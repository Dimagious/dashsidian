import { describe, it, expect, afterEach } from "vitest";
import {
    periodNames, readPeriodName, periodEnd, expectedNames, noteNameFromPath, ISO_PERIOD_FORMATS, weekYearFormat,
} from "./period-name";
import type { ParseDate } from "./note-date";
import { parsePeriodStart, setDateLocale, firstDayOfWeek } from "../adapters/datetime";

const iso = periodNames({}, parsePeriodStart);

afterEach(() => setDateLocale(null));

describe("readPeriodName: the ISO names, with no Periodic Notes settings (B-129)", () => {
    it("reads a day, a week, a month, a quarter and a year, each with both ends", () => {
        expect(readPeriodName("2026-10-01", iso)).toEqual({ unit: "day", start: "2026-10-01", end: "2026-10-01" });
        // ISO week 40 of 2026 runs Monday 28 September to Sunday 4 October.
        expect(readPeriodName("2026-W40", iso)).toEqual({ unit: "week", start: "2026-09-28", end: "2026-10-04" });
        expect(readPeriodName("2026-10", iso)).toEqual({ unit: "month", start: "2026-10-01", end: "2026-10-31" });
        expect(readPeriodName("2026-Q4", iso)).toEqual({ unit: "quarter", start: "2026-10-01", end: "2026-12-31" });
        expect(readPeriodName("2026", iso)).toEqual({ unit: "year", start: "2026-01-01", end: "2026-12-31" });
    });

    it("`2026` does not take `2026-10` for itself, and a month is not read as a year", () => {
        expect(readPeriodName("2026-10", iso)?.unit).toBe("month");
        expect(readPeriodName("2026", iso)?.unit).toBe("year");
        expect(readPeriodName("2026-10-01", iso)?.unit).toBe("day");
    });

    it("quarter boundaries: each quarter is its own three months, February in a leap year included", () => {
        expect(readPeriodName("2026-Q1", iso)).toMatchObject({ start: "2026-01-01", end: "2026-03-31" });
        expect(readPeriodName("2026-Q2", iso)).toMatchObject({ start: "2026-04-01", end: "2026-06-30" });
        expect(readPeriodName("2026-Q3", iso)).toMatchObject({ start: "2026-07-01", end: "2026-09-30" });
        expect(readPeriodName("2028-Q1", iso)).toMatchObject({ start: "2028-01-01", end: "2028-03-31" });
    });

    it("a week crossing the new year keeps its ISO year: 2026-W01 starts on 29 December 2025", () => {
        expect(readPeriodName("2026-W01", iso)).toEqual({ unit: "week", start: "2025-12-29", end: "2026-01-04" });
        expect(readPeriodName("2026-W53", iso)).toEqual({ unit: "week", start: "2026-12-28", end: "2027-01-03" });
    });

    it("strict: no prefix match, no overflow, no guessing", () => {
        for (const name of ["2026-W40 review", "2026-13", "2026-Q5", "2026-Q0", "2025-W53", "W40", "Shopping", "", "  ", "2026-02-30"]) {
            expect(readPeriodName(name, iso), name).toBeNull();
        }
    });

    it("surrounding space does not matter", () => {
        expect(readPeriodName(" 2026-10 ", iso)?.unit).toBe("month");
    });
});

describe("readPeriodName: Periodic Notes formats first, ISO after (B-129)", () => {
    it("a locale week (`gggg-[W]ww`) starts where moment's own locale starts it, Sunday in English", () => {
        const names = periodNames({ week: "gggg-[W]ww" }, parsePeriodStart);
        expect(readPeriodName("2026-W40", names)).toEqual({ unit: "week", start: "2026-09-27", end: "2026-10-03" });
    });

    it("the locale week follows the app's moment, not the language picked in Dashy's settings", () => {
        // German starts the week on Monday; the app's moment (English here)
        // starts it on Sunday, and that is the one Periodic Notes wrote with.
        setDateLocale("de");
        expect(firstDayOfWeek()).toBe(1);
        const names = periodNames({ week: "gggg-[W]ww" }, parsePeriodStart);
        expect(readPeriodName("2026-W40", names)?.start).toBe("2026-09-27");
        expect(new Date(2026, 8, 27).getDay()).toBe(0);
    });

    it("a name that does not fit the settings format still reads as ISO", () => {
        const names = periodNames({ week: "gggg-[Week]-ww", month: "MMMM YYYY" }, parsePeriodStart);
        expect(readPeriodName("2026-W40", names)?.start).toBe("2026-09-28");
        expect(readPeriodName("October 2026", names)).toEqual({ unit: "month", start: "2026-10-01", end: "2026-10-31" });
        expect(readPeriodName("2026-Week-40", names)?.start).toBe("2026-09-27");
    });

    it("the day reads in the Daily notes format too, and only the part after the last slash names the note", () => {
        const names = periodNames({ day: "YYYY/MM/DD.MM.YYYY", quarter: "Quarters/YYYY-[Q]Q", year: "[Year] YYYY" }, parsePeriodStart);
        expect(readPeriodName("05.10.2026", names)).toEqual({ unit: "day", start: "2026-10-05", end: "2026-10-05" });
        expect(readPeriodName("Year 2026", names)?.unit).toBe("year");
        expect(names.formats.filter((f) => f.unit === "quarter")).toEqual([{ unit: "quarter", format: "YYYY-[Q]Q" }]);
    });

    it("a settings format that cannot name its unit is left out: no year, or the wrong unit", () => {
        const names = periodNames({ week: "YYYY/[W]ww", month: "YYYY-MM-DD", year: "YYYY-MM", quarter: "YYYY" }, parsePeriodStart);
        expect(names.formats).toEqual(Object.entries(ISO_PERIOD_FORMATS).map(([unit, format]) => ({ unit, format })));
        // Without the left-out monthly format, a day is still a day.
        expect(readPeriodName("2026-10-01", names)?.unit).toBe("day");
    });

    it("the order is the smallest unit first, the settings format before ISO within one", () => {
        const names = periodNames({ day: "DD.MM.YYYY", week: "gggg-[W]ww" }, parsePeriodStart);
        expect(names.formats.map((f) => f.format)).toEqual([
            "DD.MM.YYYY", "YYYY-MM-DD", "gggg-[W]ww", "GGGG-[W]WW", "YYYY-MM", "YYYY-[Q]Q", "YYYY",
        ]);
        expect(expectedNames(names)).toBe("DD.MM.YYYY, YYYY-MM-DD, gggg-[W]ww, GGGG-[W]WW, YYYY-MM, YYYY-[Q]Q, YYYY");
    });

    it("expectedNames lists a format once even when the settings repeat ISO", () => {
        expect(expectedNames(periodNames({ day: "YYYY-MM-DD", month: "YYYY-MM" }, parsePeriodStart)))
            .toBe("YYYY-MM-DD, GGGG-[W]WW, YYYY-MM, YYYY-[Q]Q, YYYY");
    });
});

