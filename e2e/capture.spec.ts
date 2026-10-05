import fs from "node:fs";
import path from "node:path";
import { test, expect, openSettings, READING_VIEW } from "./fixtures";

/**
 * The pictures for the README, the site and the store listing.
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
    // Every test starts a cold Obsidian, and a first heatmap cell only means
    // the first notes are in: a shot taken then shows a dash on "Steps this
    // week" and no sparklines. Wait until every note has its metadata cached.
    const view = win.locator(READING_VIEW);
    await expect(view.locator(".dashy-hm-cell").first()).toBeVisible();
    await expect.poll(() => win.evaluate(() => {
        const a = (globalThis as unknown as {
            app?: {
                vault?: { getMarkdownFiles?: () => unknown[] };
                metadataCache?: { getFileCache?: (f: unknown) => unknown };
            };
        }).app;
        const files = a?.vault?.getMarkdownFiles?.() ?? [];
        const cached = files.filter((f) => a?.metadataCache?.getFileCache?.(f)).length;
        return files.length > 0 && cached === files.length;
    }), { timeout: 60_000 }).toBe(true);
    // Then the redraw that follows the last cache event: no card left on a
    // dash, and the sparklines drawn.
    await expect(view.locator(".dashy-stat-trend").first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await view.locator(".dashy-stat-value").allTextContents())
        .some((text) => text.trim() === "—"), { timeout: 15_000 }).toBe(false);
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

        // The habit tracker is two blocks read as one picture: the gym cards
        // and the current year of the gym heatmap under them. Both are the
        // last of their kind on the demo dashboard, so the shot is the union
        // of their boxes. The older year is left out: the demo diary covers
        // twelve months, so that grid is mostly empty weeks before it began.
        const cards = view.locator(".block-language-stats").last();
        const grid = view.locator(".block-language-heatmap").last().locator(".dashy-hm-wrap").first();
        // Obsidian scrolls the note, not the page: bring the cards to the top
        // so both blocks fit in the window the clip is taken from.
        await cards.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await win.waitForTimeout(300);
        const top = await cards.boundingBox();
        const bottom = await grid.boundingBox();
        if (!top || !bottom) throw new Error("habit blocks are not on screen");
        const clip = {
            x: Math.min(top.x, bottom.x),
            y: top.y,
            width: Math.max(top.x + top.width, bottom.x + bottom.width) - Math.min(top.x, bottom.x),
            height: bottom.y + bottom.height - top.y,
        };
        await win.screenshot({ path: path.join(SHOTS, `habits-${suffix}.png`), clip });
    });
}

/** Opens a demo note in the current leaf and waits until its blocks are drawn. */
async function openNote(win: import("@playwright/test").Page, file: string, ready: string): Promise<void> {
    await win.evaluate(async (link) => {
        const a = (globalThis as unknown as {
            app?: {
                vault?: { setConfig?: (k: string, v: unknown) => void };
                workspace?: { openLinkText?: (l: string, s: string) => Promise<void>; trigger?: (e: string) => void };
            };
        }).app;
        // The reel below turns readable line length off; these shots are read
        // at a note column's width, so they keep it on whatever ran before.
        a?.vault?.setConfig?.("readableLineLength", true);
        a?.workspace?.trigger?.("css-change");
        await a?.workspace?.openLinkText?.(link, "");
    }, file);
    const view = win.locator(READING_VIEW);
    await expect(view.locator(ready).first()).toBeVisible();
    await win.locator(".markdown-preview-view").first().evaluate((el) => { el.scrollTop = 0; });
    await win.waitForTimeout(800);
    await win.evaluate(() => {
        for (const notice of Array.from(document.querySelectorAll(".notice"))) notice.remove();
    });
    // A published picture showing a warning box would be advertising a mistake.
    await expect(view.locator(".dashy-diag-warning, .dashy-diag-error")).toHaveCount(0);
}

/** The union of two boxes, the way the habit tracker shot is clipped. */
async function union(
    first: import("@playwright/test").Locator,
    last: import("@playwright/test").Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
    const top = await first.boundingBox();
    const bottom = await last.boundingBox();
    if (!top || !bottom) throw new Error("capture: blocks are not on screen");
    const x = Math.min(top.x, bottom.x);
    return {
        x,
        y: top.y,
        width: Math.max(top.x + top.width, bottom.x + bottom.width) - x,
        height: bottom.y + bottom.height - top.y,
    };
}

