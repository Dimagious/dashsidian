import { describe, it, expect } from "vitest";
import {
    parsePeriod,
    periodWindow,
    previousPeriodWindow,
    noteDate,
    filterByPeriod,
    readPeriod,
    readCompare,
    formatDelta,
    deltaTone,
    compareCaption,
} from "./period";
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

describe("previousPeriodWindow — week", () => {
    it("Monday-first: the same weekday last week, shifted back exactly seven days", () => {
        // 2026-09-24 is a Thursday; this week's window is Mon 21 .. Thu 24.
        const today = new Date(2026, 8, 24);
        expect(previousPeriodWindow({ kind: "week" }, today, 1)).toEqual({ start: "2026-09-14", end: "2026-09-17" });
    });

    it("Sunday-first: the same weekday last week", () => {
        // 2026-09-26 is a Saturday; this week's window is Sun 20 .. Sat 26.
        const today = new Date(2026, 8, 26);
        expect(previousPeriodWindow({ kind: "week" }, today, 0)).toEqual({ start: "2026-09-13", end: "2026-09-19" });
    });

    it("today on the first day of the week: the previous window is one day", () => {
        // 2026-09-21 is a Monday, the first day of a Monday-first week.
        const today = new Date(2026, 8, 21);
        expect(previousPeriodWindow({ kind: "week" }, today, 1)).toEqual({ start: "2026-09-14", end: "2026-09-14" });
    });
});

