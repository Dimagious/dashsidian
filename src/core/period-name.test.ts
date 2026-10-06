import { describe, it, expect, afterEach } from "vitest";
import {
    periodNames, readPeriodName, periodEnd, expectedNames, noteNameFromPath, ISO_PERIOD_FORMATS,
} from "./period-name";
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
