import fs from "node:fs";
import path from "node:path";
import { test, expect, openSettings, READING_VIEW } from "./fixtures";

/**
 * The pictures for the README and the store listing.
 *
 * Taken from the running plugin rather than a mock, because a listing showing
 * something other than what installs is a lie, however small. Run on demand:
 * `npm run capture`.
 */

const SHOTS = path.resolve("docs/screens");
const FRAMES = path.resolve(".capture/frames");
const WIDTH = 1280;
const HEIGHT = 900;

test.skip(!process.env.CAPTURE, "capture run only — `npm run capture`");
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.rmSync(FRAMES, { recursive: true, force: true });
    fs.mkdirSync(FRAMES, { recursive: true });
});

/**
 * A GIF is assembled from a sequence of stills rather than from a video.
 * Recording the window gives a 1280-wide clip that has to be cropped back to
 * the part anyone cares about; shooting the region directly skips the round
 * trip and keeps the frames sharp. ffmpeg stitches them in scripts/capture.cjs.
 */
class Reel {
    private frame = 0;

    constructor(private readonly name: string) {
        fs.mkdirSync(path.join(FRAMES, name), { recursive: true });
    }

    async shoot(target: { screenshot: (o: { path: string }) => Promise<unknown> }): Promise<void> {
        const file = path.join(FRAMES, this.name, `${String(this.frame).padStart(3, "0")}.png`);
        this.frame += 1;
        await target.screenshot({ path: file });
    }

    /** A pause on the last frame, so the loop does not snap round. */
    async hold(target: { screenshot: (o: { path: string }) => Promise<unknown> }, frames: number): Promise<void> {
        for (let i = 0; i < frames; i++) await this.shoot(target);
    }
}

async function setUp(win: import("@playwright/test").Page, theme: "obsidian" | "moonstone") {
    await win.setViewportSize({ width: WIDTH, height: HEIGHT });
    await win.evaluate((name) => {
        const a = (globalThis as unknown as {
            app?: {
                vault?: { setConfig?: (k: string, v: unknown) => void };
                workspace?: { trigger?: (e: string) => void };
                changeTheme?: (n: string) => void;
            };
        }).app;
        a?.changeTheme?.(name);
        a?.vault?.setConfig?.("theme", name);
        a?.workspace?.trigger?.("css-change");
    }, theme);
    // The dashboard is drawn from a snapshot that fills in as Obsidian indexes.
    await expect(win.locator(READING_VIEW).locator(".dashy-hm-cell").first()).toBeVisible();
    await win.waitForTimeout(1_200);

    // "Indexing complete." sits over the top right corner of every shot.
    // Transient chrome, and it hides the thing being photographed.
    await win.evaluate(() => {
        for (const notice of Array.from(document.querySelectorAll(".notice"))) notice.remove();
    });
}

for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`blocks, ${suffix}`, async ({ win }) => {
        await setUp(win, theme);
        const view = win.locator(READING_VIEW);

        await win.screenshot({ path: path.join(SHOTS, `dashboard-${suffix}.png`) });

        const parts: [string, string][] = [
            ["today", ".dashy-today"],
            ["tiles", ".dashy-tiles"],
            ["stats", ".dashy-stats"],
            ["progress", ".dashy-progress"],
            ["countdown", ".dashy-countdown"],
            ["heatmap", ".dashy-hm-wrap"],
        ];
        for (const [name, selector] of parts) {
            const block = view.locator(selector).first();
            await block.scrollIntoViewIfNeeded();
            await block.screenshot({ path: path.join(SHOTS, `${name}-${suffix}.png`) });
        }
    });
}

test("diagnostics", async ({ win }) => {
    await setUp(win, "obsidian");
    await win.evaluate(async () => {
        const a = (globalThis as unknown as {
            app?: { workspace?: { openLinkText?: (l: string, s: string) => Promise<void> } };
        }).app;
        await a?.workspace?.openLinkText?.("A config with a mistake.md", "");
    });
    const view = win.locator(READING_VIEW);
    await expect(view.locator(".dashy-diag-warning").first()).toBeVisible();

    // Clipped to where the content actually ends. The preview container has a
    // min-height, so screenshotting it leaves half a page of empty note under
    // a picture whose subject is four lines tall.
    const top = await view.locator(".markdown-preview-sizer").first().boundingBox();
    const last = await view.locator(".dashy-stats").last().boundingBox();
    if (top && last) {
        await win.screenshot({
            path: path.join(SHOTS, "diagnostics-dark.png"),
            clip: { x: top.x, y: top.y, width: top.width, height: last.y + last.height - top.y + 12 },
        });
    }
});