describe("previousPeriodWindow — month", () => {
    it("31 March clamps to the last day of February in a non-leap year", () => {
        const today = new Date(2026, 2, 31); // 2026 is not a leap year
        expect(previousPeriodWindow({ kind: "month" }, today, 1)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    });

    it("31 March clamps to 29 February in a leap year", () => {
        const today = new Date(2028, 2, 31); // 2028 is a leap year
        expect(previousPeriodWindow({ kind: "month" }, today, 1)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    });

    it("a day that fits the previous month needs no clamp", () => {
        const today = new Date(2026, 8, 24); // September 24 -> August 24, August has 31 days
        expect(previousPeriodWindow({ kind: "month" }, today, 1)).toEqual({ start: "2026-08-01", end: "2026-08-24" });
    });

    it("January's previous month is December of the year before", () => {
        const today = new Date(2026, 0, 15);
        expect(previousPeriodWindow({ kind: "month" }, today, 1)).toEqual({ start: "2025-12-01", end: "2025-12-15" });
    });
});

describe("previousPeriodWindow — year", () => {
    it("29 February clamps to 28 February the year before, when that year is not leap", () => {
        const today = new Date(2028, 1, 29); // 2028 is a leap year, 2027 is not
        expect(previousPeriodWindow({ kind: "year" }, today, 1)).toEqual({ start: "2027-01-01", end: "2027-02-28" });
    });

    it("an ordinary date needs no clamp", () => {
        const today = new Date(2026, 8, 24);
        expect(previousPeriodWindow({ kind: "year" }, today, 1)).toEqual({ start: "2025-01-01", end: "2025-09-24" });
    });
});

describe("previousPeriodWindow — rolling days", () => {
    it("the N days immediately before the current window, contiguous with it", () => {
        const today = new Date(2026, 8, 24);
        expect(previousPeriodWindow({ kind: "days", days: 3 }, today, 1))
            .toEqual({ start: "2026-09-19", end: "2026-09-21" });
        // The current window (see periodWindow tests above) starts the next day.
        expect(periodWindow({ kind: "days", days: 3 }, today, 1).start).toBe("2026-09-22");
    });

    it("1d compares against the single day right before today", () => {
        const today = new Date(2026, 8, 24);
        expect(previousPeriodWindow({ kind: "days", days: 1 }, today, 1))
            .toEqual({ start: "2026-09-23", end: "2026-09-23" });
    });

    it("crosses a month boundary the same way the current window does", () => {
        const today = new Date(2026, 8, 3);
        expect(previousPeriodWindow({ kind: "days", days: 7 }, today, 1))
            .toEqual({ start: "2026-08-21", end: "2026-08-27" });
    });
});

describe("formatDelta", () => {
    it("a rise: an up arrow and a plus sign", () => {
        expect(formatDelta(2, 0)).toEqual({ arrow: "▲", text: "+2", direction: "up" });
    });

    it("a fall: a down arrow and a real minus sign, not a hyphen", () => {
        const result = formatDelta(4, 5);
        expect(result).toEqual({ arrow: "▼", text: "−1", direction: "down" });
        expect(result.text).not.toContain("-1");
    });

    it("no change: an equals sign and a plain zero", () => {
        expect(formatDelta(3, 3)).toEqual({ arrow: "=", text: "0", direction: "flat" });
    });

    it("respects the card's own precision", () => {
        expect(formatDelta(2.567, 0, 1)).toEqual({ arrow: "▲", text: "+2.6", direction: "up" });
    });

    it("both sides round to the same displayed value: flat, even though the raw values differ", () => {
        // 0.02 and 0.04 both print as 0.0 at one decimal — the same "-0.04
        // reads as -0.0" trap formatValue already avoids for the value itself.
        expect(formatDelta(0.02, 0.04, 1)).toEqual({ arrow: "=", text: "0.0", direction: "flat" });
    });

    it("a long number is grouped the same way a card value is", () => {
        expect(formatDelta(14500, 0).text).toBe("+14 500");
    });

    it("is computed from the values as displayed, not the raw difference (precision: 0)", () => {
        // At precision 0, 10.6 displays as 11 and 10.4 as 10 — a visible
        // difference of 1 — while the raw difference, 0.2, rounds to 0. The
        // delta has to agree with what the reader sees on the card, not with
        // arithmetic on numbers nobody sees.
        expect(formatDelta(10.6, 10.4, 0)).toEqual({ arrow: "▲", text: "+1", direction: "up" });
    });

    it("is computed from the values as displayed under the default precision rule too", () => {
        // 5.06 displays as 5.1 (a fraction rounds to one decimal) and 3 stays
        // 3, so the visible difference is 2.1.
        expect(formatDelta(5.06, 3)).toEqual({ arrow: "▲", text: "+2.1", direction: "up" });
    });
});

describe("deltaTone", () => {
    it("no change is always neutral, `better` or not", () => {
        expect(deltaTone("flat")).toBe("neutral");
        expect(deltaTone("flat", "up")).toBe("neutral");
        expect(deltaTone("flat", "down")).toBe("neutral");
    });

    it("a rise or a fall with no `better` set stays neutral", () => {
        expect(deltaTone("up")).toBe("neutral");
        expect(deltaTone("down")).toBe("neutral");
    });

    it("`better: up` makes a rise good and a fall bad", () => {
        expect(deltaTone("up", "up")).toBe("good");
        expect(deltaTone("down", "up")).toBe("bad");
    });

    it("`better: down` reverses it, for a number where less is better", () => {
        expect(deltaTone("down", "down")).toBe("good");
        expect(deltaTone("up", "down")).toBe("bad");
    });
});

describe("readCompare", () => {
    it("neither key given: nothing asked for, no diagnostics", () => {
        const { spec, diagnostics } = readCompare({}, "Gym", true);
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(0);
    });

    it("compare: true next to a working period turns it on", () => {
        const { spec, diagnostics } = readCompare({ compare: true }, "Gym", true);
        expect(spec).toEqual({});
        expect(diagnostics).toHaveLength(0);
    });

    it("a valid better rides along", () => {
        const { spec } = readCompare({ compare: true, better: "up" }, "Gym", true);
        expect(spec).toEqual({ better: "up" });
    });

    it("compare without a working period warns and stays off", () => {
        const { spec, diagnostics } = readCompare({ compare: true }, "Gym", false);
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("Gym");
        expect(diagnostics[0]?.message).toContain("compare");
    });

    it("better with no compare warns that it has no effect", () => {
        const { spec, diagnostics } = readCompare({ better: "up" }, "Gym", true);
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.message).toContain("better");
    });

    it("compare: false with a better set is the same as no compare at all", () => {
        const { spec, diagnostics } = readCompare({ compare: false, better: "up" }, "Gym", true);
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(1);
    });

    it("an unrecognised better warns and the delta stays neutral", () => {
        const { spec, diagnostics } = readCompare({ compare: true, better: "sideways" }, "Gym", true);
        expect(spec).toEqual({});
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.message).toContain("sideways");
    });

    it("an unlabeled card is named generically", () => {
        const { diagnostics } = readCompare({ compare: true }, "", false);
        expect(diagnostics[0]?.message).toContain("a card with no label");
    });

    // The `yaml` package hands these back exactly as written: "yes" and
    // "true" are strings, not the boolean `true` — none of them turn
    // comparison on, and each used to do so with no warning at all.
    it.each([
        ["yes", "yes"],
        ["true", "true"],
        [1, "1"],
    ])("a non-boolean compare (%s) warns and names the value, rather than silently doing nothing", (raw, shown) => {
        const { spec, diagnostics } = readCompare({ compare: raw }, "Gym", true);
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("Gym");
        expect(diagnostics[0]?.message).toContain(shown);
    });

    it("compare: false is a real boolean and stays silent, unlike a non-boolean value", () => {
        const { spec, diagnostics } = readCompare({ compare: false }, "Gym", true);
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(0);
    });

    it("streak is refused: a warning, and no delta rather than one with nothing of its own to show", () => {
        const { spec, diagnostics } = readCompare({ compare: true }, "Streak", true, "streak");
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("Streak");
        expect(diagnostics[0]?.message).toContain("streak");
    });

    it("every other aggregate, including latest, is left alone", () => {
        for (const agg of ["count", "sum", "avg", "min", "max", "latest"] as const) {
            const { spec, diagnostics } = readCompare({ compare: true }, "Card", true, agg);
            expect(spec, agg).toEqual({});
            expect(diagnostics, agg).toHaveLength(0);
        }
    });
});

describe("compareCaption", () => {
    it("names the period kind and carries the previous value", () => {
        expect(compareCaption({ kind: "week" }, "1")).toContain("last week");
        expect(compareCaption({ kind: "week" }, "1")).toContain("1");
        expect(compareCaption({ kind: "month" }, "3")).toContain("last month");
        expect(compareCaption({ kind: "year" }, "9")).toContain("last year");
    });

    it("a rolling window pluralises the day count correctly", () => {
        expect(compareCaption({ kind: "days", days: 1 }, "2")).toBe("vs the day before: 2");
        expect(compareCaption({ kind: "days", days: 3 }, "2")).toBe("vs the 3 days before: 2");
    });
});
