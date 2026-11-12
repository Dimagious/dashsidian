import { createObsidianTest } from "obsidian-plugin-dev-kit/e2e";
import type { App } from "obsidian";
import { dayCell, openPhoneNote, tapDay } from "./phone-note";

/**
 * The catalog's mobile pictures, 900x1600, from the running plugin in
 * Obsidian's own mobile interface in a phone-sized window. It is not a device,
 * so the top of the frame, where a status bar would sit, is cropped off.
 * They land in `.opdk/listing/stills`, apart from the README's pictures, and
 * `scripts/listing-pictures.cjs` moves them to `design/listing`.
 * Run on demand: `node scripts/listing-pictures.cjs`.
 */

const { test, expect, onlyWhen } = createObsidianTest({
    seedVault: ".capture/vault",
    demo: { outDir: ".opdk/listing" },
});

const WIDTH = 450;
const HEIGHT = 800;
const TOP = 44;

onlyWhen("LISTING");
test.setTimeout(180_000);

test("mobile pictures", async ({ win, obsidian, demo }) => {
    await obsidian.mobile({ width: WIDTH, height: HEIGHT + TOP });
    await obsidian.setTheme({ mode: "dark" });
    await obsidian.waitForMetadataCache();

    const shoot = async (name: string): Promise<void> => {
        await obsidian.clearNotices();
        await demo.still(name, { clip: { x: 0, y: TOP, width: WIDTH, height: HEIGHT }, settle: true, cursor: false });
    };
    const open = async (path: string): Promise<void> => {
        await obsidian.openFile(path, { mode: "preview" });
        await expect(win.locator(".workspace-leaf.mod-active .markdown-reading-view .dashy-diag-error")).toHaveCount(0);
    };

    await open("Running.md");
    await expect(win.locator(".workspace-leaf.mod-active .markdown-reading-view [class*='dashy-']").first()).toBeVisible();
    await shoot("mobile-1-running");
    await open("Dashboard.md");
    await expect(win.locator(".workspace-leaf.mod-active .markdown-reading-view [class*='dashy-']").first()).toBeVisible();
    await shoot("mobile-2-dashboard");
    // Last week's review: the demo vault names it for the week it was made in.
    const review = await obsidian.evaluate((app: App) =>
        app.vault.getMarkdownFiles().map((f) => f.path).find((p) => /^Reviews\/\d{4}-W\d{2}\.md$/.test(p)) ?? null);
    if (!review) throw new Error("listing: no weekly review note under Reviews/");
    await open(review);
    await expect(win.locator(".workspace-leaf.mod-active .markdown-reading-view [class*='dashy-']").first()).toBeVisible();
    await shoot("mobile-3-review");

    await openPhoneNote(obsidian);
    const cell = dayCell(win, tapDay());
    await expect(cell).toHaveCount(1, { timeout: 30_000 });
    await cell.click();
    await expect(win.locator(".workspace-leaf.mod-active .markdown-reading-view .dashy-hm-cell.is-selected")).toHaveCount(1);
    await shoot("mobile-4-tap");
});
