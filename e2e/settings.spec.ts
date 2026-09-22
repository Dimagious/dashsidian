import { test, expect } from "./fixtures";

/**
 * The settings tab is built through Obsidian's own Setting builder, so a DOM
 * fake proves nothing about it. This is the only place it gets exercised.
 */
test.describe("settings tab", () => {
    test.beforeEach(async ({ win }) => {
        await win.evaluate(() => {
            const a = (globalThis as unknown as {
                app?: { setting?: { open?: () => void; openTabById?: (id: string) => void } };
            }).app;
            a?.setting?.open?.();
            a?.setting?.openTabById?.("dashsidian");
        });
        await win.waitForTimeout(400);
    });

    test.afterEach(async ({ win }) => {
        await win.evaluate(() => {
            const a = (globalThis as unknown as { app?: { setting?: { close?: () => void } } }).app;
            a?.setting?.close?.();
        });
    });

    test("all three periodic folders can be set", async ({ win }) => {
        // This Obsidian build does not put `mod-settings` on the container.
        const modal = win.locator(".modal-container");
        for (const name of ["Daily notes folder", "Weekly notes folder", "Monthly notes folder"]) {
            await expect(modal.getByText(name, { exact: true })).toBeVisible();
        }
    });

    test("typing a folder is saved to disk", async ({ win }) => {
        const input = win.locator(".modal-container input[type=text]").first();
        await input.fill("Diary");
        await win.waitForTimeout(400);
        const saved = await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { plugins?: { plugins?: Record<string, { settings?: { dailyFolder?: string } }> } };
            }).app;
            return a?.plugins?.plugins?.dashsidian?.settings?.dailyFolder ?? null;
        });
        expect(saved).toBe("Diary");
    });

    test("the skill can be installed into the vault from the button", async ({ win }) => {
        await win.locator(".modal-container").getByRole("button", { name: "Install" }).click();
        await expect(win.locator(".notice").first()).toHaveText(/Skill written to/);

        const written = await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { vault?: { adapter?: { read?: (p: string) => Promise<string> } } };
            }).app;
            return a?.vault?.adapter?.read?.(".claude/skills/dashy/SKILL.md") ?? null;
        });
        expect(written).toContain("# Dashy — dashboard blocks");
        expect(written).toContain("### `countdown`");
    });
});
