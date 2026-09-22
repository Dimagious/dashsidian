import { describe, it, expect } from "vitest";
import { parseWhere, selectNotes, readSource, looksLikeConjunction, type NoteRecord } from "./source";

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

    it("two conditions get their own message, naming the limit", () => {
        const { diagnostics } = readSource({ where: "year = 2026 and rating >= 4" });
        expect(diagnostics[0]?.message).toContain("only one is supported");
    });

    it("the message quotes back what was written", () => {
        const { diagnostics } = readSource({ where: "nonsense here" });
        expect(diagnostics[0]?.message).toContain("nonsense here");
    });
});
