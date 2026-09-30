import { describe, it, expect } from "vitest";
import {
    parseWhere, selectNotes, readSource, readWhere, splitAnd, unmatchedSource, looksLikeConjunction, type NoteRecord,
} from "./source";

const note = (over: Partial<NoteRecord>): NoteRecord => ({
    path: "a.md", name: "a", folder: "", tags: [], frontmatter: {}, ...over,
});

const vault: NoteRecord[] = [
    note({ path: "01-Areas/Sport/run.md", name: "run", folder: "01-Areas/Sport", tags: ["sport"], frontmatter: { year: 2026, rating: 5 } }),
    note({ path: "01-Areas/Learning/ts.md", name: "ts", folder: "01-Areas/Learning", tags: ["tech"], frontmatter: { year: 2025, rating: 3 } }),
    note({ path: "00-Inbox/idea.md", name: "idea", folder: "00-Inbox", tags: [], frontmatter: {} }),
];

describe("parseWhere", () => {
    it("parses comparisons", () => {
        expect(parseWhere("year = 2026")).toEqual({ field: "year", op: "=", value: 2026 });
        expect(parseWhere("rating >= 4")).toEqual({ field: "rating", op: ">=", value: 4 });
        expect(parseWhere("status != done")).toEqual({ field: "status", op: "!=", value: "done" });
    });

    it("parses contains", () => {
        expect(parseWhere("tags contains books")).toEqual({ field: "tags", op: "contains", value: "books" });
    });

    it("strips quotes", () => {
        expect(parseWhere('status = "in progress"')).toEqual({ field: "status", op: "=", value: "in progress" });
    });

    it("returns null on rubbish instead of throwing", () => {
        expect(parseWhere("")).toBeNull();
        expect(parseWhere("just words")).toBeNull();
        expect(parseWhere("= 5")).toBeNull();
    });

    it("handles a non-ASCII value", () => {
        expect(parseWhere("tags contains книги")).toEqual({ field: "tags", op: "contains", value: "книги" });
    });

    it("a dotted field name parses like any other", () => {
        expect(parseWhere("health.sleep >= 80")).toEqual({ field: "health.sleep", op: ">=", value: 80 });
        expect(parseWhere("health.mood contains good")).toEqual({ field: "health.mood", op: "contains", value: "good" });
    });
});

describe("selectNotes", () => {
    it("a folder includes nested ones", () => {
        expect(selectNotes(vault, { source: "01-Areas" })).toHaveLength(2);
        expect(selectNotes(vault, { source: "01-Areas/Sport" })).toHaveLength(1);
    });

    it("a folder does not catch prefix neighbours", () => {
        const notes = [note({ folder: "01-Areas" }), note({ folder: "01-AreasOld" })];
        expect(selectNotes(notes, { source: "01-Areas" })).toHaveLength(1);
    });

    it("filters by tag, with or without the hash", () => {
        expect(selectNotes(vault, { tag: "sport" })).toHaveLength(1);
        expect(selectNotes(vault, { tag: "#sport" })).toHaveLength(1);
    });

    it("applies where", () => {
        expect(selectNotes(vault, { where: "year = 2026" })).toHaveLength(1);
        expect(selectNotes(vault, { where: "rating >= 3" })).toHaveLength(2);
    });

    it("a broken where does not silently drop everything — the filter is just skipped", () => {
        expect(selectNotes(vault, { where: "nonsense" })).toHaveLength(3);
    });

    it("conditions combine", () => {
        expect(selectNotes(vault, { source: "01-Areas", where: "rating >= 5" })).toHaveLength(1);
    });

    it("where filters on a nested frontmatter path", () => {
        const notes = [
            note({ path: "a.md", frontmatter: { health: { sleep: 82 } } }),
            note({ path: "b.md", frontmatter: { health: { sleep: 60 } } }),
            note({ path: "c.md", frontmatter: {} }),
        ];
        expect(selectNotes(notes, { where: "health.sleep >= 80" })).toEqual([notes[0]]);
    });

    it("a list of conditions keeps only notes meeting every one", () => {
        expect(selectNotes(vault, { where: ["year = 2026", "rating >= 5"] }).map((n) => n.name)).toEqual(["run"]);
        expect(selectNotes(vault, { where: ["rating >= 3", "year = 2025"] }).map((n) => n.name)).toEqual(["ts"]);
        expect(selectNotes(vault, { where: ["year = 2026", "rating < 5"] })).toEqual([]);
    });

    it("`and` in a string combines numbers across two fields", () => {
        const notes = [
            note({ path: "a.md", frontmatter: { sleep: 82, steps: 9000 } }),
            note({ path: "b.md", frontmatter: { sleep: 82, steps: 4000 } }),
            note({ path: "c.md", frontmatter: { sleep: 60, steps: 9000 } }),
            note({ path: "d.md", frontmatter: { sleep: "82", steps: 12000 } }),
        ];
        expect(selectNotes(notes, { where: "sleep >= 80 and steps > 8000" }).map((n) => n.path))
            .toEqual(["a.md", "d.md"]);
    });

    it("a dotted path and `tags contains` combine with a numeric condition", () => {
        const notes = [
            note({ path: "a.md", tags: ["sport"], frontmatter: { health: { sleep: 82 } } }),
            note({ path: "b.md", tags: ["tech"], frontmatter: { health: { sleep: 90 } } }),
            note({ path: "c.md", tags: ["sport"], frontmatter: { health: { sleep: 60 } } }),
        ];
        expect(selectNotes(notes, { where: ["health.sleep >= 80", "tags contains sport"] }).map((n) => n.path))
            .toEqual(["a.md"]);
        expect(selectNotes(notes, { where: "tags contains #sport and health.sleep < 70" }).map((n) => n.path))
            .toEqual(["c.md"]);
    });

    it("a list with a bad condition is skipped whole, never applied in part", () => {
        expect(selectNotes(vault, { where: ["year = 2026", "nonsense"] })).toHaveLength(3);
        expect(selectNotes(vault, { where: "year = 2026 or year = 2025" })).toHaveLength(3);
    });

    it("where on a literal dotted key still works", () => {
        const notes = [
            note({ path: "a.md", frontmatter: { "health.sleep": 82 } }),
            note({ path: "b.md", frontmatter: { "health.sleep": 60 } }),
        ];
        expect(selectNotes(notes, { where: "health.sleep >= 80" })).toEqual([notes[0]]);
    });
});

