import type { App } from "obsidian";
import { PERIODS, type Period, type PeriodConfig } from "../core/periodic";
import { dateFormats, type DateFormats } from "../core/note-date";
import { noteNameFromPath, periodNames, type PeriodUnit } from "../core/period-name";
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
    plugins?: { plugins?: Record<string, unknown> };
    internalPlugins?: { plugins?: Record<string, unknown> };
}

/** The Periodic Notes settings object, when the plugin is there and has one. */
function periodicNotesSettings(app: App): Record<string, unknown> | undefined {
    const periodic = (app as unknown as PluginHost).plugins?.plugins?.["periodic-notes"];
    const settings = isRecord(periodic) ? periodic.settings : undefined;
    return isRecord(settings) ? settings : undefined;
}

export function discoverPeriodics(app: App): Discovered {
    const host = app as unknown as PluginHost;
    const out: Discovered = {};

    const settings = periodicNotesSettings(app);
    if (settings) {
        for (const period of PERIODS) {
            const cfg = settings[period];
            // `enabled` is ignored on purpose: even a period switched off at the
            // neighbour still holds a configured folder, and that is a better
            // guess than the vault root. If the block asks for `monthly: true`,
            // the note belongs exactly there.
            if (!isRecord(cfg)) continue;
            const found = pick(cfg);
            if (found) out[period] = found;
        }
    }

    // The core "Daily notes" only knows about the day, and yields to Periodic Notes.
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

function pick(cfg: Record<string, unknown>): Partial<PeriodConfig> | null {
    const folder = typeof cfg.folder === "string" ? cfg.folder : "";
    const format = typeof cfg.format === "string" ? cfg.format : "";
    return folder || format ? { folder, format } : null;
}

/**
 * The day format of the Periodic Notes or core Daily notes settings, the
 * same one `today` builds the daily note's path with, or undefined when
 * neither plugin names one. Blocks read note dates in it after ISO (B-120).
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
 * falling back to the core Daily notes one (B-129). Quarter and year are
 * read here only: no other part of Dashy has a use for their folders.
 */
export function periodNameFormats(app: App): Partial<Record<PeriodUnit, string>> {
    const found = discoverPeriodics(app);
    const settings = periodicNotesSettings(app);
    const formatOf = (key: string): string | undefined => {
        const cfg = settings?.[key];
        return isRecord(cfg) && typeof cfg.format === "string" ? cfg.format : undefined;
    };
    const out: Partial<Record<PeriodUnit, string>> = {};
    const add = (unit: PeriodUnit, format: string | undefined): void => {
        if (format?.trim()) out[unit] = format.trim();
    };
    add("day", found.daily?.format);
    add("week", found.weekly?.format);
    add("month", found.monthly?.format);
    add("quarter", formatOf("quarterly"));
    add("year", formatOf("yearly"));
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
