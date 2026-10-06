/**
 * A time window for `stats` and `progress`: this week, this month, this year,
 * or a rolling count of days, all ending today; or, since B-129, a window
 * with fixed bounds: the period a note's name stands for (`note`), one
 * written out (`2026-W40`), or `from`/`to`. Pure layer: `today` and
 * `firstDay` are passed in by the caller rather than read from the wall clock
 * or from Obsidian's locale, so a test can put "today" anywhere it likes.
 */

import type { NoteRecord } from "./source";
import { dateKey, daysBetween, parseDateKey, weekdayRow } from "./calendar";
import { isStreakAgg, type Agg } from "./aggregate";
import { isRealDate, resolveNoteDate, type DateFormats } from "./note-date";
import { expectedNames, readPeriodName, type PeriodNames, type PeriodUnit } from "./period-name";
import { formatValue, roundedValue } from "./stat";
import { formatDuration, roundedDuration } from "./duration";
import { describeValue, isRecord, type Diagnostic } from "../shared/parse";
import { t, tPlural } from "../i18n";

/**
 * A window with fixed calendar bounds (B-129, ADR 0006): a day, week, month,
 * quarter or year named by a note's name or a literal, or a `span` written
 * as `from`/`to`. Unlike the other kinds it does not move with today.
 */
export interface FixedWindow {
    kind: "fixed";
    unit: PeriodUnit | "span";
    /** inclusive, YYYY-MM-DD */
    start: string;
    /** inclusive, YYYY-MM-DD; absent for `from` alone, which runs to today */
    end?: string;
}

export type Period =
    | { kind: "week" }
    | { kind: "month" }
    | { kind: "year" }
    | { kind: "days"; days: number }
    | FixedWindow;

/** What reading a fixed window takes besides the value itself. */
export interface PeriodContext {
    /** the formats period names are read in, and the parse that reads them */
    names: PeriodNames;
    /** the name of the note the block sits in, for `note`; absent when there is none */
    noteName?: string;
}

export interface PeriodReading {
    period: Period | null;
    /**
     * Set when the value is plainly a window that cannot be built: `note` in
     * a note whose name is not a period, `from`/`to` that do not read. An
     * error the config must fix; a value that is simply not a window at all
     * leaves it unset and the caller says so in its own words.
     */
    problem?: string;
}

/** A rolling window shorter than a day or longer than ten years is not a habit tracker anymore. */
const MIN_DAYS = 1;
const MAX_DAYS = 3650;

/**
 * `week`, `month`, `year`, or a rolling window: `30d`, `30 d`, a bare `30`.
 * With a `context` (B-129) also `note`, a period written out (`2026-W40`,
 * `2026-10`, `2026-Q4`, `2026`, `2026-10-01`) and `{ from, to }`. Case and
 * surrounding space do not matter. Anything else is null, and the caller
 * reports it rather than guessing what was meant.
 */
export function parsePeriod(raw: unknown, context?: PeriodContext): Period | null {
    return readPeriodValue(raw, "period", context).period;
}

/**
 * `parsePeriod` with the reason a window could not be built (`problem`).
 * `key` is the key the value was written under, `period` or `range`, for
 * the message.
 *
 * A bare number is read as a period name first: `2026` is the year, while
 * `30`, which no format reads as a period, stays thirty days. `2026d` is
 * always days.
 */
export function readPeriodValue(raw: unknown, key: string, context?: PeriodContext): PeriodReading {
    if (isRecord(raw)) return context ? readBounds(raw, key) : { period: null };
    const written = (typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "").trim();
    const text = written.toLowerCase();
    if (!text) return { period: null };
    if (text === "week" || text === "month" || text === "year") return { period: { kind: text } };

    if (context && text === "note") {
        const name = context.noteName ?? "";
        const named = readPeriodName(name, context.names);
        if (named) return { period: { kind: "fixed", unit: named.unit, start: named.start, end: named.end } };
        return {
            period: null,
            problem: t("period.noteNotAPeriod", { key, name, formats: expectedNames(context.names) }),
        };
    }

    if (context && !/d$/.test(text)) {
        const named = readPeriodName(written, context.names);
        if (named) return { period: { kind: "fixed", unit: named.unit, start: named.start, end: named.end } };
    }

    const match = /^(\d+)\s*d?$/.exec(text);
    if (!match?.[1]) return { period: null };
    const days = Number(match[1]);
    return { period: days >= MIN_DAYS && days <= MAX_DAYS ? { kind: "days", days } : null };
}

