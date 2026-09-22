/**
 * A bar towards a goal. Pure layer.
 *
 * Everything a card and a bar share — the aggregate, the field, the unit, the
 * precision — is read by core/stat.ts. Only the goal is new here, so this
 * module wraps readStat instead of repeating its validation.
 */

import { readStat, type StatSpec } from "./stat";
import type { Diagnostic } from "../shared/parse";
import { t } from "../i18n";

export interface ProgressSpec extends StatSpec {
    goal: number;
}

export interface ProgressOutcome {
    spec: ProgressSpec | null;
    diagnostics: Diagnostic[];
}

export function readProgress(item: Record<string, unknown>, label: string): ProgressOutcome {
    const card = label ? `"${label}"` : t("stats.unlabeledCard");
    const { spec, diagnostics } = readStat(item, label);

    // Number() would take `true` for 1 and `[5]` for 5. A goal is a number the
    // user wrote, and everything else is a mistake worth reporting.
    const written = item.goal;
    const goal = typeof written === "number"
        ? written
        : typeof written === "string" && written.trim() !== ""
            ? Number(written)
            : Number.NaN;
    if (written === undefined || !Number.isFinite(goal)) {
        diagnostics.push({ level: "error", message: t("progress.goalRequired", { card }) });
        return { spec: null, diagnostics };
    }
    // A goal of zero or less has no bar to draw: every value is already past it,
    // and dividing by it produces Infinity rather than a number anyone wants.
    if (goal <= 0) {
        diagnostics.push({ level: "error", message: t("progress.goalNotPositive", { card, goal }) });
        return { spec: null, diagnostics };
    }

    if (!spec) return { spec: null, diagnostics };
    return { spec: { ...spec, goal }, diagnostics };
}

/**
 * How far along, in percent. Not clamped: going past a goal is an achievement,
 * and hiding it behind a flat 100% would throw that away.
 */
export function percentOf(value: number | null, goal: number): number | null {
    if (value === null || !Number.isFinite(value) || goal <= 0) return null;
    return Math.round((value / goal) * 100);
}

/** What the bar itself may show: never negative, never past full. */
export function barWidth(percent: number | null): number {
    if (percent === null || !Number.isFinite(percent)) return 0;
    return Math.max(0, Math.min(100, percent));
}
