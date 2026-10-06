import { describe, it, expect } from "vitest";
import {
    readPeriodValue,
    parsePeriod,
    periodWindow,
    previousPeriodWindow,
    windowTense,
    futureStart,
    windowLastDay,
    windowFirstDay,
    isWeekWindow,
    isMonthWindow,
    filterByPeriod,
    readPeriod,
    compareCaption,
    type FixedWindow,
    type PeriodContext,
} from "./period";
import { periodNames } from "./period-name";
import { dateKey } from "./calendar";
import type { NoteRecord } from "./source";
import { parsePeriodStart } from "../adapters/datetime";

/** B-129, ADR 0006: windows with fixed bounds. Today is a Tuesday, 6 October 2026. */
const TODAY = new Date(2026, 9, 6);

const names = periodNames({}, parsePeriodStart);
const inNote = (noteName: string): PeriodContext => ({ names, noteName });
const literal: PeriodContext = { names };

const week = (start: string, end: string): FixedWindow => ({ kind: "fixed", unit: "week", start, end });
const month = (start: string, end: string): FixedWindow => ({ kind: "fixed", unit: "month", start, end });
const span = (start: string, end?: string): FixedWindow =>
    end === undefined ? { kind: "fixed", unit: "span", start } : { kind: "fixed", unit: "span", start, end };

const note = (name: string): NoteRecord => ({ path: `Diary/${name}.md`, name, folder: "Diary", tags: [], frontmatter: {} });

describe("readPeriodValue: `note` (B-129)", () => {
    it("is the period the note's name stands for", () => {
        expect(readPeriodValue("note", "period", inNote("2026-W40")).period)
            .toEqual(week("2026-09-28", "2026-10-04"));
        expect(readPeriodValue("note", "range", inNote("2026-06")).period)
            .toEqual(month("2026-06-01", "2026-06-30"));
        expect(readPeriodValue("Note", "period", inNote("2026-Q4")).period)
            .toEqual({ kind: "fixed", unit: "quarter", start: "2026-10-01", end: "2026-12-31" });
    });

    it("a note whose name is not a period is a problem naming the key, the name and the formats", () => {
        const { period, problem } = readPeriodValue("note", "range", inNote("Shopping list"));
        expect(period).toBeNull();
        expect(problem).toBe(
            '`range: note` needs a note named like a day, week, month, quarter or year, and this note is "Shopping list". '
            + "Name it in one of these formats: YYYY-MM-DD, GGGG-[W]WW, YYYY-MM, YYYY-[Q]Q, YYYY.",
        );
    });

    it("a block outside any note has no name to read: the same problem, with an empty name", () => {
        expect(readPeriodValue("note", "period", { names }).problem).toContain('this note is ""');
    });

    it("without a context `note` is simply not a window, as before", () => {
        expect(readPeriodValue("note", "period")).toEqual({ period: null });
    });
});

describe("readPeriodValue: a period written out (B-129)", () => {
    it("reads each kind of name", () => {
        expect(readPeriodValue("2026-10-01", "period", literal).period)
            .toEqual({ kind: "fixed", unit: "day", start: "2026-10-01", end: "2026-10-01" });
        expect(readPeriodValue("2026-W40", "period", literal).period).toEqual(week("2026-09-28", "2026-10-04"));
        expect(readPeriodValue("2026-10", "period", literal).period).toEqual(month("2026-10-01", "2026-10-31"));
        expect(readPeriodValue(2026, "period", literal).period)
            .toEqual({ kind: "fixed", unit: "year", start: "2026-01-01", end: "2026-12-31" });
    });

    it("a bare number that names no period stays days; `d` always means days", () => {
        expect(parsePeriod(30, literal)).toEqual({ kind: "days", days: 30 });
        expect(parsePeriod("365", literal)).toEqual({ kind: "days", days: 365 });
        expect(parsePeriod("2026d", literal)).toEqual({ kind: "days", days: 2026 });
        expect(parsePeriod("week", literal)).toEqual({ kind: "week" });
    });

    it("something that is neither stays unreadable, with no problem of its own", () => {
        expect(readPeriodValue("fortnight", "period", literal)).toEqual({ period: null });
        expect(readPeriodValue("2026-W60", "period", literal)).toEqual({ period: null });
    });

    it("without a context a literal is not read, as before", () => {
        expect(parsePeriod("2026-W40")).toBeNull();
        expect(parsePeriod(2026)).toEqual({ kind: "days", days: 2026 });
    });
});

