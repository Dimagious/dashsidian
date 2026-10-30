import { describe, it, expect } from "vitest";
import { countFindings, dashyBlocks, findFencedBlocks, formatBlockCheck, type CheckedBlock, type FenceTable } from "./block-check";

describe("findFencedBlocks (B-168)", () => {
    it("finds each fenced block with its language, the line of its fence and the lines between", () => {
        const text = ["# Title", "", "```stats", "items:", "  - { agg: count }", "```", "text", "~~~heatmap", "field: x", "~~~"].join("\n");
        expect(findFencedBlocks(text)).toEqual([
            { line: 3, lang: "stats", source: "items:\n  - { agg: count }" },
            { line: 8, lang: "heatmap", source: "field: x" },
        ]);
    });

    it("a fence inside a longer fence is content, not a block", () => {
        const text = ["````md", "```stats", "items: []", "```", "````"].join("\n");
        expect(findFencedBlocks(text)).toEqual([{ line: 1, lang: "md", source: "```stats\nitems: []\n```" }]);
    });

    it("a tilde fence does not close a backtick block, and a shorter fence does not close a longer one", () => {
        const text = ["````stats", "~~~", "```", "````"].join("\n");
        expect(findFencedBlocks(text)).toEqual([{ line: 1, lang: "stats", source: "~~~\n```" }]);
    });

    it("a block never closed runs to the end of the note, as Obsidian draws it", () => {
        expect(findFencedBlocks("intro\n```today\nformat: x")).toEqual([{ line: 2, lang: "today", source: "format: x" }]);
    });

    it("only the first word of the info string is the language", () => {
        expect(findFencedBlocks("```stats  extra words\nx: 1\n```")[0]?.lang).toBe("stats");
    });

    it("a block inside a callout is found, its lines without the quote markers", () => {
        const text = ["> [!note] Dashboard", "> ```stats", "> items:", ">   - { agg: count }", "> ```", "after"].join("\n");
        expect(findFencedBlocks(text)).toEqual([{ line: 2, lang: "stats", source: "items:\n  - { agg: count }" }]);
    });

    it("a callout that ends ends the block inside it", () => {
        const text = ["> ```stats", "> items: []", "plain line", "```tiles", "```"].join("\n");
        expect(findFencedBlocks(text)).toEqual([
            { line: 1, lang: "stats", source: "items: []" },
            { line: 4, lang: "tiles", source: "" },
        ]);
    });

    it("an indented fence takes that indent off its lines, no more", () => {
        expect(findFencedBlocks("  ```stats\n    items: []\n  ```")).toEqual([{ line: 1, lang: "stats", source: "  items: []" }]);
    });

    it("a block in a list item is found, its lines without the item's indent (B-168)", () => {
        const text = ["- Dashboard", "  ```stats", "  items:", "    - { agg: count }", "  ```", "1. ```tiles", "   items: []", "   ```", "* text"].join("\n");
        expect(findFencedBlocks(text)).toEqual([
            { line: 2, lang: "stats", source: "items:\n  - { agg: count }" },
            { line: 6, lang: "tiles", source: "items: []" },
        ]);
        expect(findFencedBlocks("- ```heatmap\n  field: x\n  ```")).toEqual([{ line: 1, lang: "heatmap", source: "field: x" }]);
    });

    it("a backtick line holding a backtick in its info string is inline code, not a fence", () => {
        expect(findFencedBlocks("```stats` is a block\ntext")).toEqual([]);
    });

    it("a note without fences has no blocks; Windows line ends read the same", () => {
        expect(findFencedBlocks("just text\n")).toEqual([]);
        expect(findFencedBlocks("```stats\r\nx: 1\r\n```\r\n")).toEqual([{ line: 1, lang: "stats", source: "x: 1" }]);
    });
});

const TABLE: FenceTable = {
    drawn: new Set(["stats", "dashy-chart", "heatmap"]),
    elsewhere: new Map<string, string | null>([["chart", "obsidian-charts"], ["today", null]]),
};

