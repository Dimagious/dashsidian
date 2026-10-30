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
    /**
     * Set on a week read through a format that takes its year from the
     * calendar year (`YYYY` with `ww` or `WW`) when that week spans New Year
     * (B-191): the same format with the week-year in place of `YYYY`, such as
     * `gggg-[W]ww`. Such a week has two names, one per calendar year, and the
     * one a note was given late in December reads as a week a year away.
     */
    weekYearFormat?: string;
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
 * The format a weekly `format` should be in when it pairs the calendar year
 * (`Y`) with a week number (`w` locale, `W` ISO): the same format with the
 * matching week-year (`g`, `G`) in its place. Null for a format that already
 * names the week-year, or names no week. Text in brackets is left alone.
 */
export function weekYearFormat(format: string): string | null {
    const parts = format.split(/(\[[^\]]*\])/);
    const tokens = parts.filter((_, i) => i % 2 === 0).join("");
    if (!/Y/.test(tokens) || !/[wW]/.test(tokens) || /[gG]/.test(tokens)) return null;
    const year = /W/.test(tokens) ? "G" : "g";
    return parts.map((part, i) => (i % 2 === 0 ? part.replace(/Y/g, year) : part)).join("");
}

export interface ReadNameOptions {
    /**
     * Let a day, week, month or quarter name go on after a separator
     * (B-198): a note's own name, `2026-W41 Weekly`, not a value written
     * in a block, where a tail would hide a typo.
     */
    readonly tail?: boolean;
}

/**
 * Where a name may stop and a tail begin: a run of spaces, `_` or `-`,
 * followed by the end of the name or by anything but a digit. A digit there
 * would join the period's own numbers, `2026-10-32` read as October. The
 * lookahead also refuses another separator, so the run is the whole run and
 * `2026-10 - 05` cannot stop it early to slip past its digit.
 */
const TAIL = /^[\s_-]+(?![\s_\d-])/;

/**
 * The period a name stands for, or null. The whole name is read first and
 * must fit a format exactly, strictly: nothing is guessed. With `tail`, a
 * name that fits nowhere whole is read again, every format in the same
 * order, for a day, week, month or quarter name at its start followed by
 * `TAIL`: `2026-W41 Weekly`, `2026-10_review`, `2026-Q4-plan`. A year never
 * takes a tail, so `2026 goals` is no period; `2026-W41Weekly`, with no
 * separator, is none either.
 *
 * A week is the seven days from the day the parse returns, so a locale week
 * (`gggg-[W]ww`) starts where that locale starts it, not where the
 * interface language would. A week across New Year read in a calendar-year
 * format carries `weekYearFormat`, for a warning.
 */
export function readPeriodName(text: string, names: PeriodNames, options: ReadNameOptions = {}): NamedPeriod | null {
    const name = text.trim();
    if (!name) return null;
    for (const { unit, format } of names.formats) {
        const start = names.parse(name, format);
        if (start !== null) return namedPeriod(unit, format, start);
    }
    if (!options.tail) return null;
    for (const { unit, format } of names.formats) {
        if (unit === "year") continue;
        const start = startBeforeTail(name, format, names.parse);
        if (start !== null) return namedPeriod(unit, format, start);
    }
    return null;
}

/**
 * The first day of the period a name starts with in `format`, followed by a
 * `TAIL`, or null. Every place a tail could begin is tried, the longest
 * start first, so a format with a space in it (`MMMM YYYY`) keeps its year.
 */
function startBeforeTail(name: string, format: string, parse: ParseDate): string | null {
    for (let end = name.length - 1; end > 0; end--) {
        if (!TAIL.test(name.slice(end))) continue;
        const start = parse(name.slice(0, end), format);
        if (start !== null) return start;
    }
    return null;
}

/** The period of `unit` from `start`, with the week-year format a week across New Year should be named in. */
function namedPeriod(unit: PeriodUnit, format: string, start: string): NamedPeriod {
    const named: NamedPeriod = { unit, start, end: periodEnd(unit, start) };
    const better = unit === "week" && start.slice(0, 4) !== named.end.slice(0, 4) ? weekYearFormat(format) : null;
    if (better) named.weekYearFormat = better;
    return named;
}

/** The formats a name is expected in, for an error message: each once, in reading order. */
export function expectedNames(names: PeriodNames): string {
    return [...new Set(names.formats.map((f) => f.format))].join(", ");
}

/** A note's name from its path: the part after the last `/`, without `.md`. */
export function noteNameFromPath(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
}
