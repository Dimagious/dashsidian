import { test, expect, pluginSettings, type DashyPlugin } from "./fixtures";
import type { App } from "obsidian";

/** What the plugin has written to its `data.json`, `{}` until it has. */
const savedSettings = (vault: { exists(p: string): boolean; read(p: string): string }): Partial<DashyPlugin["settings"]> =>
    vault.exists(".obsidian/plugins/dashsidian/data.json")
        ? (JSON.parse(vault.read(".obsidian/plugins/dashsidian/data.json")) as Partial<DashyPlugin["settings"]>)
        : {};

/** A file of the vault's folder on disk, or "" until it is written: what a poll reads while the plugin is still at it. */
const fileText = (vault: { exists(p: string): boolean; read(p: string): string }, rel: string): string =>
    vault.exists(rel) ? vault.read(rel) : "";

/**
 * The settings tab is declared through `getSettingDefinitions()`, so Obsidian
 * renders it, not us. A DOM fake proves nothing about that; this is the only
 * place it gets exercised.
 */
test.describe("settings tab", () => {
    test.afterEach(async ({ obsidian }) => {
        await obsidian.closeSettings();
    });

    test("all three periodic folders can be set", async ({ obsidian }) => {
        const settings = await obsidian.openSettings("dashsidian");
        for (const name of ["Daily notes folder", "Weekly notes folder", "Monthly notes folder"]) {
            await expect(settings.getByText(name, { exact: true })).toBeVisible();
        }
    });

    test("typing a folder is saved to disk", async ({ obsidian, vault }) => {
        const settings = await obsidian.openSettings("dashsidian");
        await settings.locator("input[type=text]").first().fill("Diary");

        await expect.poll(async () => (await pluginSettings(obsidian))?.dailyFolder).toBe("Diary");
        // The name says disk: the plugin's data.json is what a restart would load.
        await expect.poll(() => savedSettings(vault).dailyFolder).toBe("Diary");
    });

    test("the new-day hour can be changed and persists to disk", async ({ win, obsidian, vault }) => {
        await obsidian.openSettings("dashsidian");
        // The filter goes through `win`: a locator made from the settings content would be looked up inside each row.
        const row = win.locator(".modal.mod-settings .setting-item", { has: win.getByText("New day starts at", { exact: true }) });
        // Obsidian's dropdown keeps a second, hidden `select` around purely
        // to measure its own width; `.is-measuring` is the one to skip.
        await row.locator("select:not(.is-measuring)").selectOption({ label: "04:00" });

        await expect.poll(async () => (await pluginSettings(obsidian))?.startDayHour).toBe(4);
        await expect.poll(() => savedSettings(vault).startDayHour).toBe(4);
    });

    test("AGENTS.md is written for agents that do not read Claude skills", async ({ obsidian, vault }) => {
        const settings = await obsidian.openSettings("dashsidian");
        await settings.getByRole("button", { name: "AGENTS.md in the vault root" }).click();
        // The file on disk is the assertion that matters: the notice lands in
        // whichever window Obsidian considers active.
        await expect.poll(() => fileText(vault, "AGENTS.md")).toContain("<!-- dashy:end -->");

        const written = vault.read("AGENTS.md");
        expect(written).toContain("<!-- dashy:begin -->");
        expect(written).toContain("### `countdown`");
        expect(written.trimEnd().endsWith("<!-- dashy:end -->")).toBe(true);
    });

    test("a file the user already owns keeps its own text", async ({ obsidian, vault }) => {
        vault.write("AGENTS.md", "# House rules\n\nNever touch this line.\n");
        // installAgents looks the file up in Obsidian's index; a click before it is
        // indexed finds no file and tries to create one.
        await expect.poll(() => obsidian.evaluate((app: App) => app.vault.getFileByPath("AGENTS.md") !== null)).toBe(true);

        const settings = await obsidian.openSettings("dashsidian");
        await settings.getByRole("button", { name: "AGENTS.md in the vault root" }).click();
        await expect.poll(() => vault.read("AGENTS.md")).toContain("<!-- dashy:begin -->");

        const written = vault.read("AGENTS.md");
        expect(written).toContain("# House rules");
        expect(written).toContain("Never touch this line.");
    });

    test("the skill can be installed into the vault from the button", async ({ obsidian, vault }) => {
        const settings = await obsidian.openSettings("dashsidian");
        await settings.getByRole("button", { name: "Skill file in this vault" }).click();
        // The process in SKILL.md, the key tables in reference.md next to it (B-164).
        await expect.poll(() => fileText(vault, ".claude/skills/dashy/SKILL.md")).toContain("## 1. Look before writing");
        const skill = vault.read(".claude/skills/dashy/SKILL.md");
        expect(skill).toContain("[reference.md](reference.md)");
        await expect.poll(() => fileText(vault, ".claude/skills/dashy/reference.md")).toContain("### `countdown`");
        expect(vault.read(".claude/skills/dashy/reference.md")).toContain("# Dashy block reference");
    });

    test("the About rows are there, with somewhere to send feedback", async ({ obsidian }) => {
        const settings = await obsidian.openSettings("dashsidian");
        for (const name of ["Report a bug", "Suggest a feature", "Documentation", "Buy me a coffee"]) {
            await expect(settings.getByText(name, { exact: true })).toBeVisible();
        }
        await expect(settings.getByRole("button", { name: "Report a bug" })).toBeVisible();
    });

    test("installing again offers an update rather than a fresh install", async ({ obsidian }) => {
        const settings = await obsidian.openSettings("dashsidian");
        await settings.getByRole("button", { name: "Skill file in this vault" }).click();
        // The row redraws through update(), so the button relabels itself.
        await expect(settings.getByRole("button", { name: "Skill file in this vault" }))
            .toHaveText("Update");
    });
});
