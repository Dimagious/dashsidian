import { test, expect, openSettings, closeSettings } from "./fixtures";

/**
 * The settings tab is declared through `getSettingDefinitions()`, so Obsidian
 * renders it, not us. A DOM fake proves nothing about that; this is the only
 * place it gets exercised.
 */
test.describe("settings tab", () => {
    test.afterEach(async ({ win }) => {
        await closeSettings(win);
    });

    test("all three periodic folders can be set", async ({ app, win }) => {
        const settings = await openSettings(app, win);
        for (const name of ["Daily notes folder", "Weekly notes folder", "Monthly notes folder"]) {
            await expect(settings.getByText(name, { exact: true })).toBeVisible();
        }
    });

    test("typing a folder is saved to disk", async ({ app, win }) => {
        const settings = await openSettings(app, win);
        await settings.locator(".modal.mod-settings input[type=text]").first().fill("Diary");
        await win.waitForTimeout(500);

        const saved = await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { plugins?: { plugins?: Record<string, { settings?: { dailyFolder?: string } }> } };
            }).app;
            return a?.plugins?.plugins?.dashsidian?.settings?.dailyFolder ?? null;
        });
        expect(saved).toBe("Diary");
    });

    test("AGENTS.md is written for agents that do not read Claude skills", async ({ app, win }) => {
        const settings = await openSettings(app, win);
        await settings.getByRole("button", { name: "AGENTS.md in the vault root" }).click();
        // The notice lands in whichever window Obsidian considers active, and
        // since 1.13 that is not the one holding the settings. The file on disk
        // is the assertion that matters anyway.
        await win.waitForTimeout(800);

        const written = await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { vault?: { adapter?: { read?: (p: string) => Promise<string> } } };
            }).app;
            return a?.vault?.adapter?.read?.("AGENTS.md") ?? null;
        });
        expect(written).toContain("<!-- dashy:begin -->");
        expect(written).toContain("### `countdown`");
        expect(written?.trimEnd().endsWith("<!-- dashy:end -->")).toBe(true);
    });

    test("a file the user already owns keeps its own text", async ({ app, win }) => {
        await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { vault?: { adapter?: { write?: (p: string, d: string) => Promise<void> } } };
            }).app;
            await a?.vault?.adapter?.write?.("AGENTS.md", "# House rules\n\nNever touch this line.\n");
        });

        const settings = await openSettings(app, win);
        await settings.getByRole("button", { name: "AGENTS.md in the vault root" }).click();
        await win.waitForTimeout(800);

        const written = await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { vault?: { adapter?: { read?: (p: string) => Promise<string> } } };
            }).app;
            return a?.vault?.adapter?.read?.("AGENTS.md") ?? "";
        });
        expect(written).toContain("# House rules");
        expect(written).toContain("Never touch this line.");
        expect(written).toContain("<!-- dashy:begin -->");
    });

    test("the skill can be installed into the vault from the button", async ({ app, win }) => {
        const settings = await openSettings(app, win);
        await settings.getByRole("button", { name: "Skill file in this vault" }).click();
        await win.waitForTimeout(800);

        const written = await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { vault?: { adapter?: { read?: (p: string) => Promise<string> } } };
            }).app;
            return a?.vault?.adapter?.read?.(".claude/skills/dashy/SKILL.md") ?? null;
        });
        expect(written).toContain("# Dashy — dashboard blocks");
        expect(written).toContain("### `countdown`");
    });

    test("the About rows are there, with somewhere to send feedback", async ({ app, win }) => {
        const settings = await openSettings(app, win);
        for (const name of ["Report a bug", "Suggest a feature", "Documentation", "Buy me a coffee"]) {
            await expect(settings.getByText(name, { exact: true })).toBeVisible();
        }
        await expect(settings.getByRole("button", { name: "Report a bug" })).toBeVisible();
    });

    test("installing again offers an update rather than a fresh install", async ({ app, win }) => {
        const settings = await openSettings(app, win);
        await settings.getByRole("button", { name: "Skill file in this vault" }).click();
        await win.waitForTimeout(800);
        // The row redraws through update(), so the button relabels itself.
        await expect(settings.getByRole("button", { name: "Skill file in this vault" }))
            .toHaveText("Update");
    });
});
