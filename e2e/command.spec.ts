import type { App } from "obsidian";
import { test, expect } from "./fixtures";

/**
 * The command palette is the way in for someone who does not write the YAML
 * from memory. A picker that inserts nothing is worse than no command at all.
 */
test.describe("insert block command", () => {
    test("the command is registered under the plugin's name", async ({ obsidian }) => {
        const found = await obsidian.evaluate(
            (app: App & { commands: { commands: Record<string, { name?: string }> } }) =>
                app.commands.commands["dashsidian:insert-block"]?.name ?? null,
        );
        expect(found).toBe("Dashy: Insert block");
    });

    test("choosing a block writes a working one into the note", async ({ win, obsidian }) => {
        // A note of our own, so the dashboard is left alone, and in live
        // preview: the command is an editorCallback, so reading view offers it
        // nothing to write into, which is the right behaviour, and the reason
        // the first version of this test found no prompt at all.
        await obsidian.evaluate(async (app: App) => {
            await app.vault.create("Scratch.md", "");
        });
        await obsidian.openFile("Scratch.md", { mode: "live" });

        await obsidian.runCommand("dashsidian:insert-block");

        const picker = win.locator(".prompt-input");
        await expect(picker).toBeVisible();
        await picker.fill("stats");
        await win.locator(".suggestion-item").first().click();

        const text = await obsidian.editor().text();
        expect(text).toContain("```stats");
        expect(text).toContain("agg: count");
        expect(text.trimEnd().endsWith("```")).toBe(true);

        // And the block it wrote actually draws. Live preview renders it in the
        // editor, so there is no need to leave the mode we are in.
        await expect(win.locator(".dashy-stat").first()).toBeVisible();
    });
});