describe("readPeriodValue: `{ from, to }` (B-129)", () => {
    it("both ends, inclusive", () => {
        expect(readPeriodValue({ from: "2026-09-01", to: "2026-09-30" }, "period", literal).period)
            .toEqual(span("2026-09-01", "2026-09-30"));
    });

    it("`from` alone runs to today", () => {
        expect(readPeriodValue({ from: "2026-09-01" }, "period", literal).period).toEqual(span("2026-09-01"));
    });

    it("a Date, what a YAML date may become, reads by its local day", () => {
        expect(readPeriodValue({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 1) }, "period", literal).period)
            .toEqual(span("2026-09-01", "2026-09-01"));
    });

    it("`to` alone is refused: a window needs a start", () => {
        expect(readPeriodValue({ to: "2026-06-30" }, "range", literal)).toEqual({
            period: null,
            problem: "`range` has `to` but no `from`. A window needs a start: add `from:` with a date like 2026-09-01.",
        });
    });

    it("`from` after `to` is refused, naming both", () => {
        expect(readPeriodValue({ from: "2026-09-30", to: "2026-09-01" }, "period", literal).problem)
            .toBe("`period` starts after it ends: `from: 2026-09-30` is later than `to: 2026-09-01`. Swap them.");
    });

    it("a date that is not one, another key, or an empty map is refused, quoting the map", () => {
        const invalid = (raw: Record<string, unknown>): string | undefined => readPeriodValue(raw, "period", literal).problem;
        expect(invalid({ from: "2026-02-30" })).toBe(
            '`period` as a map takes `from` and `to`, each a date like 2026-09-01, got "{"from":"2026-02-30"}".',
        );
        expect(invalid({ from: "yesterday" })).toContain("yesterday");
        expect(invalid({ from: "2026-09-01", to: 20260930 })).toContain("20260930");
        expect(invalid({ start: "2026-09-01" })).toContain("start");
        expect(invalid({})).toContain("{}");
    });

    it("without a context a map is not a window, as before", () => {
        expect(readPeriodValue({ from: "2026-09-01" }, "period")).toEqual({ period: null });
    });
});

describe("periodWindow and windowTense for a fixed window", () => {
    it("a closed window is its own bounds", () => {
        const w = week("2026-09-21", "2026-09-27");
        expect(periodWindow(w, TODAY, 1)).toEqual({ start: "2026-09-21", end: "2026-09-27" });
        expect(windowTense(w, TODAY)).toBe("past");
    });

    it("a window still running ends today, as `week` does", () => {
        const w = week("2026-10-05", "2026-10-11");
        expect(periodWindow(w, TODAY, 1)).toEqual({ start: "2026-10-05", end: "2026-10-06" });
        expect(windowTense(w, TODAY)).toBe("current");
        expect(windowTense(week("2026-09-30", "2026-10-06"), TODAY)).toBe("current");
    });

    it("a window not started yet comes out empty and is in the future", () => {
        const w = week("2026-10-12", "2026-10-18");
        const bounds = periodWindow(w, TODAY, 1);
        expect(bounds.start > bounds.end).toBe(true);
        expect(windowTense(w, TODAY)).toBe("future");
        expect(futureStart(w, TODAY)).toBe("2026-10-12");
        expect(futureStart(w, new Date(2026, 9, 12))).toBeNull();
        expect(futureStart({ kind: "week" }, TODAY)).toBeNull();
    });

    it("`from` alone runs to today; a window that moves with today is always current", () => {
        expect(periodWindow(span("2026-09-01"), TODAY, 1)).toEqual({ start: "2026-09-01", end: "2026-10-06" });
        expect(windowTense(span("2026-09-01"), TODAY)).toBe("current");
        expect(windowTense({ kind: "month" }, TODAY)).toBe("current");
    });

    it("notes after the window's end are left out, as notes after today are", () => {
        const notes = ["2026-09-20", "2026-09-21", "2026-09-27", "2026-09-28"].map(note);
        expect(filterByPeriod(notes, week("2026-09-21", "2026-09-27"), TODAY, 1).notes.map((n) => n.name))
            .toEqual(["2026-09-21", "2026-09-27"]);
    });
});

