/**
 * A number card: what to count and how to show it. Pure layer.
 *
 * Parsing and formatting live here rather than in blocks/stats.ts, because a
 * pure function in the drawing layer is a function outside the coverage gate.
 * That is exactly how the inverted band labels slipped through in heatmap,
 * see core/bands.ts.
 */

import { AGGS, isAgg, isStreakAgg, isStreakDays, type Agg, type StreakDays } from "./aggregate";
import { readTrendDays } from "./sparkline";
import { readThreshold, formatDuration } from "./duration";
import type { FieldValueKind, ValueKind } from "./aggregate";
import { nearest, describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

export interface StatSpec {
    agg: Agg;
    /** required for everything but count, streak and current_streak */
    field?: string;
    /** a suffix after the number: km, %, d. */
    unit?: string;
    /** decimal places; when unset we format the default way */
    precision?: number;
    /** how many days of history to sketch beside the number */
    trend?: number;
    /** `agg: streak`/`current_streak` only: inclusive lower bound on a day's summed field value */
    atLeast?: number;
    /** `agg: streak`/`current_streak` only: inclusive upper bound on a day's summed field value */
    atMost?: number;
    /** `agg: streak`/`current_streak` only: unset/`"all"` counts every day, `"weekdays"` skips Saturday and Sunday */
    days?: StreakDays;
    /** `agg: streak`/`current_streak` only: a property marking a day special (vacation, sick); see core/special-days.ts */
    skipField?: string;
    /**
     * Thresholds (`at_least`, `at_most`, a progress `goal`) written as a
     * duration string, as written. Already applied as minutes; kept so the
     * block can warn once it knows the field holds plain numbers instead
     * (`durationDiagnostics`).
     */
    durationThresholds?: DurationThreshold[];
}

/** A threshold key and the duration text it was written with, for a diagnostic. */
export interface DurationThreshold {
    key: string;
    value: string;
}

/** Records a threshold written as a duration string; `raw` is a string whenever `readThreshold` said so. */
export function noteDurationThreshold(spec: StatSpec, key: string, raw: unknown): void {
    (spec.durationThresholds ??= []).push({ key, value: String(raw) });
}

/** Aggregates that need no field: they count notes, not numbers inside them. */
const FIELDLESS: readonly Agg[] = ["count", "streak", "current_streak"];

/** The most decimals `precision` accepts, on a card and on a chart alike. */
export const MAX_PRECISION = 6;

export interface StatOutcome {
    /** null — nothing to count, the card will show a dash */
    spec: StatSpec | null;
    diagnostics: Diagnostic[];
}

/**
 * Parses a single card. Never throws: anything unclear turns into a diagnostic
 * that the block draws next to the dashboard.
 *
 * `label` is only used in messages — without it, five cards give no clue which
 * one holds the mistake.
 */
export function readStat(item: Record<string, unknown>, label: string): StatOutcome {
    const diagnostics: Diagnostic[] = [];
    const card = label ? `"${label}"` : t("stats.unlabeledCard");
    const available = AGGS.join(", ");

    const rawAgg = item.agg ?? "count";
    if (!isAgg(rawAgg)) {
        const guess = typeof rawAgg === "string" ? nearest(rawAgg, AGGS) : null;
        const agg = describeValue(rawAgg);
        diagnostics.push({
            level: "error",
            message: guess
                ? t("stats.unknownAggGuess", { card, agg, guess, available })
                : t("stats.unknownAgg", { card, agg, available }),
        });
        return { spec: null, diagnostics };
    }

    // Checked against the raw agg, ahead of everything else below, so it
    // fires whatever else is also wrong with the card (a missing `field`
    // included) rather than only when the rest of the card parses cleanly.
    if (!isStreakAgg(rawAgg) && (item.at_least !== undefined || item.at_most !== undefined
        || item.days !== undefined || item.skip_field !== undefined)) {
        diagnostics.push({ level: "warning", message: t("stats.streakKeysIgnored", { card }) });
    }

    const field = typeof item.field === "string" && item.field.trim() ? item.field.trim() : undefined;
    if (!field && !FIELDLESS.includes(rawAgg)) {
        diagnostics.push({
            level: "error",
            message: t("stats.fieldRequired", { card, agg: rawAgg }),
        });
        return { spec: null, diagnostics };
    }

    const spec: StatSpec = { agg: rawAgg };
    if (field) spec.field = field;
    if (typeof item.unit === "string" && item.unit.trim()) spec.unit = item.unit.trim();

    if (item.precision !== undefined) {
        const p = item.precision;
        if (typeof p === "number" && Number.isInteger(p) && p >= 0 && p <= MAX_PRECISION) {
            spec.precision = p;
        } else {
            diagnostics.push({
                level: "warning",
                message: t("stats.badPrecision", { card, max: MAX_PRECISION, value: describeValue(p) }),
            });
        }
    }

    if (item.trend !== undefined) {
        const days = readTrendDays(item.trend);
        if (days === null) {
            diagnostics.push({
                level: "warning",
                message: t("stats.trendInvalid", { card, value: describeValue(item.trend) }),
            });
        } else if (!field) {
            // `count` has a number but no series behind it: there is nothing
            // to draw a shape from.
            diagnostics.push({ level: "warning", message: t("stats.trendNeedsField", { card }) });
        } else {
            spec.trend = days;
        }
    }

    if (isStreakAgg(rawAgg)) {
        if (item.at_least !== undefined || item.at_most !== undefined) {
            if (!field) {
                diagnostics.push({ level: "warning", message: t("stats.streakThresholdNeedsField", { card }) });
            } else {
                let atLeast: number | undefined;
                let atMost: number | undefined;
                if (item.at_least !== undefined) {
                    const threshold = readThreshold(item.at_least);
                    if (threshold) {
                        atLeast = threshold.value;
                        if (threshold.duration) noteDurationThreshold(spec, "at_least", item.at_least);
                    } else {
                        diagnostics.push({
                            level: "warning",
                            message: t("stats.streakThresholdInvalid", {
                                card, key: "at_least", value: describeValue(item.at_least),
                            }),
                        });
                    }
                }
                if (item.at_most !== undefined) {
                    const threshold = readThreshold(item.at_most);
                    if (threshold) {
                        atMost = threshold.value;
                        if (threshold.duration) noteDurationThreshold(spec, "at_most", item.at_most);
                    } else {
                        diagnostics.push({
                            level: "warning",
                            message: t("stats.streakThresholdInvalid", {
                                card, key: "at_most", value: describeValue(item.at_most),
                            }),
                        });
                    }
                }
                // Still computed, not refused: `longestStreak` over an empty
                // set of qualifying days honestly comes out 0, the same dash
                // free honesty as an all-false field above.
                if (atLeast !== undefined && atMost !== undefined && atLeast > atMost) {
                    diagnostics.push({ level: "warning", message: t("stats.streakThresholdImpossible", { card }) });
                }
                if (atLeast !== undefined) spec.atLeast = atLeast;
                if (atMost !== undefined) spec.atMost = atMost;
            }
        }

        if (item.days !== undefined) {
            if (isStreakDays(item.days)) {
                spec.days = item.days;
            } else {
                diagnostics.push({
                    level: "warning",
                    message: t("stats.streakDaysInvalid", { card, value: describeValue(item.days) }),
                });
            }
        }

        if (item.skip_field !== undefined) {
            if (typeof item.skip_field === "string" && item.skip_field.trim()) {
                spec.skipField = item.skip_field.trim();
            } else {
                diagnostics.push({
                    level: "warning",
                    message: t("stats.skipFieldInvalid", { card, value: describeValue(item.skip_field) }),
                });
            }
        }
    }

    return { spec, diagnostics };
}

/**
 * The number as it will be displayed, before grouping: same rounding
 * `formatValue` applies, exposed as a number rather than text.
 *
 * `core/period.ts` uses this to compute a delta from the values as shown
 * rather than from the raw difference — otherwise a card rounded to whole
 * numbers could read 11 and 10 while the delta beneath it, built from the
 * unrounded 10.6 and 10.4, printed "no change".
 *
 * Without `precision` a whole number stays whole and a fraction is rounded to
 * one decimal: otherwise `avg` prints 72.83333333333333 and breaks the card
 * layout.
 */
export function roundedValue(value: number, precision?: number): number {
    if (precision !== undefined) {
        const fixed = value.toFixed(precision);
        // toFixed keeps the sign of a value that rounds to nothing: -0.04 at
        // one decimal came out as "-0.0", which reads as a measurement.
        return Number(fixed) === 0 ? 0 : Number(fixed);
    }
    return Number.isInteger(value) ? value : Math.round(value * 10) / 10;
}

/**
 * A number turned into card text.
 *
 * A dash rather than a zero: "nothing to count" and "counted zero" are
 * different answers, and passing the first off as the second lies about the
 * data.
 */
export function formatValue(value: number | null, precision?: number): string {
    if (value === null || !Number.isFinite(value)) return "—";
    const rounded = roundedValue(value, precision);
    return group(precision !== undefined ? rounded.toFixed(precision) : String(rounded));
}

/**
 * A narrow no-break space between digit groups. Exported so the drawing
 * layer can split the formatted text back into its groups and place a
 * `<wbr>` right after each separator: a number may still break across
 * lines on a narrow card, but only between groups, never inside one.
 */
export const GROUP_SEPARATOR = " ";

/**
 * Splits the integer part into groups of three: 1138758 is unreadable on a card.
 *
 * Up to four digits are left alone — otherwise a year like 2026 turns into
 * "2 026", and that is an ordinal, not a quantity.
 */
function group(text: string): string {
    const dot = text.indexOf(".");
    const int = dot === -1 ? text : text.slice(0, dot);
    const frac = dot === -1 ? "" : text.slice(dot);
    const sign = int.startsWith("-") ? "-" : "";
    const digits = sign ? int.slice(1) : int;
    if (digits.length <= 4) return text;
    return sign + digits.replace(/\B(?=(\d{3})+$)/g, GROUP_SEPARATOR) + frac;
}

/**
 * A CSS modifier for a value too wide for the card's usual type size, decided
 * from the length of the formatted text (the unit is excluded — it wraps to
 * its own line before the number does, so it plays no part in this).
 *
 * The thresholds are picked so a value of one to six digits reads exactly as
 * before: the widest of those, "999 999", is 7 characters, so nothing below
 * 9 gets a class. A 7-digit value ("3 307 952", 9 characters — the card that
 * prompted this) is the shortest one that needs to shrink. A 9-digit value
 * ("123 456 789", 11 characters) needs the smaller size still.
 */
export function valueLengthClass(text: string): "" | "is-long" | "is-very-long" {
    if (text.length >= 11) return "is-very-long";
    if (text.length >= 9) return "is-long";
    return "";
}

/** Aggregates whose answer is one of the field's own values, or their sum or mean: a duration stays a duration. */
const DURATION_AGGS: readonly Agg[] = ["sum", "avg", "min", "max", "latest"];

/**
 * Whether a card's number is a length of time and shows as `5h 58m`: only
 * when every value the field contributed is a duration string, and only for
 * an aggregate that returns one of those values or their sum or mean.
 * `count`, `streak` and `current_streak` count notes and days, never time, whatever the field
 * holds; a `mixed` field is counted in minutes but shown as a plain number.
 */
export function showsDuration(agg: Agg, kind: ValueKind): boolean {
    return kind === "duration" && DURATION_AGGS.includes(agg);
}

/**
 * B-145: a duration card whose field holds only values written down to the
 * second (`2:16:32`, race times) reads as a clock, `H:MM:SS`. One value
 * without seconds and the card reads `7h 30m` as before.
 */
export function showsClock(agg: Agg, kind: FieldValueKind): boolean {
    return showsDuration(agg, kind.kind) && kind.clock === true;
}

/**
 * The card's number as text: a duration (`precision` has no effect there),
 * as a clock when `clock` is set, or a plain number.
 */
export function formatReading(value: number | null, precision: number | undefined, duration: boolean, clock = false): string {
    return duration ? formatDuration(value, clock) : formatValue(value, precision);
}

/**
 * Everything worth saying about durations on one card or bar, once the
 * field's values are known (`classifyValues`, core/aggregate.ts). `card` is
 * the already quoted label every other card message starts with.
 *
 *   - a field mixing durations and plain numbers, naming one note of each;
 *   - a `unit` on a card shown as a duration, which already carries units;
 *   - a threshold written as a duration: against a `count`/streak goal,
 *     which counts notes or days, or against a field of plain numbers. Both
 *     are still applied as minutes, the rule for a plain number there too.
 */
export function durationDiagnostics(spec: StatSpec, kind: FieldValueKind, card: string): Diagnostic[] {
    const out: Diagnostic[] = [];
    const field = spec.field ?? "";
    // A count, or a streak with no threshold, reads the same whatever the
    // values' kind: the mix changes nothing the card shows.
    const countsOnly = spec.agg === "count"
        || (isStreakAgg(spec.agg) && spec.atLeast === undefined && spec.atMost === undefined);
    if (kind.kind === "mixed" && !countsOnly) {
        out.push({
            level: "warning",
            message: t("stats.durationMixed", {
                card, field, durationNote: kind.durationNote ?? "", plainNote: kind.plainNote ?? "",
            }),
        });
    }
    if (spec.unit && showsDuration(spec.agg, kind.kind)) {
        out.push({ level: "warning", message: t("stats.durationUnitIgnored", { card, unit: spec.unit, field }) });
    }
    for (const threshold of spec.durationThresholds ?? []) {
        if (threshold.key === "goal" && (spec.agg === "count" || isStreakAgg(spec.agg))) {
            out.push({
                level: "warning",
                message: t("progress.goalDurationOnCount", { card, value: threshold.value, agg: spec.agg }),
            });
        } else if (kind.kind === "plain") {
            out.push({
                level: "warning",
                message: t("stats.durationThresholdOnPlain", { card, key: threshold.key, value: threshold.value, field }),
            });
        }
    }
    return out;
}
