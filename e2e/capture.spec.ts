import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import type { DemoHelpers, ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import type { App } from "obsidian";
import { test, expect, onlyWhen, READING_VIEW } from "./demo-fixtures";
import { DEMO_NOW } from "./demo-day";

/**
 * The pictures for the README, the site and the store listing.
 *
 * Taken from the running plugin rather than a mock, because a listing showing
 * something other than what installs is a lie, however small. Everything goes
 * through the kit's `demo` fixture: stills and frames land in `.opdk/demo`, and
 * `opdk demo` copies the stills to `docs/screens` and turns the films into GIFs
 * (settings in opdk.config.mjs). Run on demand: `npm run capture`.
 */

const WIDTH = 1280;
const HEIGHT = 900;

onlyWhen("CAPTURE");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

/** Every still is 2x on any display, waits for the page to settle and has no cursor arrow in it. */
const STILL = { settle: true, cursor: false } as const;
/** A still of one element or a union of blocks, with a margin so no text touches the edge of the picture (CSS pixels). */
const ELEMENT = { ...STILL, padding: 8 } as const;

type Box = { x: number; y: number; width: number; height: number };

type Mode = "light" | "dark";
/** The scenes that take a picture in both themes, the light one first. */
const BOTH: Mode[] = ["light", "dark"];

async function setUp(win: Page, obsidian: ObsidianHelpers, demo: DemoHelpers, mode: Mode): Promise<void> {
    // A fixed day, so a retake on another date changes only what the code changed. The window is reloaded so the
    // blocks that were drawn on the real day are drawn again on this one.
    await demo.freezeTime(DEMO_NOW);
    await obsidian.reload();
    await obsidian.setTheme({ mode });
    // The dashboard is drawn from a snapshot that fills in as Obsidian indexes.
    // Every test starts a cold Obsidian, and a first heatmap cell only means
    // the first notes are in: a shot taken then shows a dash on "Steps this
    // week" and no sparklines. Wait until every note has its metadata cached.
    const view = win.locator(READING_VIEW);
    await expect(view.locator(".dashy-hm-cell").first()).toBeVisible();
    await obsidian.waitForMetadataCache();
    // Then the redraw that follows the last cache event: no card left on a
    // dash, and the sparklines drawn.
    await expect(view.locator(".dashy-stat-trend").first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await view.locator(".dashy-stat-value").allTextContents())
        .some((text) => text.trim() === "—"), { timeout: 15_000 }).toBe(false);
    // "Indexing complete." sits over the top right corner of every shot.
    // Transient chrome, and it hides the thing being photographed.
    await obsidian.clearNotices();
}

/** Readable line length, which the note column's width follows. */
async function setReadableLineLength(obsidian: ObsidianHelpers, on: boolean): Promise<void> {
    await obsidian.evaluate((app: App & { vault: { setConfig(key: string, value: unknown): void } }, value: boolean) => {
        app.vault.setConfig("readableLineLength", value);
        app.workspace.trigger("css-change");
    }, on);
}

test("blocks", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "light");
    // A window with only the note in it: no tab bar, view header, status bar or ribbon, and both side panels folded.
    await demo.cleanUi();
    const view = win.locator(READING_VIEW);

    await demo.themes(BOTH, async () => {
        // The first shot of a scene is the top of the note, whatever the scene before it scrolled to.
        await setReadableLineLength(obsidian, false);
        await win.locator(".markdown-preview-view").first().evaluate((el: HTMLElement) => { el.scrollTop = 0; });
        await obsidian.settle();
        // The note's blocks at the width of the pane, as many as fit, ending on a whole block.
        await demo.still("dashboard", { clip: await wholeBlocksClip(view), ...STILL });
        await setReadableLineLength(obsidian, true);
        await obsidian.settle();

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
            await stillOf(obsidian, demo, name, block);
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
        await atTop(cards);
        await obsidian.settle();
        await demo.still("habits", { clip: await union(cards, grid), ...ELEMENT });
    });
});

