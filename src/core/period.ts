/**
 * A time window for `stats` and `progress`: this week, this month, this year,
 * or a rolling count of days, always ending today. Pure layer: `today` and
 * `firstDay` are passed in by the caller rather than read from the wall clock
 * or from Obsidian's locale, so a test can put "today" anywhere it likes.
 */

import type { NoteRecord } from "./source";
import { dateKey, weekdayRow } from "./calendar";
import { DATE_NAME, type Agg } from "./aggregate";
import { formatValue, roundedValue } from "./stat";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t, tPlural } from "../i18n";

export type Period =
    | { kind: "week" }
    | { kind: "month" }
    | { kind: "year" }
    | { kind: "days"; days: number };

/** A rolling window shorter than a day or longer than ten years is not a habit tracker anymore. */
const MIN_DAYS = 1;
const MAX_DAYS = 3650;

/**
 * `week`, `month`, `year`, or a rolling window: `30d`, `30 d`, a bare `30`.
 * Case and surrounding space do not matter. Anything else is null, and the
 * caller reports it rather than guessing what was meant.
 */
export function parsePeriod(raw: unknown): Period | null {
    const text = (typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "")
        .trim()
        .toLowerCase();
    if (!text) return null;
    if (text === "week" || text === "month" || text === "year") return { kind: text };

    const match = /^(\d+)\s*d?$/.exec(text);
    if (!match?.[1]) return null;
    const days = Number(match[1]);
    return days >= MIN_DAYS && days <= MAX_DAYS ? { kind: "days", days } : null;
}

/**
 * Not called `Window`: that shadows the DOM type of the same name, and,
 * lower case, is exactly the trap `core/aggregate.ts#series` already
 * sidesteps — both the popout scanner and a reader take `window.` for a call
 * on the browser global.
 */
export interface DateWindow {
    /** inclusive, YYYY-MM-DD */
    start: string;
    /** inclusive, YYYY-MM-DD — always today */
    end: string;
}

/**
 * The window a period names, ending today inclusive.
 *
 * `firstDay` is the locale's first day of the week (0 Sunday, 1 Monday, …) —
 * the same source `blocks/heatmap.ts` takes from `adapters/datetime.ts`, so
 * "this week" starts on the same day the heatmap grid does. Built from
 * `getFullYear`/`getMonth`/`getDate`: `toISOString` would shift local
 * midnight back a day east of UTC.
 */
export function periodWindow(period: Period, today: Date, firstDay: number): DateWindow {
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    const end = dateKey(today);

    switch (period.kind) {
        case "days":
            return { start: dateKey(new Date(y, m, d - (period.days - 1))), end };
        case "year":
            return { start: dateKey(new Date(y, 0, 1)), end };
        case "month":
            return { start: dateKey(new Date(y, m, 1)), end };
        case "week": {
            const back = weekdayRow(today.getDay(), firstDay);
            return { start: dateKey(new Date(y, m, d - back)), end };
        }
    }
}

/** The last day of a month; `month` is 0-based and may be -1 or 12, which `Date` normalises across the year boundary. */
function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * The same stretch of the previous period, to date, for a "this week vs last
 * week" comparison. Not the whole previous period: a Thursday this week
 * compares against Monday to Thursday last week, not the full week.
 *
 * `week` and `days` are a fixed-length window, so shifting both ends back by
 * that length lands on the same weekday / stays contiguous. `month` and
 * `year` are not fixed-length, so the previous end is built from the
 * previous month or year directly, its day clamped to what that stretch of
 * the calendar actually has: 31 March compares against 28 or 29 February,
 * 29 February compares against 28 February the year before.
 */
export function previousPeriodWindow(period: Period, today: Date, firstDay: number): DateWindow {
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();

    switch (period.kind) {
        case "days":
            return {
                start: dateKey(new Date(y, m, d - (2 * period.days - 1))),
                end: dateKey(new Date(y, m, d - period.days)),
            };
        case "week": {
            const back = weekdayRow(today.getDay(), firstDay);
            return { start: dateKey(new Date(y, m, d - back - 7)), end: dateKey(new Date(y, m, d - 7)) };
        }
        case "month": {
            const prevMonth = m - 1;
            const day = Math.min(d, daysInMonth(y, prevMonth));
            return { start: dateKey(new Date(y, prevMonth, 1)), end: dateKey(new Date(y, prevMonth, day)) };
        }
        case "year": {
            const prevYear = y - 1;
            const day = Math.min(d, daysInMonth(prevYear, m));
            return { start: dateKey(new Date(prevYear, 0, 1)), end: dateKey(new Date(prevYear, m, day)) };
        }
    }
}

