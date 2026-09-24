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
});
