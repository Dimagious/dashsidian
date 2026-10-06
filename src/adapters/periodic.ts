import type { App } from "obsidian";
import { PERIODS, type Period, type PeriodConfig } from "../core/periodic";
import { dateFormats, type DateFormats } from "../core/note-date";
import { noteNameFromPath, periodNames, PERIOD_UNITS, PERIODIC_NOTES_FORMATS, type PeriodUnit } from "../core/period-name";
import type { PeriodContext } from "../core/period";
import { isRecord } from "../shared/parse";
import { parseDateWithFormat, parsePeriodStart } from "./datetime";

/**
 * Where periodic notes live, according to the neighbouring plugins.
 *
 * Periodic Notes has no official API, and pulling in
 * `obsidian-daily-notes-interface` for three fields would be a dependency
 * (see ADR 0001, the same argument as for Dataview). So we read the settings
 * directly and defend against any shape of them: the neighbour may be absent,
 * or may update and move things around. Found nothing — return nothing, and
 * core/periodic.ts falls back to the defaults.
 */
export type Discovered = Partial<Record<Period, Partial<PeriodConfig>>>;

/** The private part of App: absent from the public types, but stable for years. */
interface PluginHost {
    plugins?: { plugins?: Record<string, unknown>; manifests?: Record<string, unknown> };
    internalPlugins?: { plugins?: Record<string, unknown> };
}

const PERIODIC_NOTES = "periodic-notes";

/** The keys Periodic Notes 0.0.x keeps each period under; 1.x names them by the unit itself. */
const FLAT_KEYS: Readonly<Record<PeriodUnit, string>> = {
    day: "daily",
    week: "weekly",
    month: "monthly",
    quarter: "quarterly",
    year: "yearly",
};

const PERIOD_UNIT: Readonly<Record<Period, PeriodUnit>> = { daily: "day", weekly: "week", monthly: "month" };

/** One period's settings (`enabled`, `folder`, `format`), still unchecked. */
type PeriodicNotesConfigs = Partial<Record<PeriodUnit, Record<string, unknown>>>;

/**
 * The settings of each period in Periodic Notes, read from whichever shape
 * the installed version reads (B-176). 0.0.x keeps them flat, under
 * `daily`/`weekly`/...; 1.x keeps them in `calendarSets`, the active one
 * named by `activeCalendarSet` (else the first). Both shapes can sit in one
 * settings file, left over from an upgrade or a downgrade, so the version
 * in the plugin's manifest decides; with no version to go by, the flat keys
 * win, as they are also what the Calendar plugin reads. With only one shape
 * there, that one is read.
 */
function periodicNotesConfigs(app: App): PeriodicNotesConfigs {
    const plugins = (app as unknown as PluginHost).plugins;
    const periodic = plugins?.plugins?.[PERIODIC_NOTES];
    const settings = currentValue(isRecord(periodic) ? periodic.settings : undefined);
    if (!isRecord(settings)) return {};

    const set = activeCalendarSet(settings);
    const hasFlat = PERIOD_UNITS.some((unit) => isRecord(settings[FLAT_KEYS[unit]]));
    const manifest = plugins?.manifests?.[PERIODIC_NOTES] ?? (isRecord(periodic) ? periodic.manifest : undefined);
    const version = isRecord(manifest) && typeof manifest.version === "string" ? manifest.version : "";
    const readsSets = set !== undefined && (!hasFlat || majorVersion(version) >= 1);

    const out: PeriodicNotesConfigs = {};
    for (const unit of PERIOD_UNITS) {
        const cfg = readsSets ? set[unit] : settings[FLAT_KEYS[unit]];
        if (isRecord(cfg)) out[unit] = cfg;
    }
    return out;
}

/**
 * The settings as they are now. Periodic Notes 1.x keeps them in a Svelte
 * store (`{ subscribe, set, update }`), which hands its value to a new
 * subscriber at once; 0.0.x keeps a plain object. A store that throws
 * counts as no settings.
 */
function currentValue(settings: unknown): unknown {
    if (!isRecord(settings) || !isFunction<Subscribe>(settings.subscribe)) return settings;
    try {
        let value: unknown;
        const stop = settings.subscribe((v) => {
            value = v;
        });
        if (isFunction<() => unknown>(stop)) stop();
        return value;
    } catch {
        return undefined;
    }
}

type Subscribe = (run: (value: unknown) => void) => unknown;

function isFunction<T>(value: unknown): value is T {
    return typeof value === "function";
}

/** The calendar set Periodic Notes 1.x works from: the one `activeCalendarSet` names, else the first. */
function activeCalendarSet(settings: Record<string, unknown>): Record<string, unknown> | undefined {
    const sets = Array.isArray(settings.calendarSets) ? settings.calendarSets.filter(isRecord) : [];
    const active = settings.activeCalendarSet;
    return sets.find((set) => typeof active === "string" && set.id === active) ?? sets[0];
}

