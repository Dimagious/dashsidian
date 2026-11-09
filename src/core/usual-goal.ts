/**
 * `goal: usual` on a progress bar (B-209): a goal that follows the bar's own
 * history instead of a number written once and left to go stale. The goal
 * is the mean of the bar's own aggregate over the periods of the same kind
 * right before its window: the last four months for `period: month`, the
 * four weeks before this one for `period: week`, four back-to-back 30-day
 * stretches before this one for `period: 30d`.
 *
 * Pure layer: `today` and `firstDay` come from the caller, as everywhere in
 * `core/period.ts`, whose window this module steps back from.
 */

import type { NoteRecord } from "./source";
import { dateKey, parseDateKey } from "./calendar";
import { aggregate, type Agg, type AggregateSpec } from "./aggregate";
import { resolveNoteDate } from "./note-date";
import { periodWindow, type DateWindow, type Period } from "./period";
import { roundedValue } from "./stat";
import { roundedDuration } from "./duration";
import type { Diagnostic } from "../shared/parse";
import { t } from "../i18n";

/** How many past periods `goal: usual` averages when `{ usual: N }` names no other number. */
export const USUAL_PERIODS = 4;

/**
 * The most periods `goal: { usual: N }` takes: ten years of months. Each
 * period is one more pass over the selection, and block YAML is untrusted
 * input: `{ usual: 1e9 }` would freeze the note on every redraw.
 */
export const MAX_USUAL_PERIODS = 120;

/** A goal the bar's history sets: the mean over this many past periods. */
export interface UsualGoalSpec {
    usual: number;
}

/** One step back from a window: a number of days, or of calendar months. */
type Step = { days: number } | { months: number };

/**
 * How far one period of this kind reaches back, or null for `{ from, to }`,
 * which has no kind to repeat. A named week or day keeps its own length; a
 * named month, quarter or year steps by whole months from its first day.
 */
function stepOf(period: Period): Step | null {
    switch (period.kind) {
        case "days":
            return { days: period.days };
        case "week":
            return { days: 7 };
        case "month":
            return { months: 1 };
        case "year":
            return { months: 12 };
        case "fixed":
            switch (period.unit) {
                case "span":
                    return null;
                case "day":
                    return { days: 1 };
                case "week":
                    return { days: 7 };
                case "month":
                    return { months: 1 };
                case "quarter":
                    return { months: 3 };
                case "year":
                    return { months: 12 };
            }
    }
}

/**
 * The `count` whole periods right before the window `period` names, the
 * nearest first. Each starts where the next one's start steps back by one
 * period, so they lie back to back with no gap and no overlap, and the
 * last one ends the day before the window starts.
 *
 * Calendar periods start where the window does: `week` on `firstDay`, the
 * locale's first day of the week, a named week (`2026-W40`) on its own
 * first day, and a month, quarter or year on the 1st. A rolling `30d` steps
 * back 30 days at a time. Null for `{ from, to }`: a span written once does
 * not repeat, so there are no periods "of the same kind" before it.
 */
export function usualWindows(period: Period, today: Date, firstDay: number, count: number): DateWindow[] | null {
    const step = stepOf(period);
    if (!step) return null;
    const start = parseDateKey(periodWindow(period, today, firstDay).start);
    const y = start.getFullYear();
    const m = start.getMonth();
    const d = start.getDate();
    const out: DateWindow[] = [];
    for (let k = 1; k <= count; k++) {
        if ("days" in step) {
            out.push({
                start: dateKey(new Date(y, m, d - k * step.days)),
                end: dateKey(new Date(y, m, d - (k - 1) * step.days - 1)),
            });
        } else {
            // Day 0 of a month is the last day of the month before it.
            out.push({
                start: dateKey(new Date(y, m - k * step.months, 1)),
                end: dateKey(new Date(y, m - (k - 1) * step.months, 0)),
            });
        }
    }
    return out;
}

