import { describe, it, expect } from "vitest";
import {
    dateFormatCandidates,
    describeVault,
    formatVaultProfile,
    isSecretName,
    sampleText,
    type ProfileSettings,
} from "./vault-profile-file";
import { dateFormats, type ParseDate } from "./note-date";
import { periodNames } from "./period-name";
import type { NoteRecord } from "./source";

const note = (path: string, frontmatter: Record<string, unknown> = {}, tags: string[] = []): NoteRecord => {
    const slash = path.lastIndexOf("/");
    return {
        path,
        name: path.slice(slash + 1).replace(/\.md$/, ""),
        folder: slash === -1 ? "" : path.slice(0, slash),
        tags,
        frontmatter,
    };
};

/** A strict reader of the two formats these tests use, standing in for moment. */
const parse: ParseDate = (text, format) => {
    if (format === "DD.MM.YYYY") {
        const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
    }
    if (format === "GGGG-[W]WW") return text === "2026-W40" ? "2026-09-28" : null;
    if (format === "YYYY-MM") return /^\d{4}-\d{2}$/.test(text) ? `${text}-01` : null;
    return null;
};

describe("describeVault: properties (B-168)", () => {
    const notes = [
        note("Diary/2026-10-01.md", { steps: 12000, sleep: "7h 30m", gym: true, mood: "good", date: "2026-10-01", tags: ["a", "b"] }),
        note("Diary/2026-10-02.md", { steps: "9000", sleep: "6:45", gym: false, mood: 3, date: "2026-10-02" }),
        note("Diary/2026-10-03.md", { steps: 8000, sleep: null, gym: true, mood: "fine", date: "2026-10-03" }),
    ];

    it("reads each property's kind the way the blocks read it", () => {
        const kinds = Object.fromEntries(describeVault(notes).fields.map((f) => [f.name, f.kind]));
        expect(kinds).toEqual({ steps: "number", sleep: "duration", gym: "checkbox", mood: "text", date: "date", tags: "list" });
    });

    it("counts the notes holding a value apart from the ones leaving it empty, and keeps every kind of a mixed one", () => {
        const fields = describeVault(notes).fields;
        expect(fields.find((f) => f.name === "sleep")).toMatchObject({ notes: 2, empty: 1 });
        expect(fields.find((f) => f.name === "mood")).toMatchObject({ notes: 3, empty: 0, kind: "text", kinds: { text: 2, number: 1 }, sample: "good" });
        expect(fields.find((f) => f.name === "steps")).toMatchObject({ notes: 3, sample: "12000", folders: [{ folder: "Diary", notes: 3 }] });
    });

    it("a nested property is a dotted path, the way `field` names it", () => {
        const fields = describeVault([note("a.md", { health: { sleep: 80, hr: { rest: 52 } } })]).fields;
        expect(fields.map((f) => [f.name, f.kind])).toEqual([["health.hr.rest", "number"], ["health.sleep", "number"]]);
    });

    it("a map deeper than three levels is one property whose sample says `(map)`, not `[object Object]`", () => {
        const fields = describeVault([note("a.md", { a: { b: { c: { d: 1 } } }, list: [{ x: 1 }, "y"] })]).fields;
        expect(fields.find((f) => f.name === "a.b.c")).toMatchObject({ kind: "text", sample: "(map)" });
        expect(fields.find((f) => f.name === "list")?.sample).toBe("(map), y");
        expect(formatVaultProfile(describeVault([note("a.md", { a: { b: { c: { d: 1 } } } })]), SETTINGS)).not.toContain("[object Object]");
    });

    it("a date in the daily note format is a date", () => {
        const dayFormats = dateFormats(undefined, "DD.MM.YYYY", parse);
        const fields = describeVault([note("a.md", { done: "05.10.2026" })], dayFormats ? { dayFormats } : {}).fields;
        expect(fields[0]?.kind).toBe("date");
        expect(describeVault([note("a.md", { done: "05.10.2026" })]).fields[0]?.kind).toBe("text");
    });

    it("lists the properties in the most notes first, cut at the limit, and says how many there were", () => {
        const many = [note("a.md", { a: 1, b: 1, c: 1 }), note("b.md", { b: 1, c: 1 }), note("c.md", { c: 1 })];
        const vault = describeVault(many, { limits: { fields: 2 } });
        expect(vault.fields.map((f) => f.name)).toEqual(["c", "b"]);
        expect(vault.fieldCount).toBe(3);
        expect(formatVaultProfile(vault, SETTINGS)).toContain("Showing the 2 properties found in the most notes, of 3.");
    });

    it("a property named like a secret is listed without its value", () => {
        const vault = describeVault([note("a.md", { api_key: "sk-123", password: "hunter2", token: "x", key: "k", monkey: "banana" })]);
        const byName = Object.fromEntries(vault.fields.map((f) => [f.name, f]));
        for (const name of ["api_key", "password", "token", "key"]) expect(byName[name]).toMatchObject({ hidden: true, sample: null, notes: 1 });
        expect(byName.monkey).toMatchObject({ hidden: false, sample: "banana" });
        const text = formatVaultProfile(vault, SETTINGS);
        for (const secret of ["sk-123", "hunter2"]) expect(text).not.toContain(secret);
        expect(text).toContain("| password | text | 1 | 0 | (hidden: the name looks like a secret) |");
    });

    it("a long value is cut to 40 characters on one line", () => {
        const long = `${"x".repeat(50)}\nmore`;
        const vault = describeVault([note("a.md", { summary: long })]);
        expect(vault.fields[0]?.sample).toBe(`${"x".repeat(40)}...`);
        expect(sampleText("a\n b")).toBe("a b");
        expect(sampleText(["one", 2])).toBe("one, 2");
    });
});

