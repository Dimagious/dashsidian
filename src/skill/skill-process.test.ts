import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parse as parseYaml } from "yaml";
import { SKILL_MARKDOWN, COMBINED_MARKDOWN } from "./skill-content";
import schema from "../blocks/schema.json";
import type { BlockContext } from "../blocks/context";
import { renderStats } from "../blocks/stats";
import { renderProgress } from "../blocks/progress";
import { renderCountdown } from "../blocks/countdown";
import { renderToday } from "../blocks/today";
import { renderTiles } from "../blocks/tiles";
import { renderHeatmap } from "../blocks/heatmap";
import { renderChart } from "../blocks/chart";
import { asItems, isRecord, parseConfig, unknownKeys } from "../shared/parse";
import { mockContext, diary, host, diagnostics, texts, type FakeNote, type FakeVault } from "../test/vault";

/**
 * The process part of the skill (B-164) teaches by example: the recipes are
 * what an agent copies. Every YAML block in it is checked here three ways,
 * so the skill cannot teach a key the plugin does not have:
 *
 * - its keys, as written, are canonical keys of that block in the schema
 *   (a synonym would draw, but the skill tells agents not to write them);
 * - the parser and the key check the blocks run report nothing;
 * - the block itself, rendered against a vault shaped like the recipe's
 *   prose, draws without a single error or warning.
 */

// Monday 5 October 2026, noon.
const TODAY = new Date(2026, 9, 5, 12, 0, 0);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
});
afterEach(() => {
    vi.useRealTimers();
});

type Render = (ctx: BlockContext, source: string, el: HTMLElement) => void | (() => void);

const RENDERERS: Record<string, Render> = {
    stats: renderStats,
    progress: renderProgress,
    countdown: renderCountdown,
    today: renderToday,
    tiles: renderTiles,
    heatmap: renderHeatmap,
    chart: renderChart,
    "dashy-chart": renderChart,
};

interface BlockKeys {
    root?: Record<string, unknown>;
    item?: Record<string, unknown>;
}

const BLOCKS = schema.blocks as Record<string, BlockKeys>;

function keySets(lang: string): { root: string[]; item: string[] } {
    const block = BLOCKS[lang === "dashy-chart" ? "chart" : lang];
    if (!block) throw new Error(`no schema block for ${lang}`);
    return { root: Object.keys(block.root ?? {}), item: Object.keys(block.item ?? {}) };
}

/**
 * The list a block's `item` keys describe. The schema does not name it, and
 * `asItems` only knows `items:`, so the two blocks that call it otherwise
 * are named here.
 */
const LIST_KEY: Record<string, string> = { heatmap: "layers", chart: "series", "dashy-chart": "series" };

function entries(lang: string, config: Record<string, unknown>): Record<string, unknown>[] {
    const list = config[LIST_KEY[lang] ?? "items"];
    return Array.isArray(list) ? list.filter(isRecord) : [];
}

/** Every fenced block in a markdown text, as an agent would copy it. */
function fencedBlocks(markdown: string): { lang: string; source: string }[] {
    return Array.from(markdown.matchAll(/^```([\w-]+)\n([\s\S]*?)\n```$/gm), (m) => ({
        lang: m[1] ?? "",
        source: m[2] ?? "",
    }));
}

/**
 * Diary notes from Wednesday 1 July to today: 97 days, every habit the
 * recipes name. Gym is skipped on every day ending in 5 (index 5, 15, ...,
 * 95 = 4 October); deep work only on Saturdays; day 40 (Monday 10 August)
 * is a vacation day.
 */
const DIARY = diary("Diary", "2026-07-01", 97, (i) => ({
    gym: i % 10 !== 5,
    deep_work: i % 7 !== 3,
    read: i % 3 === 0,
    run_km: 4 + (i % 5),
    vacation: i === 40,
}));

const READING: FakeNote[] = [
    { path: "Reading/Dune.md", frontmatter: { date_read: "2026-02-11", pages: 600 } },
    { path: "Reading/Solaris.md", frontmatter: { date_read: "2026-08-30", pages: 220 } },
    { path: "Reading/Old.md", frontmatter: { date_read: "2025-05-01", pages: 300 } },
];

const VAULT: FakeVault = {
    notes: [
        ...DIARY,
        ...READING,
        { path: "People/Anna.md", frontmatter: { name: "Anna", birthday: "1991-11-02" } },
        { path: "Inbox/idea.md" },
        { path: "Projects/Garden.md" },
    ],
};

function render(lang: string, source: string): HTMLElement {
    const draw = RENDERERS[lang];
    if (!draw) throw new Error(`no renderer for ${lang}`);
    const el = host();
    const stop = draw(mockContext(VAULT), source, el);
    if (stop) stop();
    return el;
}

const RECIPES = fencedBlocks(SKILL_MARKDOWN);

