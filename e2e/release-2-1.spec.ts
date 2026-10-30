import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { test as base, expect, openSettings, closeSettings, READING_VIEW } from "./fixtures";

/**
 * The 2.1.0 features in a real Obsidian: what jsdom cannot show (computed
 * grid tracks, link colours, overflow at a phone width), what only the real
 * app holds (the core Templates plugin's folder, Obsidian's own YAML parser
 * and adapter), and the end-to-end path from a note to the `.dashy/` files.
 *
 * Every window below is closed: the Diary is January 2026 and the Logs are
 * October 2026, so nothing depends on the day the suite runs, as long as
 * that day is after 2026-10-12. There is no Periodic Notes in this vault,
 * so a week name is read as an ISO week, Monday to Sunday (B-171).
 */

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PLUGIN_VERSION = (JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")) as { version: string }).version;
const SCHEMA_VERSION = (JSON.parse(fs.readFileSync(path.join(ROOT, "src/blocks/schema.json"), "utf8")) as { version: string }).version;

const fence = (lang: string, body: string): string => `\`\`\`${lang}\n${body.trim()}\n\`\`\`\n`;

/** The notes this file adds to the throwaway vault before Obsidian starts, so they are indexed like any other. */
const SEED: Record<string, string> = {
    // The core Templates plugin's "Template folder location" (B-190).
    ".obsidian/templates.json": JSON.stringify({ folder: "Templates" }),

    // B-168: line 1 heading, line 3 the good fence, line 10 the bad one.
    "R21/Check.md": [
        "# Check",
        "",
        fence("stats", "items:\n  - { label: Days, source: Diary, agg: count }"),
        "Between the blocks.",
        "",
        fence("stats", "items:\n  - { label: Broken, source: Diary, agg: count\n  - { label: Other }"),
    ].join("\n"),

    // B-194: ISO 2026-W02 is Jan 5..11 (Diary 05..10: 6 notes, steps 1400..1900 = 9900),
    // the week before is Dec 29..Jan 4 (Diary 01..04: 4 notes, steps 1000..1300 = 4600).
    "R21/Compare.md": fence(
        "stats",
        `columns: 2
source: Diary
period: 2026-W02
items:
  - { label: Days, agg: count, compare: true }
  - { label: Steps, field: steps, agg: sum, compare: true }`,
    ),

    // B-149: sleep_score 70..79 over Diary 01..10; the lowest is Jan 1, the highest Jan 10.
    "R21/Origin.md": [
        "See [[Dashboard]] for the rest.",
        "",
        fence(
            "stats",
            `source: Diary
items:
  - { label: Worst sleep, field: sleep_score, agg: min, origin: note }
  - { label: Best sleep, field: sleep_score, agg: max, origin: date }`,
        ),
    ].join("\n"),

    // B-197: one and three columns of each grid block.
    "R21/Columns.md": [
        fence("countdown", "columns: 1\nitems:\n  - { label: Far, date: 2099-01-01 }"),
        fence("countdown", "columns: 3\nitems:\n  - { label: A, date: 2099-01-01 }\n  - { label: B, date: 2099-02-01 }\n  - { label: C, date: 2099-03-01 }"),
        fence("tiles", "columns: 1\nitems:\n  - { label: Diary, path: Diary }"),
        fence("tiles", "columns: 3\nitems:\n  - { label: A, path: Diary }\n  - { label: B, path: Diary }\n  - { label: C, path: Diary }"),
        fence("stats", "columns: 1\nitems:\n  - { label: Days, source: Diary, agg: count }"),
        fence("stats", "columns: 3\nsource: Diary\nitems:\n  - { label: A, agg: count }\n  - { label: B, agg: count }\n  - { label: C, agg: count }"),
    ].join("\n"),

    // B-190 and B-198: the same weekly review block in a template, under a name
    // that is no period, and under a week name with words after it.
    "Templates/Weekly-Review.md": [
        fence("stats", "source: Logs\nperiod: note\nitems:\n  - { label: Minutes, field: minutes, agg: sum }"),
        fence("stats", "source: Logz\nperiod: note\nitems:\n  - { label: Minutes, field: minutes, agg: sum }"),
    ].join("\n"),
    "Reviews/Weekly-Review.md": fence("stats", "source: Logs\nperiod: note\nitems:\n  - { label: Minutes, field: minutes, agg: sum }"),
    "Reviews/2026-W41 Weekly.md": fence("stats", "source: Logs\nperiod: note\nitems:\n  - { label: Minutes, field: minutes, agg: sum }"),
    // ISO 2026-W41 is Mon Oct 5..Sun Oct 11: 10 + 100 + 1000 = 1110. The US
    // locale week 41 would be Sun Oct 4..Sat Oct 10 (1 + 10 + 100 = 111), and
    // the days either side of the ISO week carry values no sum can hide.
    "Logs/2026-10-04.md": "---\nminutes: 1\n---\n",
    "Logs/2026-10-05.md": "---\nminutes: 10\n---\n",
    "Logs/2026-10-08.md": "---\nminutes: 100\n---\n",
    "Logs/2026-10-11.md": "---\nminutes: 1000\n---\n",
    "Logs/2026-10-12.md": "---\nminutes: 10000\n---\n",

    // B-193 and B-199. Per-note sums of a and b: 3, 4, 8; s4 holds neither.
    // `date` is set on s1, null on s2, blank text on s3, missing on s4.
    "Sums/s1.md": "---\na: 1\nb: 2\ndate: 2026-01-01\n---\n",
    "Sums/s2.md": "---\na: 4\ndate:\n---\n",
    "Sums/s3.md": "---\nb: 8\ndate: \"\"\n---\n",
    "Sums/s4.md": "---\nother: 1\n---\nZanzibarquokka keeps this body out of any profile.\n",
    "R21/Sums.md": fence(
        "stats",
        `columns: 2
source: Sums
items:
  - { field: [a, b], agg: sum }
  - { label: Average total, field: [a, b], agg: avg }
  - { label: No date, agg: count, where: "date empty" }
  - { label: Dated, agg: count, where: "date not empty" }`,
    ),
};

const test = base.extend({
    vaultPath: async ({ vaultPath }, use) => {
        for (const [rel, text] of Object.entries(SEED)) {
            const file = path.join(vaultPath, rel);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, text);
        }
        await use(vaultPath);
    },
});

