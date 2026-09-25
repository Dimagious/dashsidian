import type { Page } from "@playwright/test";
import { test, expect, READING_VIEW } from "./fixtures";

/**
 * `gym` is a Properties checkbox on the Diary notes, not a number: 2026-01-02
 * through 06 and 2026-01-08 and 2026-01-10 are ticked (7 of 10), 2026-01-01,
 * 07 and 09 are not. Habits.md is a note of its own so these assertions stay
 * clear of Dashboard.md's own nth()-indexed stat cards.
 */

async function openHabits(win: Page): Promise<void> {
    await win.evaluate(async () => {
        const a = (globalThis as unknown as {
            app?: {
                vault?: { getFileByPath?: (p: string) => unknown };
                workspace?: {
                    getLeaf?: (n?: boolean) => { openFile?: (f: unknown, s?: unknown) => Promise<void> };
                };
            };
        }).app;
        const file = a?.vault?.getFileByPath?.("Habits.md");
        await a?.workspace?.getLeaf?.(false)?.openFile?.(file, {
            state: { mode: "preview", source: false },
        });
    });
    await win.waitForTimeout(800);
}

/** More screen for the note pane, so a 560px viewport is actually 560px of note. */
async function collapseSidebars(win: Page): Promise<void> {
    await win.evaluate(() => {
        const a = (globalThis as unknown as {
            app?: {
                workspace?: {
                    leftSplit?: { collapse?: () => void };
                    rightSplit?: { collapse?: () => void };
                };
            };
        }).app;
        a?.workspace?.leftSplit?.collapse?.();
        a?.workspace?.rightSplit?.collapse?.();
    });
}

