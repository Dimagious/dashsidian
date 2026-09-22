/**
 * Laying a year out into a grid of "column = week, row = weekday".
 *
 * Pure module: no Obsidian, no DOM. Everything that draws lives in
 * blocks/heatmap.ts.
 */

/**
 * The first day of the week, moment style: 0 is Sunday, 1 is Monday.
 * Monday is only the default for callers that have no locale to ask.
 */
export const DEFAULT_FIRST_DAY = 1;

/**
 * Rotates a Sunday-first list so it starts on `firstDay`.
 *
 * moment lists weekday names Sunday first whatever the locale, while the grid
 * starts its weeks wherever the locale says, so the two have to be lined up.
 */
export function rotateWeekdays<T>(names: readonly T[], firstDay: number): T[] {
    const at = ((firstDay % 7) + 7) % 7;
    return [...names.slice(at), ...names.slice(0, at)];
}

/**
 * Which grid row a weekday lands in, given where the week starts.
 * `weekday` is a JS day number: 0 is Sunday.
 */
export function weekdayRow(weekday: number, firstDay: number): number {
    return ((weekday - firstDay) % 7 + 7) % 7;
}

/** A day key in YYYY-MM-DD form. */
export function dateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

const DAY_MS = 86_400_000;

/** Whole days between two YYYY-MM-DD keys. */
export function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

export interface MonthLabel {
    /** month index, 0 = January */
    month: number;
    /** grid column, 1-based — goes straight into grid-column-start */
    column: number;
}

export interface YearLayout {
    year: number;
    /**
     * How many empty cells come before January 1st so that the first grid row
     * is the first day of the week. Computed from the weekday of January 1st
     * relative to `firstDay`.
     */
    offset: number;
    /** How many days of the year land in the grid: all of them, or up to today for the current year. */
    total: number;
    /** How many week columns the grid spans. */
    columns: number;
    /** Month labels with the column each one starts in. */
    months: MonthLabel[];
}

/**
 * Computes the layout of a year.
 *
 * `today` is passed in rather than read from `new Date()` so that tests do not
 * depend on the day they run. `firstDay` comes from the locale: a US reader
 * expects the grid to start on Sunday, a Russian one on Monday.
 */
export function layoutYear(year: number, today: Date, firstDay = DEFAULT_FIRST_DAY): YearLayout {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = year === cutoff.getFullYear() && cutoff < dec31 ? cutoff : dec31;

    const offset = weekdayRow(jan1.getDay(), firstDay);
    const total = Math.round((end.getTime() - jan1.getTime()) / DAY_MS) + 1;
    const columns = Math.ceil((total + offset) / 7);

    const months: MonthLabel[] = [];
    for (let m = 0; m < 12; m++) {
        const first = new Date(year, m, 1);
        if (first > end) break;
        const dayIndex = Math.round((first.getTime() - jan1.getTime()) / DAY_MS);
        months.push({ month: m, column: Math.floor((dayIndex + offset) / 7) + 1 });
    }

    return { year, offset, total, columns, months };
}

/** Keys of every day of the year that lands in the grid, ascending. */
export function eachDay(year: number, total: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < total; i++) out.push(dateKey(new Date(year, 0, 1 + i)));
    return out;
}

/** The longest run of consecutive days. Takes an arbitrary set of keys. */
export function longestStreak(dates: readonly string[]): number {
    const sorted = [...dates].sort();
    let best = 0;
    let run = 0;
    let prev: string | null = null;
    for (const d of sorted) {
        run = prev !== null && daysBetween(prev, d) === 1 ? run + 1 : 1;
        if (run > best) best = run;
        prev = d;
    }
    return best;
}

/**
 * The length of the run that reaches `today` inclusive.
 * If today is not in the set the run counts as broken, and the answer is 0.
 */
export function currentStreak(dates: readonly string[], today: string): number {
    const set = new Set(dates);
    if (!set.has(today)) return 0;
    let run = 0;
    const cursor = new Date(`${today}T00:00:00`);
    for (;;) {
        const key = dateKey(cursor);
        if (!set.has(key)) break;
        run++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return run;
}

/** Years present in a set of keys, newest first. */
export function yearsOf(dates: readonly string[]): number[] {
    const years = new Set<number>();
    for (const d of dates) years.add(Number(d.slice(0, 4)));
    return [...years].sort((a, b) => b - a);
}