/** Opens a demo note in the current leaf and waits until its blocks are drawn. */
async function openNote(win: Page, obsidian: ObsidianHelpers, file: string, ready: string): Promise<void> {
    // The reel below turns readable line length off; these shots are read
    // at a note column's width, so they keep it on whatever ran before.
    await setReadableLineLength(obsidian, true);
    await obsidian.openFile(file, { mode: "preview" });
    const view = win.locator(READING_VIEW);
    await expect(view.locator(ready).first()).toBeVisible();
    await win.locator(".markdown-preview-view").first().evaluate((el: HTMLElement) => { el.scrollTop = 0; });
    await obsidian.settle();
    await obsidian.clearNotices();
    // A published picture showing a warning box would be advertising a mistake.
    await expect(view.locator(".dashy-diag-warning, .dashy-diag-error")).toHaveCount(0);
}

/**
 * One element as a still. The clip has to lie inside the window, so the element is brought to the middle of the
 * note pane first (Playwright's own element screenshot scrolled it into view and took what stuck out).
 */
async function stillOf(obsidian: ObsidianHelpers, demo: DemoHelpers, name: string, block: Locator): Promise<void> {
    await block.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await obsidian.settle();
    await demo.still(name, { clip: block, ...ELEMENT });
}

/**
 * As much of the note as fits above the fold, ending on a whole block. A clip that stops mid-card reads as a broken
 * screenshot. Room around the content: clipped to the sizer exactly, the cards touch all four edges and the progress
 * bars read as cut off.
 */
async function wholeBlocksClip(view: Locator): Promise<Box> {
    const sizer = await view.locator(".markdown-preview-sizer").first().boundingBox();
    if (!sizer) throw new Error("capture: no preview sizer to clip to");
    let bottom = sizer.y;
    for (const selector of [".dashy-today", ".dashy-tiles", ".dashy-stats", ".dashy-progress", ".dashy-countdown"]) {
        const box = await view.locator(selector).first().boundingBox();
        if (box && box.y + box.height + 16 <= HEIGHT) bottom = box.y + box.height;
    }
    const pad = 20;
    const x = Math.max(0, sizer.x - pad);
    const y = Math.max(0, sizer.y - pad);
    return {
        x, y,
        width: Math.min(WIDTH - x, sizer.width + pad * 2),
        height: Math.min(HEIGHT - y, bottom - y + pad),
    };
}

/**
 * Brings an element to the top of the note pane, a little below the edge: a still is taken with a margin around the
 * element, and the margin has to lie inside the window.
 */
async function atTop(block: Locator): Promise<void> {
    await block.evaluate((el) => {
        el.scrollIntoView({ block: "start" });
        const pane = el.closest(".markdown-preview-view");
        if (pane) pane.scrollTop = Math.max(0, pane.scrollTop - 16);
    });
}

/** The union of two boxes, the way the habit tracker shot is clipped. */
async function union(first: Locator, last: Locator): Promise<Box> {
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

test("charts, streaks and sleep", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "light");
    const view = win.locator(READING_VIEW);

    await demo.themes(BOTH, async () => {
        await openNote(win, obsidian, "Charts.md", ".dashy-chart-svg");
        const crops: [string, Locator][] = [
            ["chart-weekly", view.locator(".dashy-chart").nth(0)],
            ["chart-series", view.locator(".dashy-chart").nth(1)],
            ["streak", view.locator(".dashy-stats").first()],
        ];
        for (const [name, block] of crops) {
            await stillOf(obsidian, demo, name, block);
        }

        await openNote(win, obsidian, "Sleep.md", ".dashy-hm-cell");
        const cards = view.locator(".dashy-stats").first();
        await atTop(cards);
        await obsidian.settle();
        const grid = view.locator(".block-language-heatmap").last().locator(".dashy-hm-wrap").last();
        await demo.still("sleep", { clip: await union(cards, grid), ...ELEMENT });

        await openNote(win, obsidian, "Workdays.md", ".dashy-hm-cell");
        const workCards = view.locator(".dashy-stats").first();
        await atTop(workCards);
        await obsidian.settle();
        const workGrid = view.locator(".block-language-heatmap").last().locator(".dashy-hm-wrap").last();
        await demo.still("streak-weekdays", { clip: await union(workCards, workGrid), ...ELEMENT });

        await openNote(win, obsidian, "Layers.md", ".dashy-hm-cell");
        const layers = view.locator(".block-language-heatmap").first().locator(".dashy-hm-wrap").first();
        await stillOf(obsidian, demo, "heatmap-layers", layers);

        // Back where `setUp` expects to find the next test.
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
    });
});

