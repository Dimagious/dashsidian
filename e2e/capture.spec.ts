import fs from "node:fs";
import path from "node:path";
import { test, expect, READING_VIEW } from "./fixtures";

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
        await a?.workspace?.openLinkText?.("Typo.md", "");
    });
    const view = win.locator(READING_VIEW);
    await expect(view.locator(".dashy-diag-warning").first()).toBeVisible();
    await view.locator(".dashy-diagnostics").first().scrollIntoViewIfNeeded();
    await win.screenshot({ path: path.join(SHOTS, "diagnostics-dark.png") });
});

test("settings", async ({ win }) => {
    await setUp(win, "obsidian");
    await win.evaluate(() => {
        const a = (globalThis as unknown as {
            app?: { setting?: { open?: () => void; openTabById?: (id: string) => void } };
        }).app;
        a?.setting?.open?.();
        a?.setting?.openTabById?.("dashsidian");
    });
    await win.waitForTimeout(600);
    await win.locator(".modal-container").first().screenshot({ path: path.join(SHOTS, "settings-dark.png") });
});

test("reel: the dashboard follows the vault", async ({ win }) => {
    await setUp(win, "obsidian");
    const view = win.locator(READING_VIEW);
    const region = view.locator(".dashy-stats").first();
    const counter = view.locator(".dashy-stat-value").first();
    const reel = new Reel("live-update");

    await region.scrollIntoViewIfNeeded();
    await reel.hold(region, 4);

    let count = Number((await counter.textContent())?.replace(/\D/g, "") ?? 0);
    for (let i = 1; i <= 5; i++) {
        await win.evaluate(async (n) => {
            const a = (globalThis as unknown as {
                app?: { vault?: { create?: (p: string, d: string) => Promise<unknown> } };
            }).app;
            await a?.vault?.create?.(`Diary/2019-01-0${n}.md`, `---\nsleep_score: 9${n}\nsteps: 1200${n}\n---\n`);
        }, i);
        count += 1;
        await expect(counter).toHaveText(String(count));
        await reel.shoot(region);
        await reel.shoot(region);
    }
    await reel.hold(region, 6);
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
