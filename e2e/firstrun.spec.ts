import fs from "node:fs";
import path from "node:path";
import { test, expect, openSettings, closeSettings } from "./fixtures";

/**
 * The first run, walked the way a newcomer walks it.
 *
 * The vault under `.capture/newcomer` has the data for a dashboard under names
 * that are not ours: `Journal`, not `Diary`; `mood`, not `sleep_score`; and a
 * `Templates` folder, as almost every vault has. A first run that only works
 * on a vault shaped like our examples does not work.
 *
 * Run with `npm run firstrun`. It measures rather than asserts: the report it
 * prints is the artefact.
 */

const steps: { step: string; ms: number; saw: string }[] = [];

test.skip(!process.env.FIRSTRUN, "first-run audit only — `npm run firstrun`");
test.describe.configure({ mode: "serial" });

async function timed(step: string, run: () => Promise<string>): Promise<void> {
    const started = Date.now();
    const saw = await run();
    steps.push({ step, ms: Date.now() - started, saw });
}

test("a newcomer gets from an installed plugin to a number about their own vault", async ({ app, win }) => {
    const shots = path.resolve("docs/screens/firstrun");
    fs.mkdirSync(shots, { recursive: true });
    await win.setViewportSize({ width: 1100, height: 760 });

    await timed("the plugin loads and the note opens", async () => {
        await expect(win.locator(".cm-content").first()).toBeVisible();
        return "an empty note, no sign the plugin is there";
    });

    await timed("they look for the plugin in the command palette", async () => {
        const commands = await win.evaluate(() => {
            const a = (globalThis as unknown as {
                app?: { commands?: { commands?: Record<string, { name?: string }> } };
            }).app;
            return Object.values(a?.commands?.commands ?? {})
                .map((c) => c.name ?? "")
                .filter((n) => n.toLowerCase().includes("dashy"));
        });
        return commands.join(" / ") || "nothing found";
    });

    await timed("they run it and pick the first block offered", async () => {
        await win.evaluate(() => {
            const a = (globalThis as unknown as {
                app?: { commands?: { executeCommandById?: (id: string) => boolean } };
            }).app;
            a?.commands?.executeCommandById?.("dashsidian:insert-block");
        });
        await expect(win.locator(".prompt-input")).toBeVisible();
        const offered = await win.locator(".suggestion-item").allTextContents();
        await win.screenshot({ path: path.join(shots, "1-picker.png") });
        await win.locator(".suggestion-item").first().click();
        return `offered ${offered.length}: ${offered.map((o) => o.split("\n")[0]).join(", ")}`;
    });

    await timed("the block renders", async () => {
        await win.waitForTimeout(1200);
        await win.screenshot({ path: path.join(shots, "2-first-block.png") });
        const numbers = await win.locator(".dashy-tile-badge, .dashy-stat-value").allTextContents();
        const errors = await win.locator(".dashy-diag-error").allTextContents();
        const warnings = await win.locator(".dashy-diag-warning").allTextContents();
        return [
            `numbers: ${JSON.stringify(numbers)}`,
            errors.length ? `ERRORS: ${JSON.stringify(errors)}` : "no errors",
            warnings.length ? `warnings: ${JSON.stringify(warnings)}` : "no warnings",
        ].join(" | ");
    });

    await timed("they try every other block the same way", async () => {
        const lines: string[] = [];
        for (const block of ["stats", "progress", "today", "countdown", "heatmap"]) {
            await win.evaluate(() => {
                const a = (globalThis as unknown as {
                    app?: { commands?: { executeCommandById?: (id: string) => boolean } };
                }).app;
                a?.commands?.executeCommandById?.("dashsidian:insert-block");
            });
            await win.locator(".prompt-input").fill(block);
            await win.locator(".suggestion-item").first().click();
            await win.waitForTimeout(700);
            const errors = await win.locator(".dashy-diag-error").allTextContents();
            const values = await win.locator(".dashy-stat-value, .dashy-progress-value, .dashy-countdown-value")
                .allTextContents();
            lines.push(`${block}: ${errors.length ? `ERROR ${errors.at(-1)}` : `values ${JSON.stringify(values.slice(-3))}`}`);
        }
        await win.screenshot({ path: path.join(shots, "3-all-blocks.png"), fullPage: false });
        return lines.join(" ;; ");
    });

    await timed("they open the settings to find out what to do", async () => {
        const settings = await openSettings(app, win);
        await settings.locator(".vertical-tab-content-container").first()
            .screenshot({ path: path.join(shots, "4-settings.png") });
        const rows = await settings.locator(".setting-item-name").allTextContents();
        await closeSettings(win);
        return `rows: ${rows.join(", ")}`;
    });

    // eslint-disable-next-line no-console
    console.log("\n=== FIRST RUN ===");
    let total = 0;
    for (const s of steps) {
        total += s.ms;
        // eslint-disable-next-line no-console
        console.log(`${String(s.ms).padStart(6)}ms  ${s.step}\n          ${s.saw}`);
    }
    // eslint-disable-next-line no-console
    console.log(`${String(total).padStart(6)}ms  total\n`);
});