describe("dashyBlocks (B-168)", () => {
    it("keeps Dashy's fences, the ones another plugin draws here, and `dashy-` names Dashy lacks; drops the rest", () => {
        const blocks = findFencedBlocks(["```js", "1", "```", "```stats", "```", "```chart", "```", "```today", "```", "```dashy-stat", "```", "```Dashy-Foo", "```", "```dataview", "```"].join("\n"));
        expect(dashyBlocks(blocks, TABLE).map((b) => [b.block.lang, b.status, b.owner])).toEqual([
            ["stats", "checked", undefined],
            ["chart", "elsewhere", "obsidian-charts"],
            ["today", "elsewhere", undefined],
            ["dashy-stat", "unknown", undefined],
            ["Dashy-Foo", "unknown", undefined],
        ]);
    });
});

const HEADER = { notePath: "Home.md", pluginVersion: "2.1.0", schemaVersion: "1.10.0", language: "en", today: "2026-10-30", drawn: ["stats", "dashy-chart"] };

describe("formatBlockCheck (B-168)", () => {
    it("a header, a section per block with each finding at its note line, and a summary", () => {
        const blocks: CheckedBlock[] = [
            { line: 3, lang: "stats", status: "checked", findings: [] },
            {
                line: 10,
                lang: "heatmap",
                status: "checked",
                findings: [
                    { level: "error", message: "Unknown key \"feild\".", line: 2 },
                    { level: "warning", message: "Two\nlines" },
                    { level: "notice", message: "This is a template." },
                ],
            },
        ];
        const text = formatBlockCheck({ ...HEADER, blocks });
        expect(text).toContain("- Note: Home.md\n- Checked: 2026-10-30\n- Plugin version: 2.1.0\n- Schema version: 1.10.0\n- Diagnostics language: en");
        expect(text).toContain("## Block 1: `stats` at line 3\n\nok\n");
        expect(text).toContain("## Block 2: `heatmap` at line 10\n\n- error, line 12 (block line 2): Unknown key \"feild\".\n- warning: Two lines\n- notice: This is a template.\n");
        expect(text.trimEnd().split("\n").at(-1)).toBe("Summary: 2 blocks, 1 error, 1 warning.");
    });

    it("an unknown `dashy-` fence is an error naming the blocks there are; one drawn elsewhere is a notice", () => {
        const blocks: CheckedBlock[] = [
            { line: 1, lang: "dashy-stat", status: "unknown", findings: [] },
            { line: 5, lang: "chart", status: "elsewhere", owner: "obsidian-charts", findings: [] },
            { line: 9, lang: "today", status: "elsewhere", findings: [] },
        ];
        const text = formatBlockCheck({ ...HEADER, blocks });
        expect(text).toContain("- error: `dashy-stat` is not a Dashy block, so the note shows it as plain code. Dashy blocks in this vault: `stats`, `dashy-chart`.");
        expect(text).toContain("- notice: `chart` is drawn by another plugin (obsidian-charts) in this vault, not by Dashy, so it was not checked.");
        expect(text).toContain("- notice: `today` is drawn by another plugin in this vault");
        expect(text).toContain("Summary: 3 blocks, 1 error, 0 warnings.");
    });

    it("a note without blocks says so", () => {
        const text = formatBlockCheck({ ...HEADER, blocks: [] });
        expect(text).toContain("No Dashy blocks in this note.");
        expect(text).toContain("Summary: 0 blocks, 0 errors, 0 warnings.");
        expect(text).not.toContain("## Block");
    });
});

describe("countFindings (B-168)", () => {
    it("counts errors and warnings, an unknown fence as an error, notices not at all", () => {
        expect(countFindings([
            { line: 1, lang: "stats", status: "checked", findings: [{ level: "error", message: "a" }, { level: "warning", message: "b" }, { level: "warning", message: "c" }, { level: "notice", message: "d" }] },
            { line: 2, lang: "dashy-x", status: "unknown", findings: [] },
        ])).toEqual({ blocks: 2, errors: 2, warnings: 2 });
    });
});