test("settings", async ({ app, win }) => {
    await setUp(win, "obsidian");
    // Since Obsidian 1.13 the settings live in a window of their own.
    const settings = await openSettings(app, win);
    await settings.waitForTimeout(600);
    // The settings pane alone, without Obsidian's own tab list beside it.
    await settings.locator(".vertical-tab-content-container").first()
        .screenshot({ path: path.join(SHOTS, "settings-dark.png") });
});

/**
 * Every block redrawing at once, which is what the README claims a page does.
 * This replaced a 760x295 strip of `stats` alone: enough beside a heading that
 * names the block, useless anywhere the picture stands on its own. Readable
 * line length goes off so the note fills the pane and the reel comes out wide
 * rather than tall, which is what a feed scales well.
 */
test("reel: the whole dashboard", async ({ win }) => {
    await setUp(win, "obsidian");
    const view = win.locator(READING_VIEW);
    const reel = new Reel("dashboard-wide");

    await win.evaluate(() => {
        const a = (globalThis as unknown as {
            app?: {
                vault?: { setConfig?: (k: string, v: unknown) => void };
                workspace?: { trigger?: (e: string) => void };
            };
        }).app;
        a?.vault?.setConfig?.("readableLineLength", false);
        a?.workspace?.trigger?.("css-change");
    });
    await win.locator(".markdown-preview-view").first().evaluate((el) => { el.scrollTop = 0; });
    await win.waitForTimeout(600);

    // As much of the note as fits above the fold, ending on a whole block. A
    // clip that stops mid-card reads as a broken screenshot.
    const sizer = await view.locator(".markdown-preview-sizer").first().boundingBox();
    if (!sizer) throw new Error("capture: no preview sizer to clip to");
    let bottom = sizer.y;
    for (const selector of [".dashy-today", ".dashy-tiles", ".dashy-stats", ".dashy-progress", ".dashy-countdown"]) {
        const box = await view.locator(selector).first().boundingBox();
        if (box && box.y + box.height + 16 <= HEIGHT) bottom = box.y + box.height;
    }
    // Room around the content. Clipped to the sizer exactly, the cards touch
    // all four edges and the progress bars read as cut off.
    const pad = 20;
    const x = Math.max(0, sizer.x - pad);
    const y = Math.max(0, sizer.y - pad);
    const clip = {
        x, y,
        width: Math.min(WIDTH - x, sizer.width + pad * 2),
        height: Math.min(HEIGHT - y, bottom - y + pad),
    };
    const region = { screenshot: (o: { path: string }) => win.screenshot({ ...o, clip }) };

    await reel.hold(region, 4);
    let count = Number((await view.locator(".dashy-stat-value").first().textContent())?.replace(/\D/g, "") ?? 0);
    for (let i = 1; i <= 5; i++) {
        await win.evaluate(async (n) => {
            const a = (globalThis as unknown as {
                app?: { vault?: { create?: (p: string, d: string) => Promise<unknown> } };
            }).app;
            await a?.vault?.create?.(`Diary/2019-01-0${n}.md`, `---\nsleep_score: 9${n}\nsteps: 1200${n}\n---\n`);
        }, i);
        count += 1;
        await expect(view.locator(".dashy-stat-value").first()).toHaveText(String(count));
        await reel.shoot(region);
        await reel.shoot(region);
    }
    await reel.hold(region, 8);
});

test("reel: the dashboard follows the theme", async ({ win }) => {
    await setUp(win, "obsidian");
    const view = win.locator(READING_VIEW);
    const region = view.locator(".dashy-stats").first();
    const reel = new Reel("theme-follow");

    await region.scrollIntoViewIfNeeded();
    for (const theme of ["obsidian", "moonstone", "obsidian"] as const) {
        await win.evaluate((name) => {
            const a = (globalThis as unknown as {
                app?: {
                    changeTheme?: (n: string) => void;
                    vault?: { setConfig?: (k: string, v: unknown) => void };
                    workspace?: { trigger?: (e: string) => void };
                };
            }).app;
            a?.changeTheme?.(name);
            a?.vault?.setConfig?.("theme", name);
            a?.workspace?.trigger?.("css-change");
        }, theme);
        await win.waitForTimeout(500);
        await reel.hold(region, 6);
    }
});
