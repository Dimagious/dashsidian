import { describe, it, expect } from "vitest";
import { readCountdown, readDateKey, daysUntil, countdownTarget } from "./countdown";
import type { NoteRecord } from "./source";

const NONE = (): NoteRecord[] => [];

const noteAt = (path: string, fm: Record<string, unknown>, tags: string[] = []): NoteRecord => {
    const slash = path.lastIndexOf("/");
    const name = path.slice(slash + 1).replace(/\.md$/, "");
    return { path, name, folder: slash === -1 ? "" : path.slice(0, slash), tags, frontmatter: fm };
};

describe("readDateKey", () => {
    it("takes a YYYY-MM-DD string", () => {
        expect(readDateKey("2026-11-15")).toBe("2026-11-15");
    });

    it("trims spaces", () => {
        expect(readDateKey("  2026-11-15 ")).toBe("2026-11-15");
    });

    it("takes a Date, built from local parts", () => {
        // Local midnight east of UTC is the previous day in UTC — the reason
        // toISOString is not used anywhere in this project.
        expect(readDateKey(new Date(2026, 10, 15, 0, 0, 0))).toBe("2026-11-15");
    });

    it("rejects a date that does not exist", () => {
        expect(readDateKey("2026-02-31")).toBeNull();
        expect(readDateKey("2026-13-01")).toBeNull();
    });

    it("accepts a real leap day and rejects a fake one", () => {
        expect(readDateKey("2024-02-29")).toBe("2024-02-29");
        expect(readDateKey("2026-02-29")).toBeNull();
    });

    it("rejects other shapes rather than guessing", () => {
        for (const raw of ["15.11.2026", "2026/11/15", "tomorrow", "", 42, null, undefined, {}]) {
            expect(readDateKey(raw)).toBeNull();
        }
    });

    it("an invalid Date is null, not NaN-NaN-NaN", () => {
        expect(readDateKey(new Date("nope"))).toBeNull();
    });
});

describe("readCountdown", () => {
    it("carries the date through", () => {
        const { spec, diagnostics } = readCountdown({ label: "Race", date: "2026-11-15" }, "Race", NONE);
        expect(spec).toEqual({ date: "2026-11-15" });
        expect(diagnostics).toEqual([]);
    });

    it("a missing date is an error, not an empty card", () => {
        for (const date of [undefined, null, ""]) {
            const { spec, diagnostics } = readCountdown({ date }, "Race", NONE);
            expect(spec).toBeNull();
            expect(diagnostics[0]?.level).toBe("error");
        }
    });

    it("an unparseable date says what was expected", () => {
        const { spec, diagnostics } = readCountdown({ date: "15.11.2026" }, "Race", NONE);
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("YYYY-MM-DD");
    });

    it("a card of written dates never asks for the vault", () => {
        let asked = 0;
        readCountdown({ date: "2026-11-15", repeat: "yearly" }, "Race", () => {
            asked += 1;
            return [];
        });
        expect(asked).toBe(0);
    });

    it("the message names the card, so five of them can be told apart", () => {
        expect(readCountdown({}, "Holiday", NONE).diagnostics[0]?.message).toContain("Holiday");
    });
});

describe("daysUntil", () => {
    it("counts forward", () => {
        expect(daysUntil("2026-09-25", "2026-09-22")).toBe(3);
    });

    it("today is zero", () => {
        expect(daysUntil("2026-09-22", "2026-09-22")).toBe(0);
    });

    it("a past date is negative", () => {
        expect(daysUntil("2026-09-20", "2026-09-22")).toBe(-2);
    });

    it("counts across a year boundary", () => {
        expect(daysUntil("2027-01-01", "2026-12-30")).toBe(2);
    });

    it("a daylight saving switch does not shift the count", () => {
        expect(daysUntil("2026-03-30", "2026-03-28")).toBe(2);
        expect(daysUntil("2026-10-26", "2026-10-24")).toBe(2);
    });
});

describe("readCountdown: repeat", () => {
    it("carries `yearly` through on a written date", () => {
        const { spec, diagnostics } = readCountdown({ date: "1990-05-12", repeat: "yearly" }, "Anna", NONE);
        expect(spec).toEqual({ date: "1990-05-12", repeat: "yearly" });
        expect(diagnostics).toEqual([]);
    });

    it("refuses anything but `yearly`, naming the value", () => {
        for (const repeat of ["weekly", "Yearly", "", true, 1]) {
            const { spec, diagnostics } = readCountdown({ date: "1990-05-12", repeat }, "Anna", NONE);
            expect(spec, String(repeat)).toBeNull();
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0]?.level).toBe("error");
            expect(diagnostics[0]?.message).toBe(
                `"Anna": \`repeat\` expects \`yearly\`, got "${String(repeat)}".`,
            );
        }
    });

    it("a bare `repeat:` with no value is the same as no repeat", () => {
        const { spec, diagnostics } = readCountdown({ date: "1990-05-12", repeat: null }, "Anna", NONE);
        expect(spec).toEqual({ date: "1990-05-12" });
        expect(diagnostics).toEqual([]);
    });
});

