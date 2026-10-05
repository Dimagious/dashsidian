import type { Page } from "@playwright/test";
import { test, expect, READING_VIEW } from "./fixtures";

/**
 * `TilesCover.md` holds two covered tiles, one of them an accent tile. The
 * cover bleeds past the tile's padding to its edges, which Obsidian's own
 * `max-width: 100%` on images used to cut short by 24px, leaving a strip of
 * tile background on the right (B-152). jsdom computes no layout, so this
 * can only be checked against a real render, in both views.
 */

const LIVE_PREVIEW = ".markdown-source-view.is-live-preview";

async function openTilesCover(win: Page, mode: "preview" | "source"): Promise<void> {
    await win.evaluate(async (viewMode) => {
        const a = (globalThis as unknown as {
            app?: {
                vault?: { getFileByPath?: (p: string) => unknown };
                workspace?: {
                    getLeaf?: (n?: boolean) => { openFile?: (f: unknown, s?: unknown) => Promise<void> };
                };
            };
        }).app;
        const file = a?.vault?.getFileByPath?.("TilesCover.md");
        await a?.workspace?.getLeaf?.(false)?.openFile?.(file, {
            state: { mode: viewMode, source: false },
        });
    }, mode);
    await win.waitForTimeout(800);
}

interface CoverBox {
    loaded: boolean;
    coverLeft: number;
    coverWidth: number;
    /** The tile's padding box: where its background is painted inside the border. */
    innerLeft: number;
    innerWidth: number;
}

async function coverBoxes(win: Page, scope: string): Promise<CoverBox[]> {
    return win.evaluate((sel) => {
        return Array.from(document.querySelectorAll(`${sel} .dashy-tile`)).map((tile) => {
            const cover = tile.querySelector("img.dashy-tile-cover");
            const t = tile.getBoundingClientRect();
            const c = cover?.getBoundingClientRect();
            return {
                loaded: cover instanceof HTMLImageElement && cover.naturalWidth > 0,
                coverLeft: c?.left ?? -1,
                coverWidth: c?.width ?? -1,
                innerLeft: t.left + tile.clientLeft,
                innerWidth: tile.clientWidth,
            };
        });
    }, scope);
}

async function expectCoversFill(win: Page, scope: string): Promise<void> {
    const view = win.locator(scope);
    await expect(view.locator(".dashy-tile-cover")).toHaveCount(2);
    await expect(view.locator(".dashy-diagnostics")).toHaveCount(0);
    // Wait for the app:// images to decode; naturalWidth is 0 until then.
    for (const img of await view.locator("img.dashy-tile-cover").all()) {
        await expect(img).toHaveJSProperty("complete", true);
    }

    const boxes = await coverBoxes(win, scope);
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
        expect(box.loaded).toBe(true);
        expect(box.innerWidth).toBeGreaterThan(24);
        // clientWidth is rounded to whole pixels, the rect is not.
        expect(Math.abs(box.coverWidth - box.innerWidth)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.coverLeft - box.innerLeft)).toBeLessThanOrEqual(1);
    }
}

test.describe("a tile cover reaches both edges of the tile (B-152)", () => {
    test("in reading view", async ({ win }) => {
        await openTilesCover(win, "preview");
        await expectCoversFill(win, READING_VIEW);
    });

    test("in live preview", async ({ win }) => {
        await openTilesCover(win, "source");
        await expectCoversFill(win, LIVE_PREVIEW);
    });
});
