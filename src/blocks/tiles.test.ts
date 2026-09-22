import { describe, it, expect } from "vitest";
import { renderTiles } from "./tiles";
import { mockContext, host, texts, nodes, diagnostics } from "../test/vault";

const ctx = mockContext({
    notes: [
        { path: "00-Inbox/a.md" },
        { path: "00-Inbox/b.md" },
        { path: "01-Areas/Sport/run.md" },
    ],
});

describe("tiles — what a reader sees", () => {
    it("draws a tile per item, in order, with its label", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Inbox, path: 00-Inbox }\n  - { label: Sport, path: 01-Areas/Sport }", el);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Inbox", "Sport"]);
    });

    it("a badge of `count` is the real number of notes in the folder", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Inbox, path: 00-Inbox, badge: count }", el);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
    });

    it("an empty folder is counted as zero and marked, not hidden", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Nothing, path: 99-Empty, badge: count }", el);
        const badge = nodes(el, ".dashy-tile-badge")[0];
        expect(badge?.textContent).toBe("0");
        expect(badge?.className).toContain("is-empty");
    });

    it("a badge given as text is printed as given", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Inbox, path: 00-Inbox, badge: soon }", el);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["soon"]);
    });

    it("the tile links where it was told to", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Sport, path: 01-Areas/Sport/run.md }", el);
        const link = nodes(el, "a.dashy-tile-link")[0];
        expect(link?.getAttribute("data-href")).toBe("01-Areas/Sport/run.md");
        expect(link?.className).toContain("internal-link");
    });

    it("icon and sub are drawn when given and absent when not", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: A, path: x, icon: 📥, sub: note }\n  - { label: B, path: y }", el);
        expect(texts(el, ".dashy-tile-icon")).toEqual(["📥"]);
        expect(texts(el, ".dashy-tile-sub")).toEqual(["note"]);
    });

    it("accent is a class, not a colour baked into the element", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: A, path: x, accent: true }\n  - { label: B, path: y }", el);
        const tiles = nodes(el, ".dashy-tile");
        expect(tiles[0]?.className).toContain("dashy-tile-accent");
        expect(tiles[1]?.className).not.toContain("dashy-tile-accent");
        expect(tiles[0]?.style.backgroundColor).toBe("");
    });

    it("columns reach the grid as a custom property", () => {
        const el = host();
        renderTiles(ctx, "columns: 5\nitems:\n  - { label: A, path: x }", el);
        expect(nodes(el, ".dashy-tiles")[0]?.style.getPropertyValue("--dashy-tile-columns")).toBe("5");
    });
});

describe("tiles — edges", () => {
    it("an empty block says so once, and draws no grid", () => {
        const el = host();
        renderTiles(ctx, "   ", el);
        // Not twice: "the block is empty" and "the list is empty" are the same
        // problem, and two messages read as two.
        expect(diagnostics(el, "error")).toEqual(["⛔ tiles: The block is empty."]);
        expect(nodes(el, ".dashy-tiles")).toHaveLength(0);
    });

    it("a list with no items says so", () => {
        const el = host();
        renderTiles(ctx, "columns: 3\nitems: []", el);
        expect(diagnostics(el, "error")[0]).toContain("items");
    });

    it("columns are clamped to what the grid can show", () => {
        for (const [given, expected] of [["0", "1"], ["99", "8"], ["-4", "1"]] as const) {
            const el = host();
            renderTiles(ctx, `columns: ${given}\nitems:\n  - { label: A, path: x }`, el);
            expect(nodes(el, ".dashy-tiles")[0]?.style.getPropertyValue("--dashy-tile-columns")).toBe(expected);
        }
    });

    it("a tile with a path but no label falls back to the path", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { path: 00-Inbox }", el);
        expect(texts(el, ".dashy-tile-label")).toEqual(["00-Inbox"]);
    });

    it("a tile with neither label nor path is skipped rather than drawn blank", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { icon: 📥 }\n  - { label: Real, path: x }", el);
        expect(nodes(el, ".dashy-tile")).toHaveLength(1);
    });

    it("`title` is accepted as a synonym of label inside an item", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { title: Inbox, path: 00-Inbox }", el);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Inbox"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("a single tile written as a bare object draws, and warns about nothing", () => {
        const el = host();
        renderTiles(ctx, "{ label: Inbox, path: 00-Inbox, icon: 📥 }", el);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Inbox"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("the root keys are still checked when there is an items list", () => {
        const el = host();
        renderTiles(ctx, "colums: 4\nitems:\n  - { label: A, path: x }", el);
        expect(diagnostics(el, "warning")[0]).toContain("columns");
    });

    it("an unknown key warns with a suggestion but the tile is still drawn", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { lable: Inbox, path: 00-Inbox }", el);
        expect(diagnostics(el, "warning")[0]).toContain("label");
        expect(nodes(el, ".dashy-tile")).toHaveLength(1);
    });

    it("broken YAML reports the line instead of drawing nothing", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: X\n", el);
        expect(diagnostics(el, "error")[0]).toMatch(/line \d+/);
    });
});