describe("windowLastDay, windowFirstDay and the window's shape", () => {
    it("counts up to a closed window's last day, otherwise today", () => {
        expect(dateKey(windowLastDay(week("2026-09-21", "2026-09-27"), TODAY))).toBe("2026-09-27");
        expect(dateKey(windowLastDay(week("2026-10-05", "2026-10-11"), TODAY))).toBe("2026-10-06");
        expect(windowLastDay({ kind: "year" }, TODAY)).toBe(TODAY);
        expect(windowLastDay(undefined, TODAY)).toBe(TODAY);
    });

    it("a week window starts its week on its own first day; anything else keeps the locale's", () => {
        // 27 September 2026 is a Sunday, what an English locale week starts on.
        expect(windowFirstDay(week("2026-09-27", "2026-10-03"), 1)).toBe(0);
        // A seven-day `from`/`to` keeps the locale's week; only a named week brings its own.
        expect(windowFirstDay(span("2026-09-30", "2026-10-06"), 1)).toBe(1);
        expect(windowFirstDay(month("2026-10-01", "2026-10-31"), 1)).toBe(1);
        expect(windowFirstDay({ kind: "week" }, 0)).toBe(0);
        expect(windowFirstDay(undefined, 1)).toBe(1);
    });

    it("one week or one calendar month, however it was written", () => {
        expect(isWeekWindow(week("2026-09-27", "2026-10-03"), 1)).toBe(true);
        // Seven days from the locale's first day are a week; from a Wednesday they are not.
        expect(isWeekWindow(span("2026-09-28", "2026-10-04"), 1)).toBe(true);
        expect(isWeekWindow(span("2026-09-27", "2026-10-03"), 0)).toBe(true);
        expect(isWeekWindow(span("2026-09-30", "2026-10-06"), 1)).toBe(false);
        expect(isWeekWindow(span("2026-09-28", "2026-10-05"), 1)).toBe(false);
        expect(isWeekWindow(span("2026-09-28"), 1)).toBe(false);
        expect(isWeekWindow({ kind: "week" }, 1)).toBe(false);
        expect(isMonthWindow(month("2026-10-01", "2026-10-31"))).toBe(true);
        expect(isMonthWindow(span("2028-02-01", "2028-02-29"))).toBe(true);
        expect(isMonthWindow(span("2026-10-01", "2026-10-30"))).toBe(false);
        expect(isMonthWindow(span("2026-10-02", "2026-10-31"))).toBe(false);
        expect(isMonthWindow({ kind: "fixed", unit: "quarter", start: "2026-10-01", end: "2026-12-31" })).toBe(false);
    });
});

describe("previousPeriodWindow for a fixed window: what `compare` measures against", () => {
    it("a closed week against the whole week before", () => {
        expect(previousPeriodWindow(week("2026-09-21", "2026-09-27"), TODAY, 1))
            .toEqual({ start: "2026-09-14", end: "2026-09-20" });
    });

    it("a closed month against the whole month before, whatever its length: June against all of May", () => {
        expect(previousPeriodWindow(month("2026-06-01", "2026-06-30"), TODAY, 1))
            .toEqual({ start: "2026-05-01", end: "2026-05-31" });
        expect(previousPeriodWindow(month("2026-03-01", "2026-03-31"), TODAY, 1))
            .toEqual({ start: "2026-02-01", end: "2026-02-28" });
    });

    it("a closed day, quarter and year against the one before", () => {
        expect(previousPeriodWindow({ kind: "fixed", unit: "day", start: "2026-10-01", end: "2026-10-01" }, TODAY, 1))
            .toEqual({ start: "2026-09-30", end: "2026-09-30" });
        expect(previousPeriodWindow({ kind: "fixed", unit: "quarter", start: "2026-01-01", end: "2026-03-31" }, TODAY, 1))
            .toEqual({ start: "2025-10-01", end: "2025-12-31" });
        expect(previousPeriodWindow({ kind: "fixed", unit: "year", start: "2025-01-01", end: "2025-12-31" }, TODAY, 1))
            .toEqual({ start: "2024-01-01", end: "2024-12-31" });
    });

    it("a window still running against the same days of the period before, as `period: week` does", () => {
        // Monday 5 October to today, Tuesday: Monday and Tuesday last week.
        expect(previousPeriodWindow(week("2026-10-05", "2026-10-11"), TODAY, 1))
            .toEqual({ start: "2026-09-28", end: "2026-09-29" });
        expect(previousPeriodWindow(week("2026-10-05", "2026-10-11"), TODAY, 1))
            .toEqual(previousPeriodWindow({ kind: "week" }, TODAY, 1));
        expect(previousPeriodWindow(month("2026-10-01", "2026-10-31"), TODAY, 1))
            .toEqual(previousPeriodWindow({ kind: "month" }, TODAY, 1));
        // 31 March is compared with all of February, clamped to its last day.
        expect(previousPeriodWindow(month("2026-03-01", "2026-03-31"), new Date(2026, 2, 31), 1))
            .toEqual({ start: "2026-02-01", end: "2026-02-28" });
        expect(previousPeriodWindow({ kind: "fixed", unit: "quarter", start: "2026-10-01", end: "2026-12-31" }, TODAY, 1))
            .toEqual({ start: "2026-07-01", end: "2026-07-06" });
        expect(previousPeriodWindow({ kind: "fixed", unit: "day", start: "2026-10-06", end: "2026-10-06" }, TODAY, 1))
            .toEqual({ start: "2026-10-05", end: "2026-10-05" });
    });

    it("`from`/`to` against as many days right before `from`", () => {
        expect(previousPeriodWindow(span("2026-09-01", "2026-09-10"), TODAY, 1))
            .toEqual({ start: "2026-08-22", end: "2026-08-31" });
        // `from` alone counts to today: 1 September to 6 October is 36 days.
        expect(previousPeriodWindow(span("2026-09-01"), TODAY, 1))
            .toEqual({ start: "2026-07-27", end: "2026-08-31" });
    });
});