for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`charts, streaks and sleep, ${suffix}`, async ({ win }) => {
        await setUp(win, theme);
        const view = win.locator(READING_VIEW);

        // The opening picture: the whole window, cut under the last block
        // rather than mid-card, with the note's title in it.
        await openNote(win, "Training.md", ".dashy-chart-svg");
        const heat = await view.locator(".block-language-heatmap").last().boundingBox();
        if (!heat) throw new Error("capture: the hero heatmap is not on screen");
        const heroBottom = heat.y + heat.height + 24;
        if (heroBottom > HEIGHT) throw new Error(`capture: the hero runs to ${Math.round(heroBottom)}px, past the window`);
        await win.screenshot({
            path: path.join(SHOTS, `hero-${suffix}.png`),
            clip: { x: 0, y: 0, width: WIDTH, height: Math.round(heroBottom) },
        });

        await openNote(win, "Charts.md", ".dashy-chart-svg");
        const crops: [string, import("@playwright/test").Locator][] = [
            ["chart-weekly", view.locator(".dashy-chart").nth(0)],
            ["chart-series", view.locator(".dashy-chart").nth(1)],
            ["streak", view.locator(".dashy-stats").first()],
        ];
        for (const [name, block] of crops) {
            await block.scrollIntoViewIfNeeded();
            await block.screenshot({ path: path.join(SHOTS, `${name}-${suffix}.png`) });
        }

        await openNote(win, "Sleep.md", ".dashy-hm-cell");
        const cards = view.locator(".dashy-stats").first();
        await cards.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await win.waitForTimeout(300);
        const grid = view.locator(".block-language-heatmap").last().locator(".dashy-hm-wrap").last();
        await win.screenshot({ path: path.join(SHOTS, `sleep-${suffix}.png`), clip: await union(cards, grid) });

        await openNote(win, "Workdays.md", ".dashy-hm-cell");
        const workCards = view.locator(".dashy-stats").first();
        await workCards.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await win.waitForTimeout(300);
        const workGrid = view.locator(".block-language-heatmap").last().locator(".dashy-hm-wrap").last();
        await win.screenshot({ path: path.join(SHOTS, `streak-weekdays-${suffix}.png`), clip: await union(workCards, workGrid) });

        await openNote(win, "Layers.md", ".dashy-hm-cell");
        const layers = view.locator(".block-language-heatmap").first().locator(".dashy-hm-wrap").first();
        await layers.scrollIntoViewIfNeeded();
        await layers.screenshot({ path: path.join(SHOTS, `heatmap-layers-${suffix}.png`) });

        // Back where `setUp` expects to find the next test.
        await openNote(win, "Dashboard.md", ".dashy-hm-cell");
    });
}

/**
 * The pictures for the birthday, books-per-year and homepage guides (B-155),
 * each the union of a note's first and last block, the way the habit tracker
 * shot is clipped. The notes come from `guideNotes` in scripts/demo-vault.cjs.
 */
for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`guides: birthdays, books and home, ${suffix}`, async ({ win }) => {
        await setUp(win, theme);
        const view = win.locator(READING_VIEW);
        const shots: [string, string, string, string, string][] = [
            // [picture, note, drawn when this shows, first block, last block]
            ["countdown-birthday", "Birthdays.md", ".dashy-countdown-card", ".dashy-countdown", ".dashy-countdown"],
            ["books-per-year", "Reading log.md", ".dashy-chart-svg", ".dashy-stats", ".dashy-chart"],
            ["homepage", "Home.md", ".dashy-countdown-card", ".dashy-today", ".dashy-countdown"],
        ];
        for (const [name, note, ready, first, last] of shots) {
            await openNote(win, note, ready);
            const top = view.locator(first).first();
            await top.evaluate((el) => el.scrollIntoView({ block: "start" }));
            await win.waitForTimeout(300);
            const clip = await union(top, view.locator(last).last());
            if (clip.y + clip.height > HEIGHT) {
                throw new Error(`capture: ${name} runs to ${Math.round(clip.y + clip.height)}px, past the window`);
            }
            await win.screenshot({ path: path.join(SHOTS, `${name}-${suffix}.png`), clip });
        }

        // Back where `setUp` expects to find the next test.
        await openNote(win, "Dashboard.md", ".dashy-hm-cell");
    });
}

