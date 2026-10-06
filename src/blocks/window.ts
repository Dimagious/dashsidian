import { formatDayMedium, formatYear, monthYearLong } from "../adapters/datetime";
import { parseDateKey } from "../core/calendar";
import { periodWindow, type Period } from "../core/period";
import { t } from "../i18n";

/**
 * What a block says in place of its numbers when its window has not started
 * yet (B-129), a note on next week opened today: the day it starts, in the
 * locale's own medium date; `start` is that first day, `YYYY-MM-DD`.
 */
export function notStartedNotice(start: string): string {
    return t("period.noteFuture", { date: formatDayMedium(parseDateKey(start)) });
}

/**
 * A fixed window as a reader names it, for a chart's heading: "October
 * 2026", "2026", "Oct 1, 2026", or its two ends for a week, a quarter and
 * `from`/`to`. The end is the window's own, or today for `from` alone.
 * Undefined for a window that moves with today, which the caption names
 * by its length instead.
 */
export function windowLabel(period: Period, today: Date): string | undefined {
    if (period.kind !== "fixed") return undefined;
    const start = parseDateKey(period.start);
    switch (period.unit) {
        case "day":
            return formatDayMedium(start);
        case "month":
            return monthYearLong(start);
        case "year":
            return formatYear(start);
        default: {
            const end = period.end ?? periodWindow(period, today, 0).end;
            return t("period.windowSpan", { from: formatDayMedium(start), to: formatDayMedium(parseDateKey(end)) });
        }
    }
}