describe("looksLikeConjunction", () => {
    it("spots two conditions joined", () => {
        expect(looksLikeConjunction("year = 2026 and rating >= 4")).toBe(true);
        expect(looksLikeConjunction("year = 2026 OR year = 2025")).toBe(true);
    });

    it("a single condition is not one", () => {
        expect(looksLikeConjunction("year = 2026")).toBe(false);
        expect(looksLikeConjunction("tags contains books")).toBe(false);
    });

    it("the word inside quotes belongs to the value", () => {
        expect(looksLikeConjunction('status = "waiting and ready"')).toBe(false);
        expect(looksLikeConjunction("status = 'cats and dogs'")).toBe(false);
    });

    it("a word that merely starts with and is not a join", () => {
        expect(looksLikeConjunction("author = Andrew")).toBe(false);
    });
});

describe("parseWhere — more than one condition", () => {
    it("refuses instead of reading the rest as a value", () => {
        // This used to parse as year == "2026 and rating >= 5", which is false
        // for every note: a confident zero with nothing said about it.
        expect(parseWhere("year = 2026 and rating >= 5")).toBeNull();
    });

    it("still parses the single condition it was built for", () => {
        expect(parseWhere("year = 2026")).toEqual({ field: "year", op: "=", value: 2026 });
    });
});

describe("splitAnd", () => {
    it("splits on a whole-word `and`, any case", () => {
        expect(splitAnd("year = 2026 and rating >= 4")).toEqual(["year = 2026", "rating >= 4"]);
        expect(splitAnd("a = 1 AND b = 2 And c = 3")).toEqual(["a = 1", "b = 2", "c = 3"]);
    });

    it("leaves `and` inside quotes and inside a word alone", () => {
        expect(splitAnd('status = "waiting and ready"')).toEqual(['status = "waiting and ready"']);
        expect(splitAnd("author = Andrew and genre = sand")).toEqual(["author = Andrew", "genre = sand"]);
    });

    it("an apostrophe inside a word is not a quote and does not hide an `and`", () => {
        expect(splitAnd("name = O'Brien and mood = don't")).toEqual(["name = O'Brien", "mood = don't"]);
        expect(splitAnd("title = 'Rock and roll' and year = 2026")).toEqual(["title = 'Rock and roll'", "year = 2026"]);
        expect(splitAnd('title = "Rock \'n\' roll" and year = 2026')).toEqual(['title = "Rock \'n\' roll"', "year = 2026"]);
    });

    it("a dangling or doubled `and` leaves an empty part", () => {
        expect(splitAnd("year = 2026 and")).toEqual(["year = 2026", ""]);
        expect(splitAnd("a = 1 and and b = 2")).toEqual(["a = 1", "", "b = 2"]);
    });
});

