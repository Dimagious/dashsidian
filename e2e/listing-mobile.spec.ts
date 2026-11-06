import path from "node:path";
import { test, expect } from "./fixtures";

/**
 * The catalog's mobile pictures, 900x1600, from the running plugin in
 * Obsidian's own mobile interface in a phone-sized window. It is not a device,
 * so the top of the frame, where a status bar would sit, is cropped off.
 * Run on demand: `node scripts/listing-pictures.cjs`.
 */

const OUT = path.resolve("design/listing");
const WIDTH = 450;
const HEIGHT = 800;
const TOP = 44;
const NOTE = "Sleep on my phone";
const BODY = [
    "```stats", "source: Diary", "columns: 2", "items:",
    "  - { label: Sleep score, field: sleep_score, agg: avg, period: week }",
    "  - { label: Gym this week, field: gym, agg: sum, period: week }",
    "```", "",
    "```heatmap", "source: Diary", "field: sleep_score", "color: green", "title: Sleep score", "range: 120d", "```", "",
    "```chart", "source: Diary", "field: sleep_score", "title: Last two weeks", "range: 14d", "type: line", "```", "",
].join("\n");

test.skip(!process.env.LISTING, "listing run only");

test("mobile pictures", async ({ win }) => {
    test.setTimeout(180_000);
    await win.evaluate(() => (globalThis as any).app.emulateMobile(true)).catch(() => undefined);
    await win.waitForLoadState("domcontentloaded");
    await expect.poll(() => win.evaluate(() => {
        const a = (globalThis as any).app;
        return Boolean(a?.workspace?.layoutReady && a?.plugins?.plugins?.dashsidian);
    }).catch(() => false), { timeout: 60_000 }).toBe(true);
    // Twice the pixels for the same layout: a screenshot ignores a device scale
    // set from outside, but not the window's own zoom.
    await win.setViewportSize({ width: WIDTH * 2, height: (HEIGHT + TOP) * 2 });
    await win.evaluate(() => (globalThis as any).require("electron").webFrame.setZoomFactor(2));
    await win.waitForTimeout(800);

    await win.evaluate(async ({ name, body }) => {
        const a = (globalThis as any).app;
        a.changeTheme("obsidian");
        await new Promise((resolve) => {
            const files = a.vault.getMarkdownFiles();
            const poll = () => files.every((f: unknown) => a.metadataCache.getFileCache(f)) ? resolve(null) : setTimeout(poll, 200);
            poll();
        });
        await a.vault.create(`${name}.md`, body);
    }, { name: NOTE, body: BODY });

    const shoot = async (file: string): Promise<void> => {
        await win.evaluate(() => { for (const n of Array.from(document.querySelectorAll(".notice"))) n.remove(); });
        await win.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: TOP * 2, width: WIDTH * 2, height: HEIGHT * 2 } });
    };
    const open = async (note: string): Promise<void> => {
        await win.evaluate(async (n) => {
            await (globalThis as any).app.workspace.openLinkText(n, "", false, { state: { mode: "preview" } });
        }, note);
        await win.waitForTimeout(3_500);
    };

    await open("Running");
    await shoot("mobile-1-running.png");
    await open("Dashboard");
    await shoot("mobile-2-dashboard.png");
    await open("Reviews/2026-W44");
    await shoot("mobile-3-review.png");
    await open(NOTE);
    const cell = win.locator('.workspace-leaf.mod-active .markdown-reading-view a.dashy-hm-cell[data-href$="2026-10-06.md"]');
    await expect(cell).toHaveCount(1, { timeout: 30_000 });
    await cell.click();
    await win.waitForTimeout(400);
    await shoot("mobile-4-tap.png");
    await cell.click();
    await win.waitForTimeout(1_000);
});
