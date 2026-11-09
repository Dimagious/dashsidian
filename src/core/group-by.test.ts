import { describe, it, expect } from "vitest";
import {
    DEFAULT_GROUP_LIMIT,
    groupByMissing,
    groupNotes,
    groupOrder,
    groupValues,
    hasGroupBy,
    rankGroups,
    readGroupBy,
    summarizeGroups,
} from "./group-by";
import type { NoteRecord } from "./source";

const note = (name: string, frontmatter: Record<string, unknown>): NoteRecord => ({
    path: `Games/${name}.md`,
    name,
    folder: "Games",
    tags: [],
    frontmatter,
});

const names = (notes: readonly NoteRecord[]): string[] => notes.map((n) => n.name);

describe("readGroupBy (B-213)", () => {
    it("reads the property and the default limit, and keeps every other key", () => {
        const item = { label: "By platform", group_by: " platform ", agg: "sum", field: "hours", unit: "h" };
        expect(readGroupBy(item, '"By platform"')).toEqual({
            spec: { field: "platform", limit: DEFAULT_GROUP_LIMIT },
            item,
            diagnostics: [],
        });
        expect(DEFAULT_GROUP_LIMIT).toBe(10);
    });

    it("takes a whole limit of 1 or more", () => {
        expect(readGroupBy({ group_by: "platform", limit: 1 }, "c").spec).toEqual({ field: "platform", limit: 1 });
        expect(readGroupBy({ group_by: "platform", limit: 25 }, "c").spec?.limit).toBe(25);
    });

    it.each([[0], [-3], [2.5], ["5"], [null]])("a limit of %s warns and falls back to 10", (limit) => {
        const { spec, diagnostics } = readGroupBy({ group_by: "platform", limit }, '"Games"');
        expect(spec?.limit).toBe(10);
        expect(diagnostics).toEqual([{
            level: "warning",
            message: `"Games": \`limit\` expects a whole number of 1 or more, got "${String(limit)}". Showing 10 rows.`,
        }]);
    });

    it("drops the keys that describe one number, with one warning naming them", () => {
        const item = { label: "G", group_by: "genre", compare: true, better: "up", trend: "30d", origin: "note", sub: "kept" };
        const { spec, item: kept, diagnostics } = readGroupBy(item, '"G"');
        expect(spec).not.toBeNull();
        expect(kept).toEqual({ label: "G", group_by: "genre", sub: "kept" });
        expect(diagnostics).toEqual([{
            level: "warning",
            message: '"G": with `group_by` these keys do nothing and are ignored: `compare`, `better`, `trend`, `origin`.',
        }]);
    });

    it("without group_by the card is ordinary and keeps every key; a lone limit warns", () => {
        const item = { label: "N", compare: true };
        expect(readGroupBy(item, '"N"')).toEqual({ spec: null, item, diagnostics: [] });
        expect(readGroupBy({ label: "N", limit: 3 }, '"N"').diagnostics).toEqual([
            { level: "warning", message: '"N": `limit` only works with `group_by`. Ignored.' },
        ]);
    });

    it.each([[""], ["   "], [["platform", "genre"]], [3]])("group_by %j is no property: a warning and an ordinary card", (raw) => {
        const item = { label: "N", group_by: raw, compare: true };
        const out = readGroupBy(item, '"N"');
        expect(out.spec).toBeNull();
        expect(out.item).toBe(item);
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            `"N": \`group_by\` expects a property name, got "${typeof raw === "string" ? raw : JSON.stringify(raw)}". Drawing an ordinary card instead.`,
        ]);
        expect(hasGroupBy(item)).toBe(false);
    });

    it("hasGroupBy says the same as readGroupBy", () => {
        expect(hasGroupBy({ group_by: "platform" })).toBe(true);
        expect(hasGroupBy({})).toBe(false);
    });
});

