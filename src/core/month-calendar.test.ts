import { describe, it, expect } from "vitest";
import {
    readLayout, calendarWindow, calendarMonths, layoutCalendar, noteDots, layerDots, MAX_NOTE_DOTS, MAX_LAYER_DOTS,
    type CalendarDay,
} from "./month-calendar";

const SUNDAY = 0;
const MONDAY = 1;

/** A week row as day numbers, `0` for a pad slot: easy to read against a printed calendar. */
const numbers = (week: readonly (CalendarDay | null)[] | undefined): number[] => (week ?? []).map((d) => d?.day ?? 0);

describe("readLayout", () => {
    it("absent is the grid, silently", () => {
        expect(readLayout({}, { kind: "month" })).toEqual({ layout: "grid", diagnostics: [] });
    });

    it("grid is the grid, silently, whatever the range", () => {
        expect(readLayout({ layout: "grid" }, undefined)).toEqual({ layout: "grid", diagnostics: [] });
    });

    it("calendar with range: month or range: week is a calendar, silently", () => {
        expect(readLayout({ layout: "calendar" }, { kind: "month" })).toEqual({ layout: "calendar", diagnostics: [] });
        expect(readLayout({ layout: "calendar" }, { kind: "week" })).toEqual({ layout: "calendar", diagnostics: [] });
    });

    it("an unknown value warns, naming it, and falls back to the grid", () => {
        const outcome = readLayout({ layout: "month" }, { kind: "month" });
        expect(outcome.layout).toBe("grid");
        expect(outcome.diagnostics).toEqual([
            { level: "warning", message: "`layout` expects grid or calendar, got \"month\". Using grid." },
        ]);
    });

    it("calendar without a range, or with any other range, warns and falls back to the grid", () => {
        for (const range of [undefined, { kind: "year" } as const, { kind: "days", days: 30 } as const]) {
            const outcome = readLayout({ layout: "calendar" }, range);
            expect(outcome.layout).toBe("grid");
            expect(outcome.diagnostics).toEqual([{
                level: "warning",
                message: "`layout: calendar` needs `range: month` or `range: week`. Drawing the grid instead.",
            }]);
        }
    });

    it("bands with a calendar warn that they are ignored; with a grid they stay silent", () => {
        expect(readLayout({ layout: "calendar", bands: [90, 80] }, { kind: "month" }).diagnostics).toEqual([{
            level: "warning",
            message: "`bands` is ignored with `layout: calendar`: a day shows dots, not a shade.",
        }]);
        // The calendar fell back to the grid, where bands do shade: no word about them.
        expect(readLayout({ layout: "calendar", bands: [90, 80] }, { kind: "year" }).diagnostics).toHaveLength(1);
        expect(readLayout({ layout: "grid", bands: [90, 80] }, { kind: "month" }).diagnostics).toEqual([]);
    });
});

describe("calendarWindow", () => {
    it("range: month is the whole month, past today to its last day", () => {
        expect(calendarWindow({ kind: "month" }, new Date(2026, 9, 6), MONDAY))
            .toEqual({ start: "2026-10-01", end: "2026-10-31" });
    });

    it("ends February on the 28th, or the 29th in a leap year", () => {
        expect(calendarWindow({ kind: "month" }, new Date(2026, 1, 10), MONDAY)?.end).toBe("2026-02-28");
        expect(calendarWindow({ kind: "month" }, new Date(2028, 1, 10), MONDAY)?.end).toBe("2028-02-29");
    });

    it("range: week is seven days from the locale's first day of the week", () => {
        // 2026-10-06 is a Tuesday.
        expect(calendarWindow({ kind: "week" }, new Date(2026, 9, 6), MONDAY))
            .toEqual({ start: "2026-10-05", end: "2026-10-11" });
        expect(calendarWindow({ kind: "week" }, new Date(2026, 9, 6), SUNDAY))
            .toEqual({ start: "2026-10-04", end: "2026-10-10" });
    });

    it("a week crossing the month boundary crosses it", () => {
        // 2026-09-30 is a Wednesday.
        expect(calendarWindow({ kind: "week" }, new Date(2026, 8, 30), MONDAY))
            .toEqual({ start: "2026-09-28", end: "2026-10-04" });
    });

    it("any other window has no calendar", () => {
        expect(calendarWindow({ kind: "year" }, new Date(2026, 9, 6), MONDAY)).toBeNull();
        expect(calendarWindow({ kind: "days", days: 30 }, new Date(2026, 9, 6), MONDAY)).toBeNull();
    });
});

describe("calendarMonths", () => {
    const first = (d: Date | null | undefined): string | null => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

    it("a month, or a week inside one month, names that one month", () => {
        for (const bounds of [{ start: "2026-10-01", end: "2026-10-31" }, { start: "2026-10-04", end: "2026-10-10" }]) {
            const months = calendarMonths(bounds);
            expect(first(months.from)).toBe("2026-10-1");
            expect(months.to).toBeNull();
        }
    });

    it("a week crossing into the next month names both", () => {
        const months = calendarMonths({ start: "2026-09-27", end: "2026-10-03" });
        expect([first(months.from), first(months.to)]).toEqual(["2026-9-1", "2026-10-1"]);
    });

    it("a week crossing into the next year names both years", () => {
        const months = calendarMonths({ start: "2026-12-27", end: "2027-01-02" });
        expect([first(months.from), first(months.to)]).toEqual(["2026-12-1", "2027-1-1"]);
    });
});

