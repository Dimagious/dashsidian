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

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The inverse of `dateKey`: a `YYYY-MM-DD` key back to the local calendar
 * date it names (B-092, for a cell's tooltip). Built from the three parts,
 * never `new Date(key)`: that parses as UTC midnight, which lands on the
 * previous day anywhere west of it.
 *
 * Every caller only ever hands this a key this module itself already
 * produced (`dateKey`, `eachDay`, `eachDayBetween`), so a key that does not
 * match `YYYY-MM-DD` is a programming error, not a reader's mistake — there
 * is no config, no diagnostic to report it through. This module never
 * throws, so an invalid `Date` (every field reads `NaN`, and `moment`
 * formats it as "Invalid date" rather than crashing) is the sentinel here,
 * the same "give the caller a value it can still hold onto" choice
 * `daysBetween` above already makes for a bad key of its own.
 */
export function parseDateKey(key: string): Date {
    const match = DATE_KEY.exec(key);
    const year = match?.[1];
    const month = match?.[2];
    const day = match?.[3];
    if (year === undefined || month === undefined || day === undefined) return new Date(NaN);
    return new Date(Number(year), Number(month) - 1, Number(day));
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
 *
 * Delegates to `layoutRange` (B-093): a calendar year is just the window from
 * 1 January to `end` inclusive. The only work left here is picking that `end`
 * (today for the current year, 31 December otherwise) and dropping the `year`
 * `layoutRange`'s month labels carry, which every caller of `layoutYear`
 * already knows from `year` itself.
 */
export function layoutYear(year: number, today: Date, firstDay = DEFAULT_FIRST_DAY): YearLayout {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = year === cutoff.getFullYear() && cutoff < dec31 ? cutoff : dec31;

    const range = layoutRange(dateKey(jan1), dateKey(end), firstDay);
    return {
        year,
        offset: range.offset,
        total: range.total,
        columns: range.columns,
        months: range.months.map(({ month, column }) => ({ month, column })),
    };
}

/** Keys of every day of the year that lands in the grid, ascending. */
export function eachDay(year: number, total: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < total; i++) out.push(dateKey(new Date(year, 0, 1 + i)));
    return out;
}

export interface RangeMonthLabel extends MonthLabel {
    /**
     * The calendar year this month label falls in. `MonthLabel.month` alone
     * (0-11) is ambiguous once a window can cross a year boundary or, with a
     * multi-year `Nd`, repeat the same month several times; carried here
     * rather than folded into the label text, which stays exactly what
     * `layoutYear`'s months already look like.
     */
    year: number;
}

export interface RangeLayout {
    /** inclusive, YYYY-MM-DD */
    start: string;
    /** inclusive, YYYY-MM-DD */
    end: string;
    /** How many empty cells come before `start` so the first grid row is the first day of the week. */
    offset: number;
    /** How many days land in the grid, `start` and `end` both inclusive. */
    total: number;
    /** How many week columns the grid spans. */
    columns: number;
    /** Month labels with the column each one starts in: the first column's own month, plus every month that starts inside the window. */
    months: RangeMonthLabel[];
}

/**
 * A per-year grid (`layoutYear`) never packs two month labels closer than
 * this many columns — `layoutRange`'s synthetic start-month label (below)
 * is dropped rather than let a real one land any closer, which is what
 * used to overflow `.dashy-hm-months` onto the cells beneath it once a real
 * month's 1st fell in column 1 or 2 of the window (checker round 1, B-093:
 * a plain `range: 365d` from today already hits this).
 */
const MIN_LABEL_SPACING = 4;

/**
 * Computes the layout of an arbitrary window (B-093), the generalisation of
 * `layoutYear` a `range` other than "every calendar year" needs: `week`,
 * `month`, rolling `Nd`, or a rolling year crossing 1 January in one grid
 * rather than two.
 *
 * Columns are weeks aligned to `firstDay`, exactly like `layoutYear`: the
 * first column may start mid-week (`offset` pad cells before `start`), the
 * last ends at `end`. Month labels mark every column where a month starts
 * inside the window ("real" labels, always kept), plus the window's own
 * first column, which is not necessarily the start of a month (a
 * "synthetic" label for whichever month `start` itself falls in). The
 * synthetic one is dropped when a real label would land too close to it —
 * see `MIN_LABEL_SPACING` — rather than let the two share, or nearly share,
 * a column: `.dashy-hm-months` lays labels out with no row of their own to
 * fall back to, so two in the same column overflow onto the grid below it.
 */
export function layoutRange(start: string, end: string, firstDay = DEFAULT_FIRST_DAY): RangeLayout {
    const startDate = new Date(`${start}T00:00:00`);
    const offset = weekdayRow(startDate.getDay(), firstDay);
    const total = daysBetween(start, end) + 1;
    const columns = Math.ceil((total + offset) / 7);

    // Every real month start inside the window: begins one month after
    // `start`'s own, so a `start` that already lands on the 1st is never
    // reported twice.
    const realMonths: RangeMonthLabel[] = [];
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
    for (;;) {
        const key = dateKey(cursor);
        if (key > end) break;
        const dayIndex = daysBetween(start, key);
        realMonths.push({ month: cursor.getMonth(), year: cursor.getFullYear(), column: Math.floor((dayIndex + offset) / 7) + 1 });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    const startLabel: RangeMonthLabel = { month: startDate.getMonth(), year: startDate.getFullYear(), column: 1 };
    // The gap to the first real label, not its raw column: the synthetic
    // label always sits at column 1, so a real one at column 4 is only 3
    // columns away, still inside `layoutYear`'s own Feb-to-Mar minimum.
    const gapToFirstReal = realMonths[0] ? realMonths[0].column - startLabel.column : undefined;
    const months = gapToFirstReal !== undefined && gapToFirstReal < MIN_LABEL_SPACING
        ? realMonths
        : [startLabel, ...realMonths];

    return { start, end, offset, total, columns, months };
}

/** Keys of every day between `start` and `end`, both inclusive, ascending. */
export function eachDayBetween(start: string, end: string): string[] {
    const startDate = new Date(`${start}T00:00:00`);
    const total = daysBetween(start, end) + 1;
    const out: string[] = [];
    for (let i = 0; i < total; i++) {
        out.push(dateKey(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i)));
    }
    return out;
}

export interface StreakOptions {
    /**
     * A day for which this returns true is transparent: it is dropped from
     * the set entirely (so a note landing on it never starts or extends a
     * run) and, when it sits inside a gap between two counted days, does not
     * break the run either. `days: weekdays` (core/aggregate.ts) is the
     * first caller, weekends being its transparent days; B-095's special
     * days is meant to plug in here the same way, rather than growing a
     * second, parallel notion of "day that does not count".
     */
    transparent?: (day: string) => boolean;
}

/** True when every day strictly between `a` and `b` (both YYYY-MM-DD) is transparent. */
function bridgesGap(a: string, b: string, transparent: (day: string) => boolean): boolean {
    const gap = daysBetween(a, b);
    if (gap <= 1) return gap === 1;
    const cursor = new Date(`${a}T00:00:00`);
    for (let i = 1; i < gap; i++) {
        cursor.setDate(cursor.getDate() + 1);
        if (!transparent(dateKey(cursor))) return false;
    }
    return true;
}

/**
 * The longest run of consecutive days. Takes an arbitrary set of keys.
 *
 * With `transparent` set, a day it accepts is skipped rather than counted:
 * it cannot itself be part of the run, and a gap made up only of such days
 * does not break it either. Without it (the default) this is unchanged from
 * before `transparent` existed: only a gap of exactly one day continues a run.
 */
export function longestStreak(dates: readonly string[], options: StreakOptions = {}): number {
    const transparent = options.transparent ?? (() => false);
    // Deduplicated first: two notes named for the same day are one day, and
    // the run below reads the zero-day gap between them as a break. A vault
    // with Personal/2026-01-02 and Work/2026-01-02 reported a streak of 1.
    // A transparent day (a weekend under `days: weekdays`) is dropped here
    // too, whatever it holds: it must not itself start or extend a run.
    const sorted = [...new Set(dates)].filter((d) => !transparent(d)).sort();
    let best = 0;
    let run = 0;
    let prev: string | null = null;
    for (const d of sorted) {
        run = prev !== null && bridgesGap(prev, d, transparent) ? run + 1 : 1;
        if (run > best) best = run;
        prev = d;
    }
    return best;
}

/**
 * True when a day key falls on Saturday or Sunday, in absolute terms:
 * unaffected by which day a locale's week starts on (`days: weekdays` treats
 * the weekend the same way for an English and a Russian reader alike). The
 * `transparent` predicate `core/aggregate.ts` passes to `longestStreak` for it.
 */
export function isWeekend(day: string): boolean {
    const weekday = new Date(`${day}T00:00:00`).getDay();
    return weekday === 0 || weekday === 6;
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

/** The calendar grain a `chart` groups days by (ADR 0005): one day, one week, one month. */
export type BucketSize = "day" | "week" | "month";

/**
 * The first day of the bucket a day key falls in: the day itself for `day`,
 * the locale's first day of that week for `week` (`firstDay`, 0 Sunday, 1
 * Monday, the same day `period: week` and the heatmap grid start on), the
 * 1st for `month`. Built from `getFullYear/getMonth/getDate` through
 * `parseDateKey`, never `toISOString`.
 */
export function bucketStart(key: string, bucket: BucketSize, firstDay: number): string {
    if (bucket === "day") return key;
    const day = parseDateKey(key);
    if (bucket === "month") return dateKey(new Date(day.getFullYear(), day.getMonth(), 1));
    const back = weekdayRow(day.getDay(), firstDay);
    return dateKey(new Date(day.getFullYear(), day.getMonth(), day.getDate() - back));
}

/**
 * The start keys of consecutive buckets from `start` to `end`, both
 * inclusive, ascending. `start` is expected to be a bucket start already
 * (`bucketStart`); the last key is the bucket `end` falls in. Steps by
 * calendar arithmetic, not by milliseconds, so a DST switch inside the
 * window neither adds nor drops a bucket.
 */
export function eachBucket(start: string, end: string, bucket: BucketSize): string[] {
    const first = parseDateKey(start);
    const out: string[] = [];
    for (let i = 0; ; i++) {
        const at = bucket === "month"
            ? new Date(first.getFullYear(), first.getMonth() + i, 1)
            : new Date(first.getFullYear(), first.getMonth(), first.getDate() + i * (bucket === "week" ? 7 : 1));
        const key = dateKey(at);
        // An invalid `start` formats as "NaN-NaN-NaN", which sorts after any
        // real key, so the loop ends at once rather than spinning.
        if (key > end) break;
        out.push(key);
    }
    return out;
}