describe("describeVault: folders (B-168)", () => {
    const names = periodNames({}, parse);
    const dayFormats = dateFormats(undefined, "DD.MM.YYYY", parse);

    it("says how each folder's notes are dated: ISO names, the daily format, period names, date properties", () => {
        const vault = describeVault([
            note("Diary/2026-10-01.md"),
            note("Diary/2026-10-02 Friday.md"),
            note("Journal/05.10.2026.md"),
            note("Reviews/2026-W40.md"),
            note("Reviews/2026-10.md"),
            note("Reading/Dune.md", { finished: "2026-02-11" }),
        ], { names, ...(dayFormats ? { dayFormats } : {}) });
        const byFolder = Object.fromEntries(vault.folders.map((f) => [f.folder, f]));
        expect(byFolder.Diary).toMatchObject({ notes: 2, isoNames: 2 });
        expect(byFolder.Journal).toMatchObject({ notes: 1, formatNames: 1 });
        expect(byFolder.Reviews).toMatchObject({ notes: 2, periodNames: { week: 1, month: 1 } });
        expect(byFolder.Reading).toMatchObject({ isoNames: 0, dateFields: [{ name: "finished", notes: 1 }] });
    });

    it("a name in a date format nothing reads gets the `date_format` values it fits", () => {
        const vault = describeVault([note("Log/25.03.2026.md"), note("Log/05.03.2026.md")]);
        expect(vault.folders[0]?.candidates).toEqual([{ format: "DD.MM.YYYY", notes: 2 }, { format: "MM.DD.YYYY", notes: 1 }]);
    });

    it("marks a template folder, lists the most notes first and cuts at the limit", () => {
        const vault = describeVault(
            [note("Templates/Day.md"), note("Templates/Week.md"), note("Diary/a.md"), note("Root.md")],
            { templateFolders: ["Templates"], limits: { folders: 2 } },
        );
        expect(vault.folders.map((f) => [f.folder, f.notes, f.template])).toEqual([["Templates", 2, true], ["", 1, false]]);
        expect(vault.folderCount).toBe(3);
        expect(formatVaultProfile(vault, SETTINGS)).toContain("Showing the 2 folders with the most notes, of 3.");
    });
});

describe("dateFormatCandidates (B-168)", () => {
    it("names every format a date at the start of a name fits", () => {
        expect(dateFormatCandidates("25.03.2026 Wednesday")).toEqual(["DD.MM.YYYY"]);
        expect(dateFormatCandidates("03/25/2026")).toEqual(["MM/DD/YYYY"]);
        expect(dateFormatCandidates("05-03-2026")).toEqual(["DD-MM-YYYY", "MM-DD-YYYY"]);
        expect(dateFormatCandidates("5.3.2026")).toEqual(["D.M.YYYY", "M.D.YYYY"]);
        expect(dateFormatCandidates("2026.03.05")).toEqual(["YYYY.MM.DD"]);
        expect(dateFormatCandidates("20260305 call")).toEqual(["YYYYMMDD"]);
    });

    it("no real day, a two-digit year or a plain title fits nothing", () => {
        for (const name of ["31.02.2026", "05.03.26", "Dune", "2026.13.40", "20261340", "123456789"]) {
            expect(dateFormatCandidates(name), name).toEqual([]);
        }
    });
});

