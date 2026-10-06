/**
 * A heatmap drawn as a month calendar with dots (B-133, `layout: calendar`):
 * weekday columns, week rows, one cell per day with its number and a dot per
 * note or layer that painted it. Which window it covers, which date goes in
 * which row and column, which days are still ahead and how many dots a day
 * gets are decided here; `blocks/heatmap.ts` only draws the result.
 *
 * Pure module: no Obsidian, no DOM. `today` and `firstDay` are passed in.
 */

import { DEFAULT_FIRST_DAY, dateKey, parseDateKey, weekdayRow } from "./calendar";
import { isMonthWindow, isWeekWindow, periodWindow, type DateWindow, type Period } from "./period";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

export const HEATMAP_LAYOUTS = ["grid", "calendar"] as const;
export type HeatmapLayout = (typeof HEATMAP_LAYOUTS)[number];

/** A day never shows more dots than this without `layers`, however many notes painted it. */
export const MAX_NOTE_DOTS = 3;
/** A day never shows more dots than this with `layers`, however many layers painted it. */
export const MAX_LAYER_DOTS = 4;

export interface LayoutOutcome {
    /** what actually gets drawn, after every fallback */
    layout: HeatmapLayout;
    diagnostics: Diagnostic[];
}

function isHeatmapLayout(v: unknown): v is HeatmapLayout {
    return typeof v === "string" && (HEATMAP_LAYOUTS as readonly string[]).includes(v);
}

/**
 * Reads `layout` off a heatmap config, against the `range` already read.
 * Absent is silent `grid`. An unrecognised value warns and falls back to
 * `grid`, the same shape `readPick` takes for `pick`. `calendar` only has a
 * month or a week to lay out, `range: month` or `week`, or a fixed window
 * that is exactly one calendar month or one week (B-129); a `from`/`to` week
 * has to start on `firstDay`, the locale's first day of the week. With any
 * other window, or none, it warns and the grid is drawn. Once the calendar
 * does apply, `bands` has nothing to shade (a day shows dots, not a fill)
 * and is reported as ignored.
 */
export function readLayout(
    value: Record<string, unknown>,
    range: Period | undefined,
    firstDay: number = DEFAULT_FIRST_DAY,
): LayoutOutcome {
    const raw = value.layout;
    if (raw === undefined) return { layout: "grid", diagnostics: [] };
    if (!isHeatmapLayout(raw)) {
        return {
            layout: "grid",
            diagnostics: [{ level: "warning", message: t("heatmap.layoutInvalid", { value: describeValue(raw) }) }],
        };
    }
    if (raw === "grid") return { layout: "grid", diagnostics: [] };
    if (range?.kind !== "month" && range?.kind !== "week" && !(range && (isMonthWindow(range) || isWeekWindow(range, firstDay)))) {
        return { layout: "grid", diagnostics: [{ level: "warning", message: t("heatmap.calendarNeedsRange") }] };
    }
    const diagnostics: Diagnostic[] = value.bands !== undefined
        ? [{ level: "warning", message: t("heatmap.calendarBandsIgnored") }]
        : [];
    return { layout: "calendar", diagnostics };
}

/**
 * The whole stretch a calendar shows: the current calendar month from the
 * 1st to its last day for `range: month`, the current week per the locale's
 * `firstDay` for `range: week`. Unlike `periodWindow`, whose start this
 * reuses, the end is not today: a calendar shows the days still ahead too,
 * dimmed. A fixed month or week (B-129) is that month or week, whenever it
 * falls. `null` for any other window, which has no calendar shape.
 */
export function calendarWindow(period: Period, today: Date, firstDay: number): DateWindow | null {
    if (isMonthWindow(period) || isWeekWindow(period, firstDay)) return { start: period.start, end: period.end };
    if (period.kind !== "month" && period.kind !== "week") return null;
    const { start } = periodWindow(period, today, firstDay);
    const first = parseDateKey(start);
    const end = period.kind === "month"
        // Day 0 of the next month is the last day of this one: 28, 29, 30 or 31.
        ? new Date(first.getFullYear(), first.getMonth() + 1, 0)
        : new Date(first.getFullYear(), first.getMonth(), first.getDate() + 6);
    return { start, end: dateKey(end) };
}

