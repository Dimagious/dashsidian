/**
 * A bar towards a goal. Pure layer.
 *
 * Everything a card and a bar share — the aggregate, the field, the unit, the
 * precision — is read by core/stat.ts. Only the goal is new here, so this
 * module wraps readStat instead of repeating its validation.
 */

import { readStat, noteDurationThreshold, type StatSpec } from "./stat";
import { parseDuration } from "./duration";
import { MAX_USUAL_PERIODS, USUAL_PERIODS, type UsualGoalSpec } from "./usual-goal";
import { describeValue, isRecord, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

export interface ProgressSpec extends StatSpec {
    /** a number written in the config, or one the bar's history sets (`goal: usual`, B-209) */
    goal: number | UsualGoalSpec;
}

export interface ProgressOutcome {
    spec: ProgressSpec | null;
    diagnostics: Diagnostic[];
}

export function readProgress(item: Record<string, unknown>, label: string): ProgressOutcome {
    const card = label ? `"${label}"` : t("stats.unlabeledCard");
    const { spec, diagnostics } = readStat(item, label);

    // Number() would take `true` for 1 and `[5]` for 5. A goal is a number the
    // user wrote, or a duration like `8h` (read as minutes, core/duration.ts),
    // and everything else is a mistake worth reporting.
    const written = item.goal;
    const usual = readUsual(written, card, diagnostics);
    if (usual) return { spec: spec ? { ...spec, goal: usual } : null, diagnostics };
    const numeric = typeof written === "string" && written.trim() !== "" ? Number(written) : Number.NaN;
    const duration = typeof written === "string" && !Number.isFinite(numeric) ? parseDuration(written) : null;
    const goal = typeof written === "number"
        ? written
        : duration ?? numeric;
    if (written === undefined || !Number.isFinite(goal)) {
        diagnostics.push({ level: "error", message: t("progress.goalRequired", { card }) });
        return { spec: null, diagnostics };
    }
    // A goal of zero or less has no bar to draw: every value is already past it,
    // and dividing by it produces Infinity rather than a number anyone wants.
    if (goal <= 0) {
        // As written: `goal: 0h` reads back as "0h", not as the minutes it became.
        const shown = typeof written === "string" ? written.trim() : goal;
        diagnostics.push({ level: "error", message: t("progress.goalNotPositive", { card, goal: shown }) });
        return { spec: null, diagnostics };
    }

    if (!spec) return { spec: null, diagnostics };
    const withGoal: ProgressSpec = { ...spec, goal };
    if (duration !== null) noteDurationThreshold(withGoal, "goal", written);
    return { spec: withGoal, diagnostics };
}

/**
 * `goal: usual` (B-209), in any case, or `goal: { usual: N }`: the goal the
 * bar's own past periods set. A count of periods that is not a whole number
 * from 1 to `MAX_USUAL_PERIODS` warns and falls back to the default four, so the bar still
 * draws. Null for anything else, which the caller reads as a fixed goal.
 */
function readUsual(written: unknown, card: string, diagnostics: Diagnostic[]): UsualGoalSpec | null {
    if (typeof written === "string") {
        return written.trim().toLowerCase() === "usual" ? { usual: USUAL_PERIODS } : null;
    }
    if (!isRecord(written) || Object.keys(written).length !== 1 || !Object.prototype.hasOwnProperty.call(written, "usual")) {
        return null;
    }
    const count = written.usual;
    if (typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= MAX_USUAL_PERIODS) return { usual: count };
    diagnostics.push({
        level: "warning",
        message: t("progress.usualBadCount", { card, value: describeValue(count), count: USUAL_PERIODS, max: MAX_USUAL_PERIODS }),
    });
    return { usual: USUAL_PERIODS };
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
