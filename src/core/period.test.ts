import { describe, it, expect } from "vitest";
import { parsePeriod, periodWindow, noteDate, filterByPeriod, readPeriod } from "./period";
import type { NoteRecord } from "./source";

const note = (name: string, frontmatter: Record<string, unknown> = {}, folder = "Diary"): NoteRecord => ({
    path: `${folder}/${name}.md`,
    name,
    folder,
    tags: [],
    frontmatter,
});

describe("parsePeriod", () => {
    it("knows week, month and year", () => {
        expect(parsePeriod("week")).toEqual({ kind: "week" });
        expect(parsePeriod("month")).toEqual({ kind: "month" });
        expect(parsePeriod("year")).toEqual({ kind: "year" });
    });

    it("is case insensitive and tolerates surrounding whitespace", () => {
        expect(parsePeriod("  WEEK  ")).toEqual({ kind: "week" });
        expect(parsePeriod("Month")).toEqual({ kind: "month" });
        expect(parsePeriod(" YeAr ")).toEqual({ kind: "year" });
    });

    it("reads a rolling window: Nd, N d, and a bare number", () => {
        expect(parsePeriod("30d")).toEqual({ kind: "days", days: 30 });
        expect(parsePeriod("30 d")).toEqual({ kind: "days", days: 30 });
        expect(parsePeriod("30")).toEqual({ kind: "days", days: 30 });
        expect(parsePeriod(30)).toEqual({ kind: "days", days: 30 });
        expect(parsePeriod("7D")).toEqual({ kind: "days", days: 7 });
    });

    it("accepts the bounds and rejects just past them", () => {
        expect(parsePeriod("0d")).toBeNull();
        expect(parsePeriod("1d")).toEqual({ kind: "days", days: 1 });
        expect(parsePeriod("3650d")).toEqual({ kind: "days", days: 3650 });
        expect(parsePeriod("3651d")).toBeNull();
    });

    it("garbage, empty and the wrong type are all null", () => {
        expect(parsePeriod("banana")).toBeNull();
        expect(parsePeriod("last month")).toBeNull();
        expect(parsePeriod("")).toBeNull();
        expect(parsePeriod("   ")).toBeNull();
        expect(parsePeriod(null)).toBeNull();
        expect(parsePeriod(undefined)).toBeNull();
        expect(parsePeriod(true)).toBeNull();
        expect(parsePeriod({})).toBeNull();
        expect(parsePeriod(-5)).toBeNull();
    });
});

describe("periodWindow — week", () => {
    it("Monday-first: today being Monday starts the window on itself", () => {
        // 2026-09-21 is a Monday.
        const today = new Date(2026, 8, 21);
        expect(periodWindow({ kind: "week" }, today, 1)).toEqual({ start: "2026-09-21", end: "2026-09-21" });
    });

    it("Monday-first: today being Sunday starts the window six days back", () => {
        // 2026-09-27 is a Sunday, the last day of a Monday-first week.
        const today = new Date(2026, 8, 27);
        expect(periodWindow({ kind: "week" }, today, 1)).toEqual({ start: "2026-09-21", end: "2026-09-27" });
    });

    it("Sunday-first: today being Sunday starts the window on itself", () => {
        const today = new Date(2026, 8, 27);
        expect(periodWindow({ kind: "week" }, today, 0)).toEqual({ start: "2026-09-27", end: "2026-09-27" });
    });

    it("Sunday-first: today being Saturday starts the window six days back", () => {
        // 2026-09-26 is a Saturday, the last day of a Sunday-first week.
        const today = new Date(2026, 8, 26);
        expect(periodWindow({ kind: "week" }, today, 0)).toEqual({ start: "2026-09-20", end: "2026-09-26" });
    });
});