describe("readWhere", () => {
    const clauses = (where: unknown) => {
        const reading = readWhere(where);
        return reading.kind === "ok" ? reading.clauses : reading;
    };
    const message = (where: unknown) => {
        const reading = readWhere(where);
        return reading.kind === "error" ? reading.message : `not an error: ${reading.kind}`;
    };

    it("apostrophes in unquoted values keep both conditions", () => {
        expect(clauses("name = O'Brien and mood = don't")).toEqual([
            { field: "name", op: "=", value: "O'Brien" },
            { field: "mood", op: "=", value: "don't" },
        ]);
    });

    it("a quote left open where a value starts is unreadable, not a value with a stray quote", () => {
        expect(readWhere('a = "unbalanced and b = 2').kind).toBe("error");
        expect(readWhere("a = 'open").kind).toBe("error");
    });

    it("absent, null and blank are nothing to filter and nothing to say", () => {
        expect(readWhere(undefined)).toEqual({ kind: "none" });
        expect(readWhere(null)).toEqual({ kind: "none" });
        expect(readWhere("  ")).toEqual({ kind: "none" });
    });

    it("a list of two or three conditions reads every one", () => {
        expect(clauses(["year = 2026", "rating >= 5"])).toEqual([
            { field: "year", op: "=", value: 2026 },
            { field: "rating", op: ">=", value: 5 },
        ]);
        expect(clauses(["year = 2026", "rating >= 5", "tags contains books"])).toEqual([
            { field: "year", op: "=", value: 2026 },
            { field: "rating", op: ">=", value: 5 },
            { field: "tags", op: "contains", value: "books" },
        ]);
    });

    it("`and` in a string, in any case, reads the same as a list", () => {
        expect(clauses("year = 2026 AND rating >= 5")).toEqual(clauses(["year = 2026", "rating >= 5"]));
    });

    it("a quoted value holding `and` stays one condition", () => {
        expect(clauses('status = "waiting and ready"')).toEqual([
            { field: "status", op: "=", value: "waiting and ready" },
        ]);
    });

    it("a list item holding `and` adds its conditions", () => {
        expect(clauses(["year = 2026 and rating >= 5", "health.sleep > 70"])).toEqual([
            { field: "year", op: "=", value: 2026 },
            { field: "rating", op: ">=", value: 5 },
            { field: "health.sleep", op: ">", value: 70 },
        ]);
    });

    it("`or` drops the whole filter, in a string and inside a list item", () => {
        expect(message("year = 2026 or year = 2025")).toContain("`where: year = 2026 or year = 2025` uses `or`");
        expect(message(["rating >= 4", "year = 2026 OR year = 2025"]))
            .toContain("`where: year = 2026 OR year = 2025` uses `or`");
    });

    it("`or` is named even when an unreadable condition comes first", () => {
        expect(message(["nonsense", "a = 1 or b = 2"])).toContain("uses `or`");
    });

    it("a quoted `or` is part of the value", () => {
        expect(clauses('answer = "this or that"')).toEqual([
            { field: "answer", op: "=", value: "this or that" },
        ]);
    });

    it("one bad condition among good ones drops them all and is quoted", () => {
        const reading = readWhere(["year = 2026", "rating >=", "tags contains books"]);
        expect(reading.kind).toBe("error");
        expect(message(["year = 2026", "rating >=", "tags contains books"])).toBe(
            "`rating >=` in `where` could not be read, so the whole filter was ignored. The numbers below are unfiltered. Each condition looks like `year = 2026`, `rating >= 4` or `tags contains books`.",
        );
        expect(message("year = 2026 and just words")).toContain("`just words` in `where` could not be read");
    });

    it("a single bad condition keeps the plain unreadable message", () => {
        expect(message("just words")).toContain("`where: just words` could not be read and was ignored");
        expect(message(["just words"])).toContain("`where: just words` could not be read and was ignored");
    });

    it("a dangling `and` is unreadable, quoting what was written", () => {
        expect(message("year = 2026 and")).toContain("`where: year = 2026 and` could not be read");
    });

    it("an empty list is refused", () => {
        expect(message([])).toContain("`where` is an empty list");
    });

    it("a map item, a nested list, a null or an empty string item is refused, quoting it", () => {
        expect(message(["year = 2026", { status: "done" }])).toContain('`where` lists `{"status":"done"}`, which is not a condition');
        expect(message(["year = 2026", ["a = 1"]])).toContain('`where` lists `["a = 1"]`');
        expect(message(["year = 2026", null])).toContain("`where` lists `null`");
        expect(message(["year = 2026", "  "])).toContain('`where` lists `"  "`');
    });

    it("a map in place of the whole value is unreadable, shown as written", () => {
        expect(message({ year: 2026 })).toContain('`where: {"year":2026}` could not be read');
    });

    it("a bare number is read as text, and text alone is not a condition", () => {
        expect(message(2026)).toContain("`where: 2026` could not be read");
        expect(message(["year = 2026", 5])).toContain("`5` in `where` could not be read");
    });
});

