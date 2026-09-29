import { describe, it, expect } from "vitest";
import {
    dateKey,
    rotateWeekdays,
    weekdayRow,
    daysBetween,
    layoutYear,
    layoutRange,
    eachDay,
    eachDayBetween,
    longestStreak,
    currentStreak,
    isWeekend,
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

describe("layoutRange (B-093)", () => {
    it("a single day is always one column, whatever the offset", () => {
        const l = layoutRange("2026-09-22", "2026-09-22", 1);
        expect(l.total).toBe(1);
        expect(l.columns).toBe(1);
        expect(l.months).toEqual([{ month: 8, year: 2026, column: 1 }]);
    });

    it("a window that fits inside one week is one column", () => {
        // Monday to Wednesday, weeks starting on Monday: no offset, 3 days.
        const l = layoutRange("2026-09-21", "2026-09-23", 1);
        expect(l.offset).toBe(0);
        expect(l.total).toBe(3);
        expect(l.columns).toBe(1);
    });

    it("crosses a year boundary in one grid, with a month label on each side", () => {
        // 1 December 2025 is a Monday, so the window starts exactly on a
        // week boundary and January's real label lands far enough away
        // (column 5) that the synthetic December one survives too.
        const l = layoutRange("2025-12-01", "2026-01-15", 1);
        expect(l.offset).toBe(0);
        expect(l.total).toBe(46); // 1 December through 15 January inclusive
        expect(l.months).toEqual([
            { month: 11, year: 2025, column: 1 },
            { month: 0, year: 2026, column: 5 },
        ]);
    });

    // Checker round 1, B-093: the window this README example (`range: 365d`
    // from "today") actually produces used to carry two labels in the same
    // column — the synthetic September one and the real October one, both
    // landing in column 1 — which `.dashy-hm-months` (a `display: grid` row
    // with no row template of its own) then overflowed onto the cells below
    // it rather than stacking cleanly.
    it("drops the synthetic start-month label once a real one would land within the minimum spacing", () => {
        const l = layoutRange("2025-09-29", "2026-09-28", 0);
        // September (month 8) is gone; October (month 9) is the first label
        // now, sitting exactly where September's synthetic one would have.
        expect(l.months[0]).toEqual({ month: 9, year: 2025, column: 1 });
        expect(l.months.some((m) => m.month === 8 && m.year === 2025)).toBe(false);
        const columns = l.months.map((m) => m.column);
        expect(new Set(columns).size).toBe(columns.length); // no two labels share a column
    });

    it("the same drop happens for a short rolling window too, not only a year-long one", () => {
        // range: 30d from 2026-09-28: the window starts 2026-08-30, and
        // September's real 1st lands right where August's synthetic label
        // would, one column later.
        const l = layoutRange("2026-08-30", "2026-09-28", 0);
        expect(l.months).toEqual([{ month: 8, year: 2026, column: 1 }]);
    });

    it("never packs two month labels closer than a per-year grid's own minimum spacing, over every day of a year, both rolling-window lengths and both week starts", () => {
        for (const days of [30, 365]) {
            for (const firstDay of [0, 1]) {
                for (let doy = 0; doy < 365; doy++) {
                    const today = new Date(2026, 0, 1 + doy);
                    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
                    const l = layoutRange(dateKey(start), dateKey(today), firstDay);
                    for (let i = 1; i < l.months.length; i++) {
                        const gap = (l.months[i]?.column ?? 0) - (l.months[i - 1]?.column ?? 0);
                        expect(gap).toBeGreaterThanOrEqual(4);
                    }
                }
            }
        }
    });

    it("counts a leap day", () => {
        const l = layoutRange("2024-02-28", "2024-03-01");
        expect(l.total).toBe(3); // 28, 29 February, 1 March
    });

    it("survives a daylight saving switch", () => {
        // Europe's clocks spring forward on 2026-03-29.
        const l = layoutRange("2026-03-27", "2026-03-30");
        expect(l.total).toBe(4);
    });

    it("a Sunday-first locale shifts the offset the same way layoutYear does", () => {
        expect(layoutRange("2026-01-01", "2026-01-01", 1).offset).toBe(3);
        expect(layoutRange("2026-01-01", "2026-01-01", 0).offset).toBe(4);
    });

    it("every cell still lands in the row of its weekday", () => {
        for (const firstDay of [0, 1, 6]) {
            const l = layoutRange("2026-09-01", "2026-09-30", firstDay);
            const days = eachDayBetween("2026-09-01", "2026-09-30");
            days.forEach((key, i) => {
                const row = (i + l.offset) % 7;
                const weekday = weekdayRow(new Date(`${key}T00:00:00`).getDay(), firstDay);
                expect(row).toBe(weekday);
            });
        }
    });
});

describe("eachDayBetween", () => {
    it("returns keys in ascending order, both ends inclusive", () => {
        expect(eachDayBetween("2026-01-01", "2026-01-03"))
            .toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    });

    it("a single day returns just that day", () => {
        expect(eachDayBetween("2026-01-01", "2026-01-01")).toEqual(["2026-01-01"]);
    });

    it("includes a leap day", () => {
        expect(eachDayBetween("2024-02-28", "2024-03-01"))
            .toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
    });

    it("crosses a year boundary", () => {
        expect(eachDayBetween("2025-12-30", "2026-01-02"))
            .toEqual(["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
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

    it("two notes named for the same day are one day, not a break", () => {
        // A vault with Personal/2026-01-02 and Work/2026-01-02 reported 1.
        expect(longestStreak(["2026-01-01", "2026-01-02", "2026-01-02", "2026-01-03"])).toBe(3);
    });

    it("a day repeated many times still counts once", () => {
        expect(longestStreak(["2026-01-01", "2026-01-01", "2026-01-01"])).toBe(1);
    });
});

describe("longestStreak with a transparent day predicate (B-101)", () => {
    // 2026-09-18 is a Friday, 19/20 the weekend, 21 a Monday.
    const weekend = (d: string) => d === "2026-09-19" || d === "2026-09-20";

    it("a gap made only of transparent days bridges the run", () => {
        expect(longestStreak(["2026-09-18", "2026-09-21"], { transparent: weekend })).toBe(2);
    });

    it("a transparent day present in the input does not extend the run", () => {
        // The Saturday has a date in the set too (e.g. a note logged that
        // day), but it must still not count: 2, not 3.
        expect(longestStreak(["2026-09-18", "2026-09-19", "2026-09-21"], { transparent: weekend })).toBe(2);
    });

    it("a non-transparent day missing from the gap still breaks the run", () => {
        // 2026-09-23 is a Wednesday: the gap also crosses Monday and
        // Tuesday, both ordinary days that carry no date here.
        expect(longestStreak(["2026-09-18", "2026-09-23"], { transparent: weekend })).toBe(1);
    });

    it("without a predicate, behaviour is exactly as before (default weekdays)", () => {
        expect(longestStreak(["2026-09-18", "2026-09-21"])).toBe(1);
    });

    it("bridges a transparent gap across a year boundary", () => {
        // 2027-12-31 is a Friday, 2028-01-01/02 the weekend, 2028-01-03 a Monday.
        const weekendYearEnd = (d: string) => d === "2028-01-01" || d === "2028-01-02";
        expect(longestStreak(["2027-12-31", "2028-01-03"], { transparent: weekendYearEnd })).toBe(2);
    });

    it("bridges a transparent gap through a daylight-saving change", () => {
        // 2026-03-27 is a Friday, 28/29 the weekend (Europe's clocks skip
        // forward on the 29th), 2026-03-30 a Monday. `isWeekend` itself,
        // not the September-only `weekend` above, since these are March dates.
        expect(longestStreak(["2026-03-27", "2026-03-30"], { transparent: isWeekend })).toBe(2);
    });
});

describe("isWeekend", () => {
    it("Saturday and Sunday are the weekend", () => {
        expect(isWeekend("2026-09-19")).toBe(true);
        expect(isWeekend("2026-09-20")).toBe(true);
    });

    it("every other day is not", () => {
        expect(isWeekend("2026-09-18")).toBe(false);
        expect(isWeekend("2026-09-21")).toBe(false);
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

describe("weekdayRow", () => {
    it("the first day of the week is row zero", () => {
        expect(weekdayRow(0, 0)).toBe(0);
        expect(weekdayRow(1, 1)).toBe(0);
    });

    it("Monday sits in row 1 of a Sunday-first week and row 0 of a Monday-first one", () => {
        expect(weekdayRow(1, 0)).toBe(1);
        expect(weekdayRow(1, 1)).toBe(0);
    });

    it("Sunday wraps to the last row when the week starts on Monday", () => {
        expect(weekdayRow(0, 1)).toBe(6);
    });

    it("always lands inside the seven rows", () => {
        for (let weekday = 0; weekday < 7; weekday++) {
            for (let firstDay = 0; firstDay < 7; firstDay++) {
                const row = weekdayRow(weekday, firstDay);
                expect(row).toBeGreaterThanOrEqual(0);
                expect(row).toBeLessThan(7);
            }
        }
    });
});
