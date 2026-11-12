import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import type { DemoHelpers, ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import type { App } from "obsidian";
import { test, expect, onlyWhen, READING_VIEW } from "./demo-fixtures";

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
/** The whole window, the way the dashboard pictures are taken. */
const WINDOW_CLIP = { x: 0, y: 0, width: WIDTH, height: HEIGHT };

onlyWhen("CAPTURE");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

/** Every still is 2x on any display, waits for the page to settle and has no cursor arrow in it. */
const STILL = { settle: true, cursor: false } as const;

type Box = { x: number; y: number; width: number; height: number };

/** The theme names Obsidian's own: `obsidian` is the dark default, `moonstone` the light one. */
const MODE = { obsidian: "dark", moonstone: "light" } as const;

async function setUp(win: Page, obsidian: ObsidianHelpers, theme: "obsidian" | "moonstone"): Promise<void> {
    await obsidian.setTheme({ mode: MODE[theme] });
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

for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`blocks, ${suffix}`, async ({ win, obsidian, demo }) => {
        await setUp(win, obsidian, theme);
        const view = win.locator(READING_VIEW);

        await demo.still(`dashboard-${suffix}`, { clip: WINDOW_CLIP, ...STILL });

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
            await stillOf(obsidian, demo, `${name}-${suffix}`, block);
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
        await obsidian.settle();
        await demo.still(`habits-${suffix}`, { clip: await union(cards, grid), ...STILL });
    });
}

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
    await demo.still(name, { clip: block, ...STILL });
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

for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`charts, streaks and sleep, ${suffix}`, async ({ win, obsidian, demo }) => {
        await setUp(win, obsidian, theme);
        const view = win.locator(READING_VIEW);

        await openNote(win, obsidian, "Charts.md", ".dashy-chart-svg");
        const crops: [string, Locator][] = [
            ["chart-weekly", view.locator(".dashy-chart").nth(0)],
            ["chart-series", view.locator(".dashy-chart").nth(1)],
            ["streak", view.locator(".dashy-stats").first()],
        ];
        for (const [name, block] of crops) {
            await stillOf(obsidian, demo, `${name}-${suffix}`, block);
        }

        await openNote(win, obsidian, "Sleep.md", ".dashy-hm-cell");
        const cards = view.locator(".dashy-stats").first();
        await cards.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await obsidian.settle();
        const grid = view.locator(".block-language-heatmap").last().locator(".dashy-hm-wrap").last();
        await demo.still(`sleep-${suffix}`, { clip: await union(cards, grid), ...STILL });

        await openNote(win, obsidian, "Workdays.md", ".dashy-hm-cell");
        const workCards = view.locator(".dashy-stats").first();
        await workCards.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await obsidian.settle();
        const workGrid = view.locator(".block-language-heatmap").last().locator(".dashy-hm-wrap").last();
        await demo.still(`streak-weekdays-${suffix}`, { clip: await union(workCards, workGrid), ...STILL });

        await openNote(win, obsidian, "Layers.md", ".dashy-hm-cell");
        const layers = view.locator(".block-language-heatmap").first().locator(".dashy-hm-wrap").first();
        await stillOf(obsidian, demo, `heatmap-layers-${suffix}`, layers);

        // Back where `setUp` expects to find the next test.
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
    });
}

/**
 * The pictures for the birthday, books-per-year and homepage guides (B-155),
 * each the union of a note's first and last block, the way the habit tracker
 * shot is clipped. The notes come from `guideNotes` in scripts/demo-vault.cjs.
 */
for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`guides: birthdays, books and home, ${suffix}`, async ({ win, obsidian, demo }) => {
        await setUp(win, obsidian, theme);
        const view = win.locator(READING_VIEW);
        const shots: [string, string, string, string, string][] = [
            // [picture, note, drawn when this shows, first block, last block]
            ["countdown-birthday", "Birthdays.md", ".dashy-countdown-card", ".dashy-countdown", ".dashy-countdown"],
            ["books-per-year", "Reading log.md", ".dashy-chart-svg", ".dashy-stats", ".dashy-chart"],
            ["homepage", "Home.md", ".dashy-countdown-card", ".dashy-today", ".dashy-countdown"],
        ];
        for (const [name, note, ready, first, last] of shots) {
            await openNote(win, obsidian, note, ready);
            const top = view.locator(first).first();
            await top.evaluate((el) => el.scrollIntoView({ block: "start" }));
            await obsidian.settle();
            const clip = await union(top, view.locator(last).last());
            if (clip.y + clip.height > HEIGHT) {
                throw new Error(`capture: ${name} runs to ${Math.round(clip.y + clip.height)}px, past the window`);
            }
            await demo.still(`${name}-${suffix}`, { clip, ...STILL });
        }

        // Back where `setUp` expects to find the next test.
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
    });
}