describe("readCountdown: field", () => {
    const passport = noteAt("Docs/Passport.md", { type: "passport", expires: "2031-04-30" });
    const visa = noteAt("Docs/Visa.md", { type: "visa", expires: "2027-01-15" });

    it("reads the date from the one note the selection leaves", () => {
        const { spec, diagnostics } = readCountdown(
            { field: "expires", where: "type = passport" }, "Passport", () => [passport, visa],
        );
        expect(spec).toEqual({ date: "2031-04-30", note: "Docs/Passport.md" });
        expect(diagnostics).toEqual([]);
    });

    it("takes the newest dated note, the way `agg: latest` does", () => {
        const notes = [
            noteAt("Health/2026-03-01 check.md", { valid_until: "2027-03-01" }),
            noteAt("Health/2026-09-14 check.md", { valid_until: "2027-09-14" }),
            noteAt("Health/2025-09-10 check.md", { valid_until: "2026-09-10" }),
        ];
        const { spec } = readCountdown({ field: "valid_until", source: "Health" }, "Medical", () => notes);
        expect(spec).toEqual({ date: "2027-09-14", note: "Health/2026-09-14 check.md" });
    });

    it("a dated note wins over an undated one, which is still read when it is all there is", () => {
        const undated = noteAt("Health/Certificate.md", { valid_until: "2030-01-01" });
        const dated = noteAt("Health/2026-01-05.md", { valid_until: "2027-01-05" });
        expect(readCountdown({ field: "valid_until" }, "M", () => [undated, dated]).spec?.date).toBe("2027-01-05");
        expect(readCountdown({ field: "valid_until" }, "M", () => [undated]).spec?.date).toBe("2030-01-01");
    });

    it("among undated notes the first by path wins, whatever order the vault lists them in", () => {
        const b = noteAt("People/Boris.md", { birthday: "1985-02-01" });
        const a = noteAt("People/Anna.md", { birthday: "1990-05-12" });
        expect(readCountdown({ field: "birthday" }, "X", () => [b, a]).spec?.note).toBe("People/Anna.md");
        expect(readCountdown({ field: "birthday" }, "X", () => [a, b]).spec?.note).toBe("People/Anna.md");
    });

    it("skips a newer note where the property is blank or absent", () => {
        const notes = [
            noteAt("Health/2026-09-20.md", { valid_until: null }),
            noteAt("Health/2026-09-19.md", { valid_until: "  " }),
            noteAt("Health/2026-09-18.md", {}),
            noteAt("Health/2026-09-01.md", { valid_until: "2027-09-01" }),
        ];
        expect(readCountdown({ field: "valid_until" }, "M", () => notes).spec?.date).toBe("2027-09-01");
    });

    it("reads a datetime string and a Date the way `date_field` does", () => {
        const at = noteAt("A.md", { when: "2026-12-24T18:30" });
        expect(readCountdown({ field: "when" }, "Eve", () => [at]).spec?.date).toBe("2026-12-24");
        const asDate = noteAt("B.md", { when: new Date(2026, 11, 24, 0, 0, 0) });
        expect(readCountdown({ field: "when" }, "Eve", () => [asDate]).spec?.date).toBe("2026-12-24");
    });

    it("reads a nested property by a dotted path", () => {
        const n = noteAt("A.md", { meta: { expires: "2028-02-29" } });
        expect(readCountdown({ field: "meta.expires" }, "A", () => [n]).spec?.date).toBe("2028-02-29");
    });

    it("carries `repeat` with a field", () => {
        const anna = noteAt("People/Anna.md", { birthday: "1990-05-12" });
        const { spec } = readCountdown({ field: "birthday", repeat: "yearly" }, "Anna", () => [anna]);
        expect(spec).toEqual({ date: "1990-05-12", repeat: "yearly", note: "People/Anna.md" });
    });

    it("a property no note has is an error naming it", () => {
        const { spec, diagnostics } = readCountdown({ field: "valid_until" }, "Medical", () => [passport]);
        expect(spec).toBeNull();
        expect(diagnostics.map((d) => d.level)).toEqual(["error"]);
        expect(diagnostics[0]?.message).toBe(
            '"Medical": no note in the selection has "valid_until" filled in. Check the name, `source`, `tag` and `where`.',
        );
    });

    it("an empty vault is the same error, not a blank card", () => {
        const { spec, diagnostics } = readCountdown({ field: "valid_until" }, "Medical", NONE);
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("\"valid_until\"");
    });

    it("a value that is not a date names the property, the note and the value", () => {
        const bad = noteAt("Health/Certificate.md", { valid_until: "next spring" });
        const older = noteAt("Health/2020-01-01.md", { valid_until: "2021-01-01" });
        // The undated note is the only one with a bad value, but the dated one
        // wins the order, so the bad value is never reached here...
        expect(readCountdown({ field: "valid_until" }, "M", () => [bad, older]).spec?.date).toBe("2021-01-01");
        // ...and when it is the newest reading, it is reported, not skipped.
        const { spec, diagnostics } = readCountdown({ field: "valid_until" }, "Medical", () => [bad]);
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toBe(
            '"Medical": "valid_until" in "Certificate" is "next spring", not a date. Expected YYYY-MM-DD, or another format named with `date_format:` next to `items:`.',
        );
    });

    it("a bad newest value is not papered over with an older good one", () => {
        const notes = [
            noteAt("Health/2026-09-14.md", { valid_until: "14.09.2027" }),
            noteAt("Health/2026-03-01.md", { valid_until: "2027-03-01" }),
        ];
        const { spec, diagnostics } = readCountdown({ field: "valid_until" }, "M", () => notes);
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("\"2026-09-14\"");
        expect(diagnostics[0]?.message).toContain("\"14.09.2027\"");
    });

    it("both `date` and `field` is an error, not a guess", () => {
        const { spec, diagnostics } = readCountdown(
            { date: "2026-11-15", field: "expires" }, "Passport", () => [passport],
        );
        expect(spec).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.message).toContain("both `date:` and `field:`");
    });

    it("neither is an error that mentions both", () => {
        const { diagnostics } = readCountdown({ label: "X" }, "X", NONE);
        expect(diagnostics[0]?.message).toBe(
            '"X": neither `date:` nor `field:` is set. There is nothing to count down to.',
        );
    });

    it("a field that is not a property name is refused", () => {
        const { spec, diagnostics } = readCountdown({ field: 42 }, "X", () => [passport]);
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toBe('"X": `field` expects a property name, got "42".');
    });

    it("a folder that is not there warns, and the card still errors on the field", () => {
        const { spec, diagnostics } = readCountdown(
            { field: "expires", source: "Nowhere" }, "Passport", () => [passport],
        );
        expect(spec).toBeNull();
        expect(diagnostics.map((d) => d.level)).toEqual(["warning", "error"]);
        expect(diagnostics[0]?.message).toContain("`Nowhere`");
    });

    it("a tag narrows the selection like on a stats card", () => {
        const tagged = noteAt("A.md", { expires: "2029-01-01" }, ["id"]);
        const other = noteAt("B.md", { expires: "2030-01-01" });
        expect(readCountdown({ field: "expires", tag: "#id" }, "A", () => [other, tagged]).spec?.date)
            .toBe("2029-01-01");
    });

    it("selection keys next to a written date warn that they do nothing", () => {
        const { spec, diagnostics } = readCountdown({ date: "2026-11-15", source: "Docs" }, "Race", NONE);
        expect(spec).toEqual({ date: "2026-11-15" });
        expect(diagnostics).toEqual([{
            level: "warning",
            message: '"Race": `source`, `tag` and `where` only choose the note `field` is read from. With `date:` they are ignored.',
        }]);
    });
});

