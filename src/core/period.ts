/**
 * A time window for `stats` and `progress`: this week, this month, this year,
 * or a rolling count of days, always ending today. Pure layer: `today` and
 * `firstDay` are passed in by the caller rather than read from the wall clock
 * or from Obsidian's locale, so a test can put "today" anywhere it likes.
 */

import type { NoteRecord } from "./source";
import { dateKey, weekdayRow } from "./calendar";
import { DATE_NAME } from "./aggregate";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

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
 * narrowed to the window. `anyDated` is what lets the caller tell an honest
 * empty week (a real answer, `count` 0) from "not one of these notes has a
 * date", which needs a warning rather than a silent zero.
 */
export function filterByPeriod(
    notes: readonly NoteRecord[],
    period: Period,
    today: Date,
    firstDay: number,
    dateField?: string,
): PeriodFilter {
    const bounds = periodWindow(period, today, firstDay);
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
