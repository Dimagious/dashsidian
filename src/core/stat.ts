/**
 * A number card: what to count and how to show it. Pure layer.
 *
 * Parsing and formatting live here rather than in blocks/stats.ts, because a
 * pure function in the drawing layer is a function outside the coverage gate.
 * That is exactly how the inverted band labels slipped through in heatmap,
 * see core/bands.ts.
 */

import { AGGS, isAgg, type Agg } from "./aggregate";
import { readTrendDays } from "./sparkline";
import { nearest, describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

export interface StatSpec {
    agg: Agg;
    /** required for everything but count and streak */
    field?: string;
    /** a suffix after the number: km, %, d. */
    unit?: string;
    /** decimal places; when unset we format the default way */
    precision?: number;
    /** how many days of history to sketch beside the number */
    trend?: number;
}

/** Aggregates that need no field: they count notes, not numbers inside them. */
const FIELDLESS: readonly Agg[] = ["count", "streak"];

const MAX_PRECISION = 6;

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

    return { spec, diagnostics };
}

/**
 * A number turned into card text.
 *
 * A dash rather than a zero: "nothing to count" and "counted zero" are
 * different answers, and passing the first off as the second lies about the
 * data.
 *
 * Without `precision` a whole number stays whole and a fraction is rounded to
 * one decimal: otherwise `avg` prints 72.83333333333333 and breaks the card
 * layout.
 */
export function formatValue(value: number | null, precision?: number): string {
    if (value === null || !Number.isFinite(value)) return "—";
    if (precision !== undefined) {
        const fixed = value.toFixed(precision);
        // toFixed keeps the sign of a value that rounds to nothing: -0.04 at
        // one decimal came out as "-0.0", which reads as a measurement.
        return group(Number(fixed) === 0 ? (0).toFixed(precision) : fixed);
    }
    if (Number.isInteger(value)) return group(String(value));
    return group(String(Math.round(value * 10) / 10));
}

/** A narrow no-break space: digit groups must not wrap across lines. */
const GROUP_SEPARATOR = " ";

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
