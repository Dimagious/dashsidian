import type { Page } from "@playwright/test";
import { test, expect, READING_VIEW } from "./fixtures";

/**
 * `Journal` is its own folder, separate from `Diary` (whose exact-name
 * counts every other spec in this suite depends on): three notes named with
 * a weekday suffix rather than a bare `YYYY-MM-DD`, two of them sharing
 * 2026-01-06. Exercises B-081 end to end — a suffixed name is dated, two
 * same-day notes sum into one heatmap cell and its tooltip, and a streak
 * counts that day once — against a real Obsidian render, not the jsdom
 * stubs the unit tests use.
 */

async function openJournal(win: Page): Promise<void> {
    await win.evaluate(async () => {
        const a = (globalThis as unknown as {
            app?: {
                vault?: { getFileByPath?: (p: string) => unknown };
                workspace?: {
                    getLeaf?: (n?: boolean) => { openFile?: (f: unknown, s?: unknown) => Promise<void> };
                };
            };
        }).app;
        const file = a?.vault?.getFileByPath?.("Journal.md");
        await a?.workspace?.getLeaf?.(false)?.openFile?.(file, {
            state: { mode: "preview", source: false },
        });
    });
    await win.waitForTimeout(800);
}

test.describe("dated names beyond an exact YYYY-MM-DD (B-081)", () => {
    test("a suffixed name counts, same-day notes sum, and the streak spans them as one day", async ({ win }) => {
        await openJournal(win);
        const view = win.locator(READING_VIEW);

        const values = view.locator(".dashy-stat-value");
        await expect(values.nth(0)).toHaveText("3"); // three notes, count
        await expect(values.nth(1)).toHaveText("2"); // 5th and 6th, consecutive: one link, not two isolated days

        const painted = await view.locator(".dashy-hm-cell").evaluateAll(
            (cells) => cells.filter((c) => (c as HTMLElement).style.backgroundColor !== "").length,
        );
        expect(painted).toBe(2); // two distinct days painted, not three notes

        await expect(view.locator('[title="2026-01-05: score 8"]')).toHaveCount(1);
        // The two 2026-01-06 notes (score 5 and score 2) sum into one cell
        // rather than one overwriting the other.
        await expect(view.locator('[title="2026-01-06: score 7"]')).toHaveCount(1);

        // The link target is deterministic: "(evening)" sorts before
        // "Tuesday" by path, so that is the note the cell opens.
        const cell = view.locator('a.dashy-hm-cell[title="2026-01-06: score 7"]');
        await expect(cell).toHaveAttribute("data-href", "Journal/2026-01-06 (evening).md");
    });
});
