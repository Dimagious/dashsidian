import { describe, it, expect } from "vitest";
import { readStatsLayout, inlineLayoutDiagnostics } from "./stats-layout";

describe("readStatsLayout", () => {
    it("is cards when unset, and when the block has no root map at all", () => {
        expect(readStatsLayout({ items: [] })).toEqual({ layout: "cards", diagnostics: [] });
        expect(readStatsLayout(null)).toEqual({ layout: "cards", diagnostics: [] });
    });

    it("reads both known values as written", () => {
        expect(readStatsLayout({ layout: "inline" }).layout).toBe("inline");
        expect(readStatsLayout({ layout: "cards" }).layout).toBe("cards");
    });

    it.each([
        ["row", "row"],
        ["Inline", "Inline"],
        [3, "3"],
        [{ a: 1 }, '{"a":1}'],
    ])("an unknown value %j warns, naming it, and falls back to cards", (raw, shown) => {
        const { layout, diagnostics } = readStatsLayout({ layout: raw });
        expect(layout).toBe("cards");
        expect(diagnostics).toEqual([
            { level: "warning", message: `\`layout\` expects cards or inline, got "${shown}". Drawing cards.` },
        ]);
    });
});

describe("inlineLayoutDiagnostics", () => {
    const items = [
        { label: "Notes", sub: "all of them", trend: "30d" },
        { label: "Tasks", sub: "open" },
        { trend: "7d" },
    ];

    it("says nothing for cards, whatever the cards set", () => {
        expect(inlineLayoutDiagnostics("cards", { columns: 4 }, items)).toEqual([]);
    });

    it("warns once per dropped key, naming every card that set it", () => {
        expect(inlineLayoutDiagnostics("inline", null, items)).toEqual([
            {
                level: "warning",
                message: '`trend` is not drawn with `layout: inline`: "Notes", a card with no label. Use `layout: cards` to see it.',
            },
            {
                level: "warning",
                message: '`sub` is not shown with `layout: inline`: "Notes", "Tasks". Use `layout: cards` to see it.',
            },
        ]);
    });

    it("warns about `columns`, which has no grid to size", () => {
        expect(inlineLayoutDiagnostics("inline", { columns: 3 }, [{ label: "Notes" }])).toEqual([
            { level: "warning", message: "`columns` has no effect with `layout: inline`, which draws one line." },
        ]);
    });

    it("is silent for an inline block that sets none of them", () => {
        expect(inlineLayoutDiagnostics("inline", { layout: "inline" }, [{ label: "Notes", icon: "x", unit: "km" }]))
            .toEqual([]);
    });
});
