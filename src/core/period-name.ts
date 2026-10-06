/**
 * Which day, week, month, quarter or year a name like `2026-W40` stands for
 * (B-129, ADR 0006): the window `period: note` takes from the note a block
 * sits in, and the one a literal like `period: 2026-10` names.
 *
 * Pure module: no Obsidian, no moment. Reading a name in a moment format is
 * the injected `ParseDate` (`adapters/datetime.ts#parsePeriodStart`), which
 * returns the first day of the period the name stands for.
 */

import { dateKey, parseDateKey } from "./calendar";
import { isDayFormat, nameFormat, type ParseDate } from "./note-date";

export const PERIOD_UNITS = ["day", "week", "month", "quarter", "year"] as const;
export type PeriodUnit = (typeof PERIOD_UNITS)[number];

/** What a name is read as when no plugin names the period's notes, or the name does not fit the format one does. */
export const ISO_PERIOD_FORMATS: Readonly<Record<PeriodUnit, string>> = {
    day: "YYYY-MM-DD",
    week: "GGGG-[W]WW",
    month: "YYYY-MM",
    quarter: "YYYY-[Q]Q",
    year: "YYYY",
};

/**
 * What Periodic Notes (0.0.17) names a period's notes when that period is
 * switched on but its format was never saved (B-171). Only the week differs
 * from ISO: a locale week, Sunday to Saturday under English.
 */
export const PERIODIC_NOTES_FORMATS: Readonly<Record<PeriodUnit, string>> = {
    day: "YYYY-MM-DD",
    week: "gggg-[W]ww",
    month: "YYYY-MM",
    quarter: "YYYY-[Q]Q",
    year: "YYYY",
};

export interface PeriodNames {
    /**
     * Tried in this order: the smallest unit first, so `2026` never takes
     * `2026-10` for itself, and within a unit the settings format before
     * the ISO one.
     */
    readonly formats: readonly { readonly unit: PeriodUnit; readonly format: string }[];
    /** reads a name in a format: the first day of the period it names, `YYYY-MM-DD`, or null */
    readonly parse: ParseDate;
}

/** A period a name stands for, both ends inclusive. */
export interface NamedPeriod {
    unit: PeriodUnit;
    /** YYYY-MM-DD */
    start: string;
    /** YYYY-MM-DD */
    end: string;
}

/**
 * Whether a settings format can name a period of `unit` at all: a year in
 * it, and the token of the unit itself. A format with no year would read
 * `W40` as week 40 of whatever year it is now, a guess the window must not
 * make; one with the wrong unit, a weekly format set to `YYYY-MM-DD`, would
 * read a day's name as a week.
 */
function fitsUnit(unit: PeriodUnit, format: string): boolean {
    if (unit === "day") return isDayFormat(format);
    const tokens = format.replace(/\[[^\]]*\]/g, "");
    if (!/[YgG]/.test(tokens)) return false;
    switch (unit) {
        case "week":
            return /[wW]/.test(tokens);
        case "month":
            return /M/.test(tokens) && !/[DdwWQ]/.test(tokens);
        case "quarter":
            return /Q/.test(tokens);
        case "year":
            return !/[MDdwWQ]/.test(tokens);
    }
}

/**
 * The formats names are read in. `settings` holds the Periodic Notes format
 * of each unit, and the Daily notes one for the day, as set; only the part
 * after the last `/` names the note. A settings format that cannot name its
 * unit is left out, and the ISO format always follows.
 */
export function periodNames(settings: Partial<Record<PeriodUnit, string>>, parse: ParseDate): PeriodNames {
    const formats: { unit: PeriodUnit; format: string }[] = [];
    for (const unit of PERIOD_UNITS) {
        const own = settings[unit]?.trim();
        const name = own ? nameFormat(own) : "";
        if (name && name !== ISO_PERIOD_FORMATS[unit] && fitsUnit(unit, name)) formats.push({ unit, format: name });
        formats.push({ unit, format: ISO_PERIOD_FORMATS[unit] });
    }
    return { formats, parse };
}

/** The last day of a period of `unit` starting on `start`. */
export function periodEnd(unit: PeriodUnit, start: string): string {
    const first = parseDateKey(start);
    const y = first.getFullYear();
    const m = first.getMonth();
    const d = first.getDate();
    switch (unit) {
        case "day":
            return start;
        case "week":
            return dateKey(new Date(y, m, d + 6));
        case "month":
            return dateKey(new Date(y, m + 1, 0));
        case "quarter":
            return dateKey(new Date(y, m + 3, 0));
        case "year":
            return dateKey(new Date(y, 11, 31));
    }
}

/**
 * The period a whole name stands for, or null. The name must fit a format
 * exactly, strictly: `2026-W40 review` is not a week, and nothing is guessed.
 * A week is the seven days from the day the parse returns, so a locale week
 * (`gggg-[W]ww`) starts where that locale starts it, not where the
 * interface language would.
 */
export function readPeriodName(text: string, names: PeriodNames): NamedPeriod | null {
    const name = text.trim();
    if (!name) return null;
    for (const { unit, format } of names.formats) {
        const start = names.parse(name, format);
        if (start !== null) return { unit, start, end: periodEnd(unit, start) };
    }
    return null;
}

/** The formats a name is expected in, for an error message: each once, in reading order. */
export function expectedNames(names: PeriodNames): string {
    return [...new Set(names.formats.map((f) => f.format))].join(", ");
}

/** A note's name from its path: the part after the last `/`, without `.md`. */
export function noteNameFromPath(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
}