/** The major of a version like `1.0.0-beta.3`; -1 when there is none to read. */
function majorVersion(version: string): number {
    const match = /^\s*v?(\d+)(?:\.|$)/.exec(version);
    return match?.[1] === undefined ? -1 : Number(match[1]);
}

/**
 * The day follows the rule of obsidian-daily-notes-interface, which
 * Periodic Notes and the Calendar plugin create daily notes with (B-172):
 * Periodic Notes' day when it is switched on there, a blank format being
 * its default `YYYY-MM-DD`; otherwise the core Daily notes plugin, whatever
 * Periodic Notes keeps for its switched-off day. The week and the month
 * ignore `enabled` on purpose: even a period switched off at the neighbour
 * still holds a configured folder, and that is a better guess than the
 * vault root. If the block asks for `monthly: true`, the note belongs
 * exactly there.
 */
export function discoverPeriodics(app: App): Discovered {
    const host = app as unknown as PluginHost;
    const configs = periodicNotesConfigs(app);
    const out: Discovered = {};

    for (const period of PERIODS) {
        const cfg = configs[PERIOD_UNIT[period]];
        if (!cfg) continue;
        if (period === "daily") {
            // A blank format stays blank: resolveConfig and the date readers
            // take it as ISO, which is the Periodic Notes default.
            if (cfg.enabled === true) out.daily = { folder: text(cfg.folder), format: text(cfg.format) };
            continue;
        }
        const found = pick(cfg);
        if (found) out[period] = found;
    }

    if (!out.daily) {
        const core = host.internalPlugins?.plugins?.["daily-notes"];
        const instance = isRecord(core) ? core.instance : undefined;
        const options = isRecord(instance) ? instance.options : undefined;
        if (isRecord(options)) {
            const found = pick(options);
            if (found) out.daily = found;
        }
    }

    return out;
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function pick(cfg: Record<string, unknown>): Partial<PeriodConfig> | null {
    const folder = text(cfg.folder);
    const format = text(cfg.format);
    return folder || format ? { folder, format } : null;
}

/**
 * The day format of the Periodic Notes or core Daily notes settings, the
 * same one `today` builds the daily note's path with (see
 * `discoverPeriodics` for which wins), or undefined when it is blank. Blocks read note dates in it after ISO (B-120).
 */
export function dailyNoteFormat(app: App): string | undefined {
    return discoverPeriodics(app).daily?.format?.trim() || undefined;
}

/**
 * The formats a block reads note dates in after ISO: its own `date_format`
 * first, then `dailyNoteFormat`. Undefined when there is neither, which
 * leaves the block reading ISO dates only.
 */
export function noteDateFormats(app: App, own?: string): DateFormats | undefined {
    return dateFormats(own, dailyNoteFormat(app), parseDateWithFormat);
}

/**
 * The name format of each period, as Periodic Notes has it set, the day
 * the one `today` reads (B-129): Periodic Notes' when it is switched on
 * there, else the core Daily notes one. Quarter and year are
 * read here only: no other part of Dashy has a use for their folders.
 * A period Periodic Notes has switched on with no format saved names its
 * notes in the plugin's own default (B-171), so a weekly `2026-W40` is a
 * locale week there, not an ISO one. The day needs no such default: the
 * plugin's, like the core Daily notes one, is ISO, which is always read.
 */
export function periodNameFormats(app: App): Partial<Record<PeriodUnit, string>> {
    const configs = periodicNotesConfigs(app);
    const formatOf = (unit: PeriodUnit): string | undefined => {
        const cfg = configs[unit];
        if (!cfg) return undefined;
        const saved = text(cfg.format);
        return saved.trim() || (cfg.enabled === true ? PERIODIC_NOTES_FORMATS[unit] : undefined);
    };
    const out: Partial<Record<PeriodUnit, string>> = {};
    const add = (unit: PeriodUnit, format: string | undefined): void => {
        if (format?.trim()) out[unit] = format.trim();
    };
    add("day", discoverPeriodics(app).daily?.format);
    add("week", formatOf("week"));
    add("month", formatOf("month"));
    add("quarter", formatOf("quarter"));
    add("year", formatOf("year"));
    return out;
}

/**
 * What a block reads `period`/`range` with (B-129): the period name formats
 * and the name of the note at `sourcePath`, where the block sits.
 */
export function periodContext(app: App, sourcePath?: string): PeriodContext {
    const context: PeriodContext = { names: periodNames(periodNameFormats(app), parsePeriodStart) };
    if (sourcePath !== undefined) context.noteName = noteNameFromPath(sourcePath);
    return context;
}