describe("the skill's recipes only teach what the plugin draws (B-164)", () => {
    it("SKILL.md carries the recipes, one per site guide and the month calendar", () => {
        expect(RECIPES.map((r) => r.lang)).toEqual([
            "stats", "heatmap", "heatmap", "chart", "progress", "countdown", "today", "tiles",
        ]);
    });

    it("AGENTS.md and Copy markdown carry the same recipes, word for word", () => {
        expect(fencedBlocks(COMBINED_MARKDOWN).slice(0, RECIPES.length)).toEqual(RECIPES);
    });

    it("every key is written canonically, at the level the schema puts it", () => {
        for (const { lang, source } of RECIPES) {
            const { root, item } = keySets(lang);
            const raw: unknown = parseYaml(source);
            expect(isRecord(raw), `${lang}: a mapping`).toBe(true);
            if (!isRecord(raw)) continue;
            for (const key of Object.keys(raw)) expect(root, `${lang} root key ${key}`).toContain(key);
            for (const entry of entries(lang, raw)) {
                for (const key of Object.keys(entry)) expect(item, `${lang} item key ${key}`).toContain(key);
            }
        }
    });

    it("the parser and the key check the blocks run report nothing", () => {
        for (const { lang, source } of RECIPES) {
            const keys = keySets(lang);
            const parsed = parseConfig(source, keys);
            expect(parsed.diagnostics, lang).toEqual([]);
            expect(isRecord(parsed.value), lang).toBe(true);
            if (!isRecord(parsed.value)) continue;
            expect(unknownKeys(parsed.value, keys.root), lang).toEqual([]);
            for (const entry of entries(lang, parsed.value)) expect(unknownKeys(entry, keys.item), lang).toEqual([]);
        }
    });

    it("every recipe draws without an error or a warning", () => {
        for (const { lang, source } of RECIPES) {
            const el = render(lang, source);
            expect(diagnostics(el, "error"), `${lang}\n${source}`).toEqual([]);
            expect(diagnostics(el, "warning"), `${lang}\n${source}`).toEqual([]);
        }
    });

    it("the recipes draw the numbers their captions promise", () => {
        const [habits, , , , goal, birthday] = RECIPES;
        const stats = render("stats", habits?.source ?? "");
        expect(texts(stats, ".dashy-stat-label"))
            .toEqual(["Gym this month", "Days in a row", "Best streak", "Workdays in a row"]);
        expect(texts(stats, ".dashy-stat-value")).toEqual([
            // 1 to 5 October less the 4th
            "4",
            // today only: yesterday was skipped; one day, not "1 days" (B-169)
            "1 day",
            // nine days between two skipped ones
            "9 days",
            // all 69 weekdays since 1 July but the vacation day; Saturdays never break it
            "68 days",
        ]);

        const progress = render("progress", goal?.source ?? "");
        // Only the two books read in 2026 count towards this year's goal.
        expect(texts(progress, ".dashy-progress-label")).toEqual(["Books this year", "Pages this year"]);
        expect(texts(progress, ".dashy-progress-value")).toEqual(["2 / 24 8%", "820 / 8000 10%"]);

        const countdown = render("countdown", birthday?.source ?? "");
        expect(texts(countdown, ".dashy-countdown-value")).toEqual(["28", "258"]);
    });

    it("the same check catches a key the plugin does not have", () => {
        // Guards the guard: a recipe with a wrong key must fail the checks above.
        const bad = "source: Diary\nitems:\n  - { label: Gym, field: gym, agg: sum, perod: month }";
        const keys = keySets("stats");
        const parsed = parseConfig(bad, keys);
        const entry = isRecord(parsed.value) ? asItems(parsed.value)[0] ?? {} : {};
        expect(unknownKeys(entry, keys.item)).toHaveLength(1);
        expect(diagnostics(render("stats", bad), "warning").join("\n")).toContain("perod");
    });

    it("a field the vault does not have is a warning, so the fixture proves the fields exist", () => {
        const el = render("heatmap", "source: Diary\nfield: gyn");
        expect(diagnostics(el, "error").concat(diagnostics(el, "warning")).join("\n")).toContain("gyn");
    });
});

describe("every key and block the process names exists (B-164)", () => {
    const allKeys = new Set(
        Object.values(BLOCKS).flatMap((b) => [...Object.keys(b.root ?? {}), ...Object.keys(b.item ?? {})]),
    );

    it("an inline `key: value` names a key some block has", () => {
        const spans = Array.from(SKILL_MARKDOWN.matchAll(/`([a-z_]+): [^`\n]+`/g), (m) => m[1] ?? "");
        expect(spans.length).toBeGreaterThan(3);
        for (const key of spans) expect(allKeys, key).toContain(key);
    });

    it("every block the intent map points to is a schema block, and every schema block is on it", () => {
        const map = SKILL_MARKDOWN.split("## 2. Pick the block")[1]?.split("\n## ")[0] ?? "";
        const named = Array.from(map.matchAll(/^\|[^|\n]+\| `([\w-]+)`/gm), (m) => m[1] ?? "");
        expect(named.length).toBeGreaterThan(0);
        for (const block of named) expect(Object.keys(BLOCKS)).toContain(block);
        expect(new Set(named)).toEqual(new Set(Object.keys(BLOCKS)));
    });

    it("the keys the map names next to a block are keys of that block", () => {
        const map = SKILL_MARKDOWN.split("## 2. Pick the block")[1]?.split("\n## ")[0] ?? "";
        for (const row of map.matchAll(/^\|[^|\n]+\| `([\w-]+)`([^|\n]*)\|$/gm)) {
            const block = BLOCKS[row[1] ?? ""];
            const keys = Object.keys(block?.root ?? {}).concat(Object.keys(block?.item ?? {}));
            for (const span of (row[2] ?? "").matchAll(/`([a-z_]+)(?::[^`]*)?`/g)) {
                expect(keys, `${row[1]}: ${span[1]}`).toContain(span[1]);
            }
        }
    });
});