describe("groupValues (B-213)", () => {
    it("a single value, trimmed", () => {
        expect(groupValues({ platform: "  Switch " }, "platform")).toEqual(["Switch"]);
    });

    it("a list gives each of its values, blanks and maps left out", () => {
        expect(groupValues({ genres: ["rpg", " indie", "", null, { a: 1 }] }, "genres")).toEqual(["rpg", "indie"]);
    });

    it("a link is the name of the note it points to: no folder, alias, heading or extension", () => {
        expect(groupValues({ p: "[[Switch]]" }, "p")).toEqual(["Switch"]);
        expect(groupValues({ p: "[[Consoles/Switch|my Switch]]" }, "p")).toEqual(["Switch"]);
        expect(groupValues({ p: "[[Switch#Games]]" }, "p")).toEqual(["Switch"]);
        expect(groupValues({ p: "[[Consoles/Switch.md]]" }, "p")).toEqual(["Switch"]);
        expect(groupValues({ p: ["[[PC]]", "[[Switch]]"] }, "p")).toEqual(["PC", "Switch"]);
        // A link into the note itself has no name: shown as written.
        expect(groupValues({ p: "[[#Notes]]" }, "p")).toEqual(["[[#Notes]]"]);
    });

    it("numbers and checkboxes are their text, a date as written", () => {
        expect(groupValues({ stars: 5 }, "stars")).toEqual(["5"]);
        expect(groupValues({ done: false }, "done")).toEqual(["false"]);
        expect(groupValues({ day: "2026-10-05" }, "day")).toEqual(["2026-10-05"]);
        expect(groupValues({ n: Number.NaN }, "n")).toEqual([]);
    });

    it("missing, null, blank and an empty list give nothing; a dotted path is read", () => {
        expect(groupValues({}, "platform")).toEqual([]);
        expect(groupValues({ platform: null }, "platform")).toEqual([]);
        expect(groupValues({ platform: "  " }, "platform")).toEqual([]);
        expect(groupValues({ platform: [] }, "platform")).toEqual([]);
        expect(groupValues({ meta: { platform: "PC" } }, "meta.platform")).toEqual(["PC"]);
    });
});

describe("groupNotes (B-213)", () => {
    it("splits by value; a note with a list counts in each and marks an overlap", () => {
        const notes = [
            note("Hades", { platform: ["PC", "Switch"] }),
            note("Celeste", { platform: "Switch" }),
            note("Halo", { platform: "Xbox" }),
        ];
        const { groups, noValue, overlap } = groupNotes(notes, "platform");
        expect(groups.map((g) => [g.label, names(g.notes)])).toEqual([
            ["PC", ["Hades"]],
            ["Switch", ["Hades", "Celeste"]],
            ["Xbox", ["Halo"]],
        ]);
        expect(noValue).toEqual([]);
        expect(overlap).toBe(true);
    });

    it("no overlap when every note has one value", () => {
        const notes = [note("A", { platform: "PC" }), note("B", { platform: "PC" })];
        expect(groupNotes(notes, "platform").overlap).toBe(false);
    });

    it("groups regardless of case and shows the spelling most notes use", () => {
        const notes = [
            note("A", { genre: "rpg" }),
            note("B", { genre: "RPG" }),
            note("C", { genre: "rpg" }),
        ];
        const { groups } = groupNotes(notes, "genre");
        expect(groups.map((g) => [g.label, g.notes.length])).toEqual([["rpg", 3]]);
    });

    it("a tie between spellings goes to the first by code point, whatever the note order", () => {
        const one = groupNotes([note("A", { genre: "rpg" }), note("B", { genre: "RPG" })], "genre");
        const other = groupNotes([note("B", { genre: "RPG" }), note("A", { genre: "rpg" })], "genre");
        expect(one.groups[0]?.label).toBe("RPG");
        expect(other.groups[0]?.label).toBe("RPG");
    });

    it("a value listed twice in one note, in any case, counts once and is no overlap", () => {
        const { groups, overlap } = groupNotes([note("A", { genre: ["rpg", "RPG"] })], "genre");
        expect(groups.map((g) => g.notes.length)).toEqual([1]);
        expect(overlap).toBe(false);
    });

    it("a link and the plain name are one group", () => {
        const notes = [note("A", { platform: "[[Switch]]" }), note("B", { platform: "Switch" })];
        expect(groupNotes(notes, "platform").groups.map((g) => [g.label, g.notes.length])).toEqual([["Switch", 2]]);
    });

    it("missing, null, blank and an empty list are the notes with no value", () => {
        const notes = [
            note("Missing", {}),
            note("Null", { platform: null }),
            note("Blank", { platform: "" }),
            note("Empty", { platform: [] }),
            note("PC", { platform: "PC" }),
        ];
        const { groups, noValue } = groupNotes(notes, "platform");
        expect(names(noValue)).toEqual(["Missing", "Null", "Blank", "Empty"]);
        expect(groups.map((g) => g.label)).toEqual(["PC"]);
    });

    it("numbers and booleans group by their text", () => {
        const notes = [note("A", { stars: 5 }), note("B", { stars: 5 }), note("C", { stars: 4 }), note("D", { done: true })];
        expect(groupNotes(notes, "stars").groups.map((g) => [g.label, g.notes.length])).toEqual([["5", 2], ["4", 1]]);
        expect(groupNotes(notes, "done").groups.map((g) => g.label)).toEqual(["true"]);
    });
});