/** True for a real calendar date — catches `2026-02-30`, which the digit pattern alone lets through. */
function isRealDate(y: number, m: number, d: number): boolean {
    const at = new Date(y, m - 1, d);
    return at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d;
}

/**
 * A note's date under `period`.
 *
 * Without `dateField` it is the note's own YYYY-MM-DD name, the same rule
 * `streak` and `latest` already use. With `dateField` the name is not
 * consulted at all — the date comes from that frontmatter property only. A
 * datetime string (`2026-03-02T10:30`, what an Obsidian datetime property
 * writes) is trimmed to its date part; a `Date` instance (what a date
 * property may resolve to) is read by its local year/month/day. Anything
 * else — a number, free text, a missing property — has no date here.
 */
export function noteDate(note: NoteRecord, dateField?: string): string | null {
    if (!dateField) return DATE_NAME.test(note.name) ? note.name : null;

    const raw = note.frontmatter[dateField];
    if (raw instanceof Date) {
        return Number.isNaN(raw.getTime()) ? null : dateKey(raw);
    }
    if (typeof raw === "string") {
        const head = raw.slice(0, 10);
        if (!DATE_NAME.test(head)) return null;
        const [y, m, d] = head.split("-").map(Number) as [number, number, number];
        return isRealDate(y, m, d) ? head : null;
    }
    return null;
}

function inWindow(key: string, bounds: DateWindow): boolean {
    return key >= bounds.start && key <= bounds.end;
}

export interface PeriodFilter {
    /** the selection, narrowed to the window */
    notes: NoteRecord[];
    /** whether at least one note in the selection resolved to a date at all */
    anyDated: boolean;
}

/**
 * Notes without a resolvable date are dropped first; what remains is then
 * narrowed to the given bounds. `anyDated` is what lets the caller tell an
 * honest empty window (a real answer, `count` 0) from "not one of these notes
 * has a date", which needs a warning rather than a silent zero.
 */
export function filterByWindow(
    notes: readonly NoteRecord[],
    bounds: DateWindow,
    dateField?: string,
): PeriodFilter {
    let anyDated = false;
    const out: NoteRecord[] = [];
    for (const note of notes) {
        const key = noteDate(note, dateField);
        if (key === null) continue;
        anyDated = true;
        if (inWindow(key, bounds)) out.push(note);
    }
    return { notes: out, anyDated };
}

/** `filterByWindow` over the window a period names, ending today. */
export function filterByPeriod(
    notes: readonly NoteRecord[],
    period: Period,
    today: Date,
    firstDay: number,
    dateField?: string,
): PeriodFilter {
    return filterByWindow(notes, periodWindow(period, today, firstDay), dateField);
}

export interface PeriodSpec {
    period: Period;
    dateField?: string;
}

export interface PeriodOutcome {
    /** null — no period was asked for, or it could not be read */
    spec: PeriodSpec | null;
    diagnostics: Diagnostic[];
}

/**
 * Parses `period:` and `date_field:` off a card or bar. `label` names it in
 * diagnostics, the same way every other reader in `core/` does.
 */
export function readPeriod(item: Record<string, unknown>, label: string): PeriodOutcome {
    const diagnostics: Diagnostic[] = [];
    const card = label ? `"${label}"` : t("stats.unlabeledCard");

    const rawField = item.date_field;
    const dateField = typeof rawField === "string" && rawField.trim() ? rawField.trim() : undefined;

    if (item.period === undefined) {
        // `date_field` alone does nothing — it only steers where `period`
        // looks for a date — and a silent no-op reads as a bug the config
        // author cannot see.
        if (dateField) diagnostics.push({ level: "warning", message: t("period.dateFieldUnused", { card }) });
        return { spec: null, diagnostics };
    }

    const period = parsePeriod(item.period);
    if (!period) {
        diagnostics.push({
            level: "warning",
            message: t("period.invalid", { card, value: describeValue(item.period) }),
        });
        return { spec: null, diagnostics };
    }

    const spec: PeriodSpec = { period };
    if (dateField) spec.dateField = dateField;
    return { spec, diagnostics };
}

export type BetterDirection = "up" | "down";

export interface CompareSpec {
    /** which direction of the delta is the good one; unset stays neutral */
    better?: BetterDirection;
}

export interface CompareOutcome {
    /** null — `compare` was not asked for, or could not be turned on */
    spec: CompareSpec | null;
    diagnostics: Diagnostic[];
}

/**
 * Parses `compare:` and `better:` off a stats card.
 *
 * `compare` only means something next to a working `period` — comparing
 * "this week" against nothing is not a comparison — so `hasPeriod` is the
 * caller's already-parsed `readPeriod` outcome. A `period` that failed to
 * parse reports its own warning and is not also blamed here. `agg` is the
 * card's own aggregate, when it parsed: `streak` is refused, the same way
 * `trend` refuses `count` — a streak has no value of its own for the
 * previous period to sit next to.
 */
