import { describe, it, expect } from "vitest";
import {
    readBlockSelection, inheritSelection, blankSelectionDiagnostics, undatedRootDiagnostics, unmatchedRootDateFormat,
} from "./inherit";
import { selectNotes, type NoteRecord } from "./source";
import { dateFormats } from "./note-date";
import { parseDateWithFormat } from "../adapters/datetime";

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

describe("readBlockSelection: root problems reported once for the block (B-153, B-154)", () => {
    it("an unreadable root period is one block-level warning naming the value", () => {
        const block = readBlockSelection({ period: "fortnight", items: [] }, SHARED);
        expect(block.diagnostics.map((d) => d.message)).toEqual([
            '`period` at the block root expects week, month, year or a rolling window such as 30d, got "fortnight". Everything that inherits it is drawn unfiltered.',
        ]);
        // Kept in the defaults: cards still inherit it and read it as no window.
        expect(block.defaults.period).toBe("fortnight");
    });

    it("a readable root period, or none at all, warns about nothing", () => {
        expect(readBlockSelection({ period: "30d", items: [] }, SHARED).diagnostics).toEqual([]);
        expect(readBlockSelection({ period: "week", items: [] }, SHARED).diagnostics).toEqual([]);
        expect(readBlockSelection({ source: "Diary", items: [] }, SHARED).diagnostics).toEqual([]);
    });

    it("a root period is not judged when the block does not share it", () => {
        expect(readBlockSelection({ period: "fortnight", items: [] }, ["source"]).diagnostics).toEqual([]);
    });

    it("a blank root source or tag, null or empty text, warns once each", () => {
        const nulls = readBlockSelection({ source: null, tag: null, items: [] }, SHARED);
        expect(nulls.diagnostics.map((d) => d.message)).toEqual([
            "`source` at the block root is empty, so the whole vault is read. Name a folder, or remove the key if the whole vault is meant.",
            "`tag` at the block root is empty, so no tag filter applies. Name a tag, or remove the key if no tag filter is meant.",
        ]);
        const empties = readBlockSelection({ source: "", tag: "", items: [] }, SHARED);
        expect(empties.diagnostics.map((d) => d.message)).toEqual(nulls.diagnostics.map((d) => d.message));
    });

    it("a whitespace root source or tag warns the same as an empty one (B-156)", () => {
        const spaced = readBlockSelection({ source: "  ", tag: " ", items: [] }, SHARED);
        expect(spaced.diagnostics.map((d) => d.message)).toEqual([
            "`source` at the block root is empty, so the whole vault is read. Name a folder, or remove the key if the whole vault is meant.",
            "`tag` at the block root is empty, so no tag filter applies. Name a tag, or remove the key if no tag filter is meant.",
        ]);
        expect(spaced.source).toEqual({});
    });

    it("a single card without items: has no root, so nothing is reported for one", () => {
        expect(readBlockSelection({ source: null, period: "fortnight" }, SHARED).diagnostics).toEqual([]);
    });
});

describe("inheritSelection: which keys came from the root", () => {
    const block = readBlockSelection({ source: "Diary", period: "week", date_field: "day", items: [] }, SHARED);

    it("a silent card inherits every root key", () => {
        expect([...inheritSelection({ label: "A" }, block).inherited].sort()).toEqual(["date_field", "period", "source"]);
    });

    it("a key the card writes, even blank, is its own", () => {
        const { inherited } = inheritSelection({ period: "fortnight", source: null }, block);
        expect([...inherited]).toEqual(["date_field"]);
    });

    it("nothing is inherited without a root", () => {
        const none = readBlockSelection([{ label: "A" }], SHARED);
        expect(inheritSelection({ label: "A" }, none).inherited.size).toBe(0);
    });
});

describe("blankSelectionDiagnostics (B-154)", () => {
    const root = readBlockSelection({ source: "Diary", tag: "habit", items: [] }, SHARED);
    const bare = readBlockSelection({ items: [] }, SHARED);

    it("a blank source or tag over a root value says what is lost and how to inherit it", () => {
        expect(blankSelectionDiagnostics({ source: null, tag: "" }, root, '"Gym"').map((d) => d.message)).toEqual([
            '"Gym": `source` is empty, so it reads the whole vault instead of the folder at the block root. Remove the key to inherit that folder.',
            '"Gym": `tag` is empty, so it has no tag filter instead of the tag at the block root. Remove the key to inherit that tag.',
        ]);
    });

    it("with nothing at the root to inherit, the warning only says what the blank means", () => {
        expect(blankSelectionDiagnostics({ source: "", tag: null }, bare, '"Gym"').map((d) => d.message)).toEqual([
            '"Gym": `source` is empty, so it reads the whole vault. Name a folder, or remove the key if the whole vault is meant.',
            '"Gym": `tag` is empty, so no tag filter applies. Name a tag, or remove the key if no tag filter is meant.',
        ]);
    });

    it("a blank root value is nothing to inherit either", () => {
        const blankRoot = readBlockSelection({ source: null, items: [] }, SHARED);
        expect(blankSelectionDiagnostics({ source: "" }, blankRoot, '"Gym"').map((d) => d.message)).toEqual([
            '"Gym": `source` is empty, so it reads the whole vault. Name a folder, or remove the key if the whole vault is meant.',
        ]);
    });

    it("a written value or a missing key is not blank", () => {
        expect(blankSelectionDiagnostics({ source: "Gym", tag: "run" }, root, '"Gym"')).toEqual([]);
        expect(blankSelectionDiagnostics({}, root, '"Gym"')).toEqual([]);
        // Padding around a real name is not blank: it reads as the name (B-156).
        expect(blankSelectionDiagnostics({ source: " Gym ", tag: " run " }, root, '"Gym"')).toEqual([]);
    });

    it("whitespace alone is blank, the same as empty text (B-156)", () => {
        expect(blankSelectionDiagnostics({ source: " ", tag: "\t " }, root, '"Gym"').map((d) => d.message))
            .toEqual(blankSelectionDiagnostics({ source: "", tag: "" }, root, '"Gym"').map((d) => d.message));
        expect(blankSelectionDiagnostics({ source: "   " }, bare, '"Gym"').map((d) => d.message)).toEqual([
            '"Gym": `source` is empty, so it reads the whole vault. Name a folder, or remove the key if the whole vault is meant.',
        ]);
    });

    it("a whitespace root value is nothing to inherit (B-156)", () => {
        const spacedRoot = readBlockSelection({ tag: "  ", items: [] }, SHARED);
        expect(blankSelectionDiagnostics({ tag: "" }, spacedRoot, '"Gym"').map((d) => d.message)).toEqual([
            '"Gym": `tag` is empty, so no tag filter applies. Name a tag, or remove the key if no tag filter is meant.',
        ]);
    });
});

