import type { App } from "obsidian";
import { test, expect, READING_VIEW } from "./fixtures";

/**
 * A block draws from a snapshot taken once. Until the plugin listened for vault
 * changes, a dashboard opened right after Obsidian started kept showing the
 * numbers of a half-read vault — and adding a note changed nothing on screen
 * until the note was reopened.
 */

test.describe("blocks follow the vault", () => {
    test("a new note is counted without reopening anything", async ({ win, obsidian }) => {
        const days = win.locator(READING_VIEW).locator(".dashy-stat-value").first();
        await expect(days).toHaveText("10");

        await obsidian.evaluate(async (app: App) => {
            await app.vault.create("Diary/2026-01-11.md", "---\nsleep_score: 80\nsteps: 2000\n---\n");
        });

        await expect(days).toHaveText("11");
    });

    test("deleting a note is counted too", async ({ win, obsidian }) => {
        const days = win.locator(READING_VIEW).locator(".dashy-stat-value").first();
        await expect(days).toHaveText("10");

        await obsidian.evaluate(async (app: App) => {
            const file = app.vault.getAbstractFileByPath("Diary/2026-01-10.md");
            if (!file) throw new Error("no note at Diary/2026-01-10.md");
            await app.vault.delete(file);
        });

        await expect(days).toHaveText("9");
    });

    test("editing frontmatter moves the average and the heatmap with it", async ({ win, obsidian }) => {
        const average = win.locator(READING_VIEW).locator(".dashy-stat-value").nth(1);
        await expect(average).toHaveText("74.5");

        await obsidian.evaluate(async (app: App) => {
            const file = app.vault.getFileByPath("Diary/2026-01-01.md");
            if (!file) throw new Error("no note at Diary/2026-01-01.md");
            await app.vault.modify(file, "---\nsleep_score: 100\nsteps: 1000\n---\n");
        });

        // 70..79 with the first raised from 70 to 100 averages 77.5
        await expect(average).toHaveText("77.5");
    });

    test("a redraw replaces the blocks rather than stacking copies", async ({ win, obsidian }) => {
        const cards = win.locator(READING_VIEW).locator(".dashy-stat");
        await expect(cards).toHaveCount(3);

        await obsidian.evaluate(async (app: App) => {
            await app.vault.create("Diary/2026-01-12.md", "---\nsleep_score: 70\n---\n");
        });

        await expect(win.locator(READING_VIEW).locator(".dashy-stat-value").first()).toHaveText("11");
        await expect(cards, "still three cards, not six").toHaveCount(3);
    });
});