/**
 * The pictures for the birthday, books-per-year and homepage guides (B-155),
 * each the union of a note's first and last block, the way the habit tracker
 * shot is clipped. The notes come from `guideNotes` in scripts/demo-vault.cjs.
 */
test("guides: birthdays, books and home", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "light");
    const view = win.locator(READING_VIEW);

    await demo.themes(BOTH, async () => {
        const shots: [string, string, string, string, string][] = [
            // [picture, note, drawn when this shows, first block, last block]
            ["countdown-birthday", "Birthdays.md", ".dashy-countdown-card", ".dashy-countdown", ".dashy-countdown"],
            ["books-per-year", "Reading log.md", ".dashy-chart-svg", ".dashy-stats", ".dashy-chart"],
            ["homepage", "Home.md", ".dashy-countdown-card", ".dashy-today", ".dashy-countdown"],
        ];
        for (const [name, note, ready, first, last] of shots) {
            await openNote(win, obsidian, note, ready);
            const top = view.locator(first).first();
            await atTop(top);
            await obsidian.settle();
            const clip = await union(top, view.locator(last).last());
            if (clip.y + clip.height > HEIGHT) {
                throw new Error(`capture: ${name} runs to ${Math.round(clip.y + clip.height)}px, past the window`);
            }
            await demo.still(name, { clip, ...ELEMENT });
        }

        // Back where `setUp` expects to find the next test.
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
    });
});

/**
 * The picture for the monthly habit calendar guide (B-161): the first block
 * of `Habit calendar.md`, this month with gym, reading and meditation as
 * dots, shot as one element the way the layers heatmap is. The note comes
 * from `guideNotes` in scripts/demo-vault.cjs.
 */
test("guides: monthly habit calendar", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "light");
    const view = win.locator(READING_VIEW);

    await demo.themes(BOTH, async () => {
        await openNote(win, obsidian, "Habit calendar.md", ".dashy-hm-cal");
        const month = view.locator(".block-language-heatmap").first().locator(".dashy-hm-calendar").first();
        await stillOf(obsidian, demo, "habit-calendar", month);

        // Back where `setUp` expects to find the next test.
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
    });
});

/**
 * The picture for the weekly review guide (B-163): the cards and the chart of
 * last week's review note, clipped from the first block to the last the way
 * the books-per-year shot is. The note is named for last week by
 * `guideNotes` in scripts/demo-vault.cjs, so it is found by folder here.
 */
test("guides: weekly review", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "light");
    const view = win.locator(READING_VIEW);

    await demo.themes(BOTH, async () => {
        const note = await obsidian.evaluate((app: App) =>
            app.vault.getMarkdownFiles().map((f) => f.path).find((p) => /^Reviews\/\d{4}-W\d{2}\.md$/.test(p)) ?? null);
        if (!note) throw new Error("capture: no weekly review note under Reviews/");
        await openNote(win, obsidian, note, ".dashy-chart-svg");
        const top = view.locator(".dashy-stats").first();
        await atTop(top);
        await obsidian.settle();
        const clip = await union(top, view.locator(".dashy-chart").last());
        if (clip.y + clip.height > HEIGHT) {
            throw new Error(`capture: weekly-review runs to ${Math.round(clip.y + clip.height)}px, past the window`);
        }
        await demo.still("weekly-review", { clip, ...ELEMENT });

        // Back where `setUp` expects to find the next test.
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
    });
});