describe("a source or tag that is not text, at the root and on a card (B-160)", () => {
    const SOURCE_2024 = '`source` must be a folder name in text, got `2024`, so it was ignored and the whole vault is read. Put the folder name in quotes, as written: `source: "2024"`.';
    const TAG_LIST = "`tag` must be one tag name in text, got `[\"a\",\"b\"]`, so it was ignored and the tag filter is dropped. Name one tag, like `tag: book`.";

    it("at the root it is one error each, and it is not handed down", () => {
        const block = readBlockSelection({ source: 2024, tag: ["a", "b"], period: "week", items: [] }, SHARED);
        expect(block.diagnostics).toEqual([
            { level: "error", message: SOURCE_2024 },
            { level: "error", message: TAG_LIST },
        ]);
        expect(block.defaults).toEqual({ period: "week" });
        expect(block.source).toEqual({});
    });

    it("a card under such a root repeats nothing and reads as if the root had no source", () => {
        const block = readBlockSelection({ source: 2024, items: [] }, SHARED);
        const { source, diagnostics, inherited } = inheritSelection({ label: "A" }, block);
        expect(diagnostics).toEqual([]);
        expect(source).toEqual({});
        expect(inherited.has("source")).toBe(false);
    });

    it("a card's own number is the card's error, and its source is not the root's", () => {
        const block = readBlockSelection({ source: "Diary", items: [] }, SHARED);
        const { source, diagnostics } = inheritSelection({ source: 2024 }, block);
        expect(diagnostics).toEqual([{ level: "error", message: SOURCE_2024 }]);
        expect(source.source).toBeUndefined();
    });

    it("an empty root source stays the blank warning, not this error", () => {
        const block = readBlockSelection({ source: null, items: [] }, SHARED);
        expect(block.diagnostics.map((d) => d.level)).toEqual(["warning"]);
        expect(block.diagnostics[0]?.message).toContain("`source` at the block root is empty");
    });

    it("a blank card under a root whose source is a number is told nothing is inherited", () => {
        const block = readBlockSelection({ source: 2024, items: [] }, SHARED);
        expect(blankSelectionDiagnostics({ source: null }, block, '"Gym"').map((d) => d.message)).toEqual([
            '"Gym": `source` is empty, so it reads the whole vault. Name a folder, or remove the key if the whole vault is meant.',
        ]);
    });
});

describe("undatedRootDiagnostics (B-153)", () => {
    const block = readBlockSelection({ date_field: "day", items: [] }, SHARED);

    it("names every card that found no date, in one warning", () => {
        expect(undatedRootDiagnostics(block, ['"A"', '"B"']).map((d) => d.message)).toEqual([
            '`date_field` at the block root: none of the notes selected for "A", "B" has a date in "day".',
        ]);
    });

    it("no card falling short, or no root date_field, is no warning", () => {
        expect(undatedRootDiagnostics(block, [])).toEqual([]);
        expect(undatedRootDiagnostics(readBlockSelection({ items: [] }, SHARED), ['"A"'])).toEqual([]);
    });
});

describe("unmatchedRootDateFormat (B-120)", () => {
    const formats = dateFormats("DD.MM.YYYY", undefined, parseDateWithFormat);

    it("one card's fitting notes clear the warning for every card reading names", () => {
        const fits = [note("Diary", "05.10.2026", {})];
        const misses = [note("Other", "x", {})];
        expect(unmatchedRootDateFormat([{ notes: misses }, { notes: fits }], formats)).toEqual([]);
    });

    it("cards reading a date_field are judged apart from cards reading names", () => {
        const names = [note("Diary", "05.10.2026", {})];
        const values = [note("Log", "a", { day: "2026/10/05" })];
        const out = unmatchedRootDateFormat([{ notes: names }, { notes: values, dateField: "day" }], formats);
        expect(out.map((d) => d.message)).toEqual([
            "`date_format: DD.MM.YYYY` fits none of the selected notes: \"2026/10/05\", for one, is not written that way.",
        ]);
    });

    it("a card whose date_field ISO already reads does not trip the root's format", () => {
        const iso = [note("Log", "a", { day: "2026-10-05" })];
        expect(unmatchedRootDateFormat([{ notes: iso, dateField: "day" }], formats)).toEqual([]);
    });

    it("a note two cards share is judged once, and nothing selected is silent", () => {
        const shared = note("Diary", "x", {});
        expect(unmatchedRootDateFormat([{ notes: [shared] }, { notes: [shared] }], formats)).toHaveLength(1);
        expect(unmatchedRootDateFormat([], formats)).toEqual([]);
        expect(unmatchedRootDateFormat([{ notes: [shared] }], undefined)).toEqual([]);
    });
});
