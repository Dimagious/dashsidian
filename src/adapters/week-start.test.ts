import { describe, it, expect, afterEach } from "vitest";
import {
    firstDayOfWeek, setWeekStart, setDateLocale, noteWeekFirstDay, weekdayNames, formatNoteName, parsePeriodStart,
} from "./datetime";

afterEach(() => {
    setWeekStart(null);
    setDateLocale(null);
});

describe("setWeekStart (B-231)", () => {
    it("auto (null) falls back to the locale's first day", () => {
        expect(firstDayOfWeek()).toBe(0);
        setDateLocale("de");
        expect(firstDayOfWeek()).toBe(1);
    });

    it.each([0, 1, 6])("an explicit %i wins over the locale", (day) => {
        setWeekStart(day);
        expect(firstDayOfWeek()).toBe(day);
        setDateLocale("de");
        expect(firstDayOfWeek()).toBe(day);
    });

    it("an invalid value is auto, and null puts auto back", () => {
        setWeekStart(1);
        setWeekStart(3);
        expect(firstDayOfWeek()).toBe(0);
        setWeekStart(1);
        setWeekStart(null);
        expect(firstDayOfWeek()).toBe(0);
        setWeekStart(Number.NaN);
        expect(firstDayOfWeek()).toBe(0);
    });

    it("never touches how periodic notes are named or read", () => {
        const sunday = new Date(2026, 8, 27);
        const before = [formatNoteName(sunday, "gggg-[W]ww"), parsePeriodStart("2026-W40", "gggg-[W]ww"), noteWeekFirstDay()];
        setWeekStart(1);
        setDateLocale("de");
        expect(firstDayOfWeek()).toBe(1);
        expect([formatNoteName(sunday, "gggg-[W]ww"), parsePeriodStart("2026-W40", "gggg-[W]ww"), noteWeekFirstDay()]).toEqual(before);
        // Obsidian's locale (English) is Sunday first: W40 starts on 27 September.
        expect(before).toEqual(["2026-W40", "2026-09-27", 0]);
    });
});

describe("weekdayNames", () => {
    it("lists full names Sunday first, capitalised, in Dashy's language", () => {
        expect(weekdayNames()[1]).toBe("Monday");
        setDateLocale("ru");
        expect(weekdayNames()[1]).toBe("Понедельник");
    });
});