/**
 * The same weekly chart from a `dataviewjs` script and from a Dashy block.
 * Dataview and Obsidian Charts are switched on for this shot only and off
 * again after it, so no other picture is drawn with them loaded. Skipped when
 * scripts/demo-vault.cjs found no copy of them to put in the vault.
 */
const COMPARE_PLUGINS = ["dataview", "obsidian-charts"];
const compareReady = COMPARE_PLUGINS.every((id) =>
    fs.existsSync(path.resolve(".capture/vault/.obsidian/plugins", id, "main.js")));

type PluginHost = App & {
    plugins: {
        enablePlugin(id: string): Promise<unknown>;
        disablePlugin(id: string): Promise<unknown>;
        plugins: { dataview?: { index?: { initialized?: boolean } } };
    };
};

for (const mode of BOTH) {
    const suffix = mode;

    test(`dataviewjs comparison, ${suffix}`, async ({ win, obsidian, demo }) => {
        test.skip(!compareReady, "no Dataview/Obsidian Charts under .capture/livecheck: comparison shot skipped");
        await setUp(win, obsidian, demo, mode);
        const toggle = (on: boolean): Promise<void> => obsidian.evaluate(async (app: PluginHost, arg: { ids: string[]; enable: boolean }) => {
            for (const id of arg.ids) await (arg.enable ? app.plugins.enablePlugin(id) : app.plugins.disablePlugin(id));
        }, { ids: COMPARE_PLUGINS, enable: on });

        await toggle(true);
        try {
            // A script run before Dataview finished indexing sees a handful of
            // notes and draws a handful of weeks. Wait for the index, then
            // open the note, so the script gets the whole diary.
            await expect.poll(() => obsidian.evaluate((app: PluginHost) =>
                app.plugins.plugins.dataview?.index?.initialized === true), { timeout: 30_000 }).toBe(true);
            await openNote(win, obsidian, "Dataview compare.md", ".dashy-chart-svg");
            const view = win.locator(READING_VIEW);
            const canvas = view.locator(".block-language-dataviewjs canvas").first();
            await expect(canvas).toBeVisible({ timeout: 15_000 });
            // Chart.js animates its bars in on a canvas, which no DOM change tells us about.
            await win.waitForTimeout(1_500);
            await obsidian.clearNotices();
            const top = await view.locator(".markdown-preview-sizer").first().boundingBox();
            const last = await view.locator(".dashy-chart").last().boundingBox();
            if (!top || !last) throw new Error("capture: the comparison note is not on screen");
            await demo.still(`compare-${suffix}`, {
                clip: { x: top.x, y: top.y, width: top.width, height: last.y + last.height - top.y },
                ...ELEMENT,
            });
        } finally {
            await toggle(false);
            await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
        }
    });
}

test("diagnostics", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "dark");
    await obsidian.openFile("A config with a mistake.md", { mode: "preview" });
    const view = win.locator(READING_VIEW);
    await expect(view.locator(".dashy-diag-warning").first()).toBeVisible();
    await expect(view.locator(".dashy-chart-svg").first()).toBeVisible();

    // Clipped to where the content actually ends. The preview container has a
    // min-height, so screenshotting it leaves half a page of empty note under
    // a picture whose subject is four lines tall.
    const top = await view.locator(".markdown-preview-sizer").first().boundingBox();
    const last = await view.locator(".dashy-chart").last().boundingBox();
    if (!top || !last) throw new Error("capture: the diagnostics note is not on screen");
    await demo.still("diagnostics-dark", {
        clip: { x: top.x, y: top.y, width: top.width, height: last.y + last.height - top.y },
        ...ELEMENT,
    });
});

