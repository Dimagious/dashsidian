import { describe, it, expect } from "vitest";
import {
    dateKey,
    rotateWeekdays,
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

    it("every cell lands in the row of its weekday, whatever the week starts on", () => {
        for (const firstDay of [0, 1, 6]) {
            const l = layoutYear(2026, new Date(2026, 11, 31), firstDay);
            for (let i = 0; i < l.total; i++) {
                const row = (i + l.offset) % 7;
                const weekday = ((new Date(2026, 0, 1 + i).getDay() - firstDay) % 7 + 7) % 7;
                expect(row).toBe(weekday);
            }
        }
    });

    it("a Sunday-first locale shifts the offset by one", () => {
        // 1 January 2026 is a Thursday: three cells before it when weeks start
        // on Monday, four when they start on Sunday.
        expect(layoutYear(2026, new Date(2026, 8, 22), 1).offset).toBe(3);
        expect(layoutYear(2026, new Date(2026, 8, 22), 0).offset).toBe(4);
    });

    it("Monday is the default when no locale is given", () => {
        expect(layoutYear(2026, new Date(2026, 8, 22)).offset)
            .toBe(layoutYear(2026, new Date(2026, 8, 22), 1).offset);
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

describe("rotateWeekdays", () => {
    const sundayFirst = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    it("Monday first drops Sunday to the end", () => {
        expect(rotateWeekdays(sundayFirst, 1))
            .toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    });

    it("Sunday first leaves the list as moment gives it", () => {
        expect(rotateWeekdays(sundayFirst, 0)).toEqual(sundayFirst);
    });

    it("Saturday first, as some locales want", () => {
        expect(rotateWeekdays(sundayFirst, 6)[0]).toBe("Sat");
    });

    it("keeps all seven days, never loses or repeats one", () => {
        for (let d = 0; d < 7; d++) {
            expect(new Set(rotateWeekdays(sundayFirst, d)).size).toBe(7);
        }
    });

    it("an out-of-range day wraps instead of producing a short list", () => {
        expect(rotateWeekdays(sundayFirst, 8)).toEqual(rotateWeekdays(sundayFirst, 1));
        expect(rotateWeekdays(sundayFirst, -1)).toEqual(rotateWeekdays(sundayFirst, 6));
    });
});
