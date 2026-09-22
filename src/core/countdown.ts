/**
 * How long until a date. Pure layer.
 */

import { daysBetween } from "./calendar";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CountdownSpec {
    /** YYYY-MM-DD */
    date: string;
}

export interface CountdownOutcome {
    spec: CountdownSpec | null;
    diagnostics: Diagnostic[];
}

/**
 * Normalises whatever YAML produced into a YYYY-MM-DD key.
 *
 * A bare `2026-11-15` is a string under the YAML 1.2 core schema, but a Date
 * arrives too when a parser follows 1.1, so both are accepted. The date is
 * rebuilt from its local parts rather than through toISOString, which shifts
 * local midnight a day back east of UTC.
 */
export function readDateKey(raw: unknown): string | null {
    if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime())) return null;
        const m = String(raw.getMonth() + 1).padStart(2, "0");
        const d = String(raw.getDate()).padStart(2, "0");
        return `${raw.getFullYear()}-${m}-${d}`;
    }
    if (typeof raw !== "string") return null;

    const text = raw.trim();
    if (!DATE_PATTERN.test(text)) return null;

    // The pattern lets 2026-02-31 through; only a round trip catches it.
    const [y, m, d] = text.split("-").map(Number) as [number, number, number];
    const probe = new Date(y, m - 1, d);
    const sane = probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
    return sane ? text : null;
}

export function readCountdown(item: Record<string, unknown>, label: string): CountdownOutcome {
    const diagnostics: Diagnostic[] = [];
    const card = label ? `"${label}"` : t("stats.unlabeledCard");

    if (item.date === undefined || item.date === null || item.date === "") {
        diagnostics.push({ level: "error", message: t("countdown.dateRequired", { card }) });
        return { spec: null, diagnostics };
    }

    const date = readDateKey(item.date);
    if (!date) {
        diagnostics.push({
            level: "error",
            message: t("countdown.dateInvalid", { card, date: describeValue(item.date) }),
        });
        return { spec: null, diagnostics };
    }

    return { spec: { date }, diagnostics };
}

/**
 * Whole days from today to the date: positive ahead, negative behind, zero
 * today. Both sides are day keys, so daylight saving cannot shift the answer.
 */
export function daysUntil(date: string, today: string): number {
    return daysBetween(today, date);
}
