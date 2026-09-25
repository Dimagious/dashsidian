import { describe, it, expect } from "vitest";
import { isRealDate, dateFromName, resolveNoteDate, readDateField } from "./note-date";
import type { NoteRecord } from "./source";

const note = (name: string, frontmatter: Record<string, unknown> = {}): NoteRecord => ({
    path: `Diary/${name}.md`,
    name,
    folder: "Diary",
    tags: [],
    frontmatter,
});

describe("isRealDate", () => {
    it("an ordinary date is real", () => {
        expect(isRealDate(2026, 3, 2)).toBe(true);
    });

    it("a leap day exists on a leap year", () => {
        expect(isRealDate(2024, 2, 29)).toBe(true);
        expect(isRealDate(2000, 2, 29)).toBe(true); // divisible by 400
    });

    it("a leap day does not exist on a non-leap year", () => {
        expect(isRealDate(2025, 2, 29)).toBe(false);
        expect(isRealDate(2100, 2, 29)).toBe(false); // divisible by 100, not 400
    });

    it("day 30 of February does not exist in any year", () => {
        expect(isRealDate(2026, 2, 30)).toBe(false);
    });

    it("month and day bounds", () => {
        expect(isRealDate(2026, 13, 1)).toBe(false);
        expect(isRealDate(2026, 0, 10)).toBe(false);
        expect(isRealDate(2026, 1, 32)).toBe(false);
        expect(isRealDate(2026, 1, 0)).toBe(false);
    });
});

describe("dateFromName", () => {
    it("an exact YYYY-MM-DD name is the date", () => {
        expect(dateFromName("2024-01-01")).toBe("2024-01-01");
    });

    it("a suffix separated by a space, underscore, dash, dot or parenthesis is still a date", () => {
        expect(dateFromName("2024-01-01 Monday")).toBe("2024-01-01");
        expect(dateFromName("2024-01-01_standup")).toBe("2024-01-01");
        expect(dateFromName("2024-01-01-standup")).toBe("2024-01-01");
        expect(dateFromName("2024-01-01.draft")).toBe("2024-01-01");
        expect(dateFromName("2024-01-01 (sick)")).toBe("2024-01-01");
    });

    it("an extra digit right after the day is not a date", () => {
        // "2024-01-011" reads as day 01 with an eleventh digit stuck on, not
        // a suffixed name — the day itself is not two digits followed by a
        // word boundary.
        expect(dateFromName("2024-01-011")).toBeNull();
    });

    it("a day not padded to two digits is not a date", () => {
        expect(dateFromName("2024-01-1")).toBeNull();
    });

    it("a date that does not start the name is not a date", () => {
        expect(dateFromName("x 2024-01-01")).toBeNull();
    });

    it("digits with no separators are not a date", () => {
        expect(dateFromName("20240101")).toBeNull();
    });

    it("a name with no date at all has none", () => {
        expect(dateFromName("Template")).toBeNull();
        expect(dateFromName("book-1")).toBeNull();
    });

    it("an invalid calendar date in the name is rejected, not just an invalid pattern", () => {
        expect(dateFromName("2026-02-30")).toBeNull();
        expect(dateFromName("2025-02-29")).toBeNull();
        expect(dateFromName("2026-13-01")).toBeNull();
        expect(dateFromName("2026-00-10")).toBeNull();
    });

    it("a real leap day in the name is accepted", () => {
        expect(dateFromName("2024-02-29")).toBe("2024-02-29");
        expect(dateFromName("2024-02-29 Thursday")).toBe("2024-02-29");
    });
});

describe("resolveNoteDate — by name", () => {
    it("falls back to dateFromName's rule when no dateField is given", () => {
        expect(resolveNoteDate(note("2026-03-02"))).toBe("2026-03-02");
        expect(resolveNoteDate(note("2026-03-02 Monday"))).toBe("2026-03-02");
        expect(resolveNoteDate(note("Template"))).toBeNull();
    });
});

describe("resolveNoteDate — by date_field", () => {
    it("the name is ignored once date_field is set, even when it looks like a date", () => {
        expect(resolveNoteDate(note("2026-03-02", {}), "finished")).toBeNull();
    });

    it("a plain date string", () => {
        expect(resolveNoteDate(note("book-1", { finished: "2026-03-02" }), "finished")).toBe("2026-03-02");
    });

    it("a datetime string keeps only the date part", () => {
        expect(resolveNoteDate(note("book-1", { finished: "2026-03-02T10:30" }), "finished")).toBe("2026-03-02");
    });

    it("a space-separated datetime is accepted the same way as a T-separated one (B-081 round 2)", () => {
        expect(resolveNoteDate(note("book-1", { finished: "2026-03-02 10:30" }), "finished")).toBe("2026-03-02");
    });

    it("an eleventh character that is neither T nor a space is rejected, digit or not (B-081 round 2)", () => {
        // "2026-03-021" used to slice down to "2026-03-02" and pass; the
        // character right after the day now has to be T or a space, the
        // same rule a note's name already follows.
        expect(resolveNoteDate(note("book-1", { finished: "2026-03-021" }), "finished")).toBeNull();
        expect(resolveNoteDate(note("book-1", { finished: "2026-03-02garbage" }), "finished")).toBeNull();
    });

    it("an invalid calendar date is rejected, not just an invalid pattern", () => {
        expect(resolveNoteDate(note("book-1", { finished: "2026-02-30" }), "finished")).toBeNull();
    });

    it("a Date instance is read by its local year/month/day", () => {
        expect(resolveNoteDate(note("book-1", { finished: new Date(2026, 2, 2) }), "finished")).toBe("2026-03-02");
    });

    it("an invalid Date instance has no date", () => {
        expect(resolveNoteDate(note("book-1", { finished: new Date("not a date") }), "finished")).toBeNull();
    });

    it("a number is not a date", () => {
        expect(resolveNoteDate(note("book-1", { finished: 20260302 }), "finished")).toBeNull();
    });

    it("a boolean is not a date", () => {
        expect(resolveNoteDate(note("book-1", { finished: true }), "finished")).toBeNull();
    });

    it("a missing property has no date, and the dated name is not a fallback", () => {
        expect(resolveNoteDate(note("2026-03-02", {}), "finished")).toBeNull();
        expect(resolveNoteDate(note("book-1", {}), "finished")).toBeNull();
    });
});

describe("readDateField", () => {
    it("reads a trimmed string", () => {
        expect(readDateField({ date_field: "  finished  " })).toBe("finished");
    });

    it("blank, missing or non-string values are undefined", () => {
        expect(readDateField({ date_field: "" })).toBeUndefined();
        expect(readDateField({ date_field: "   " })).toBeUndefined();
        expect(readDateField({})).toBeUndefined();
        expect(readDateField({ date_field: 5 })).toBeUndefined();
    });
});