describe("compareCaption for a fixed window", () => {
    it("a closed period names the whole period before it", () => {
        expect(compareCaption(week("2026-09-21", "2026-09-27"), "3", TODAY)).toBe("vs the week before: 3");
        expect(compareCaption(month("2026-06-01", "2026-06-30"), "3", TODAY)).toBe("vs the month before: 3");
        expect(compareCaption({ kind: "fixed", unit: "quarter", start: "2026-01-01", end: "2026-03-31" }, "3", TODAY))
            .toBe("vs the quarter before: 3");
        expect(compareCaption({ kind: "fixed", unit: "year", start: "2025-01-01", end: "2025-12-31" }, "3", TODAY))
            .toBe("vs the year before: 3");
        expect(compareCaption({ kind: "fixed", unit: "day", start: "2026-10-01", end: "2026-10-01" }, "3", TODAY))
            .toBe("vs the day before: 3");
    });

    it("a window still running reads as the same days, the way the moving windows do", () => {
        expect(compareCaption(week("2026-10-05", "2026-10-11"), "3", TODAY)).toBe("vs the same days last week: 3");
        expect(compareCaption(month("2026-10-01", "2026-10-31"), "3", TODAY)).toBe("vs the same days last month: 3");
        expect(compareCaption({ kind: "fixed", unit: "quarter", start: "2026-10-01", end: "2026-12-31" }, "3", TODAY))
            .toBe("vs the same days last quarter: 3");
        expect(compareCaption({ kind: "fixed", unit: "year", start: "2026-01-01", end: "2026-12-31" }, "3", TODAY))
            .toBe("vs the same days last year: 3");
        expect(compareCaption({ kind: "fixed", unit: "day", start: "2026-10-06", end: "2026-10-06" }, "3", TODAY))
            .toBe("vs the day before: 3");
    });

    it("`from`/`to` counts its days", () => {
        expect(compareCaption(span("2026-09-01", "2026-09-10"), "3", TODAY)).toBe("vs the 10 days before: 3");
        expect(compareCaption(span("2026-10-06", "2026-10-06"), "3", TODAY)).toBe("vs the day before: 3");
        expect(compareCaption(span("2026-09-01", "2026-09-10"), "3")).toBe("vs the 10 days before: 3");
    });
});

describe("readPeriod with a fixed window", () => {
    it("reads `note` with the context and keeps `date_field`", () => {
        expect(readPeriod({ period: "note" }, "Gym", "done", inNote("2026-10"))).toEqual({
            spec: { period: month("2026-10-01", "2026-10-31"), dateField: "done" },
            diagnostics: [],
            broken: false,
        });
    });

    it("a window that cannot be built is an error naming the card, and the card is broken", () => {
        const { spec, diagnostics, broken } = readPeriod({ period: "note" }, "Gym", undefined, inNote("Inbox"));
        expect(spec).toBeNull();
        expect(broken).toBe(true);
        expect(diagnostics).toEqual([{
            level: "error",
            message: '"Gym": `period: note` needs a note named like a day, week, month, quarter or year, and this note is "Inbox". '
                + "Name it in one of these formats: YYYY-MM-DD, GGGG-[W]WW, YYYY-MM, YYYY-[Q]Q, YYYY.",
        }]);
    });

    it("a value that is no window at all still only warns, and the card is not broken", () => {
        const { diagnostics, broken } = readPeriod({ period: "fortnight" }, "Gym", undefined, literal);
        expect(broken).toBe(false);
        expect(diagnostics.map((d) => d.level)).toEqual(["warning"]);
    });
});
