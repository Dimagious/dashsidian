import { describe, it, expect, vi } from "vitest";
import {
    isRealDate, dateFromName, resolveNoteDate, readDateField, readDateFormat, dateFormats, isDayFormat,
    unmatchedDateFormat, type ParseDate,
} from "./note-date";
import type { NoteRecord } from "./source";
// The real parser this module is handed in the plugin: moment, strict. Not
// a stand-in, so a test here fails when the format reading itself breaks.
import { parseDateWithFormat } from "../adapters/datetime";

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

    it("a time after a hyphen is read for its date, the way a name already is (B-120)", () => {
        expect(resolveNoteDate(note("book-1", { finished: "2026-10-05-14:30" }), "finished")).toBe("2026-10-05");
        expect(resolveNoteDate(note("book-1", { finished: "2026-10-05-9:05" }), "finished")).toBe("2026-10-05");
        // A hyphen followed by anything but a clock time is still not a date.
        expect(resolveNoteDate(note("book-1", { finished: "2026-10-05-draft" }), "finished")).toBeNull();
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

    it("date_field reaches a nested property", () => {
        expect(resolveNoteDate(note("book-1", { meta: { date: "2026-03-02" } }), "meta.date")).toBe("2026-03-02");
    });

    it("date_field as a nested path with no match has no date, name included", () => {
        expect(resolveNoteDate(note("2026-03-02", { meta: {} }), "meta.date")).toBeNull();
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

describe("isDayFormat (B-120)", () => {
    it("a format with a year, a month and a day names a day", () => {
        expect(isDayFormat("DD.MM.YYYY")).toBe(true);
        expect(isDayFormat("MMMM D, YYYY")).toBe(true);
        expect(isDayFormat("YYYYMMDD")).toBe(true);
    });

    it("a month, a week or a weekday alone does not", () => {
        expect(isDayFormat("YYYY-MM")).toBe(false);
        expect(isDayFormat("gggg-[W]ww")).toBe(false);
        expect(isDayFormat("dddd")).toBe(false);
    });

    it("moment's locale day formats L, l, LL and ll name a day, LLL (with a time) alone does not", () => {
        for (const format of ["L", "l", "LL", "ll", "[Diary] LL"]) expect(isDayFormat(format)).toBe(true);
        expect(isDayFormat("LLL")).toBe(false);
        expect(isDayFormat("LT")).toBe(false);
    });

    it("letters inside [escaped] text do not count as tokens", () => {
        expect(isDayFormat("[Day] MM-YYYY")).toBe(false);
        expect(isDayFormat("[Diary] DD.MM.YYYY")).toBe(true);
    });
});

describe("dateFormats (B-120)", () => {
    it("neither a block format nor a settings format leaves ISO alone", () => {
        expect(dateFormats(undefined, undefined, parseDateWithFormat)).toBeUndefined();
        expect(dateFormats(undefined, "  ", parseDateWithFormat)).toBeUndefined();
    });

    it("the settings format equal to ISO adds nothing", () => {
        expect(dateFormats(undefined, "YYYY-MM-DD", parseDateWithFormat)).toBeUndefined();
    });

    it("the block's own format comes before the settings format", () => {
        const formats = dateFormats("MM/DD/YYYY", "DD.MM.YYYY", parseDateWithFormat);
        expect(formats?.own).toBe("MM/DD/YYYY");
        expect(formats?.values).toEqual(["MM/DD/YYYY", "DD.MM.YYYY"]);
        // A name holds no slash, so only the part after the last one is a name format,
        // and `YYYY` alone names no day.
        expect(formats?.names).toEqual(["DD.MM.YYYY"]);
    });

    it("a settings format with folders in it is read for the name part only", () => {
        const formats = dateFormats(undefined, "YYYY/MM/DD.MM.YYYY", parseDateWithFormat);
        expect(formats?.names).toEqual(["DD.MM.YYYY"]);
        expect(formats?.values).toEqual(["DD.MM.YYYY"]);
    });

    it("a settings format that names no day, like a folder per month, is left out", () => {
        expect(dateFormats(undefined, "YYYY/MM/DD", parseDateWithFormat)).toBeUndefined();
    });

    it("the same format from both places is tried once", () => {
        expect(dateFormats("DD.MM.YYYY", "DD.MM.YYYY", parseDateWithFormat)?.names).toEqual(["DD.MM.YYYY"]);
    });
});

describe("resolveNoteDate with formats (B-120)", () => {
    const dotted = dateFormats("DD.MM.YYYY", undefined, parseDateWithFormat);

    it("ISO and ISO with a time are read with no format at all", () => {
        expect(resolveNoteDate(note("2026-10-05"))).toBe("2026-10-05");
        expect(resolveNoteDate(note("2026-10-05-14:30"))).toBe("2026-10-05");
        expect(resolveNoteDate(note("2026-10-05 14:30"))).toBe("2026-10-05");
    });

    it("an ambiguous order without a format is not a date", () => {
        expect(resolveNoteDate(note("05-10-2026"))).toBeNull();
        expect(resolveNoteDate(note("05.10.2026"))).toBeNull();
        expect(resolveNoteDate(note("book", { day: "05-10-2026" }), "day")).toBeNull();
    });

    it.each([
        ["DD.MM.YYYY", "05.10.2026"],
        ["DD-MM-YYYY", "05-10-2026"],
        ["YYYYMMDD", "20261005"],
        ["D MMMM YYYY", "5 October 2026"],
    ])("a name written as %s is read", (format, name) => {
        const formats = dateFormats(format, undefined, parseDateWithFormat);
        expect(resolveNoteDate(note(name), undefined, formats)).toBe("2026-10-05");
    });

    it("MM/DD/YYYY reads a date_field value, month first", () => {
        const formats = dateFormats("MM/DD/YYYY", undefined, parseDateWithFormat);
        expect(resolveNoteDate(note("book", { done: "10/05/2026" }), "done", formats)).toBe("2026-10-05");
        expect(resolveNoteDate(note("book", { done: " 10/05/2026 " }), "done", formats)).toBe("2026-10-05");
    });

    it("a day that does not exist is rejected under a format", () => {
        expect(resolveNoteDate(note("31.02.2026"), undefined, dotted)).toBeNull();
        expect(resolveNoteDate(note("book", { day: "31.02.2026" }), "day", dotted)).toBeNull();
        expect(resolveNoteDate(note("29.02.2025"), undefined, dotted)).toBeNull();
        expect(resolveNoteDate(note("29.02.2024"), undefined, dotted)).toBe("2024-02-29");
    });

    it("the match is strict: an unpadded day does not fit a padded format", () => {
        expect(resolveNoteDate(note("5.10.2026"), undefined, dotted)).toBeNull();
    });

    it("a name may carry text after the date, past a break", () => {
        expect(resolveNoteDate(note("05.10.2026 Monday"), undefined, dotted)).toBe("2026-10-05");
        expect(resolveNoteDate(note("05.10.2026-14.30"), undefined, dotted)).toBe("2026-10-05");
        expect(resolveNoteDate(note("05.10.2026 (sick) notes"), undefined, dotted)).toBe("2026-10-05");
    });

    it("a name with no break after the date, or a date not at its start, does not fit", () => {
        expect(resolveNoteDate(note("05.10.2026x"), undefined, dotted)).toBeNull();
        expect(resolveNoteDate(note("05.10.20261"), undefined, dotted)).toBeNull();
        expect(resolveNoteDate(note("Diary 05.10.2026"), undefined, dotted)).toBeNull();
    });

    it("a format that holds a time keeps it rather than stopping at the day (t/109729)", () => {
        const formats = dateFormats("YYYY-MM-DD-HH:mm", undefined, parseDateWithFormat);
        expect(resolveNoteDate(note("2026-10-05-14:30"), undefined, formats)).toBe("2026-10-05");
        const compact = dateFormats("YYYYMMDD HHmm", undefined, parseDateWithFormat);
        expect(resolveNoteDate(note("20261005 1430 standup"), undefined, compact)).toBe("2026-10-05");
    });

    it("ISO wins over a format that would read the same text another way", () => {
        const formats = dateFormats("YYYY-DD-MM", undefined, parseDateWithFormat);
        expect(resolveNoteDate(note("2026-05-10"), undefined, formats)).toBe("2026-05-10");
        // Where ISO has no reading at all, the format gets its turn.
        expect(resolveNoteDate(note("2026-30-01"), undefined, formats)).toBe("2026-01-30");
    });

    it("the block's format is tried before the settings format", () => {
        // `05.10.2026` reads as 5 October under DD.MM and as 10 May under MM.DD.
        const own = dateFormats("MM.DD.YYYY", "DD.MM.YYYY", parseDateWithFormat);
        expect(resolveNoteDate(note("05.10.2026"), undefined, own)).toBe("2026-05-10");
        const settingsOnly = dateFormats(undefined, "DD.MM.YYYY", parseDateWithFormat);
        expect(resolveNoteDate(note("05.10.2026"), undefined, settingsOnly)).toBe("2026-10-05");
    });

    it("the settings format is the fallback when the block's own does not fit", () => {
        const formats = dateFormats("YYYYMMDD", "DD.MM.YYYY", parseDateWithFormat);
        expect(resolveNoteDate(note("20261005"), undefined, formats)).toBe("2026-10-05");
        expect(resolveNoteDate(note("06.10.2026"), undefined, formats)).toBe("2026-10-06");
    });

    it("a date_field value may carry a time after the date, like a name (B-120, M1)", () => {
        expect(resolveNoteDate(note("book", { done: "05.10.2026 14:30" }), "done", dotted)).toBe("2026-10-05");
        expect(resolveNoteDate(note("book", { done: "05.10.2026-14:30" }), "done", dotted)).toBe("2026-10-05");
        // The same break rule as a name: no break after the date, no date.
        expect(resolveNoteDate(note("book", { done: "05.10.2026x" }), "done", dotted)).toBeNull();
    });

    it("moment's locale day formats read a whole day", () => {
        const long = dateFormats("LL", undefined, parseDateWithFormat);
        expect(resolveNoteDate(note("October 5, 2026"), undefined, long)).toBe("2026-10-05");
        const short = dateFormats("L", undefined, parseDateWithFormat);
        expect(resolveNoteDate(note("book", { done: "10/05/2026" }), "done", short)).toBe("2026-10-05");
    });

    it("a date_field value that is not text is not read through a format", () => {
        expect(resolveNoteDate(note("book", { day: 20261005 }), "day", dateFormats("YYYYMMDD", undefined, parseDateWithFormat)))
            .toBeNull();
    });

    it("a name that cannot start with a number is not handed to the parser at all", () => {
        const parse = vi.fn<ParseDate>(() => null);
        const formats = dateFormats("DD.MM.YYYY", undefined, parse);
        expect(resolveNoteDate(note("Meeting notes, project review"), undefined, formats)).toBeNull();
        expect(parse).not.toHaveBeenCalled();
    });
});

describe("readDateFormat (B-120)", () => {
    it("absent is silent", () => {
        expect(readDateFormat({})).toEqual({ diagnostics: [] });
    });

    it("a day format is read, trimmed", () => {
        expect(readDateFormat({ date_format: " DD.MM.YYYY " })).toEqual({ format: "DD.MM.YYYY", diagnostics: [] });
    });

    it("a value that is not text warns and is not used", () => {
        const { format, diagnostics } = readDateFormat({ date_format: 20261005 });
        expect(format).toBeUndefined();
        expect(diagnostics).toEqual([{
            level: "warning",
            message: "`date_format` expects a date format such as DD.MM.YYYY, got \"20261005\". Ignored.",
        }]);
        expect(readDateFormat({ date_format: "  " }).diagnostics).toHaveLength(1);
    });

    it("a format that names no day warns and is not used", () => {
        const { format, diagnostics } = readDateFormat({ date_format: "YYYY-MM" });
        expect(format).toBeUndefined();
        expect(diagnostics[0]?.message).toBe(
            "`date_format: YYYY-MM` has no year, month and day in it, so it cannot name a day. Ignored. Write it like DD.MM.YYYY.",
        );
    });
});

describe("unmatchedDateFormat (B-120)", () => {
    const dotted = dateFormats("DD.MM.YYYY", undefined, parseDateWithFormat);

    it("names the format and the first name by path that does not fit it", () => {
        const notes = [note("20261006"), note("20261005"), note("Template")];
        expect(unmatchedDateFormat(notes, undefined, dotted)).toEqual([{
            level: "warning",
            message: "`date_format: DD.MM.YYYY` fits none of the selected notes: \"20261005\", for one, is not written that way.",
        }]);
    });

    it("a note ISO already reads counts as fitting, by name and by date_field", () => {
        expect(unmatchedDateFormat([note("2026-10-05"), note("Template")], undefined, dotted)).toEqual([]);
        expect(unmatchedDateFormat([note("a", { done: "2026-10-05" })], "done", dotted)).toEqual([]);
        // A redundant ISO date_format over datetime values stays quiet too.
        const iso = dateFormats("YYYY-MM-DD", undefined, parseDateWithFormat);
        expect(unmatchedDateFormat([note("a", { done: "2026-10-05T10:30" })], "done", iso)).toEqual([]);
    });

    it("a Date an Obsidian date property becomes counts as fitting", () => {
        const notes = [note("a", { done: new Date(2026, 9, 5) }), note("b", { done: "x" })];
        expect(unmatchedDateFormat(notes, "done", dotted)).toEqual([]);
    });

    it("a date_field value fits by its start, like a name", () => {
        expect(unmatchedDateFormat([note("a", { done: "05.10.2026 14:30" })], "done", dotted)).toEqual([]);
    });

    it("one note that fits is enough", () => {
        expect(unmatchedDateFormat([note("2026-10-05"), note("06.10.2026 Tuesday")], undefined, dotted)).toEqual([]);
    });

    it("with date_field, the property values are judged, not the names", () => {
        const notes = [note("05.10.2026", { done: "2026/10/05" }), note("b", { done: 5 }), note("c")];
        expect(unmatchedDateFormat(notes, "done", dotted)[0]?.message).toContain("\"2026/10/05\"");
        expect(unmatchedDateFormat([note("x", { done: "05.10.2026" })], "done", dotted)).toEqual([]);
    });

    it("nothing to judge is silent: no notes, or no text in date_field anywhere", () => {
        expect(unmatchedDateFormat([], undefined, dotted)).toEqual([]);
        expect(unmatchedDateFormat([note("a", { done: new Date(2026, 9, 5) })], "done", dotted)).toEqual([]);
    });

    it("only the block's own format is judged, never the settings format", () => {
        const settingsOnly = dateFormats(undefined, "DD.MM.YYYY", parseDateWithFormat);
        expect(unmatchedDateFormat([note("2026-10-05")], undefined, settingsOnly)).toEqual([]);
        expect(unmatchedDateFormat([note("2026-10-05")], undefined, undefined)).toEqual([]);
    });

    it("a format meant for values, with slashes, fits no name", () => {
        const slashed = dateFormats("MM/DD/YYYY", undefined, parseDateWithFormat);
        expect(unmatchedDateFormat([note("10-05-2026")], undefined, slashed)).toHaveLength(1);
    });
});