describe("isSecretName (B-168)", () => {
    it("matches secrets, not words that merely hold the letters", () => {
        for (const name of ["password", "db_passwd", "auth.token", "client_secret", "apiKey", "api-key", "private", "ssh_key", "key"]) {
            expect(isSecretName(name), name).toBe(true);
        }
        for (const name of ["monkey", "keyboard_hours", "passage", "steps", "keynote"]) {
            expect(isSecretName(name), name).toBe(name === "keyboard_hours" || name === "keynote");
        }
    });
});

const SETTINGS: ProfileSettings = {
    pluginVersion: "2.1.0",
    schemaVersion: "1.10.0",
    today: "2026-10-30",
    startDayHour: 4,
    obsidianLanguage: "en",
    pluginLanguage: "ru",
    firstDayOfWeek: 0,
    periodic: [
        { period: "daily", folder: "Diary", format: "YYYY-MM-DD", from: "Periodic Notes or Daily notes" },
        { period: "weekly", folder: "", format: "gggg-[W]ww", from: "default" },
        { period: "monthly", folder: "Months", format: "YYYY-MM", from: "Dashy settings" },
    ],
    nameFormats: { week: "gggg-[W]ww" },
    templateFolders: ["Templates"],
};

describe("formatVaultProfile (B-168)", () => {
    it("writes the settings, the folders, the properties and the tags as an agent reads them", () => {
        const vault = describeVault([
            note("Diary/2026-10-01.md", { steps: 12000, gym: true }, ["habit"]),
            note("Diary/2026-10-02.md", { steps: 9000, gym: false }, ["habit", "work"]),
        ]);
        const text = formatVaultProfile(vault, SETTINGS);
        expect(text).toContain("- Dashy 2.1.0, block schema 1.10.0");
        expect(text).toContain("- Today: 2026-10-30; a new day starts at 04:00");
        expect(text).toContain("- Obsidian language: en; Dashy's language: ru");
        expect(text).toContain("- First day of the week: Sunday");
        expect(text).toContain("- Template folders: `Templates`");
        expect(text).toContain("| daily | Diary | `YYYY-MM-DD` | Periodic Notes or Daily notes |");
        expect(text).toContain("| weekly | (vault root) | `gggg-[W]ww` | default |");
        expect(text).toContain("week `gggg-[W]ww` from the settings, then ISO");
        expect(text).toContain("| Diary | 2 | 2 YYYY-MM-DD |  |  |");
        expect(text).toContain("| steps | number | 2 | 0 | `12000` | Diary (2) |");
        expect(text).toContain("| gym | checkbox | 2 | 0 | `true` | Diary (2) |");
        expect(text).toContain("habit (2), work (1)");
        expect(text).toContain("fills its examples with the folder holding the most notes, `Diary`, and the number property in the most notes, `steps`.");
    });

    it("an empty vault says so in every section rather than writing empty tables", () => {
        const text = formatVaultProfile(describeVault([]), { ...SETTINGS, nameFormats: {}, templateFolders: [] });
        expect(text).toContain("The vault has no notes.");
        expect(text).toContain("No note has properties.");
        expect(text).toContain("No note has tags.");
        expect(text).toContain("- Template folders: none");
        expect(text).toContain("ISO only: day `YYYY-MM-DD`");
        expect(text).toContain("the folder holding the most notes, none here, and the number property in the most notes, none here.");
        expect(text).not.toContain("| Folder | Notes |");
        expect(text).not.toContain("| Property |");
    });

    it("a pipe in a name cannot break a table row", () => {
        const text = formatVaultProfile(describeVault([note("A|B/x.md", { "a|b": "c|d" })]), SETTINGS);
        expect(text).toContain("| A\\|B | 1 |");
        expect(text).toContain("| a\\|b | text | 1 | 0 | `c\\|d` |");
    });

    it("a mixed property names its other kinds; a list of tags is cut with a note", () => {
        const vault = describeVault(
            [note("a.md", { mood: 3 }, ["x"]), note("b.md", { mood: 4 }, ["y"]), note("c.md", { mood: "ok" }, ["z"])],
            { limits: { tags: 2 } },
        );
        const text = formatVaultProfile(vault, SETTINGS);
        expect(text).toContain("| mood | number; also text (1) | 3 |");
        expect(text).toContain("Showing the 2 most used tags, of 3.");
    });
});
