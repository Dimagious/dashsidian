import type { App } from "obsidian";
import { test, expect, READING_VIEW, paintedCells, expectPainted } from "./fixtures";

/**
 * `gym` is a Properties checkbox on the Diary notes, not a number: 2026-01-02
 * through 06 and 2026-01-08 and 2026-01-10 are ticked (7 of 10), 2026-01-01,
 * 07 and 09 are not. Habits.md is a note of its own so these assertions stay
 * clear of Dashboard.md's own nth()-indexed stat cards.
 */

test.describe("checkbox properties feed the aggregates", () => {
    test("sum, streak and heatmap render from ticked days on load", async ({ win, obsidian }) => {
        await obsidian.openFile("Habits.md", { mode: "preview" });
        const view = win.locator(READING_VIEW);

        const values = view.locator(".dashy-stat-value");
        await expect(values.nth(0)).toHaveText("7"); // gym days: 2,3,4,5,6,8,10
        await expect(values.nth(1)).toHaveText("5"); // longest run: 2026-01-02..06
        await expect(values.nth(2)).toHaveText("0.7"); // share of ticked days: 7 of 10

        await expectPainted(view, 7);

        // A false day is present data, not missing data: it reads as "no data"
        // on the cell, same as a day nothing ever set. The tooltip's date is
        // the locale's own medium format (B-092), and a painted cell names
        // the one note behind its value.
        await expect(view.locator('[title="Jan 1, 2026: no data"]')).toHaveCount(1);
        await expect(view.locator('[title="Jan 4, 2026: gym 1 (2026-01-04)"]')).toHaveCount(1);
        await expect(view.locator(".dashy-hm-title")).toHaveText(/7 of \d+ days/);
    });

    test("toggling a checkbox redraws the stat and the heatmap cell", async ({ win, obsidian }) => {
        await obsidian.openFile("Habits.md", { mode: "preview" });
        const view = win.locator(READING_VIEW);
        const values = view.locator(".dashy-stat-value");
        await expect(values.nth(0)).toHaveText("7");
        await expect(view.locator('[title="Jan 4, 2026: gym 1 (2026-01-04)"]')).toHaveCount(1);

        // The Properties pane writes through fileManager.processFrontMatter,
        // not a raw modify of the file's text.
        await obsidian.evaluate(async (app: App) => {
            const file = app.vault.getFileByPath("Diary/2026-01-04.md");
            if (!file) throw new Error("no note at Diary/2026-01-04.md");
            await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                fm.gym = false;
            });
        });

        // 2,3,4,5,6,8,10 loses 4: sum drops to 6, and the run 2..6 splits into
        // 2..3 and 5..6, so the longest streak drops from 5 to 2.
        await expect(values.nth(0)).toHaveText("6");
        await expect(values.nth(1)).toHaveText("2");
        await expect(values.nth(2)).toHaveText("0.6");

        await expectPainted(view, 6);

        await expect(view.locator('[title="Jan 4, 2026: gym 1 (2026-01-04)"]')).toHaveCount(0);
        await expect(view.locator('[title="Jan 4, 2026: no data"]')).toHaveCount(1);
        await expect(view.locator(".dashy-hm-title")).toHaveText(/6 of \d+ days/);
    });

    test("unticking the box in the Properties pane redraws the dashboard", async ({ win, obsidian }) => {
        // The same flip as above, but by a click on the checkbox a person
        // would click: Habits in one pane, the day note in a split beside it.
        await obsidian.openFile("Habits.md", { mode: "preview" });
        await obsidian.evaluate(async (app: App) => {
            const file = app.vault.getFileByPath("Diary/2026-01-04.md");
            if (!file) throw new Error("no note at Diary/2026-01-04.md");
            await app.workspace.getLeaf("split").openFile(file, { state: { mode: "source", source: false } });
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
        await expect(view.locator('[title="Jan 4, 2026: no data"]')).toHaveCount(1);
    });

    // The grid spans January through today (the e2e vault's clock sits well
    // into the year), which does not fit a 560px pane; B-070 (9f3db44)
    // opens it scrolled to that end rather than at January. That scroll is
    // deferred (the block is built off-document, so its width reads 0 at
    // draw time) to the first ResizeObserver callback after attach, so this
    // waits for it rather than asserting immediately after open.
    test("a heatmap too wide for its pane opens scrolled toward the end, not stuck at the start", async ({ win, obsidian }) => {
        await obsidian.collapseSidebars();
        await win.setViewportSize({ width: 560, height: 800 });
        await obsidian.openFile("Habits.md", { mode: "preview" });
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
    test("a heatmap the reader scrolled by hand keeps its position across a redraw", async ({ win, obsidian }) => {
        await obsidian.collapseSidebars();
        await win.setViewportSize({ width: 560, height: 800 });
        await obsidian.openFile("Habits.md", { mode: "preview" });
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
        const before = await paintedCells(scroller);
        await obsidian.evaluate(async (app: App) => {
            await app.vault.create("Diary/2026-01-11.md", "---\ngym: true\n---\n");
        });
        await expectPainted(scroller, before + 1, { timeout: 5_000 });

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

    test("a heatmap the reader left at the end stays at the end across a redraw", async ({ win, obsidian }) => {
        await obsidian.collapseSidebars();
        await win.setViewportSize({ width: 560, height: 800 });
        await obsidian.openFile("Habits.md", { mode: "preview" });
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
        const before = await paintedCells(scroller);
        await obsidian.evaluate(async (app: App) => {
            await app.vault.create("Diary/2026-01-12.md", "---\ngym: true\n---\n");
        });
        await expectPainted(scroller, before + 1, { timeout: 5_000 });

        // Still pinned to the (new) end: nothing more to scroll to on the right.
        await expect(scroller).not.toHaveClass(/can-scroll-right/);
    });
});
