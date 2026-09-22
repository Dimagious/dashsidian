import { describe, it, expect } from "vitest";
import {
    dateKey,
    daysBetween,
    layoutYear,
    eachDay,
    longestStreak,
    currentStreak,
    yearsOf,
} from "./calendar";

describe("dateKey", () => {
    it("builds YYYY-MM-DD from a local date", () => {
        expect(dateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
        expect(dateKey(new Date(2026, 8, 22))).toBe("2026-09-22");
    });

    it("does not slip a day back the way toISOString does east of UTC", () => {
        // Local midnight in a positive offset is the previous day in UTC.
        // This is exactly what threw the whole grid off in the first version.
        const midnight = new Date(2026, 2, 29, 0, 0, 0);
        expect(dateKey(midnight)).toBe("2026-03-29");
    });
});

describe("daysBetween", () => {
    it("counts whole days", () => {
        expect(daysBetween("2026-01-01", "2026-01-02")).toBe(1);
        expect(daysBetween("2026-01-01", "2026-02-01")).toBe(31);
        expect(daysBetween("2026-01-02", "2026-01-01")).toBe(-1);
    });

    it("survives a daylight saving switch", () => {
        expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
        expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    });
});

describe("layoutYear", () => {
    it("puts 1 January 2026 on a Thursday: offset 3", () => {
        const l = layoutYear(2026, new Date(2026, 8, 22));
        expect(l.offset).toBe(3);
    });

    it("the current year is cut off at today", () => {
        const l = layoutYear(2026, new Date(2026, 8, 22));
        expect(l.total).toBe(265); // 1 January to 22 September
        expect(l.columns).toBe(39);
    });

    it("a past year is taken whole", () => {
        const l = layoutYear(2025, new Date(2026, 8, 22));
        expect(l.total).toBe(365);
    });

    it("a leap year has 366 days", () => {
        const l = layoutYear(2024, new Date(2026, 8, 22));
        expect(l.total).toBe(366);
    });

    it("every cell lands in the row of its weekday", () => {
        const l = layoutYear(2026, new Date(2026, 11, 31));
        for (let i = 0; i < l.total; i++) {
            const row = (i + l.offset) % 7;
            const weekday = (new Date(2026, 0, 1 + i).getDay() + 6) % 7;
            expect(row).toBe(weekday);
        }
    });

    it("month labels stay inside the grid", () => {
        const l = layoutYear(2026, new Date(2026, 8, 22));
        expect(l.months).toHaveLength(9); // January through September
        expect(l.months[0]).toEqual({ month: 0, column: 1 });
        for (const m of l.months) expect(m.column).toBeLessThanOrEqual(l.columns);
    });
});

describe("eachDay", () => {
    it("returns keys in ascending order", () => {
        const days = eachDay(2026, 3);
        expect(days).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    });
});

describe("longestStreak", () => {
    it("finds the longest run", () => {
        expect(longestStreak(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05"])).toBe(3);
    });

    it("does not depend on input order", () => {
        expect(longestStreak(["2026-01-05", "2026-01-02", "2026-01-01", "2026-01-03"])).toBe(3);
    });

    it("an empty set is zero", () => {
        expect(longestStreak([])).toBe(0);
    });

    it("a single day is one", () => {
        expect(longestStreak(["2026-01-01"])).toBe(1);
    });
});

describe("currentStreak", () => {
    it("counts the run that reaches today", () => {
        const dates = ["2026-09-20", "2026-09-21", "2026-09-22"];
        expect(currentStreak(dates, "2026-09-22")).toBe(3);
    });

    it("a missing today breaks the run", () => {
        expect(currentStreak(["2026-09-20", "2026-09-21"], "2026-09-22")).toBe(0);
    });

    it("counts across a month boundary", () => {
        expect(currentStreak(["2026-08-31", "2026-09-01"], "2026-09-01")).toBe(2);
    });
});

describe("yearsOf", () => {
    it("returns years newest first, without repeats", () => {
        expect(yearsOf(["2025-01-01", "2026-05-05", "2026-01-01"])).toEqual([2026, 2025]);
    });
});