/** A bound written as `YYYY-MM-DD`, or a Date a YAML date became; null for anything else. */
function readBound(raw: unknown): string | null {
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : dateKey(raw);
    if (typeof raw !== "string") return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (!match) return null;
    const [, y = "", m = "", d = ""] = match;
    return isRealDate(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : null;
}

/**
 * `{ from, to }`: both inclusive, `from` alone runs to today. `to` alone is
 * refused, since a window without a start has nothing to compare against
 * and no first bucket, and so is `from` after `to`.
 */
function readBounds(raw: Record<string, unknown>, key: string): PeriodReading {
    const invalid = (): PeriodReading => ({
        period: null,
        problem: t("period.boundsInvalid", { key, value: describeValue(raw) }),
    });
    if (Object.keys(raw).some((k) => k !== "from" && k !== "to")) return invalid();
    // Own keys only: the map reaches here as YAML wrote it (shared/parse.ts#MAP_KEYS).
    const own = (k: string): unknown => (Object.prototype.hasOwnProperty.call(raw, k) ? raw[k] : undefined);
    const rawFrom = own("from");
    const rawTo = own("to");
    if (rawFrom === undefined) {
        return rawTo === undefined ? invalid() : { period: null, problem: t("period.boundsNoFrom", { key }) };
    }
    const from = readBound(rawFrom);
    const to = rawTo === undefined ? undefined : readBound(rawTo);
    if (from === null || to === null) return invalid();
    if (to !== undefined && from > to) return { period: null, problem: t("period.boundsOrder", { key, from, to }) };
    const period: FixedWindow = { kind: "fixed", unit: "span", start: from };
    if (to !== undefined) period.end = to;
    return { period };
}

/**
 * Not called `Window`: that shadows the DOM type of the same name, and,
 * lower case, is exactly the trap `core/aggregate.ts#series` already
 * sidesteps — both the popout scanner and a reader take `window.` for a call
 * on the browser global.
 */
export interface DateWindow {
    /**
     * inclusive, YYYY-MM-DD; `""` means open at the start (`usualWindow`),
     * which only `filterByWindow` reads: every key compares after it
     */
    start: string;
    /** inclusive, YYYY-MM-DD: today, or a fixed window's own end when that comes first */
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
        case "fixed":
            // A window still running counts up to today, as `week` does; one
            // not started yet comes out with its start after its end, empty.
            return { start: period.start, end: period.end !== undefined && period.end < end ? period.end : end };
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
        case "fixed":
            return previousFixedWindow(period, today);
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

/** Where a window lies against today. A window that moves with today is always `current`. */
export type WindowTense = "past" | "current" | "future";

export function windowTense(period: Period, today: Date): WindowTense {
    if (period.kind !== "fixed") return "current";
    const key = dateKey(today);
    if (period.start > key) return "future";
    return period.end !== undefined && period.end < key ? "past" : "current";
}

/** The first day of a window still ahead of today, or null for one that has started or moves with today. */
export function futureStart(period: Period, today: Date): string | null {
    return period.kind === "fixed" && windowTense(period, today) === "future" ? period.start : null;
}

/**
 * The last day a window counts, as a Date: today, or a closed window's own
 * last day. What `current_streak` counts back from and where `trend` ends
 * (B-129): a weekly review keeps reading its own week a year later.
 */
export function windowLastDay(period: Period | undefined, today: Date): Date {
    if (period?.kind !== "fixed") return today;
    return parseDateKey(periodWindow(period, today, 0).end);
}

/**
 * True when a window ended before today, so its last day is over too. Such a
 * day gets no grace from `current_streak` (B-173): unfilled, it breaks the
 * run. A window still running, one that moves with today, or none at all is
 * never over.
 */
export function windowIsOver(period: Period | undefined, today: Date): boolean {
    return period !== undefined && windowTense(period, today) === "past";
}

/**
 * The first day of the week inside a window. A named week starts its week
 * where its own first day falls, which for a locale week (`gggg-[W]ww`) can
 * differ from the interface language's first day (ADR 0006). Every other
 * window keeps `firstDay`.
 */
export function windowFirstDay(period: Period | undefined, firstDay: number): number {
    return period?.kind === "fixed" && period.unit === "week" ? parseDateKey(period.start).getDay() : firstDay;
}

/**
 * A fixed window that is one week: a named week, or a `from`/`to` of seven
 * days starting on `firstDay`, the locale's first day of the week. Seven days
 * from a Wednesday are a plain stretch of days, not a week.
 */
export function isWeekWindow(period: Period, firstDay: number): period is FixedWindow & { end: string } {
    if (period.kind !== "fixed" || period.end === undefined) return false;
    if (period.unit === "week") return true;
    return period.unit === "span" && daysBetween(period.start, period.end) === 6
        && parseDateKey(period.start).getDay() === firstDay;
}

/** A fixed window that is one calendar month, 1st to last day: a named month, or a `from`/`to` written that way. */
export function isMonthWindow(period: Period): period is FixedWindow & { end: string } {
    if (period.kind !== "fixed" || period.end === undefined) return false;
    if (period.unit === "month") return true;
    const first = parseDateKey(period.start);
    return period.unit === "span" && first.getDate() === 1
        && period.end === dateKey(new Date(first.getFullYear(), first.getMonth() + 1, 0));
}

/** `date` moved back by one period of `unit`, the day of the month clamped to what the earlier month has. */
function shiftBack(date: Date, unit: PeriodUnit): Date {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    switch (unit) {
        case "day":
            return new Date(y, m, d - 1);
        case "week":
            return new Date(y, m, d - 7);
        case "month":
        case "quarter":
        case "year": {
            const back = unit === "month" ? 1 : unit === "quarter" ? 3 : 12;
            return new Date(y, m - back, Math.min(d, daysInMonth(y, m - back)));
        }
    }
}

/**
 * What a fixed window is compared with (ADR 0006). A closed day, week,
 * month, quarter or year: the whole period before it, so June is compared
 * with the whole of May however long each is. One still running: the same
 * stretch of the previous period to date, as `period: week` does. `from`/
 * `to`: as many days as the window counts, right before `from`.
 */
function previousFixedWindow(period: FixedWindow, today: Date): DateWindow {
    const bounds = periodWindow(period, today, 0);
    const start = parseDateKey(bounds.start);
    const dayBefore = dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1));
    if (period.unit === "span") {
        const length = daysBetween(bounds.start, bounds.end) + 1;
        return { start: dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() - length)), end: dayBefore };
    }
    const previousStart = dateKey(shiftBack(start, period.unit));
    if (windowTense(period, today) !== "current") return { start: previousStart, end: dayBefore };
    const sameDay = dateKey(shiftBack(today, period.unit));
    return { start: previousStart, end: sameDay < dayBefore ? sameDay : dayBefore };
}

