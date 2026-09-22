import { test, expect } from "./fixtures";

/**
 * The command palette is the way in for someone who does not write the YAML
 * from memory. A picker that inserts nothing is worse than no command at all.
 */
test.describe("insert block command", () => {
    test("the command is registered under the plugin's name", async ({ win }) => {
        const found = await win.evaluate(() => {
            const a = (globalThis as unknown as {
                app?: { commands?: { commands?: Record<string, { name?: string }> } };
            }).app;
            return a?.commands?.commands?.["dashsidian:insert-block"]?.name ?? null;
        });
        expect(found).toBe("Dashy: Insert block");
    });

    test("choosing a block writes a working one into the note", async ({ win }) => {
        // A note of our own, so the dashboard is left alone, and in source mode:
        // the command is an editorCallback, so reading view offers it nothing
        // to write into — which is the right behaviour, and the reason the
        // first version of this test found no prompt at all.
        await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: { vault?: { create?: (p: string, d: string) => Promise<unknown> } };
            }).app;
            await a?.vault?.create?.("Scratch.md", "");
        });
        await win.waitForTimeout(400);

        await win.evaluate(async () => {
            const a = (globalThis as unknown as {
                app?: {
                    vault?: { getFileByPath?: (p: string) => unknown };
                    workspace?: {
                        getLeaf?: (n?: boolean) => { openFile?: (f: unknown, s?: unknown) => Promise<void> };
                    };
                };
            }).app;
            const file = a?.vault?.getFileByPath?.("Scratch.md");
            await a?.workspace?.getLeaf?.(false)?.openFile?.(file, {
                state: { mode: "source", source: false },
            });
        });
        await win.waitForTimeout(800);

        await win.evaluate(() => {
            const a = (globalThis as unknown as {
                app?: { commands?: { executeCommandById?: (id: string) => boolean } };
            }).app;
            a?.commands?.executeCommandById?.("dashsidian:insert-block");
        });

        const picker = win.locator(".prompt-input");
        await expect(picker).toBeVisible();
        await picker.fill("stats");
        await win.locator(".suggestion-item").first().click();

        const text = await win.evaluate(() => {
            const a = (globalThis as unknown as {
                app?: { workspace?: { activeEditor?: { editor?: { getValue?: () => string } } | null } };
            }).app;
            return a?.workspace?.activeEditor?.editor?.getValue?.() ?? "";
        });
        expect(text).toContain("```stats");
        expect(text).toContain("agg: count");
        expect(text.trimEnd().endsWith("```")).toBe(true);

        // And the block it wrote actually draws. Live preview renders it in the
        // editor, so there is no need to leave the mode we are in.
        await expect(win.locator(".dashy-stat").first()).toBeVisible();
    });
});