describe("layoutCalendar", () => {
    it("a month whose 1st is the first day of the week has no padding before it", () => {
        // 1 June 2026 is a Monday: in a Monday-first locale it opens the first row.
        const today = new Date(2026, 5, 30);
        const { weeks } = layoutCalendar({ start: "2026-06-01", end: "2026-06-30" }, today, MONDAY);
        expect(numbers(weeks[0])).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(numbers(weeks.at(-1))).toEqual([29, 30, 0, 0, 0, 0, 0]);
        expect(weeks).toHaveLength(5);
    });

    it("the same month in a Sunday-first locale pads one slot before the 1st", () => {
        const today = new Date(2026, 5, 30);
        const { weeks } = layoutCalendar({ start: "2026-06-01", end: "2026-06-30" }, today, SUNDAY);
        expect(numbers(weeks[0])).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(numbers(weeks.at(-1))).toEqual([28, 29, 30, 0, 0, 0, 0]);
        expect(weeks).toHaveLength(5);
    });

    it("every row has exactly seven slots, and every day of the month appears once, in order", () => {
        const { weeks } = layoutCalendar({ start: "2026-10-01", end: "2026-10-31" }, new Date(2026, 9, 6), MONDAY);
        expect(weeks.every((w) => w.length === 7)).toBe(true);
        const days = weeks.flat().filter((d): d is CalendarDay => d !== null);
        expect(days.map((d) => d.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
        expect(days[0]?.key).toBe("2026-10-01");
        expect(days.at(-1)?.key).toBe("2026-10-31");
        // 1 October 2026 is a Thursday: three pad slots in a Monday-first week.
        expect(numbers(weeks[0])).toEqual([0, 0, 0, 1, 2, 3, 4]);
    });

    it("February 2026 starts on a Sunday: four full rows in a Sunday-first locale, five in a Monday-first one", () => {
        const bounds = { start: "2026-02-01", end: "2026-02-28" };
        const today = new Date(2026, 1, 28);
        const sunday = layoutCalendar(bounds, today, SUNDAY).weeks;
        expect(sunday).toHaveLength(4);
        expect(numbers(sunday[0])).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(numbers(sunday[3])).toEqual([22, 23, 24, 25, 26, 27, 28]);

        const monday = layoutCalendar(bounds, today, MONDAY).weeks;
        expect(monday).toHaveLength(5);
        expect(numbers(monday[0])).toEqual([0, 0, 0, 0, 0, 0, 1]);
        expect(numbers(monday[4])).toEqual([23, 24, 25, 26, 27, 28, 0]);
    });

    it("February 2028 has its 29th", () => {
        // 1 February 2028 is a Tuesday.
        const { weeks } = layoutCalendar({ start: "2028-02-01", end: "2028-02-29" }, new Date(2028, 1, 29), MONDAY);
        expect(numbers(weeks[0])).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(numbers(weeks.at(-1))).toEqual([28, 29, 0, 0, 0, 0, 0]);
    });

    it("days after today are marked future, and only days up to today are counted", () => {
        const { weeks, pastKeys } = layoutCalendar({ start: "2026-10-01", end: "2026-10-31" }, new Date(2026, 9, 6), MONDAY);
        const days = weeks.flat().filter((d): d is CalendarDay => d !== null);
        expect(days.filter((d) => !d.future).map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(days.find((d) => d.day === 7)?.future).toBe(true);
        expect(pastKeys).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]);
    });

    it("a week is one row of seven days, no padding, crossing into the next month", () => {
        const today = new Date(2026, 8, 30); // Wednesday
        const { weeks, pastKeys } = layoutCalendar({ start: "2026-09-28", end: "2026-10-04" }, today, MONDAY);
        expect(weeks).toHaveLength(1);
        expect(numbers(weeks[0])).toEqual([28, 29, 30, 1, 2, 3, 4]);
        expect(weeks[0]?.map((d) => d?.future)).toEqual([false, false, false, true, true, true, true]);
        expect(pastKeys).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
    });

    it("an unreadable start lays out nothing rather than spinning", () => {
        expect(layoutCalendar({ start: "nope", end: "2026-10-31" }, new Date(2026, 9, 6), MONDAY).pastKeys).toEqual([]);
    });
});

describe("noteDots", () => {
    it("one dot per painting note, capped at three", () => {
        expect([0, 1, 3, 5].map((n) => noteDots(n, false))).toEqual([0, 1, 3, 3]);
        expect(MAX_NOTE_DOTS).toBe(3);
    });

    it("a day still ahead shows none, whatever is there", () => {
        expect(noteDots(2, true)).toBe(0);
    });
});

describe("layerDots", () => {
    const layer = (painted: Record<string, boolean>): Map<string, { painted: boolean }> =>
        new Map(Object.entries(painted).map(([day, p]) => [day, { painted: p }]));

    it("every layer painted that day, in list order, skipping one with no mark and one with only false", () => {
        const perLayer = [
            layer({ "2026-10-02": true }),
            layer({ "2026-10-02": false }),
            layer({ "2026-10-02": true }),
            layer({}),
        ];
        expect(layerDots(perLayer, "2026-10-02", false)).toEqual([0, 2]);
    });

    it("caps at four layers, the first four painted in list order", () => {
        const perLayer = Array.from({ length: 6 }, () => layer({ "2026-10-02": true }));
        expect(layerDots(perLayer, "2026-10-02", false)).toEqual([0, 1, 2, 3]);
        expect(MAX_LAYER_DOTS).toBe(4);
    });

    it("a day nothing painted, or a day still ahead, shows none", () => {
        const perLayer = [layer({ "2026-10-02": true })];
        expect(layerDots(perLayer, "2026-10-03", false)).toEqual([]);
        expect(layerDots(perLayer, "2026-10-02", true)).toEqual([]);
    });
});
