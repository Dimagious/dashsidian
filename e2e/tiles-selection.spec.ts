import type { Page } from "@playwright/test";
import { test, expect, READING_VIEW } from "./fixtures";

/**
 * `TilesSelection.md` is its own note, separate from `Dashboard.md` (whose
 * tile count and order every other spec in this suite depends on): a single
 * tile whose `badge: count` is narrowed by `where`, exercising B-114 end to
 * end against a real Obsidian render rather than the jsdom stubs the unit
 * tests use. `Diary` holds ten notes, seven of them `gym: true`.
 */

async function openTilesSelection(win: Page): Promise<void> {
    await win.evaluate(async () => {
        const a = (globalThis as unknown as {
            app?: {
                vault?: { getFileByPath?: (p: string) => unknown };
                workspace?: {
                    getLeaf?: (n?: boolean) => { openFile?: (f: unknown, s?: unknown) => Promise<void> };
                };
            };
        }).app;
        const file = a?.vault?.getFileByPath?.("TilesSelection.md");
        await a?.workspace?.getLeaf?.(false)?.openFile?.(file, {
            state: { mode: "preview", source: false },
        });
    });
    await win.waitForTimeout(800);
}

test.describe("a tile's badge: count narrowed by where (B-114)", () => {
    test("only the notes matching where are counted, not the whole folder", async ({ win }) => {
        await openTilesSelection(win);
        const view = win.locator(READING_VIEW);

        await expect(view.locator(".dashy-tile")).toHaveCount(1);
        await expect(view.locator(".dashy-tile-badge").first()).toHaveText("7");
        await expect(view.locator(".dashy-diagnostics")).toHaveCount(0);
    });
});