/**
 * The same weekly chart from a `dataviewjs` script and from a Dashy block.
 * Dataview and Obsidian Charts are switched on for this shot only and off
 * again after it, so no other picture is drawn with them loaded. Skipped when
 * scripts/demo-vault.cjs found no copy of them to put in the vault.
 */
const COMPARE_PLUGINS = ["dataview", "obsidian-charts"];
const compareReady = COMPARE_PLUGINS.every((id) =>
    fs.existsSync(path.resolve(".capture/vault/.obsidian/plugins", id, "main.js")));

for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`dataviewjs comparison, ${suffix}`, async ({ win }) => {
        test.skip(!compareReady, "no Dataview/Obsidian Charts under .capture/livecheck: comparison shot skipped");
        await setUp(win, theme);
        const toggle = (on: boolean): Promise<void> => win.evaluate(async ({ ids, enable }) => {
            const plugins = (globalThis as unknown as {
                app?: { plugins?: { enablePlugin?: (id: string) => Promise<unknown>; disablePlugin?: (id: string) => Promise<unknown> } };
            }).app?.plugins;
            for (const id of ids) await (enable ? plugins?.enablePlugin?.(id) : plugins?.disablePlugin?.(id));
        }, { ids: COMPARE_PLUGINS, enable: on });

        await toggle(true);
        try {
            // A script run before Dataview finished indexing sees a handful of
            // notes and draws a handful of weeks. Wait for the index, then
            // open the note, so the script gets the whole diary.
            await expect.poll(() => win.evaluate(() => {
                const dv = (globalThis as unknown as {
                    app?: { plugins?: { plugins?: { dataview?: { index?: { initialized?: boolean } } } } };
                }).app?.plugins?.plugins?.dataview;
                return dv?.index?.initialized === true;
            }), { timeout: 30_000 }).toBe(true);
            await openNote(win, "Dataview compare.md", ".dashy-chart-svg");
            const view = win.locator(READING_VIEW);
            const canvas = view.locator(".block-language-dataviewjs canvas").first();
            await expect(canvas).toBeVisible({ timeout: 15_000 });
            await win.waitForTimeout(1_500); // Chart.js animates its bars in
            await win.evaluate(() => {
                for (const notice of Array.from(document.querySelectorAll(".notice"))) notice.remove();
            });
            const top = await view.locator(".markdown-preview-sizer").first().boundingBox();
            const last = await view.locator(".dashy-chart").last().boundingBox();
            if (!top || !last) throw new Error("capture: the comparison note is not on screen");
            await win.screenshot({
                path: path.join(SHOTS, `compare-${suffix}.png`),
                clip: { x: top.x, y: top.y, width: top.width, height: last.y + last.height - top.y },
            });
        } finally {
            await toggle(false);
            await openNote(win, "Dashboard.md", ".dashy-hm-cell");
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
    await expect(view.locator(".dashy-chart-svg").first()).toBeVisible();

    // Clipped to where the content actually ends. The preview container has a
    // min-height, so screenshotting it leaves half a page of empty note under
    // a picture whose subject is four lines tall.
    const top = await view.locator(".markdown-preview-sizer").first().boundingBox();
    const last = await view.locator(".dashy-chart").last().boundingBox();
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
    // The site puts this picture under the agent section and describes its
    // two install buttons, so they have to be in it. The pane outgrew one
    // window when "New day" arrived: scroll until the last setting (the
    // AGENTS.md row) sits at the bottom, and let the top fall where it may.
    const pane = settings.locator(".vertical-tab-content-container").first();
    const agents = pane.locator(".setting-item").filter({ hasText: "AGENTS.md in the vault root" }).first();
    await expect(agents).toHaveCount(1);
    await agents.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await settings.waitForTimeout(300);
    const heading = pane.getByText("AI agent skill", { exact: true }).first();
    const headingBox = await heading.boundingBox();
    const paneBox = await pane.boundingBox();
    if (!headingBox || !paneBox || headingBox.y < paneBox.y) {
        throw new Error("capture: the agent section does not fit in the settings window");
    }
    // The settings pane alone, without Obsidian's own tab list beside it.
    await pane.screenshot({ path: path.join(SHOTS, "settings-dark.png") });
});

/**
 * Every block redrawing at once, which is what the site claims a page does.
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