describe("countdownTarget", () => {
    const yearly = (date: string) => ({ date, repeat: "yearly" as const });

    it("without repeat the date is its own target, past or not", () => {
        expect(countdownTarget({ date: "1990-05-12" }, "2026-10-05")).toEqual({ date: "1990-05-12", years: 0 });
    });

    it("a birthday later this year lands this year", () => {
        expect(countdownTarget(yearly("1990-11-20"), "2026-10-05")).toEqual({ date: "2026-11-20", years: 36 });
    });

    it("a birthday that passed yesterday lands next year", () => {
        expect(countdownTarget(yearly("1990-10-04"), "2026-10-05")).toEqual({ date: "2027-10-04", years: 37 });
    });

    it("a birthday today is today, with the age it is turning", () => {
        expect(countdownTarget(yearly("1990-10-05"), "2026-10-05")).toEqual({ date: "2026-10-05", years: 36 });
    });

    it("an anniversary on 31 December rolls into the next year on 1 January", () => {
        expect(countdownTarget(yearly("2020-12-31"), "2027-01-01")).toEqual({ date: "2027-12-31", years: 7 });
    });

    it("29 February falls on the 28th in a year without one", () => {
        expect(countdownTarget(yearly("2000-02-29"), "2027-01-10")).toEqual({ date: "2027-02-28", years: 27 });
    });

    it("29 February stays the 29th in a leap year", () => {
        expect(countdownTarget(yearly("2000-02-29"), "2028-02-28")).toEqual({ date: "2028-02-29", years: 28 });
    });

    it("on 28 February of a year without the 29th, it is today", () => {
        expect(countdownTarget(yearly("2000-02-29"), "2027-02-28")).toEqual({ date: "2027-02-28", years: 27 });
    });

    it("past the 28th in a year without the 29th, it moves to the next year's 29th", () => {
        expect(countdownTarget(yearly("2000-02-29"), "2027-03-01")).toEqual({ date: "2028-02-29", years: 28 });
    });

    it("a date still ahead counts to itself, with no anniversary", () => {
        expect(countdownTarget(yearly("2027-06-01"), "2026-10-05")).toEqual({ date: "2027-06-01", years: 0 });
    });

    it("the original day itself is today, year zero", () => {
        expect(countdownTarget(yearly("2026-10-05"), "2026-10-05")).toEqual({ date: "2026-10-05", years: 0 });
    });

    it("one year on is the first anniversary", () => {
        expect(countdownTarget(yearly("2025-10-05"), "2026-10-05")).toEqual({ date: "2026-10-05", years: 1 });
    });
});