/**
 * Aggregates whose answer over a period with nothing in it is zero rather
 * than "no value": no note is no count, no run and nothing added up. An
 * `avg`, `min`, `max` or `latest` over nothing has no value, and a period
 * like that is left out of the mean instead of pulling it towards zero.
 */
const ZERO_WHEN_EMPTY: readonly Agg[] = ["count", "sum", "streak", "current_streak"];

export interface UsualGoal {
    /** the mean over the periods that counted; null when none did */
    value: number | null;
    /** how many past periods the mean was taken over */
    counted: number;
    /**
     * true when every period's own value was a whole number, as a count or a
     * sum of whole steps is: the mean of 7, 6, 7 and 6 is shown as 7, the way
     * the value next to it is, not as 6.5 (`roundedGoal`)
     */
    whole: boolean;
}

/**
 * The mean of the bar's aggregate over `windows` (`usualWindows`), measured
 * on `selected`, the bar's selection before its own `period` narrows it.
 *
 * A period that ends before the selection's first dated note is skipped:
 * a vault started in July has no June to be measured against, and a zero for
 * it would set the goal too low. A period after that with nothing in it
 * counts as zero for `count`, `sum` and the streaks (`ZERO_WHEN_EMPTY`) and
 * is skipped for the rest. Each period is aggregated as a closed window, its
 * last day the day `current_streak` counts back from, with no grace.
 */
export function usualGoal(
    selected: readonly NoteRecord[],
    windows: readonly DateWindow[],
    spec: Omit<AggregateSpec, "today" | "graceToday">,
): UsualGoal {
    const dated: { key: string; note: NoteRecord }[] = [];
    let first: string | null = null;
    for (const note of selected) {
        const key = resolveNoteDate(note, spec.dateField, spec.formats);
        if (key === null) continue;
        dated.push({ key, note });
        if (first === null || key < first) first = key;
    }
    if (first === null) return { value: null, counted: 0, whole: true };

    let total = 0;
    let counted = 0;
    let whole = true;
    for (const bounds of windows) {
        if (bounds.end < first) continue;
        const inside = dated.filter((d) => d.key >= bounds.start && d.key <= bounds.end).map((d) => d.note);
        const value = aggregate(inside, { ...spec, today: parseDateKey(bounds.end), graceToday: false })
            ?? (ZERO_WHEN_EMPTY.includes(spec.agg) ? 0 : null);
        if (value === null) continue;
        total += value;
        counted++;
        if (!Number.isInteger(value)) whole = false;
    }
    return { value: counted ? total / counted : null, counted, whole };
}

/**
 * The usual goal as the bar shows it, so the goal it is measured against is
 * the number the reader sees: a mean of 47.75 at `precision: 0` reads `48`,
 * and 48 of 48 is 100%. A duration rounds the way it is printed. Without
 * `precision`, a mean of whole values (`whole`, from `usualGoal`) stays
 * whole like the values it comes from; any other keeps one decimal, as a
 * value does.
 */
export function roundedGoal(
    value: number,
    format: { precision?: number; duration?: boolean; clock?: boolean; whole?: boolean },
): number {
    if (format.duration) return roundedDuration(value, format.clock ?? false);
    if (format.precision === undefined && format.whole) return Math.round(value);
    return roundedValue(value, format.precision);
}

/**
 * What `goal: usual` needs from the bar's window, `period` after root
 * inheritance (`core/inherit.ts`). `periodWritten` is whether the config
 * set one at all: a `period` that was written and could not be read has its
 * own diagnostic, and this one would only double it.
 *
 * No `period`: an error naming the fix, the bar cannot draw. `{ from, to }`:
 * a warning, a span has no periods before it, and the value is shown with
 * no goal. Null when the usual goal can be worked out.
 */
export function usualGoalProblem(card: string, period: Period | null, periodWritten: boolean): Diagnostic | null {
    if (!periodWritten) return { level: "error", message: t("progress.usualNeedsPeriod", { card }) };
    if (period?.kind === "fixed" && period.unit === "span") {
        return { level: "warning", message: t("progress.usualNeedsRepeating", { card }) };
    }
    return null;
}