describe("rankGroups and groupOrder (B-213)", () => {
    const rows = [
        { label: "PS5", value: 1 },
        { label: "Switch", value: 4 },
        { label: "PC", value: 3 },
        { label: "Xbox", value: 1 },
        { label: "Empty", value: null },
        { label: "PS4", value: 1 },
    ];

    it("ranks the largest first, ties by name, nothing to show last", () => {
        expect(rankGroups(rows, "descending", 10)).toEqual({
            rows: [
                { label: "Switch", value: 4 },
                { label: "PC", value: 3 },
                { label: "PS4", value: 1 },
                { label: "PS5", value: 1 },
                { label: "Xbox", value: 1 },
                { label: "Empty", value: null },
            ],
            more: 0,
        });
    });

    it("ascending puts the smallest first, a dash still last", () => {
        expect(rankGroups(rows, "ascending", 10).rows.map((r) => r.label))
            .toEqual(["PS4", "PS5", "Xbox", "PC", "Switch", "Empty"]);
    });

    it("cuts to the limit and counts what it left out", () => {
        expect(rankGroups(rows, "descending", 2)).toEqual({
            rows: [{ label: "Switch", value: 4 }, { label: "PC", value: 3 }],
            more: 4,
        });
        expect(rankGroups(rows, "descending", 6).more).toBe(0);
        expect(rankGroups([], "descending", 3)).toEqual({ rows: [], more: 0 });
    });

    it("a tie by name compares numbers as numbers", () => {
        const numeric = [{ label: "10", value: 1 }, { label: "9", value: 1 }, { label: "2", value: 1 }];
        expect(rankGroups(numeric, "descending", 10).rows.map((r) => r.label)).toEqual(["2", "9", "10"]);
    });

    it("only `min` ranks ascending", () => {
        expect(groupOrder("min")).toBe("ascending");
        for (const agg of ["count", "sum", "avg", "max", "latest", "streak", "current_streak"] as const) {
            expect(groupOrder(agg), agg).toBe("descending");
        }
    });
});

describe("summarizeGroups (B-213)", () => {
    const notes = [
        note("Hades", { platform: ["PC", "Switch"], hours: 40 }),
        note("Celeste", { platform: "Switch", hours: 12 }),
        note("BG3", { platform: "PC", hours: 120 }),
        note("Tetris", { hours: 3 }),
    ];
    const sumHours = (group: readonly NoteRecord[]): number | null => {
        const values = group.map((n) => n.frontmatter.hours).filter((v): v is number => typeof v === "number");
        return values.length ? values.reduce((a, b) => a + b, 0) : null;
    };

    it("measures each group and the notes with no value apart, in one call", () => {
        expect(summarizeGroups(notes, { field: "platform", limit: 10 }, "sum", sumHours)).toEqual({
            rows: [{ label: "PC", value: 160 }, { label: "Switch", value: 52 }],
            more: 0,
            noValue: { value: 3 },
            overlap: true,
        });
    });

    it("`min` ranks the smallest first; the no-value row is outside the limit", () => {
        const out = summarizeGroups(notes, { field: "platform", limit: 1 }, "min", sumHours);
        expect(out.rows).toEqual([{ label: "Switch", value: 52 }]);
        expect(out.more).toBe(1);
        expect(out.noValue).toEqual({ value: 3 });
    });

    it("no no-value row when every note has a value", () => {
        const out = summarizeGroups(notes.slice(0, 3), { field: "platform", limit: 10 }, "count", (g) => g.length);
        expect(out.noValue).toBeUndefined();
        expect(out.rows).toEqual([{ label: "PC", value: 2 }, { label: "Switch", value: 2 }]);
    });
});

describe("groupByMissing (B-213)", () => {
    it("warns when no selected note has the property at all", () => {
        expect(groupByMissing([note("A", { platfrom: "PC" })], "platform", '"Games"')).toEqual([{
            level: "warning",
            message: '"Games": no selected note has "platform" for `group_by`. Check the name: every note is counted under "no value".',
        }]);
    });

    it("is silent once one note has it, even blank, and over an empty selection", () => {
        expect(groupByMissing([note("A", {}), note("B", { platform: null })], "platform", "c")).toEqual([]);
        expect(groupByMissing([], "platform", "c")).toEqual([]);
    });
});

describe("groupNotes: checker follow-ups (B-213)", () => {
    it("shows two links in one text value as written, not as a mangled name", () => {
        const { groups } = groupNotes([note("Hades", { platform: "[[PC]], [[Switch]]" })], "platform");
        expect(groups.map((g) => g.label)).toEqual(["[[PC]], [[Switch]]"]);
    });

    it("puts composed and decomposed spellings of one word in one group", () => {
        const composed = "café";
        const decomposed = "café";
        const { groups } = groupNotes([note("A", { place: composed }), note("B", { place: decomposed })], "place");
        expect(groups.map((g) => [g.label, names(g.notes)])).toEqual([[composed, ["A", "B"]]]);
    });
});