/** The month(s) a calendar's heading names: `to` only when the window ends in another month than it starts. */
export interface CalendarMonths {
    /** the 1st of the month the window starts in */
    from: Date;
    /** the 1st of the month the window ends in, or `null` when it is the same month */
    to: Date | null;
}

/**
 * Which month a calendar's heading names. A month window, and a week inside
 * one month, name that one month; a week crossing into the next month, or
 * the next year, names both ends so its day numbers are not read against
 * the wrong month.
 */
export function calendarMonths(bounds: DateWindow): CalendarMonths {
    const start = parseDateKey(bounds.start);
    const end = parseDateKey(bounds.end);
    const from = new Date(start.getFullYear(), start.getMonth(), 1);
    const same = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
    return { from, to: same ? null : new Date(end.getFullYear(), end.getMonth(), 1) };
}

/** One day of the calendar. */
export interface CalendarDay {
    /** YYYY-MM-DD */
    key: string;
    /** day of the month, 1-31, what the cell shows */
    day: number;
    /** after today: drawn dimmed, never dotted or linked */
    future: boolean;
}

export interface CalendarLayout {
    /** rows of exactly seven slots, `firstDay` first; `null` is a pad slot before the 1st or after the last day */
    weeks: (CalendarDay | null)[][];
    /** every day in the window up to and including today, ascending: what the caption counts */
    pastKeys: string[];
}

/**
 * Lays a window out in weeks: the first row starts on `firstDay`, so the
 * window's first day lands in its own weekday's column after as many pad
 * slots as it takes (none when it already falls on `firstDay`), and the last
 * row is padded out to seven. Built day by day from `getFullYear`/
 * `getMonth`/`getDate`, never by adding milliseconds, so a DST switch
 * inside the month neither drops nor repeats a day.
 */
export function layoutCalendar(bounds: DateWindow, today: Date, firstDay: number): CalendarLayout {
    const todayKey = dateKey(today);
    const first = parseDateKey(bounds.start);
    const slots: (CalendarDay | null)[] = [];
    for (let i = 0; i < weekdayRow(first.getDay(), firstDay); i++) slots.push(null);

    const pastKeys: string[] = [];
    for (let i = 0; ; i++) {
        const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
        const key = dateKey(date);
        // An invalid `start` formats as "NaN-NaN-NaN", which sorts after any
        // real key, so the loop ends at once rather than spinning.
        if (key > bounds.end) break;
        const future = key > todayKey;
        if (!future) pastKeys.push(key);
        slots.push({ key, day: date.getDate(), future });
    }
    while (slots.length % 7 !== 0) slots.push(null);

    const weeks: (CalendarDay | null)[][] = [];
    for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
    return { weeks, pastKeys };
}

/**
 * How many dots a day shows without `layers`: one per note that painted it,
 * at most `MAX_NOTE_DOTS`. A day still ahead shows none, whatever is there.
 */
export function noteDots(paintedNotes: number, future: boolean): number {
    if (future || paintedNotes <= 0) return 0;
    return Math.min(paintedNotes, MAX_NOTE_DOTS);
}

/**
 * Which layers get a dot on `day` with `layers`: every layer painted that
 * day, as its index into the list, in list order, at most `MAX_LAYER_DOTS`.
 * `pick` plays no part: it chooses one winner for a grid cell's fill, and a
 * calendar day shows every painted layer instead. A day still ahead shows
 * none.
 */
export function layerDots(
    perLayerMarks: readonly ReadonlyMap<string, { painted: boolean }>[],
    day: string,
    future: boolean,
): number[] {
    if (future) return [];
    const out: number[] = [];
    perLayerMarks.forEach((marks, i) => {
        if (marks.get(day)?.painted) out.push(i);
    });
    return out.slice(0, MAX_LAYER_DOTS);
}