/**
 * Everything before a window starts, for `compare: usual` (B-135): the
 * card's history, with the window itself left out so this week is not
 * measured against an average it is part of. Open at the start: every dated
 * note before the window counts, however old.
 */
export function usualWindow(period: Period, today: Date, firstDay: number): DateWindow {
    const start = parseDateKey(periodWindow(period, today, firstDay).start);
    return { start: "", end: dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1)) };
}

/**
 * A note's date under `period`. The single resolver in `core/note-date.ts`,
 * re-exported here under its established name: `streak`, `latest` and
 * `trend` (`core/aggregate.ts`) and the heatmap (`blocks/heatmap.ts`) all
 * call it too, so a note's date can only be decided in one place.
 */
export const noteDate = resolveNoteDate;

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
    formats?: DateFormats,
): PeriodFilter {
    let anyDated = false;
    const out: NoteRecord[] = [];
    for (const note of notes) {
        const key = noteDate(note, dateField, formats);
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
    formats?: DateFormats,
): PeriodFilter {
    return filterByWindow(notes, periodWindow(period, today, firstDay), dateField, formats);
}

export interface PeriodSpec {
    period: Period;
    dateField?: string;
}

export interface PeriodOutcome {
    /** null — no period was asked for, or it could not be read */
    spec: PeriodSpec | null;
    diagnostics: Diagnostic[];
    /**
     * True when `period` names a window that cannot be built (`problem` on
     * `PeriodReading`): the card counts nothing rather than everything.
     */
    broken: boolean;
}

/**
 * Parses `period:` off a card or bar. `dateField` is what `core/note-date.ts`'s
 * `readDateField` already read off the same item — passed in rather than
 * re-parsed here, because whether it is "used" now depends on more than
 * `period` alone (see `dateFieldHasEffect`), a decision this function has no
 * view of. `label` names the card in diagnostics, the same way every other
 * reader in `core/` does.
 */
export function readPeriod(
    item: Record<string, unknown>,
    label: string,
    dateField?: string,
    context?: PeriodContext,
): PeriodOutcome {
    const diagnostics: Diagnostic[] = [];

    if (item.period === undefined) return { spec: null, diagnostics, broken: false };

    const { period, problem } = readPeriodValue(item.period, "period", context);
    if (!period) {
        const card = label ? `"${label}"` : t("stats.unlabeledCard");
        diagnostics.push(problem
            ? { level: "error", message: t("period.atCard", { card, message: problem }) }
            : { level: "warning", message: t("period.invalid", { card, value: describeValue(item.period) }) });
        return { spec: null, diagnostics, broken: problem !== undefined };
    }

    const spec: PeriodSpec = { period };
    if (dateField) spec.dateField = dateField;
    return { spec, diagnostics, broken: false };
}

/**
 * Whether `date_field` does anything for this card or bar. It steers four
 * consumers that resolve a note's date: `period`'s window, `streak` (and
 * `current_streak`), `latest` and `trend`. Anything else — `count`, `sum`, `avg`, `min`, `max`
 * with no `period` and no `trend` — never looks at a note's date at all, so
 * `date_field` next to one of those is a no-op worth a warning. `hasTrend`
 * is left `undefined` by `progress`, which has no `trend`.
 *
 * `hasPeriod`/`hasTrend` mean "the config asked for it", not "it parsed": the
 * caller passes `item.period !== undefined` / `item.trend !== undefined`
 * rather than whether `readPeriod`/`readStat` actually produced a spec. An
 * unreadable `period: fortnight` or `trend: bogus` already has its own
 * diagnostic; piling "date_field has no effect" on top of it would be a
 * second warning for one mistake, and a misleading one — `date_field` would
 * have worked fine once the real problem was fixed.
 */
export function dateFieldHasEffect(hasPeriod: boolean, agg?: Agg, hasTrend?: boolean): boolean {
    return hasPeriod || (agg !== undefined && isStreakAgg(agg)) || agg === "latest" || Boolean(hasTrend);
}

export type BetterDirection = "up" | "down";

/**
 * What a delta is taken against: the same stretch of the previous period
 * (`compare: true`), or the card's usual level before the window (`compare:
 * usual`, B-135).
 */
export type CompareAgainst = "previous" | "usual";

export interface CompareSpec {
    against: CompareAgainst;
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
 * card's own aggregate, when it parsed: `streak` and `current_streak` are
 * refused, the same way `trend` refuses `count` — a streak has no value of
 * its own for the previous period to sit next to, and a current streak in a
 * window that has already ended is always cut off before today.
 *
 * `compare: usual` (B-135) takes the delta against the card's average before
 * the window (`usualWindow`) instead, and works with `agg: avg` only.
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

    // `compare: usual` (B-135): the delta against the card's usual level.
    const usual = typeof rawCompare === "string" && rawCompare.trim().toLowerCase() === "usual";

    // A non-boolean `compare` (the `yaml` package hands back "yes", "true" or
    // 1 as-is, none of them `true`) drew nothing and warned about nothing —
    // the config looked like it worked and silently did not.
    if (rawCompare !== undefined && typeof rawCompare !== "boolean" && !usual) {
        diagnostics.push({
            level: "warning",
            message: t("compare.notBoolean", { card, value: describeValue(rawCompare) }),
        });
        return { spec: null, diagnostics };
    }

    if (rawCompare !== true && !usual) {
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

    // The usual level is an average; a usual sum or count depends on how
    // long the history is, which says nothing about this week.
    if (usual && agg !== undefined && agg !== "avg") {
        diagnostics.push({ level: "warning", message: t("compare.usualNeedsAvg", { card }) });
        return { spec: null, diagnostics };
    }

    if (agg !== undefined && isStreakAgg(agg)) {
        diagnostics.push({ level: "warning", message: t("compare.streakUnsupported", { card }) });
        return { spec: null, diagnostics };
    }

    if (betterGiven && !better) {
        diagnostics.push({
            level: "warning",
            message: t("compare.badBetter", { card, value: describeValue(rawBetter) }),
        });
    }

    const spec: CompareSpec = { against: usual ? "usual" : "previous" };
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
export function formatDelta(
    current: number,
    previous: number,
    precision?: number,
    duration = false,
    clock = false,
): DeltaFormat {
    // A duration card (core/duration.ts) rounds and prints its own way,
    // ignoring `precision`: `+32m`, not `+32`. A clock card (B-145) keeps
    // its clock and its seconds in the delta too: `−0:01:12`.
    const round = (v: number): number => (duration ? roundedDuration(v, clock) : roundedValue(v, precision));
    const format = (v: number): string => (duration ? formatDuration(v, clock) : formatValue(v, precision));
    const delta = round(current) - round(previous);
    const magnitude = format(Math.abs(delta));
    if (magnitude === format(0)) return { arrow: "=", text: magnitude, direction: "flat" };
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

/** What a `compare: usual` delta compares with, for a tooltip: "vs usual: 85". */
export function usualCaption(usualText: string): string {
    return t("compare.vsUsual", { value: usualText });
}

/**
 * What the delta compares with, for a tooltip: "vs the same days last week:
 * 1". `previousText` is the previous window's value, already formatted with
 * the card's own precision. `today` tells a fixed window that is still
 * running, compared to date, from a closed one, compared whole.
 */
export function compareCaption(period: Period, previousText: string, today?: Date): string {
    switch (period.kind) {
        case "fixed":
            return fixedCompareCaption(period, previousText, today);
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

function fixedCompareCaption(period: FixedWindow, previousText: string, today?: Date): string {
    const value = previousText;
    if (period.unit === "span") {
        const bounds = periodWindow(period, today ?? parseDateKey(period.end ?? period.start), 0);
        return tPlural("compare.vsDays", daysBetween(bounds.start, bounds.end) + 1, { value });
    }
    if (today && windowTense(period, today) === "current") {
        switch (period.unit) {
            case "week":
                return t("compare.vsWeek", { value });
            case "month":
                return t("compare.vsMonth", { value });
            case "quarter":
                return t("compare.vsQuarter", { value });
            case "year":
                return t("compare.vsYear", { value });
            case "day":
                return t("compare.vsPreviousDay", { value });
        }
    }
    switch (period.unit) {
        case "day":
            return t("compare.vsPreviousDay", { value });
        case "week":
            return t("compare.vsPreviousWeek", { value });
        case "month":
            return t("compare.vsPreviousMonth", { value });
        case "quarter":
            return t("compare.vsPreviousQuarter", { value });
        case "year":
            return t("compare.vsPreviousYear", { value });
    }
}
