/**
 * Periodic notes: which folder, which name format, which path.
 * Pure layer — no Obsidian, no moment.
 *
 * Formatting a date is not part of this: format strings are written in moment
 * notation, and moment itself lives inside Obsidian and is reached through
 * adapters/datetime.ts.
 */

import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";
import { readClock, type ClockPrecision } from "./clock";

export const PERIODS = ["daily", "weekly", "monthly"] as const;
export type Period = (typeof PERIODS)[number];

/** A folder and a note name format. The format is in moment notation. */
export interface PeriodConfig {
    folder: string;
    format: string;
}

/**
 * Defaults for when neither Periodic Notes nor the core Daily notes plugin is
 * installed. They match the Periodic Notes defaults.
 */
export const DEFAULT_FORMATS: Record<Period, string> = {
    daily: "YYYY-MM-DD",
    weekly: "gggg-[W]ww",
    monthly: "YYYY-MM",
};

/** A folder with no leading or trailing slashes; the vault root is "". */
export function normalizeFolder(folder: string): string {
    return folder.trim().replace(/^\/+|\/+$/g, "");
}

/** A note path from the vault root, with the extension. */
export function notePath(folder: string, basename: string): string {
    const f = normalizeFolder(folder);
    return f ? `${f}/${basename}.md` : `${basename}.md`;
}

/**
 * Where the folder and the format come from.
 *
 * The Dashy setting wins over whatever a neighbouring plugin reports: a folder
 * typed in by hand is a deliberate choice, and silently overriding it with
 * another plugin's setting is not on. That is also what the settings text
 * promises — "leave empty to follow Periodic Notes".
 *
 * The format is never taken from the Dashy settings: they hold folders only.
 */
export function resolveConfig(
    period: Period,
    dashyFolder: string,
    discovered: Partial<PeriodConfig> | undefined,
): PeriodConfig {
    const own = normalizeFolder(dashyFolder ?? "");
    const found = normalizeFolder(discovered?.folder ?? "");
    const format = discovered?.format?.trim();
    return {
        folder: own || found,
        format: format || DEFAULT_FORMATS[period],
    };
}

export interface TodaySpec {
    /** what to show, in daily -> weekly -> monthly order */
    periods: Period[];
    /** a custom heading instead of today's date */
    title?: string;
    /** a live clock above the date; absent: none */
    clock?: ClockPrecision;
    /**
     * `date: note` (B-210): the day comes from the name of the note the
     * block sits in, not from today. Absent: today.
     */
    noteDate?: true;
    /** links to the day before and after; only with `noteDate`, on unless `nav: false` */
    nav?: boolean;
}

export interface TodayOutcome {
    spec: TodaySpec | null;
    diagnostics: Diagnostic[];
}

/**
 * Parses the config of the `today` block.
 *
 * With none of the keys given we show the daily note: that is what one expects
 * from a block by that name. But once at least one is given, only the given
 * ones apply — otherwise `weekly: true` would silently drag the day along too.
 */
export function readToday(value: Record<string, unknown>): TodayOutcome {
    const diagnostics: Diagnostic[] = [];
    const mentioned = PERIODS.filter((p) => value[p] !== undefined);
    const clock = readClock(value.clock);
    diagnostics.push(...clock.diagnostics);

    for (const key of [...mentioned, ...(value.nav === undefined ? [] : ["nav"])]) {
        if (typeof value[key] !== "boolean") {
            diagnostics.push({
                level: "warning",
                message: t("today.notBoolean", {
                    key,
                    value: String(value[key]),
                    read: truthy(value[key]) ? "true" : "false",
                }),
            });
        }
    }

    const noteDate = readDateKey(value.date, diagnostics);
    if (noteDate && clock.clock) diagnostics.push({ level: "warning", message: t("today.clockWithNoteDate") });
    if (!noteDate && value.nav !== undefined) diagnostics.push({ level: "warning", message: t("today.navWithoutNoteDate") });

    const periods = mentioned.length === 0
        ? (["daily"] as Period[])
        : mentioned.filter((p) => truthy(value[p]));

    if (!periods.length) {
        diagnostics.push({ level: "error", message: t("today.nothingToShow") });
        return { spec: null, diagnostics };
    }

    const spec: TodaySpec = { periods };
    if (typeof value.title === "string" && value.title.trim()) spec.title = value.title.trim();
    if (noteDate) {
        spec.noteDate = true;
        spec.nav = value.nav === undefined || truthy(value.nav);
    } else if (clock.clock) {
        spec.clock = clock.clock;
    }
    return { spec, diagnostics };
}

/**
 * Reads the `date` key (B-210): `note`, in any case, is the day of the note
 * the block sits in. Absent is today. Anything else warns and is today too:
 * the rest of the block is still worth drawing. Only `note` for now; the
 * keyword stays English, like every other config value.
 */
function readDateKey(raw: unknown, diagnostics: Diagnostic[]): boolean {
    if (raw === undefined) return false;
    if (typeof raw === "string" && raw.trim().toLowerCase() === "note") return true;
    diagnostics.push({ level: "warning", message: t("today.badDate", { value: describeValue(raw) }) });
    return false;
}

/**
 * YAML already resolved true/false; strings like "yes" come from models.
 * The keywords stay English: a config language is not localised.
 */
function truthy(v: unknown): boolean {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return !["false", "no", "0", "off"].includes(v.trim().toLowerCase());
    if (typeof v === "number") return v !== 0;
    return v !== null && v !== undefined;
}