describe("readSource", () => {
    it("carries the three keys through", () => {
        const { spec, diagnostics } = readSource({
            source: "Diary", tag: "sport", where: "year = 2026",
        });
        expect(spec).toEqual({ source: "Diary", tag: "sport", where: "year = 2026" });
        expect(diagnostics).toEqual([]);
    });

    it("keys that are not strings are ignored, not stringified", () => {
        expect(readSource({ source: 42, tag: null, where: [] }).spec).toEqual({});
    });

    it("a blank where is nothing to complain about", () => {
        const { spec, diagnostics } = readSource({ where: "   " });
        expect(spec.where).toBeUndefined();
        expect(diagnostics).toEqual([]);
    });

    it("an unreadable where warns and is dropped, so the block draws unfiltered", () => {
        const { spec, diagnostics } = readSource({ where: "just words" });
        expect(spec.where).toBeUndefined();
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("unfiltered");
    });

    it("`or` gets its own message, naming what is supported instead", () => {
        const { spec, diagnostics } = readSource({ where: "year = 2026 or rating >= 4" });
        expect(spec.where).toBeUndefined();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.message).toBe(
            "`where: year = 2026 or rating >= 4` uses `or`, which is not supported. The filter was ignored and the numbers below are unfiltered. To require every condition, join them with `and` or list them, like `[year = 2026, rating >= 4]`; quote the value if the word is part of it.",
        );
    });

    it("two conditions joined by `and` carry through without a word", () => {
        const { spec, diagnostics } = readSource({ where: "year = 2026 and rating >= 4" });
        expect(spec.where).toBe("year = 2026 and rating >= 4");
        expect(diagnostics).toEqual([]);
    });

    it("a list carries through as its conditions", () => {
        const { spec, diagnostics } = readSource({ where: ["year = 2026", "rating >= 4 and tags contains sport"] });
        expect(spec.where).toEqual(["year = 2026", "rating >= 4", "tags contains sport"]);
        expect(diagnostics).toEqual([]);
    });

    it("an empty list warns and is dropped", () => {
        const { spec, diagnostics } = readSource({ where: [] });
        expect(spec.where).toBeUndefined();
        expect(diagnostics.map((d) => d.level)).toEqual(["warning"]);
        expect(diagnostics[0]?.message).toContain("`where` is an empty list");
    });

    it("the message quotes back what was written", () => {
        const { diagnostics } = readSource({ where: "nonsense here" });
        expect(diagnostics[0]?.message).toContain("nonsense here");
    });
});

describe("unmatchedSource", () => {
    it("names a folder nothing is filed under", () => {
        expect(unmatchedSource(vault, { source: "99-Nowhere" })).toBe("99-Nowhere");
    });

    it("says nothing when the folder holds notes", () => {
        expect(unmatchedSource(vault, { source: "01-Areas" })).toBeNull();
        expect(unmatchedSource(vault, { source: "01-Areas/Sport" })).toBeNull();
    });

    it("no source given is nothing to complain about", () => {
        expect(unmatchedSource(vault, {})).toBeNull();
        expect(unmatchedSource(vault, { source: "   " })).toBeNull();
    });

    it("a folder that holds only nested notes counts as matched", () => {
        expect(unmatchedSource([note({ folder: "a/b/c" })], { source: "a" })).toBeNull();
    });

    it("a prefix that is not a folder boundary is still unmatched", () => {
        expect(unmatchedSource([note({ folder: "01-AreasOld" })], { source: "01-Areas" }))
            .toBe("01-Areas");
    });

    it("slashes around the name do not change the answer", () => {
        expect(unmatchedSource(vault, { source: "/01-Areas/" })).toBeNull();
    });

    it("an empty vault leaves every folder unmatched", () => {
        expect(unmatchedSource([], { source: "Anything" })).toBe("Anything");
    });
});
