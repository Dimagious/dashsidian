import { describe, it, expect } from "vitest";
import { readCountdown, readDateKey, daysUntil, countdownTarget } from "./countdown";
import type { NoteRecord } from "./source";
import { dateFormats, type ParseDate } from "./note-date";

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

describe("readCountdown: pick next (B-170)", () => {
    const TODAY = "2026-10-07";
    const races = [
        noteAt("Races/2026-03-01 Half.md", { date: "2026-03-01" }),
        noteAt("Races/2026-01-10 IRONMAN 70.3.md", { date: "2026-11-15" }),
        noteAt("Races/2025-12-01 Marathon.md", { date: "2026-10-20" }),
    ];
    const next = (item: Record<string, unknown>, notes: NoteRecord[], today = TODAY) =>
        readCountdown({ field: "date", pick: "next", ...item }, "Next race", () => notes, undefined, today);

    it("picks the soonest date still ahead, whatever the dates in the names say", () => {
        const { spec, diagnostics } = next({ source: "Races" }, races);
        expect(spec).toEqual({
            date: "2026-10-20",
            note: "Races/2025-12-01 Marathon.md",
            noteName: "2025-12-01 Marathon",
        });
        expect(diagnostics).toEqual([]);
    });

    it("the order the vault lists the notes in does not matter", () => {
        expect(next({}, [...races].reverse()).spec?.date).toBe("2026-10-20");
    });

    it("a date today is the next one", () => {
        const notes = [...races, noteAt("Races/Sprint.md", { date: TODAY })];
        expect(next({}, notes).spec).toEqual({ date: TODAY, note: "Races/Sprint.md", noteName: "Sprint" });
    });

    it("yesterday is gone by, so the next one after it wins", () => {
        const notes = [noteAt("Races/A.md", { date: "2026-10-06" }), noteAt("Races/B.md", { date: "2026-10-08" })];
        expect(next({}, notes).spec?.note).toBe("Races/B.md");
    });

    it("notes without a date in their name take part like any other", () => {
        const notes = [
            noteAt("Races/2026-10-01 Club run.md", { date: "2026-12-01" }),
            noteAt("Races/Berlin.md", { date: "2026-10-30" }),
        ];
        expect(next({}, notes).spec?.note).toBe("Races/Berlin.md");
    });

    it("`latest`, the default, still reads the newest note by name, past date or not", () => {
        const latest = readCountdown({ field: "date", source: "Races" }, "R", () => races, undefined, TODAY);
        expect(latest.spec).toEqual({ date: "2026-03-01", note: "Races/2026-03-01 Half.md" });
        const named = readCountdown({ field: "date", pick: "latest" }, "R", () => races, undefined, TODAY);
        expect(named.spec).toEqual(latest.spec);
        expect(named.diagnostics).toEqual([]);
    });

    it("a tie goes to the first note by path", () => {
        const notes = [noteAt("Races/B.md", { date: "2026-11-01" }), noteAt("Races/A.md", { date: "2026-11-01" })];
        expect(next({}, notes).spec?.note).toBe("Races/A.md");
        expect(next({}, [...notes].reverse()).spec?.note).toBe("Races/A.md");
    });

    it("when every date has passed, the card errors naming the latest one and its note", () => {
        const past = [
            noteAt("Races/A.md", { date: "2026-05-01" }),
            noteAt("Races/B.md", { date: "2026-09-30" }),
            noteAt("Races/C.md", { date: "2025-06-01" }),
        ];
        const { spec, diagnostics } = next({}, past);
        expect(spec).toBeNull();
        expect(diagnostics).toEqual([{
            level: "error",
            message: '"Next race": no date in "date" is still ahead. The latest is 2026-09-30, in "B".',
        }]);
    });

    it("a value that is not a date is skipped, and one warning names the first and counts them", () => {
        const notes = [
            noteAt("Races/C.md", { date: "2026-11-01" }),
            noteAt("Races/B.md", { date: "soon" }),
            noteAt("Races/A.md", { date: "TBD" }),
        ];
        const { spec, diagnostics } = next({}, notes);
        expect(spec?.note).toBe("Races/C.md");
        expect(diagnostics).toEqual([{
            level: "warning",
            message: '"Next race": 2 notes were skipped, their "date" is not a date: "TBD" in "A", for one. Expected YYYY-MM-DD, or another format named with `date_format:` next to `items:`.',
        }]);
    });

    it("one skipped note takes the singular", () => {
        const notes = [noteAt("Races/A.md", { date: "TBD" }), noteAt("Races/B.md", { date: "2026-11-01" })];
        expect(next({}, notes).diagnostics[0]?.message).toBe(
            '"Next race": 1 note was skipped, its "date" is not a date: "TBD" in "A". Expected YYYY-MM-DD, or another format named with `date_format:` next to `items:`.',
        );
    });

    it("a skipped value is still reported when every real date has passed", () => {
        const notes = [noteAt("Races/A.md", { date: "TBD" }), noteAt("Races/B.md", { date: "2026-01-01" })];
        const { spec, diagnostics } = next({}, notes);
        expect(spec).toBeNull();
        expect(diagnostics.map((d) => d.level)).toEqual(["warning", "error"]);
        expect(diagnostics[0]?.message).toContain('1 note was skipped, its "date" is not a date: "TBD" in "A"');
        expect(diagnostics[1]?.message).toContain("The latest is 2026-01-01");
    });

    it("blank values are not counted as skipped", () => {
        const notes = [noteAt("Races/A.md", { date: "" }), noteAt("Races/B.md", { date: null }),
            noteAt("Races/C.md", { date: "2026-11-01" })];
        const { spec, diagnostics } = next({}, notes);
        expect(spec?.note).toBe("Races/C.md");
        expect(diagnostics).toEqual([]);
    });

    it("when no value is a date at all, the first is the error `latest` gives", () => {
        const notes = [noteAt("Races/B.md", { date: "soon" }), noteAt("Races/A.md", { date: "TBD" })];
        const { spec, diagnostics } = next({}, notes);
        expect(spec).toBeNull();
        expect(diagnostics).toEqual([{
            level: "error",
            message: '"Next race": "date" in "A" is "TBD", not a date. Expected YYYY-MM-DD, or another format named with `date_format:` next to `items:`.',
        }]);
    });

    it("no note with the field filled in is the usual missing-field error", () => {
        const { spec, diagnostics } = next({}, [noteAt("Races/A.md", { distance: 42 })]);
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toBe(
            '"Next race": no note in the selection has "date" filled in. Check the name, `source`, `tag` and `where`.',
        );
        expect(next({}, []).diagnostics[0]?.message).toContain("no note in the selection");
    });

    it("source, tag and where narrow the notes it chooses from", () => {
        const notes = [
            noteAt("Races/A.md", { date: "2026-10-10", type: "run" }, ["race"]),
            noteAt("Races/B.md", { date: "2026-10-12", type: "tri" }, ["race"]),
            noteAt("Races/C.md", { date: "2026-10-14", type: "tri" }),
            noteAt("Trips/D.md", { date: "2026-10-08", type: "tri" }, ["race"]),
        ];
        expect(next({}, notes).spec?.note).toBe("Trips/D.md");
        expect(next({ source: "Races" }, notes).spec?.note).toBe("Races/A.md");
        expect(next({ source: "Races", where: "type = tri" }, notes).spec?.note).toBe("Races/B.md");
        expect(next({ where: "type = tri", tag: "race", source: "Races" }, notes).spec?.note).toBe("Races/B.md");
        expect(next({ where: "type = tri" }, notes.filter((n) => n.tags.length === 0)).spec?.note).toBe("Races/C.md");
    });

    it("with repeat yearly it counts to the next birthday among the people", () => {
        const people = [
            noteAt("People/Anna.md", { birthday: "1990-05-12" }),
            noteAt("People/Boris.md", { birthday: "1985-10-04" }),
            noteAt("People/Clara.md", { birthday: "2001-12-24" }),
        ];
        const { spec, diagnostics } = readCountdown(
            { field: "birthday", pick: "next", repeat: "yearly", source: "People" },
            "Next birthday", () => people, undefined, TODAY,
        );
        // Boris's was three days ago, so Clara's 24 December comes first. The
        // original date is kept, so the block still works out the age.
        expect(spec).toEqual({
            date: "2001-12-24", repeat: "yearly", note: "People/Clara.md", noteName: "Clara",
        });
        expect(diagnostics).toEqual([]);
        expect(countdownTarget(spec ?? { date: "" }, TODAY)).toEqual({ date: "2026-12-24", years: 25 });
    });

    it("a 29 February birthday lands on the 28th and can be the next one", () => {
        const people = [
            noteAt("People/Leap.md", { birthday: "2000-02-29" }),
            noteAt("People/March.md", { birthday: "1999-03-01" }),
        ];
        const { spec } = readCountdown(
            { field: "birthday", pick: "next", repeat: "yearly" }, "B", () => people, undefined, "2027-01-10",
        );
        expect(spec?.note).toBe("People/Leap.md");
        expect(countdownTarget(spec ?? { date: "" }, "2027-01-10")).toEqual({ date: "2027-02-28", years: 27 });
    });

    it("with repeat yearly a birthday today wins over one tomorrow", () => {
        const people = [
            noteAt("People/A.md", { birthday: "1990-10-08" }),
            noteAt("People/B.md", { birthday: "1980-10-07" }),
        ];
        const { spec } = readCountdown(
            { field: "birthday", pick: "next", repeat: "yearly" }, "B", () => people, undefined, TODAY,
        );
        expect(spec?.note).toBe("People/B.md");
    });

    it("reads values in the block's date format", () => {
        const notes = [noteAt("Races/A.md", { date: "20.11.2026" }), noteAt("Races/B.md", { date: "15.10.2026" })];
        // A stand-in for moment: reads DD.MM.YYYY and nothing else.
        const parse: ParseDate = (text, format) => {
            const m = format === "DD.MM.YYYY" ? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text) : null;
            return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
        };
        const formats = dateFormats("DD.MM.YYYY", undefined, parse);
        const { spec } = readCountdown({ field: "date", pick: "next" }, "R", () => notes, formats, TODAY);
        expect(spec?.date).toBe("2026-10-15");
    });

    it("refuses any other value, naming it", () => {
        for (const pick of ["soonest", "Next", "", true, 1]) {
            const { spec, diagnostics } = readCountdown(
                { field: "date", pick }, "Next race", () => races, undefined, TODAY,
            );
            expect(spec, String(pick)).toBeNull();
            expect(diagnostics).toEqual([{
                level: "error",
                message: `"Next race": \`pick\` expects \`latest\` or \`next\`, got "${String(pick)}".`,
            }]);
        }
    });

    it("a bare `pick:` is the default", () => {
        const { spec, diagnostics } = readCountdown({ field: "date", pick: null }, "R", () => races, undefined, TODAY);
        expect(spec?.note).toBe("Races/2026-03-01 Half.md");
        expect(diagnostics).toEqual([]);
    });

    it("next to a written date it warns and the date stands", () => {
        const { spec, diagnostics } = readCountdown({ date: "2026-11-15", pick: "next" }, "Race", NONE);
        expect(spec).toEqual({ date: "2026-11-15" });
        expect(diagnostics).toEqual([{
            level: "warning",
            message: '"Race": `pick` only chooses among the notes `field` is read from. With `date:` it is ignored.',
        }]);
    });

    it("an invalid value next to a written date is still an error, like `repeat`", () => {
        const { spec, diagnostics } = readCountdown({ date: "2026-11-15", pick: "soonest" }, "Race", NONE);
        expect(spec).toBeNull();
        expect(diagnostics).toEqual([{
            level: "error",
            message: '"Race": `pick` expects `latest` or `next`, got "soonest".',
        }]);
    });

    it("without today it is a caller's bug and throws, rather than counting from a wrong day", () => {
        expect(() => readCountdown({ field: "date", pick: "next" }, "R", () => races)).toThrow(/needs `today`/);
        // `latest` never needed it, and still does not.
        expect(readCountdown({ field: "date" }, "R", () => races).spec?.date).toBe("2026-03-01");
    });
});
