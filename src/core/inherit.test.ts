import { describe, it, expect } from "vitest";
import { readBlockSelection, inheritSelection } from "./inherit";
import { selectNotes, type NoteRecord } from "./source";

const SHARED = ["source", "tag", "where", "period", "date_field"] as const;

function note(folder: string, name: string, frontmatter: Record<string, unknown>, tags: string[] = []): NoteRecord {
    return { path: `${folder}/${name}.md`, name, folder, tags, frontmatter };
}

describe("readBlockSelection", () => {
    it("reads the shared keys off an items: root, keeping where out of the defaults", () => {
        const block = readBlockSelection(
            { columns: 2, source: "Diary", tag: "#habit", where: "mood >= 3", period: "week", date_field: "day", items: [] },
            SHARED,
        );
        expect(block.defaults).toEqual({ source: "Diary", tag: "#habit", period: "week", date_field: "day" });
        expect(block.source).toEqual({ source: "Diary", tag: "#habit", where: "mood >= 3" });
        expect(block.diagnostics).toEqual([]);
    });

    it("a single card written without items: has no separate root", () => {
        const block = readBlockSelection({ label: "Days", source: "Diary", where: "a or b" }, SHARED);
        expect(block).toEqual({ defaults: {}, source: {}, diagnostics: [] });
    });

    it("a bare list has no root at all", () => {
        expect(readBlockSelection([{ label: "Days", source: "Diary" }], SHARED))
            .toEqual({ defaults: {}, source: {}, diagnostics: [] });
    });

    it("only keys the block shares are inherited", () => {
        const block = readBlockSelection({ source: "Diary", columns: 3, field: "steps", items: [] }, ["source"]);
        expect(block.defaults).toEqual({ source: "Diary" });
    });

    it("an unreadable root where is reported once and selects nothing by itself", () => {
        const block = readBlockSelection({ where: "mood > 3 or energy > 3", items: [] }, SHARED);
        expect(block.diagnostics).toHaveLength(1);
        expect(block.diagnostics[0]?.message).toContain("`where: mood > 3 or energy > 3` uses `or`");
        expect(block.source.where).toBeUndefined();
    });
});

describe("inheritSelection", () => {
    const block = readBlockSelection(
        { source: "Diary", tag: "habit", where: "mood >= 3", period: "week", date_field: "day", items: [] },
        SHARED,
    );

    it("a silent card takes every root key", () => {
        const { item, source, diagnostics } = inheritSelection({ label: "Days" }, block);
        expect(item).toEqual({ label: "Days", source: "Diary", tag: "habit", period: "week", date_field: "day" });
        expect(source).toEqual({ source: "Diary", tag: "habit", where: "mood >= 3" });
        expect(diagnostics).toEqual([]);
    });

    it("a card's own source, tag, period and date_field each replace the root's", () => {
        expect(inheritSelection({ source: "Gym" }, block).source.source).toBe("Gym");
        expect(inheritSelection({ source: "Gym" }, block).source.tag).toBe("habit");
        expect(inheritSelection({ tag: "run" }, block).source).toEqual({ source: "Diary", tag: "run", where: "mood >= 3" });
        expect(inheritSelection({ period: "30d" }, block).item.period).toBe("30d");
        expect(inheritSelection({ date_field: "logged" }, block).item.date_field).toBe("logged");
        expect(inheritSelection({ period: "30d" }, block).item.date_field).toBe("day");
    });

    it("root and card where both hold, as one list of conditions", () => {
        const { source } = inheritSelection({ where: "energy > 2 and sleep < 8" }, block);
        expect(source.where).toEqual(["mood >= 3", "energy > 2", "sleep < 8"]);
    });

    it("a card where alone comes back exactly as written", () => {
        const plain = readBlockSelection({ source: "Diary", items: [] }, SHARED);
        expect(inheritSelection({ where: "energy > 2" }, plain).source.where).toBe("energy > 2");
        expect(inheritSelection({ where: ["energy > 2"] }, plain).source.where).toEqual(["energy > 2"]);
        expect(inheritSelection({}, plain).source).toEqual({ source: "Diary" });
    });

    it("a quoted and in a root value stays inside its one condition", () => {
        const quoted = readBlockSelection({ where: 'status = "waiting and ready"', items: [] }, SHARED);
        const { source } = inheritSelection({ where: "mood > 3" }, quoted);
        expect(source.where).toEqual(['status = "waiting and ready"', "mood > 3"]);

        const notes = [
            note("D", "a", { status: "waiting and ready", mood: 4 }),
            note("D", "b", { status: "waiting and ready", mood: 2 }),
            note("D", "c", { status: "waiting", mood: 5 }),
        ];
        expect(selectNotes(notes, source).map((n) => n.name)).toEqual(["a"]);
    });

    it("an or at the root never leaks into the card's conditions", () => {
        // Text concatenation would read `a or b and c` as `a or (b and c)`;
        // the root's `or` is refused once and the card keeps only its own.
        const bad = readBlockSelection({ where: "mood > 3 or energy > 3", items: [] }, SHARED);
        const { source, diagnostics } = inheritSelection({ where: "sleep > 7" }, bad);
        expect(source.where).toBe("sleep > 7");
        expect(diagnostics).toEqual([]);
    });

    it("a bad card where is the card's own diagnostic, and the root's still applies", () => {
        const { source, diagnostics } = inheritSelection({ where: "steps <" }, block);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.message).toContain("`where: steps <` could not be read");
        expect(source.where).toBe("mood >= 3");
    });

    it("the combined selection filters notes by both sides", () => {
        const notes = [
            note("Diary", "a", { mood: 4, sleep: 8 }, ["habit"]),
            note("Diary", "b", { mood: 4, sleep: 6 }, ["habit"]),
            note("Diary", "c", { mood: 2, sleep: 9 }, ["habit"]),
            note("Diary", "d", { mood: 5, sleep: 9 }),
            note("Other", "e", { mood: 5, sleep: 9 }, ["habit"]),
        ];
        const { source } = inheritSelection({ where: "sleep >= 8" }, block);
        expect(selectNotes(notes, source).map((n) => n.name)).toEqual(["a"]);
    });
});