describe("periodWindow — month", () => {
    it("starts on the 1st regardless of how far into the month today is", () => {
        const today = new Date(2026, 8, 30); // September has 30 days
        expect(periodWindow({ kind: "month" }, today, 1)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    });

    it("February in a leap year", () => {
        const today = new Date(2028, 1, 29); // 2028 is a leap year
        expect(periodWindow({ kind: "month" }, today, 1)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    });
});

describe("periodWindow — year", () => {
    it("today on 1 January", () => {
        const today = new Date(2026, 0, 1);
        expect(periodWindow({ kind: "year" }, today, 1)).toEqual({ start: "2026-01-01", end: "2026-01-01" });
    });

    it("today on 31 December", () => {
        const today = new Date(2026, 11, 31);
        expect(periodWindow({ kind: "year" }, today, 1)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    });
});

describe("periodWindow — rolling days", () => {
    it("1d is today alone", () => {
        const today = new Date(2026, 8, 24);
        expect(periodWindow({ kind: "days", days: 1 }, today, 1)).toEqual({ start: "2026-09-24", end: "2026-09-24" });
    });

    it("7d starts six days back", () => {
        const today = new Date(2026, 8, 24);
        expect(periodWindow({ kind: "days", days: 7 }, today, 1)).toEqual({ start: "2026-09-18", end: "2026-09-24" });
    });

    it("a rolling window can cross a month boundary", () => {
        const today = new Date(2026, 8, 3);
        expect(periodWindow({ kind: "days", days: 7 }, today, 1)).toEqual({ start: "2026-08-28", end: "2026-09-03" });
    });
});

describe("noteDate — by name", () => {
    it("a YYYY-MM-DD name is the date", () => {
        expect(noteDate(note("2026-03-02"))).toBe("2026-03-02");
    });

    it("a name that is not a date has none", () => {
        expect(noteDate(note("Template"))).toBeNull();
        expect(noteDate(note("book-1"))).toBeNull();
    });

    it("the name is ignored once date_field is set, even when it looks like a date", () => {
        expect(noteDate(note("2026-03-02", {}), "finished")).toBeNull();
    });
});

describe("noteDate — by date_field", () => {
    it("a plain date string", () => {
        expect(noteDate(note("book-1", { finished: "2026-03-02" }), "finished")).toBe("2026-03-02");
    });

    it("a datetime string keeps only the date part", () => {
        expect(noteDate(note("book-1", { finished: "2026-03-02T10:30" }), "finished")).toBe("2026-03-02");
    });

    it("an invalid calendar date is rejected, not just an invalid pattern", () => {
        expect(noteDate(note("book-1", { finished: "2026-02-30" }), "finished")).toBeNull();
    });

    it("a Date instance is read by its local year/month/day", () => {
        expect(noteDate(note("book-1", { finished: new Date(2026, 2, 2) }), "finished")).toBe("2026-03-02");
    });

    it("an invalid Date instance has no date", () => {
        expect(noteDate(note("book-1", { finished: new Date("not a date") }), "finished")).toBeNull();
    });

    it("a string that is not shaped like a date has none", () => {
        expect(noteDate(note("book-1", { finished: "March 2nd" }), "finished")).toBeNull();
    });

    it("a missing property has no date", () => {
        expect(noteDate(note("book-1", {}), "finished")).toBeNull();
    });

    it("a number or other non-date value has no date", () => {
        expect(noteDate(note("book-1", { finished: 20260302 }), "finished")).toBeNull();
        expect(noteDate(note("book-1", { finished: true }), "finished")).toBeNull();
    });
});

describe("filterByPeriod", () => {
    const today = new Date(2026, 8, 24); // 2026-09-24, a Thursday

    it("keeps only notes dated inside the window", () => {
        const notes = [note("2026-09-24"), note("2026-09-23"), note("2026-09-17")];
        const result = filterByPeriod(notes, { kind: "week" }, today, 1);
        expect(result.notes.map((n) => n.name)).toEqual(["2026-09-24", "2026-09-23"]);
        expect(result.anyDated).toBe(true);
    });

    it("a future-dated note is outside every window", () => {
        const notes = [note("2026-09-25")]; // tomorrow
        const result = filterByPeriod(notes, { kind: "year" }, today, 1);
        expect(result.notes).toHaveLength(0);
        expect(result.anyDated).toBe(true);
    });

    it("notes without a date are dropped before the window is even considered", () => {
        const notes = [note("Template"), note("book-1", { rating: 5 })];
        const result = filterByPeriod(notes, { kind: "week" }, today, 1);
        expect(result.notes).toHaveLength(0);
        expect(result.anyDated).toBe(false);
    });

    it("an honest empty window still reports dates were found", () => {
        const notes = [note("2026-01-01")];
        const result = filterByPeriod(notes, { kind: "week" }, today, 1);
        expect(result.notes).toHaveLength(0);
        expect(result.anyDated).toBe(true);
    });

    it("date_field narrows which notes have a date at all", () => {
        const notes = [
            note("book-1", { finished: "2026-09-22" }, "Books"),
            note("book-2", { rating: 5 }, "Books"),
        ];
        const result = filterByPeriod(notes, { kind: "week" }, today, 1, "finished");
        expect(result.notes.map((n) => n.path)).toEqual(["Books/book-1.md"]);
        expect(result.anyDated).toBe(true);
    });
});

describe("readPeriod", () => {
    it("no period asked for is not an error and needs no diagnostics", () => {
        const { spec, diagnostics } = readPeriod({}, "Card");
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(0);
    });

    it("a valid period parses with no diagnostics", () => {
        const { spec, diagnostics } = readPeriod({ period: "week" }, "Card");
        expect(spec).toEqual({ period: { kind: "week" } });
        expect(diagnostics).toHaveLength(0);
    });

    it("date_field rides along when both are given", () => {
        const { spec } = readPeriod({ period: "year", date_field: "finished" }, "Card");
        expect(spec).toEqual({ period: { kind: "year" }, dateField: "finished" });
    });

    it("an unreadable period warns and names the card and the value", () => {
        const { spec, diagnostics } = readPeriod({ period: "fortnight" }, "Gym");
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("Gym");
        expect(diagnostics[0]?.message).toContain("fortnight");
    });

    it("date_field without period warns that it has no effect", () => {
        const { spec, diagnostics } = readPeriod({ date_field: "finished" }, "Gym");
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.message).toContain("date_field");
    });

    it("an unlabeled card is named generically in the diagnostic", () => {
        const { diagnostics } = readPeriod({ period: "fortnight" }, "");
        expect(diagnostics[0]?.message).toContain("a card with no label");
    });
});