test.describe("checkbox properties feed the aggregates", () => {
    test("sum, streak and heatmap render from ticked days on load", async ({ win }) => {
        await openHabits(win);
        const view = win.locator(READING_VIEW);

        const values = view.locator(".dashy-stat-value");
        await expect(values.nth(0)).toHaveText("7"); // gym days: 2,3,4,5,6,8,10
        await expect(values.nth(1)).toHaveText("5"); // longest run: 2026-01-02..06
        await expect(values.nth(2)).toHaveText("0.7"); // share of ticked days: 7 of 10

        const painted = await view.locator(".dashy-hm-cell").evaluateAll(
            (cells) => cells.filter((c) => (c as HTMLElement).style.backgroundColor !== "").length,
        );
        expect(painted).toBe(7);

        // A false day is present data, not missing data: it reads as "no data"
        // on the cell, same as a day nothing ever set.
        await expect(view.locator('[title="2026-01-01: no data"]')).toHaveCount(1);
        await expect(view.locator('[title="2026-01-04: gym 1"]')).toHaveCount(1);
        await expect(view.locator(".dashy-hm-title")).toHaveText(/7 of \d+ days/);
    });

    test("toggling a checkbox redraws the stat and the heatmap cell", async ({ win }) => {
        await openHabits(win);
        const view = win.locator(READING_VIEW);
        const values = view.locator(".dashy-stat-value");
        await expect(values.nth(0)).toHaveText("7");
        await expect(view.locator('[title="2026-01-04: gym 1"]')).toHaveCount(1);

        // The Properties pane writes through fileManager.processFrontMatter,
        // not a raw modify of the file's text.
        await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: {
                    vault?: { getFileByPath?: (p: string) => unknown };
                    fileManager?: {
                        processFrontMatter?: (
                            f: unknown,
                            fn: (fm: Record<string, unknown>) => void,
                        ) => Promise<void>;
                    };
                };
            }).app;
            const file = a?.vault?.getFileByPath?.("Diary/2026-01-04.md");
            if (file) {
                await a?.fileManager?.processFrontMatter?.(file, (fm) => {
                    fm.gym = false;
                });
            }
        });

        // 2,3,4,5,6,8,10 loses 4: sum drops to 6, and the run 2..6 splits into
        // 2..3 and 5..6, so the longest streak drops from 5 to 2.
        await expect(values.nth(0)).toHaveText("6");
        await expect(values.nth(1)).toHaveText("2");
        await expect(values.nth(2)).toHaveText("0.6");

        const painted = await view.locator(".dashy-hm-cell").evaluateAll(
            (cells) => cells.filter((c) => (c as HTMLElement).style.backgroundColor !== "").length,
        );
        expect(painted).toBe(6);

        await expect(view.locator('[title="2026-01-04: gym 1"]')).toHaveCount(0);
        await expect(view.locator('[title="2026-01-04: no data"]')).toHaveCount(1);
        await expect(view.locator(".dashy-hm-title")).toHaveText(/6 of \d+ days/);
    });

    test("unticking the box in the Properties pane redraws the dashboard", async ({ win }) => {
        // The same flip as above, but by a click on the checkbox a person
        // would click: Habits in one pane, the day note in a split beside it.
        await openHabits(win);
        await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: {
                    vault?: { getFileByPath?: (p: string) => unknown };
                    workspace?: {
                        getLeaf?: (split: string) => { openFile?: (f: unknown, s?: unknown) => Promise<void> };
                    };
                };
            }).app;
            const file = a?.vault?.getFileByPath?.("Diary/2026-01-04.md");
            await a?.workspace?.getLeaf?.("split")?.openFile?.(file, {
                state: { mode: "source", source: false },
            });
        });

        const box = win.locator('.metadata-property[data-property-key="gym"] input[type="checkbox"]');
        await expect(box).toBeChecked();

        const view = win.locator(READING_VIEW).filter({ has: win.locator(".dashy-stat") });
        const values = view.locator(".dashy-stat-value");
        await expect(values.nth(0)).toHaveText("7");

        await box.click();
        await expect(box).not.toBeChecked();

        await expect(values.nth(0)).toHaveText("6");
        await expect(values.nth(1)).toHaveText("2");
        await expect(view.locator('[title="2026-01-04: no data"]')).toHaveCount(1);
    });

    // The grid spans January through today (the e2e vault's clock sits well
    // into the year), which does not fit a 560px pane; B-070 (9f3db44)
    // opens it scrolled to that end rather than at January. That scroll is
    // deferred (the block is built off-document, so its width reads 0 at
    // draw time) to the first ResizeObserver callback after attach, so this
    // waits for it rather than asserting immediately after open.
    test("a heatmap too wide for its pane opens scrolled toward the end, not stuck at the start", async ({ win }) => {
        await collapseSidebars(win);
        await win.setViewportSize({ width: 560, height: 800 });
        await openHabits(win);
        const view = win.locator(READING_VIEW);
        const scroller = view.locator(".dashy-hm-scroll");
        await expect(scroller.locator(".dashy-hm-cell").first()).toBeVisible();

        await expect
            .poll(() => scroller.evaluate((el) => (el as HTMLElement).scrollLeft), { timeout: 5_000 })
            .toBeGreaterThan(0);
        await expect(scroller).toHaveClass(/can-scroll-left/);
    });

    // Every vault event redraws the block from scratch (B-089): a grid the
    // reader had scrolled by hand used to jump straight back to the end the
    // moment anything else in the vault changed. `app.vault.create` here is
    // the "anything else" — a plain file create, same event family as a
    // sync pulling in a new note.
    test("a heatmap the reader scrolled by hand keeps its position across a redraw", async ({ win }) => {
        await collapseSidebars(win);
        await win.setViewportSize({ width: 560, height: 800 });
        await openHabits(win);
        const view = win.locator(READING_VIEW);
        const scroller = view.locator(".dashy-hm-scroll");
        await expect(scroller.locator(".dashy-hm-cell").first()).toBeVisible();

        // Let the initial pin-to-end settle first, or setting `scrollLeft`
        // below races the block's own deferred initial scroll.
        await expect
            .poll(() => scroller.evaluate((el) => (el as HTMLElement).scrollLeft), { timeout: 5_000 })
            .toBeGreaterThan(0);

        // The reader drags the grid to the middle of its actual scrollable
        // range (`scrollWidth - clientWidth`), not `scrollWidth / 2`:
        // measured here `scrollWidth` is 621 and `clientWidth` 422, so half
        // of `scrollWidth` (311) is past the 199px maximum and clamps
        // straight back to the end, which would let this test pass on the
        // pre-B-089 code too, always pinned.
        const target = await scroller.evaluate((el) => {
            const scrollEl = el as HTMLElement;
            scrollEl.dispatchEvent(new Event("pointerdown"));
            const mid = Math.round((scrollEl.scrollWidth - scrollEl.clientWidth) / 2);
            scrollEl.scrollLeft = mid;
            return scrollEl.scrollLeft;
        });
        expect(target).toBeGreaterThan(0);
        // Genuinely mid-grid before the redraw: there is still more to the
        // right, unlike the pinned-to-the-end starting position.
        await expect(scroller).toHaveClass(/can-scroll-right/);

        // A vault change redraws the block. The heatmap's own painted-cell
        // count is the proof the *heatmap* redrew, not only the stats block
        // above it: the new note is a `gym: true` day the grid did not have
        // data for yet.
        const painted = () => scroller.locator(".dashy-hm-cell").evaluateAll(
            (cells) => cells.filter((c) => (c as HTMLElement).style.backgroundColor !== "").length,
        );
        const before = await painted();
        await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { vault?: { create?: (path: string, content: string) => Promise<unknown> } };
            }).app;
            await a?.vault?.create?.("Diary/2026-01-11.md", "---\ngym: true\n---\n");
        });
        await expect.poll(painted, { timeout: 5_000 }).toBe(before + 1);

        // The redrawn scroller lands within a couple of pixels of where the
        // reader left it, not back at the end.
        await expect
            .poll(() => scroller.evaluate((el) => (el as HTMLElement).scrollLeft), { timeout: 5_000 })
            .toBeGreaterThan(target - 3);
        await expect
            .poll(() => scroller.evaluate((el) => (el as HTMLElement).scrollLeft), { timeout: 5_000 })
            .toBeLessThan(target + 3);
        await expect(scroller).toHaveClass(/can-scroll-right/);
    });

    test("a heatmap the reader left at the end stays at the end across a redraw", async ({ win }) => {
        await collapseSidebars(win);
        await win.setViewportSize({ width: 560, height: 800 });
        await openHabits(win);
        const view = win.locator(READING_VIEW);
        const scroller = view.locator(".dashy-hm-scroll");
        await expect(scroller.locator(".dashy-hm-cell").first()).toBeVisible();

        await expect
            .poll(() => scroller.evaluate((el) => (el as HTMLElement).scrollLeft), { timeout: 5_000 })
            .toBeGreaterThan(0);
        await expect(scroller).toHaveClass(/can-scroll-left/);
        await expect(scroller).not.toHaveClass(/can-scroll-right/);

        // Same proof as above: the heatmap itself redrew, not only the
        // stats block sharing the note.
        const painted = () => scroller.locator(".dashy-hm-cell").evaluateAll(
            (cells) => cells.filter((c) => (c as HTMLElement).style.backgroundColor !== "").length,
        );
        const before = await painted();
        await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { vault?: { create?: (path: string, content: string) => Promise<unknown> } };
            }).app;
            await a?.vault?.create?.("Diary/2026-01-12.md", "---\ngym: true\n---\n");
        });
        await expect.poll(painted, { timeout: 5_000 }).toBe(before + 1);

        // Still pinned to the (new) end: nothing more to scroll to on the right.
        await expect(scroller).not.toHaveClass(/can-scroll-right/);
    });
});