// Serial by the config (one worker, fullyParallel off); each test opens its own note.

async function openNote(win: Page, notePath: string): Promise<void> {
    await win.evaluate(async (p) => {
        const a = (globalThis as unknown as {
            app?: {
                vault?: { getFileByPath?: (p: string) => unknown };
                workspace?: {
                    getLeaf?: (n?: boolean) => { openFile?: (f: unknown, s?: unknown) => Promise<void> };
                };
            };
        }).app;
        const file = a?.vault?.getFileByPath?.(p);
        if (!file) throw new Error(`no note at ${p}`);
        await a?.workspace?.getLeaf?.(false)?.openFile?.(file, {
            state: { mode: "preview", source: false },
        });
    }, notePath);
    await win.waitForTimeout(800);
}

async function runCommand(win: Page, id: string): Promise<boolean> {
    return win.evaluate((commandId) => {
        const a = (globalThis as unknown as {
            app?: { commands?: { executeCommandById?: (id: string) => boolean } };
        }).app;
        return a?.commands?.executeCommandById?.(commandId) ?? false;
    }, id);
}

/** The whole window to the note pane, so a 390px viewport is 390px of note, not of sidebars. */
async function collapseSidebars(win: Page): Promise<void> {
    await win.evaluate(() => {
        const a = (globalThis as unknown as {
            app?: {
                workspace?: {
                    leftSplit?: { collapse?: () => void };
                    rightSplit?: { collapse?: () => void };
                };
            };
        }).app;
        a?.workspace?.leftSplit?.collapse?.();
        a?.workspace?.rightSplit?.collapse?.();
    });
}

/** The number of tracks a grid draws, from the computed style a real engine resolves. */
async function trackCount(block: Locator): Promise<number> {
    const columns = await block.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    return columns.split(/\s+/).filter(Boolean).length;
}

const view = (win: Page): Locator => win.locator(READING_VIEW);