describe("weekYearFormat: the week-year a calendar-year weekly format should use (B-191)", () => {
    it("puts the locale week-year beside `ww` and the ISO one beside `WW`", () => {
        expect(weekYearFormat("YYYY-[W]ww")).toBe("gggg-[W]ww");
        expect(weekYearFormat("YYYY-[W]WW")).toBe("GGGG-[W]WW");
        expect(weekYearFormat("YY[w]w")).toBe("gg[w]w");
    });

    it("leaves text in brackets alone", () => {
        expect(weekYearFormat("[Year] YYYY [Week] ww")).toBe("[Year] gggg [Week] ww");
    });

    it("is null for a format that already names the week-year, or names no week", () => {
        expect(weekYearFormat("gggg-[W]ww")).toBeNull();
        expect(weekYearFormat("GGGG-[W]WW")).toBeNull();
        expect(weekYearFormat("YYYY-MM")).toBeNull();
        expect(weekYearFormat("YYYY-[Week]")).toBeNull();
    });
});

describe("readPeriodName: a week across New Year in a calendar-year format (B-191)", () => {
    /** What moment returns for these names in English: the first day of the week each names. */
    const starts: Record<string, string> = {
        "YYYY-[W]ww 2026-W01": "2025-12-28",
        "YYYY-[W]ww 2026-W52": "2026-12-20",
        "YYYY-[W]ww 2026-W41": "2026-10-04",
        "YYYY-[W]WW 2026-W01": "2025-12-29",
        "YYYY-[W]WW 2026-W53": "2026-12-28",
        "gggg-[W]ww 2026-W01": "2025-12-28",
        "GGGG-[W]WW 2026-W01": "2025-12-29",
        "GGGG-[W]WW 2027-W01": "2027-01-04",
    };
    const parse: ParseDate = (text, format) => starts[`${format} ${text}`] ?? null;
    const weekly = (format: string): ReturnType<typeof periodNames> => periodNames({ week: format }, parse);

    it("flags locale week 1 that starts in December, with the `gggg` format to use", () => {
        expect(readPeriodName("2026-W01", weekly("YYYY-[W]ww"))).toEqual({
            unit: "week", start: "2025-12-28", end: "2026-01-03", weekYearFormat: "gggg-[W]ww",
        });
    });

    it("flags ISO week 1 starting in December and week 53 ending in January, with the `GGGG` format", () => {
        expect(readPeriodName("2026-W01", weekly("YYYY-[W]WW"))?.weekYearFormat).toBe("GGGG-[W]WW");
        expect(readPeriodName("2026-W53", weekly("YYYY-[W]WW"))).toEqual({
            unit: "week", start: "2026-12-28", end: "2027-01-03", weekYearFormat: "GGGG-[W]WW",
        });
    });

    it("does not flag a calendar-year week that stays inside one year, late December included", () => {
        expect(readPeriodName("2026-W52", weekly("YYYY-[W]ww"))).toEqual({ unit: "week", start: "2026-12-20", end: "2026-12-26" });
        expect(readPeriodName("2026-W41", weekly("YYYY-[W]ww"))).toEqual({ unit: "week", start: "2026-10-04", end: "2026-10-10" });
    });

    it("does not flag a week across New Year named by its week-year, set or ISO", () => {
        expect(readPeriodName("2026-W01", weekly("gggg-[W]ww"))).toEqual({ unit: "week", start: "2025-12-28", end: "2026-01-03" });
        // No settings: the ISO `GGGG-[W]WW` reads it.
        expect(readPeriodName("2026-W01", periodNames({}, parse))).toEqual({ unit: "week", start: "2025-12-29", end: "2026-01-04" });
    });
});