/**
 * The picture for the monthly habit calendar guide (B-161): the first block
 * of `Habit calendar.md`, this month with gym, reading and meditation as
 * dots, shot as one element the way the layers heatmap is. The note comes
 * from `guideNotes` in scripts/demo-vault.cjs.
 */
for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`guides: monthly habit calendar, ${suffix}`, async ({ win, obsidian, demo }) => {
        await setUp(win, obsidian, theme);
        const view = win.locator(READING_VIEW);
        await openNote(win, obsidian, "Habit calendar.md", ".dashy-hm-cal");
        const month = view.locator(".block-language-heatmap").first().locator(".dashy-hm-calendar").first();
        await stillOf(obsidian, demo, `habit-calendar-${suffix}`, month);

        // Back where `setUp` expects to find the next test.
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
    });
}

/**
 * The picture for the weekly review guide (B-163): the cards and the chart of
 * last week's review note, clipped from the first block to the last the way
 * the books-per-year shot is. The note is named for last week by
 * `guideNotes` in scripts/demo-vault.cjs, so it is found by folder here.
 */
for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`guides: weekly review, ${suffix}`, async ({ win, obsidian, demo }) => {
        await setUp(win, obsidian, theme);
        const view = win.locator(READING_VIEW);
        const note = await obsidian.evaluate((app: App) =>
            app.vault.getMarkdownFiles().map((f) => f.path).find((p) => /^Reviews\/\d{4}-W\d{2}\.md$/.test(p)) ?? null);
        if (!note) throw new Error("capture: no weekly review note under Reviews/");
        await openNote(win, obsidian, note, ".dashy-chart-svg");
        const top = view.locator(".dashy-stats").first();
        await top.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await obsidian.settle();
        const clip = await union(top, view.locator(".dashy-chart").last());
        if (clip.y + clip.height > HEIGHT) {
            throw new Error(`capture: weekly-review runs to ${Math.round(clip.y + clip.height)}px, past the window`);
        }
        await demo.still(`weekly-review-${suffix}`, { clip, ...STILL });

        // Back where `setUp` expects to find the next test.
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
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

type PluginHost = App & {
    plugins: {
        enablePlugin(id: string): Promise<unknown>;
        disablePlugin(id: string): Promise<unknown>;
        plugins: { dataview?: { index?: { initialized?: boolean } } };
    };
};

for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`dataviewjs comparison, ${suffix}`, async ({ win, obsidian, demo }) => {
        test.skip(!compareReady, "no Dataview/Obsidian Charts under .capture/livecheck: comparison shot skipped");
        await setUp(win, obsidian, theme);
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
                ...STILL,
            });
        } finally {
            await toggle(false);
            await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
        }
    });
}

test("diagnostics", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, "obsidian");
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
        clip: { x: top.x, y: top.y, width: top.width, height: last.y + last.height - top.y + 12 },
        ...STILL,
    });
});

test("settings", async ({ win, obsidian, demo }) => {
    await setUp(win, obsidian, "obsidian");
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
    // The settings pane alone, without Obsidian's own tab list beside it.
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
    await setUp(win, obsidian, "obsidian");
    const view = win.locator(READING_VIEW);

    await setReadableLineLength(obsidian, false);
    await win.locator(".markdown-preview-view").first().evaluate((el: HTMLElement) => { el.scrollTop = 0; });
    await obsidian.settle();

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
    await setUp(win, obsidian, "obsidian");
    const view = win.locator(READING_VIEW);
    const region = view.locator(".dashy-stats").first();

    await region.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await obsidian.settle();
    const film = demo.film({ name: "theme-follow", kind: "desktop", clip: region, cursor: false });
    for (const theme of ["obsidian", "moonstone", "obsidian"] as const) {
        await obsidian.setTheme({ mode: MODE[theme] });
        await film.shot({ hold: 1.5, settle: true });
    }
});

/**
 * The 2.0 hero's right half (B-184): the note an agent wrote for the prompt in
 * scripts/agent-hero.cjs, as Obsidian draws it. Clipped from the note's title
 * to the last block; the script puts the prompt beside it.
 */
for (const theme of ["obsidian", "moonstone"] as const) {
    const suffix = theme === "obsidian" ? "dark" : "light";

    test(`agent hero note, ${suffix}`, async ({ win, obsidian, demo }) => {
        await setUp(win, obsidian, theme);
        const view = win.locator(READING_VIEW);
        await openNote(win, obsidian, "Running.md", ".dashy-chart-svg");
        // From the note's title, so the picture says which note this is.
        const box = await union(view.locator(".inline-title").first(), view.locator(".dashy-chart").last());
        const pad = 24;
        await demo.still(`agent-note-${suffix}`, {
            clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
            ...STILL,
        });
        await openNote(win, obsidian, "Dashboard.md", ".dashy-hm-cell");
    });
}
