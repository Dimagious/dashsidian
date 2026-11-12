import { test, expect, READING_VIEW } from "./fixtures";

/**
 * `TilesSelection.md` is its own note, separate from `Dashboard.md` (whose
 * tile count and order every other spec in this suite depends on): a single
 * tile whose `badge: count` is narrowed by `where`, exercising B-114 end to
 * end against a real Obsidian render rather than the jsdom stubs the unit
 * tests use. `Diary` holds ten notes, seven of them `gym: true`.
 */

test.describe("a tile's badge: count narrowed by where (B-114)", () => {
    test("only the notes matching where are counted, not the whole folder", async ({ win, obsidian }) => {
        await obsidian.openFile("TilesSelection.md", { mode: "preview" });
        const view = win.locator(READING_VIEW);

        await expect(view.locator(".dashy-tile")).toHaveCount(1);
        await expect(view.locator(".dashy-tile-badge").first()).toHaveText("7");
        await expect(view.locator(".dashy-diagnostics")).toHaveCount(0);
    });
});