describe("readPeriodName with `tail`: a note's name may go on after the period (B-198)", () => {
    const tail = { tail: true } as const;

    it("reads a week, month, quarter or day followed by a space, `_` or `-` and words", () => {
        const week = { unit: "week", start: "2026-10-05", end: "2026-10-11" };
        for (const name of ["2026-W41 Weekly", "2026-W41_notes", "2026-W41-notes", "2026-W41 - plan", "2026-W41  (draft)", "2026-W41_"]) {
            expect(readPeriodName(name, iso, tail), name).toEqual(week);
        }
        expect(readPeriodName("2026-10 Monthly Review", iso, tail)).toEqual({ unit: "month", start: "2026-10-01", end: "2026-10-31" });
        expect(readPeriodName("2026-Q4 review", iso, tail)).toEqual({ unit: "quarter", start: "2026-10-01", end: "2026-12-31" });
        expect(readPeriodName("2026-10-05 Monday", iso, tail)).toEqual({ unit: "day", start: "2026-10-05", end: "2026-10-05" });
    });

    it("reads the names in the settings formats too, a locale week and a month spelled out", () => {
        const names = periodNames({ week: "gggg-[W]ww", month: "MMMM YYYY" }, parsePeriodStart);
        expect(readPeriodName("2026-W41 Weekly", names, tail)).toEqual({ unit: "week", start: "2026-10-04", end: "2026-10-10" });
        // The longest start is tried first, so the space inside the format keeps the year.
        expect(readPeriodName("October 2026 review", names, tail)).toEqual({ unit: "month", start: "2026-10-01", end: "2026-10-31" });
    });

    it("keeps the smallest unit first: a day with words after it is a day, not its month", () => {
        expect(readPeriodName("2026-10-05 x", iso, tail)?.unit).toBe("day");
        expect(readPeriodName("2026-10-05", iso, tail)?.unit).toBe("day");
    });

    it("a year takes no tail: `2026 goals` is no period, the bare `2026` still is", () => {
        expect(readPeriodName("2026 goals", iso, tail)).toBeNull();
        expect(readPeriodName("2026_goals", iso, tail)).toBeNull();
        expect(readPeriodName("2026", iso, tail)?.unit).toBe("year");
        const named = periodNames({ year: "[Year] YYYY" }, parsePeriodStart);
        expect(readPeriodName("Year 2026 plan", named, tail)).toBeNull();
    });

    it("refuses a tail with no separator, a digit after the separator, an invalid period or words before it", () => {
        for (const name of [
            "2026-W41Weekly", "2026-W410", "2026-W4 x", "2026-13 x", "2026-Q5 x", "2026-Q0 x", "Weekly 2026-W41",
            "2026-10-32 x", "2026-10 05", "2026-10_05 x", "2026-10 - 05", "2026-W41-3", "2026-10-1 x", "2026-1 x",
        ]) {
            expect(readPeriodName(name, iso, tail), name).toBeNull();
        }
    });

    it("without `tail` a name with words after the period is still no period", () => {
        expect(readPeriodName("2026-W41 Weekly", iso)).toBeNull();
        expect(readPeriodName("2026-10 Monthly Review", iso, { tail: false })).toBeNull();
    });

    it("a week across New Year with words after it still carries the week-year format (B-191)", () => {
        const names = periodNames({ week: "YYYY-[W]ww" }, parsePeriodStart);
        expect(readPeriodName("2026-W01 Weekly", names, tail)).toEqual({
            unit: "week", start: "2025-12-28", end: "2026-01-03", weekYearFormat: "gggg-[W]ww",
        });
        expect(readPeriodName("2026-W41 Weekly", names, tail)?.weekYearFormat).toBeUndefined();
    });
});

describe("periodEnd", () => {
    it("ends a period on its own last day, across months, years and leap days", () => {
        expect(periodEnd("day", "2026-02-28")).toBe("2026-02-28");
        expect(periodEnd("week", "2026-12-28")).toBe("2027-01-03");
        expect(periodEnd("month", "2028-02-01")).toBe("2028-02-29");
        expect(periodEnd("month", "2026-02-01")).toBe("2026-02-28");
        expect(periodEnd("quarter", "2026-10-01")).toBe("2026-12-31");
        expect(periodEnd("year", "2026-01-01")).toBe("2026-12-31");
    });
});

describe("noteNameFromPath", () => {
    it("is the name after the last folder, without .md", () => {
        expect(noteNameFromPath("Periodic/Weekly/2026-W40.md")).toBe("2026-W40");
        expect(noteNameFromPath("2026-10.md")).toBe("2026-10");
        expect(noteNameFromPath("Notes/Plan.MD")).toBe("Plan");
        expect(noteNameFromPath("")).toBe("");
    });
});