test.describe("2.1.0 in a real Obsidian", () => {
    test("B-168: the two agent commands write .dashy/ only when run", async ({ win, vaultPath }) => {
        const dashy = path.join(vaultPath, ".dashy");
        expect(fs.existsSync(dashy), ".dashy/ must not exist before a command runs").toBe(false);

        await openNote(win, "R21/Check.md");
        // The message the note itself shows, which the report must repeat word for word.
        const shown = view(win).locator(".dashy-diag-error");
        await expect(shown).toHaveCount(1);
        const message = await shown.getAttribute("data-message");
        expect(message).toMatch(/^Could not parse YAML: /);
        const blockLine = await shown.getAttribute("data-line");

        expect(await runCommand(win, "dashsidian:check-blocks")).toBe(true);
        const checkFile = path.join(dashy, "block-check.md");
        await expect.poll(() => fs.existsSync(checkFile)).toBe(true);
        const report = fs.readFileSync(checkFile, "utf8");

        expect(report).toContain("# Dashy block check");
        expect(report).toContain("- Note: R21/Check.md");
        expect(report).toContain(`- Plugin version: ${PLUGIN_VERSION}`);
        expect(report).toContain(`- Schema version: ${SCHEMA_VERSION}`);
        expect(report).toContain("## Block 1: `stats` at line 3\n\nok\n");
        expect(report).toContain("## Block 2: `stats` at line 10");
        // Obsidian's own parseYaml decides whether the error carries a line.
        expect(blockLine, "the YAML error in the note names its line").not.toBeNull();
        const at = Number(blockLine);
        expect(report).toContain(`- error, line ${10 + at} (block line ${at}): ${(message ?? "").replace(/\s*\n\s*/g, " ").trim()}`);
        expect(report.trimEnd().split("\n").at(-1)).toBe("Summary: 2 blocks, 1 error, 0 warnings.");

        expect(await runCommand(win, "dashsidian:vault-profile")).toBe(true);
        const profileFile = path.join(dashy, "vault-profile.md");
        await expect.poll(() => fs.existsSync(profileFile)).toBe(true);
        const profile = fs.readFileSync(profileFile, "utf8");
        expect(profile).toContain("sleep_score");
        expect(profile).toContain(`Dashy ${PLUGIN_VERSION}, block schema ${SCHEMA_VERSION}`);
        // Note bodies never reach it: the Journal's and the one seeded above.
        expect(profile).not.toContain("Zanzibarquokka");
        expect(profile).not.toContain("second entry the same day");
        expect(profile).not.toContain("morning entry");

        expect(fs.readdirSync(dashy).sort()).toEqual(["block-check.md", "vault-profile.md"]);
    });

    test("B-194: compare shows the previous value and fits a phone-wide card", async ({ win }) => {
        await openNote(win, "R21/Compare.md");
        const cards = view(win).locator(".dashy-stat");
        await expect(cards).toHaveCount(2);

        await expect(cards.nth(0).locator(".dashy-stat-value")).toHaveText("6");
        await expect(cards.nth(0).locator(".dashy-stat-delta")).toHaveText(/^\S+ \+2 \(was 4\)$/);
        await expect(cards.nth(0).locator(".dashy-stat-delta-previous-value")).toHaveText("(was 4)");

        await expect(cards.nth(1).locator(".dashy-stat-value")).toHaveText("9900");
        await expect(cards.nth(1).locator(".dashy-stat-delta")).toHaveText(/^\S+ \+5300 \(was 4600\)$/);
        await expect(cards.nth(1).locator(".dashy-stat-delta-previous-value")).toHaveText("(was 4600)");

        await collapseSidebars(win);
        await win.setViewportSize({ width: 390, height: 800 });
        await win.waitForTimeout(300);
        const sizes = await cards.evaluateAll((els) =>
            els.map((el) => ({ scroll: el.scrollWidth, client: el.clientWidth })));
        for (const card of sizes) {
            // Two cards side by side in a phone-wide pane, not a sliver squeezed by a sidebar.
            expect(card.client).toBeGreaterThan(100);
            expect(card.client).toBeLessThan(200);
            expect(card.scroll).toBeLessThanOrEqual(card.client);
        }
    });

    test("B-149: origin names the note as a quiet link, or its date", async ({ win }) => {
        await openNote(win, "R21/Origin.md");
        const cards = view(win).locator(".dashy-stat");
        await expect(cards).toHaveCount(2);

        await expect(cards.nth(0).locator(".dashy-stat-value")).toHaveText("70");
        const link = cards.nth(0).locator("a.internal-link.dashy-stat-origin");
        await expect(link).toHaveText("2026-01-01");
        await expect(link).toHaveAttribute("data-href", "Diary/2026-01-01.md");

        const colours = await win.evaluate((scope) => {
            const root = document.querySelector(scope);
            const origin = root?.querySelector(".dashy-stat-origin.internal-link");
            const sub = origin?.parentElement;
            const plain = root?.querySelector("a.internal-link:not(.dashy-stat-origin)");
            return {
                origin: origin ? getComputedStyle(origin).color : null,
                sub: sub ? getComputedStyle(sub).color : null,
                plain: plain ? getComputedStyle(plain).color : null,
            };
        }, READING_VIEW);
        expect(colours.plain, "the note's own [[Dashboard]] link").not.toBeNull();
        expect(colours.origin).toBe(colours.sub);
        expect(colours.origin).not.toBe(colours.plain);

        await expect(cards.nth(1).locator(".dashy-stat-value")).toHaveText("79");
        await expect(cards.nth(1).locator(".dashy-stat-origin")).toHaveText("Jan 10, 2026");
        await expect(cards.nth(1).locator("a.dashy-stat-origin")).toHaveCount(0);
        await expect(view(win).locator(".dashy-diag")).toHaveCount(0);
    });

    test("B-197: a phone keeps one column for columns: 1 and at most two otherwise", async ({ win }) => {
        await openNote(win, "R21/Columns.md");
        const grids = {
            countdown: view(win).locator(".dashy-countdown"),
            tiles: view(win).locator(".dashy-tiles"),
            stats: view(win).locator(".dashy-stats"),
        };
        for (const grid of Object.values(grids)) await expect(grid).toHaveCount(2);

        await win.setViewportSize({ width: 700, height: 800 });
        await win.waitForTimeout(300);
        for (const [name, grid] of Object.entries(grids)) {
            expect(await trackCount(grid.nth(0)), `${name} columns: 1 at 700px`).toBe(1);
            expect(await trackCount(grid.nth(1)), `${name} columns: 3 at 700px`).toBe(2);
        }

        await win.setViewportSize({ width: 1000, height: 800 });
        await win.waitForTimeout(300);
        for (const [name, grid] of Object.entries(grids)) {
            expect(await trackCount(grid.nth(0)), `${name} columns: 1 at 1000px`).toBe(1);
            expect(await trackCount(grid.nth(1)), `${name} columns: 3 at 1000px`).toBe(3);
        }
    });

    test("B-190: a template shows a calm hint, the same block elsewhere an error", async ({ win }) => {
        const folder = await win.evaluate(() => {
            const a = (globalThis as unknown as {
                app?: { internalPlugins?: { plugins?: Record<string, { instance?: { options?: { folder?: unknown } } }> } };
            }).app;
            return a?.internalPlugins?.plugins?.templates?.instance?.options?.folder ?? null;
        });
        expect(folder, "the core Templates plugin read .obsidian/templates.json").toBe("Templates");

        await openNote(win, "Templates/Weekly-Review.md");
        const blocks = view(win).locator(".block-language-stats");
        await expect(blocks).toHaveCount(2);
        const hint = "This note is a template, so there is nothing to count here yet. A note made from it and named for a period, like 2026-W40, counts that period.";

        await expect(blocks.nth(0).locator(".dashy-notice")).toHaveText(hint);
        await expect(blocks.nth(0).locator(".dashy-diag")).toHaveCount(0);
        await expect(blocks.nth(0).locator(".dashy-stat")).toHaveCount(0);

        // The typo in `source` is still reported, above the same hint.
        await expect(blocks.nth(1).locator(".dashy-diag-warning")).toHaveAttribute(
            "data-message",
            "Nothing is filed under `Logz`. The numbers below count nothing. Point `source` at a folder of your own.",
        );
        await expect(blocks.nth(1).locator(".dashy-notice")).toHaveText(hint);

        await openNote(win, "Reviews/Weekly-Review.md");
        const error = view(win).locator(".dashy-diag-error");
        await expect(error).toHaveCount(1);
        await expect(error).toHaveAttribute("data-message", /^`period: note` needs a note named like a day, week, month, quarter or year, and this note is "Weekly-Review"\./);
        await expect(view(win).locator(".dashy-notice")).toHaveCount(0);
    });

    test("B-198: a week name with words after it counts that ISO week", async ({ win }) => {
        await openNote(win, "Reviews/2026-W41 Weekly.md");
        await expect(view(win).locator(".dashy-diag-error")).toHaveCount(0);
        await expect(view(win).locator(".dashy-stat-value")).toHaveText("1110");
    });

    test("B-193 and B-199: a list of fields sums per note, and where finds empty properties", async ({ win }) => {
        await openNote(win, "R21/Sums.md");
        const cards = view(win).locator(".dashy-stat");
        await expect(cards).toHaveCount(4);

        // 3 + 4 + 8; s4 holds neither field and is left out, not counted as 0.
        await expect(cards.nth(0).locator(".dashy-stat-value")).toHaveText("15");
        await expect(cards.nth(0).locator(".dashy-stat-label")).toHaveText("a + b");
        // 15 / 3, where counting s4 as 0 would give 3.75.
        await expect(cards.nth(1).locator(".dashy-stat-value")).toHaveText("5");
        // null, blank text and missing: s2, s3, s4.
        await expect(cards.nth(2).locator(".dashy-stat-value")).toHaveText("3");
        await expect(cards.nth(3).locator(".dashy-stat-value")).toHaveText("1");
        await expect(view(win).locator(".dashy-diag")).toHaveCount(0);
    });

    test("B-192: the skill row names the schema version", async ({ app, win }) => {
        const settings = await openSettings(app, win);
        await settings.getByRole("button", { name: "Skill file in this vault" }).click();
        await win.waitForTimeout(800);
        await expect(settings.getByText(`Installed, schema version ${SCHEMA_VERSION}. Nothing to do.`, { exact: true }))
            .toBeVisible();
        await closeSettings(win);
    });
});