export function readCompare(
    item: Record<string, unknown>,
    label: string,
    hasPeriod: boolean,
    agg?: Agg,
): CompareOutcome {
    const diagnostics: Diagnostic[] = [];
    const card = label ? `"${label}"` : t("stats.unlabeledCard");

    const rawCompare = item.compare;
    const rawBetter = item.better;
    const betterGiven = rawBetter !== undefined;
    const better: BetterDirection | undefined = rawBetter === "up" || rawBetter === "down" ? rawBetter : undefined;

    // A non-boolean `compare` (the `yaml` package hands back "yes", "true" or
    // 1 as-is, none of them `true`) drew nothing and warned about nothing —
    // the config looked like it worked and silently did not.
    if (rawCompare !== undefined && typeof rawCompare !== "boolean") {
        diagnostics.push({
            level: "warning",
            message: t("compare.notBoolean", { card, value: describeValue(rawCompare) }),
        });
        return { spec: null, diagnostics };
    }

    if (rawCompare !== true) {
        // `better` next to a `compare` that is missing or false has nothing
        // to colour — the config author asked for a colour rule the block
        // never gets to apply. `compare: false` on its own stays silent.
        if (betterGiven) diagnostics.push({ level: "warning", message: t("compare.betterUnused", { card }) });
        return { spec: null, diagnostics };
    }

    if (!hasPeriod) {
        diagnostics.push({ level: "warning", message: t("compare.needsPeriod", { card }) });
        return { spec: null, diagnostics };
    }

    if (agg === "streak") {
        diagnostics.push({ level: "warning", message: t("compare.streakUnsupported", { card }) });
        return { spec: null, diagnostics };
    }

    if (betterGiven && !better) {
        diagnostics.push({
            level: "warning",
            message: t("compare.badBetter", { card, value: describeValue(rawBetter) }),
        });
    }

    const spec: CompareSpec = {};
    if (better) spec.better = better;
    return { spec, diagnostics };
}

export type DeltaDirection = "up" | "down" | "flat";

export interface DeltaFormat {
    /** decorative glyph — a screen reader should skip it, the sign below already carries the meaning */
    arrow: string;
    /** the part that reads sensibly on its own: +2, -1 (a real minus sign), 0 */
    text: string;
    direction: DeltaDirection;
}

/** A real minus sign, not a hyphen: U+2212 reads as a value, not as a word broken across a line. */
const MINUS_SIGN = "−";

/**
 * Current minus previous, as text — computed from the values as the card
 * displays them, not from the raw difference. Both sides are rounded to the
 * card's own precision first: at `precision: 0`, 10.6 reads as 11 and 10.4
 * reads as 10, and the delta beneath them has to say "+1", the difference a
 * reader actually sees, not "+0.2" or "no change" from numbers nobody sees.
 *
 * A delta that rounds to zero at the card's precision is flat even when the
 * raw difference is not exactly zero — the same "-0.0 reads as a
 * measurement" trap `formatValue` already avoids for the value itself.
 */
export function formatDelta(current: number, previous: number, precision?: number): DeltaFormat {
    const delta = roundedValue(current, precision) - roundedValue(previous, precision);
    const magnitude = formatValue(Math.abs(delta), precision);
    if (magnitude === formatValue(0, precision)) return { arrow: "=", text: magnitude, direction: "flat" };
    const direction: DeltaDirection = delta > 0 ? "up" : "down";
    const sign = direction === "up" ? "+" : MINUS_SIGN;
    return { arrow: direction === "up" ? "▲" : "▼", text: `${sign}${magnitude}`, direction };
}

export type DeltaTone = "good" | "bad" | "neutral";

/**
 * Colour policy for a delta: `better` names the direction that counts as an
 * improvement. No change is always neutral, and so is a rise or a fall with
 * no `better` set at all.
 */
export function deltaTone(direction: DeltaDirection, better?: BetterDirection): DeltaTone {
    if (direction === "flat" || !better) return "neutral";
    return direction === better ? "good" : "bad";
}

/**
 * What the delta compares with, for a tooltip: "vs the same days last week:
 * 1". `previousText` is the previous window's value, already formatted with
 * the card's own precision.
 */
export function compareCaption(period: Period, previousText: string): string {
    switch (period.kind) {
        case "week":
            return t("compare.vsWeek", { value: previousText });
        case "month":
            return t("compare.vsMonth", { value: previousText });
        case "year":
            return t("compare.vsYear", { value: previousText });
        case "days":
            return tPlural("compare.vsDays", period.days, { value: previousText });
    }
}