test("settings", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "dark");
    await obsidian.openSettings("dashsidian");
    // The site puts this picture under the agent section and describes its
    // two install buttons, so they have to be in it. The pane outgrew one
    // window when "New day" arrived: scroll until the last setting (the
    // AGENTS.md row) sits at the bottom, and let the top fall where it may.
    const pane = win.locator(".modal.mod-settings .vertical-tab-content-container").first();
    const agents = pane.locator(".setting-item").filter({ hasText: "AGENTS.md in the vault root" }).first();
    await expect(agents).toHaveCount(1);
    await agents.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await obsidian.settle();
    const heading = pane.getByText("AI agent skill", { exact: true }).first();
    const headingBox = await heading.boundingBox();
    const paneBox = await pane.boundingBox();
    if (!headingBox || !paneBox || headingBox.y < paneBox.y) {
        throw new Error("capture: the agent section does not fit in the settings window");
    }
    // The settings pane alone, without Obsidian's own tab list beside it, and no margin. In this window size the clip
    // still shows the modal's close button and cuts through the first row at the top.
    await demo.still("settings-dark", { clip: pane, ...STILL });
});

/**
 * Every block redrawing at once, which is what the site claims a page does.
 * This replaced a 760x295 strip of `stats` alone: enough beside a heading that
 * names the block, useless anywhere the picture stands on its own. Readable
 * line length goes off so the note fills the pane and the reel comes out wide
 * rather than tall, which is what a feed scales well.
 */
test("reel: the whole dashboard", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "dark");
    const view = win.locator(READING_VIEW);

    await setReadableLineLength(obsidian, false);
    await win.locator(".markdown-preview-view").first().evaluate((el: HTMLElement) => { el.scrollTop = 0; });
    await obsidian.settle();

    const clip = await wholeBlocksClip(view);
    const film = demo.film({ name: "dashboard-wide", kind: "desktop", clip, cursor: false });

    // Four 4 fps frames held, a note added every half second, eight held at the end.
    await film.shot({ hold: 1, settle: true });
    let count = Number((await view.locator(".dashy-stat-value").first().textContent())?.replace(/\D/g, "") ?? 0);
    for (let i = 1; i <= 5; i++) {
        await obsidian.evaluate(async (app: App, n: number) => {
            await app.vault.create(`Diary/2019-01-0${n}.md`, `---\nsleep_score: 9${n}\nsteps: 1200${n}\n---\n`);
        }, i);
        count += 1;
        await expect(view.locator(".dashy-stat-value").first()).toHaveText(String(count));
        await film.shot({ hold: 0.5, settle: true });
    }
    await film.shot({ hold: 2, settle: true });
});

test("reel: the dashboard follows the theme", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "dark");
    const view = win.locator(READING_VIEW);
    const region = view.locator(".dashy-stats").first();

    await region.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await obsidian.settle();
    const film = demo.film({ name: "theme-follow", kind: "desktop", clip: region, cursor: false });
    for (const mode of ["dark", "light", "dark"] as const) {
        await obsidian.setTheme({ mode });
        await film.shot({ hold: 1.5, settle: true });
    }
});

/**
 * The 2.0 hero's right half (B-184): the note an agent wrote for the prompt in
 * scripts/agent-hero.cjs, as Obsidian draws it. Clipped from the note's title
 * to the last block; the script puts the prompt beside it.
 */
test("agent hero note", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, demo, "light");
    const view = win.locator(READING_VIEW);

    await demo.themes(BOTH, async () => {
        await openNote(win, obsidian, "Running.md", ".dashy-chart-svg");
        // From the note's title, so the picture says which note this is.
        const box = await union(view.locator(".inline-title").first(), view.locator(".dashy-chart").last());
        const pad = 24;
        await demo.still("agent-note", {
            clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
            ...STILL,
        });
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
    });
});
