import { describe, it, expect, vi, afterEach } from "vitest";
import { Platform } from "obsidian";
import { renderHeatmap } from "./heatmap";
import { formatValue } from "../core/stat";
import { mockContext, diary, host, texts, nodes, diagnostics } from "../test/vault";
import { DEFAULT_SETTINGS } from "../types";
import { setDateLocale, formatDayMedium } from "../adapters/datetime";
import { parseDateKey } from "../core/calendar";
import { setLocale } from "../i18n";

/**
 * The same locale-medium rendering a cell's tooltip itself uses (B-092), so
 * a lookup or an exact assertion here does not have to hand-roll the date
 * format the block already computes. `date` is the plain `YYYY-MM-DD` key
 * every fixture below is written in terms of.
 */
const medium = (date: string): string => formatDayMedium(parseDateKey(date));

// 2026 starts on a Thursday. With weeks starting on Sunday (the English
// locale) that means four pad cells before January 1st.
const ctx = mockContext({
    notes: [
        ...diary("Diary", "2026-01-01", 30, (i) => ({ sleep_score: 60 + i, steps: 5000 + i * 300 })),
        { path: "Diary/not-a-date.md", frontmatter: { sleep_score: 99 } },
        { path: "Diary/2026-02-05.md", frontmatter: { note: "no number here" } },
    ],
});

const map = (config: string, context = ctx) => {
    const el = host();
    renderHeatmap(context, config, el);
    return el;
};

/**
 * jsdom never lays anything out, so `scrollWidth` / `clientWidth` are 0 on
 * every element (see the comment on `settled` in heatmap.ts). These stand a
 * scroller's metrics up by hand instead of trusting layout, the same way a
 * real browser would report them once the grid is wider than its note.
 * Shared by the "more to see" and the "restores scroll across a redraw"
 * suites below, so it lives at module scope rather than in either one.
 */
function stubMetrics(scroller: HTMLElement, scrollLeft: number, clientWidth: number, scrollWidth: number): void {
    // `writable: true` on `scrollLeft`: production code assigns to it (the
    // deferred initial scroll), and a non-writable stub would throw the
    // moment it tried.
    Object.defineProperty(scroller, "scrollLeft", { value: scrollLeft, configurable: true, writable: true });
    Object.defineProperty(scroller, "clientWidth", { value: clientWidth, configurable: true });
    Object.defineProperty(scroller, "scrollWidth", { value: scrollWidth, configurable: true });
}

/** A `ResizeObserver` stand-in the test fires on demand instead of waiting for a real resize. */
class ManualResizeObserver implements ResizeObserver {
    static instances: ManualResizeObserver[] = [];
    constructor(private readonly callback: ResizeObserverCallback) {
        ManualResizeObserver.instances.push(this);
    }
    observe(): void { /* not exercised */ }
    unobserve(): void { /* not exercised */ }
    disconnect(): void { /* not exercised */ }
    /** Runs this observer's callback, the way a real resize would. */
    fire(): void {
        this.callback([], this);
    }
}

function withManualResizeObserver(run: () => void): void {
    const original = window.ResizeObserver;
    ManualResizeObserver.instances = [];
    window.ResizeObserver = ManualResizeObserver;
    try {
        run();
    } finally {
        window.ResizeObserver = original;
    }
}

describe("heatmap — the grid matches the calendar", () => {
    it("draws one grid for the one year present", () => {
        expect(nodes(map("source: Diary\nfield: sleep_score"), ".dashy-hm-grid")).toHaveLength(1);
    });

    it("pads the start of the year so the first row is the first weekday", () => {
        const el = map("source: Diary\nfield: sleep_score");
        // 1 January 2026 is a Thursday: four pads in a Sunday-first week.
        expect(nodes(el, ".dashy-hm-pad")).toHaveLength(4);
    });

    it("every day of the year up to today gets a cell", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const cells = nodes(el, ".dashy-hm-cell").length - nodes(el, ".dashy-hm-pad").length;
        const start = new Date(2026, 0, 1);
        const now = new Date();
        // Date-only on both ends: a time of day would round the difference up.
        const end = now.getFullYear() === 2026
            ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
            : new Date(2026, 11, 31);
        const expected = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
        expect(cells).toBe(expected);
    });

    it("only days with data are coloured; the rest stay bare", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const coloured = nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "");
        expect(coloured).toHaveLength(30);
    });

    it("a day with data links to its note and says what it holds", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const link = nodes(el, "a.dashy-hm-cell")[0];
        expect(link?.getAttribute("data-href")).toBe("Diary/2026-01-01.md");
        expect(link?.getAttribute("title")).toContain("sleep_score 60");
        expect(link?.getAttribute("aria-label")).toBe(link?.getAttribute("title"));
    });

    it("a day without data says so rather than staying silent", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const bare = nodes(el, "div.dashy-hm-cell").find((c) => !c.className.includes("pad"));
        expect(bare?.getAttribute("title")).toContain("no data");
    });

    it("`link: false` draws cells that are not links", () => {
        const el = map("source: Diary\nfield: sleep_score\nlink: false");
        expect(nodes(el, "a.dashy-hm-cell")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-cell").length).toBeGreaterThan(0);
    });

    it("weekday labels run Monday, Wednesday, Friday", () => {
        const el = map("source: Diary\nfield: sleep_score");
        expect(texts(el, ".dashy-hm-wd").filter(Boolean)).toHaveLength(3);
    });

    it("months are labelled from January", () => {
        const el = map("source: Diary\nfield: sleep_score");
        expect(texts(el, ".dashy-hm-mon")[0]).toBeTruthy();
        expect(nodes(el, ".dashy-hm-mon")[0]?.style.gridColumnStart).toBe("1");
    });
});

describe("heatmap — colours and bands", () => {
    it("bands become a legend, top band first and open above", () => {
        const el = map("source: Diary\nfield: sleep_score\nbands: [90, 80, 60]");
        expect(texts(el, ".dashy-hm-leg")).toEqual(["90+", "80–89", "60–79"]);
    });

    it("a higher value gets a stronger colour than a lower one", () => {
        const el = map("source: Diary\nfield: sleep_score\nbands: [80, 70, 60]");
        const alpha = (title: string) => {
            const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.includes(title));
            const colour = cell?.style.backgroundColor ?? "";
            // jsdom re-serialises a fully opaque rgba() as rgb(), so a missing
            // fourth component means alpha 1 rather than a parse failure.
            const parts = /\(([^)]*)\)/.exec(colour)?.[1]?.split(",") ?? [];
            return parts.length === 4 ? Number(parts[3]) : parts.length === 3 ? 1 : 0;
        };
        expect(alpha("sleep_score 85")).toBeGreaterThan(alpha("sleep_score 75"));
        expect(alpha("sleep_score 75")).toBeGreaterThan(alpha("sleep_score 65"));
    });

    it("a named colour is used, and nonsense falls back instead of failing", () => {
        const green = map("source: Diary\nfield: sleep_score\ncolor: green");
        const broken = map("source: Diary\nfield: sleep_score\ncolor: not-a-colour");
        const first = (el: HTMLElement) =>
            nodes(el, ".dashy-hm-cell").find((c) => c.style.backgroundColor !== "")?.style.backgroundColor;
        expect(first(green)).toContain("34, 197, 94");
        expect(first(broken)).toContain("59, 130, 246");
    });

    // B-116: without `bands`, the block now fits its own 4-band scale to the
    // grid's own min and max (`core/bands.ts#autoBands`) instead of the
    // single flat "has data" band B-097 pinned. The fixture's `sleep_score`
    // spans 60-89 across the month, quartered into
    // [81.75, 74.5, 67.25, 60] and labelled the same way an explicit
    // 4-threshold `bands:` would be.
    // Thresholds are rounded to the data's own precision (whole numbers,
    // for an integer field like `sleep_score`) before they become labels,
    // so "82+" is the actual boundary a cell is tested against, not a
    // display-only rounding of some other number underneath it.
    it("without bands, the legend is a 4-band scale fitted to this grid's own min and max", () => {
        const el = map("source: Diary\nfield: sleep_score");
        expect(texts(el, ".dashy-hm-leg")).toEqual(["82+", "75–81", "67–74", "60–66"]);
    });

    // The same fixture that used to prove every painted cell was identical
    // (B-097) now proves the opposite: a low value and a high value paint
    // visibly differently once the scale is fitted to the data.
    it("without bands, a low value and a high value now paint differently: the scale is fitted to the data", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const painted = nodes(el, ".dashy-hm-cell")
            .map((c) => c.style.backgroundColor)
            .filter((c) => c !== "");
        expect(painted.length).toBeGreaterThan(1);
        expect(new Set(painted).size).toBeGreaterThan(1);
    });

    it("without bands, a small integer spread gets one band per distinct value, not fractional cuts", () => {
        // mood is 5, 7 and 4 across three days: a span of 3, all integers,
        // so `autoBands` derives from the distinct values themselves
        // (7, 5, 4) rather than quarter-cutting a range that narrow — 7 and
        // 5 are two apart, so that pair still reads as a range ("5–6"), but
        // 5 and 4 are adjacent and collapse to the bare "4".
        const moodCtx = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { mood: 5 } },
                { path: "Diary/2026-01-02.md", frontmatter: { mood: 7 } },
                { path: "Diary/2026-01-03.md", frontmatter: { mood: 4 } },
            ],
        });
        const el = map("source: Diary\nfield: mood", moodCtx);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["7+", "5–6", "4"]);
    });

    it("without bands, two calendar years each fit their own scale, not one shared across both", () => {
        const twoYearCtx = mockContext({
            notes: [
                ...diary("Diary", "2025-01-01", 3, (i) => ({ score: 10 + i * 10 })), // 10, 20, 30
                ...diary("Diary", "2026-01-01", 3, (i) => ({ score: 100 + i * 100 })), // 100, 200, 300
            ],
        });
        const el = map("source: Diary\nfield: score", twoYearCtx);
        const grids = nodes(el, ".dashy-hm-wrap");
        expect(grids).toHaveLength(2);
        const legendOf = (grid: HTMLElement) =>
            Array.from(grid.querySelectorAll(".dashy-hm-leg")).map((n) => n.textContent ?? "");
        // Years are newest first (`yearsOf`): 2026's grid comes first. Its
        // scale (100-300) is an order of magnitude apart from 2025's
        // (10-30) — proof each grid fits its own range rather than one
        // scale being stretched to cover both.
        expect(legendOf(grids[0]!)).toEqual(["250+", "200–249", "150–199", "100–149"]);
        expect(legendOf(grids[1]!)).toEqual(["25+", "20–24", "15–19", "10–14"]);
    });
});

// B-138: a `field` list made only of checkboxes counts the ticked boxes per
// day and shades that count against every listed box ticked. It used to
// paint every day with at least one tick at full colour (B-116 kept it flat
// on purpose), so "how many habits today" could not be seen at all.
describe("heatmap — several checkbox fields count the ticked boxes (B-138)", () => {
    /** A cell's alpha: jsdom re-serialises a fully opaque rgba() as rgb(), so three components mean 1. */
    const alphaOn = (el: HTMLElement, date: string): number => {
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date)));
        const parts = /\(([^)]*)\)/.exec(cell?.style.backgroundColor ?? "")?.[1]?.split(",") ?? [];
        return parts.length === 4 ? Number(parts[3]) : parts.length === 3 ? 1 : 0;
    };
    const habitsCtx = mockContext({
        notes: [
            { path: "Diary/2026-01-01.md", frontmatter: { gym: true, yoga: false } }, // 1 of 2
            { path: "Diary/2026-01-02.md", frontmatter: { gym: true, yoga: true } }, // 2 of 2
            { path: "Diary/2026-01-03.md", frontmatter: { gym: false, yoga: false } }, // 0 of 2
        ],
    });

    it("one ticked of two paints paler than both ticked", () => {
        const el = map("source: Diary\nfield: [gym, yoga]", habitsCtx);
        expect(alphaOn(el, "2026-01-01")).toBe(0.72);
        expect(alphaOn(el, "2026-01-02")).toBe(1);
        expect(alphaOn(el, "2026-01-03")).toBe(0);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["2", "1"]);
    });

    it("the scale tops out at every listed field, even when no day reached it", () => {
        const oneEach = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { gym: true, yoga: false } },
                { path: "Diary/2026-01-02.md", frontmatter: { gym: false, yoga: true } },
            ],
        });
        const el = map("source: Diary\nfield: [gym, yoga]", oneEach);
        expect(alphaOn(el, "2026-01-01")).toBe(0.72);
        expect(alphaOn(el, "2026-01-02")).toBe(0.72);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["2", "1"]);
    });

    it("three fields: one, two and three ticked each get their own strength", () => {
        const three = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { gym: true, yoga: false, read: false } },
                { path: "Diary/2026-01-02.md", frontmatter: { gym: true, yoga: true, read: false } },
                { path: "Diary/2026-01-03.md", frontmatter: { gym: true, yoga: true, read: true } },
            ],
        });
        const el = map("source: Diary\nfield: [gym, yoga, read]", three);
        expect([alphaOn(el, "2026-01-01"), alphaOn(el, "2026-01-02"), alphaOn(el, "2026-01-03")])
            .toEqual([0.46, 0.72, 1]);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["3", "2", "1"]);
    });

    it("a field missing from a note counts as not ticked", () => {
        const missing = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { gym: true } },
                { path: "Diary/2026-01-02.md", frontmatter: { gym: true, yoga: true } },
            ],
        });
        const el = map("source: Diary\nfield: [gym, yoga]", missing);
        expect(alphaOn(el, "2026-01-01")).toBe(0.72);
        expect(alphaOn(el, "2026-01-02")).toBe(1);
    });

    it("a single checkbox field is unchanged: every ticked day at full colour, one flat legend row", () => {
        const el = map("source: Diary\nfield: gym", habitsCtx);
        expect(alphaOn(el, "2026-01-01")).toBe(1);
        expect(alphaOn(el, "2026-01-02")).toBe(1);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["has data"]);
        expect(texts(el, ".dashy-hm-title")[0]).not.toContain("average");
    });

    it("explicit bands still win, and score the ticked count", () => {
        const el = map("source: Diary\nfield: [gym, yoga]\nbands: [{min: 2, alpha: 0.9, label: Both}, {min: 1, alpha: 0.3, label: One}]", habitsCtx);
        expect(alphaOn(el, "2026-01-01")).toBe(0.3);
        expect(alphaOn(el, "2026-01-02")).toBe(0.9);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["Both", "One"]);
    });

    it("the tooltip says the count and the caption averages it", () => {
        const el = map("source: Diary\nfield: [gym, yoga]", habitsCtx);
        const title = (date: string): string | null | undefined =>
            nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date)))?.getAttribute("title");
        expect(title("2026-01-01")).toBe(`${medium("2026-01-01")}: gym, yoga 1 (2026-01-01)`);
        expect(title("2026-01-02")).toBe(`${medium("2026-01-02")}: gym, yoga 2 (2026-01-02)`);
        // (1 + 2 + 0) / 3 recorded days; 2 of them have at least one tick.
        expect(texts(el, ".dashy-hm-title")[0]).toMatch(/^2026, gym, yoga: average 1, 2 of \d+ days$/);
    });

    it("per_day avg shades the share of ticked boxes", () => {
        const el = map("source: Diary\nfield: [gym, yoga]\nper_day: avg", habitsCtx);
        expect(alphaOn(el, "2026-01-01")).toBe(0.72);
        expect(alphaOn(el, "2026-01-02")).toBe(1);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["1", "0.5"]);
    });

    it("per_day avg counts a field missing from a note as unticked, not as a smaller list", () => {
        const missing = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { gym: true } },
                { path: "Diary/2026-01-02.md", frontmatter: { gym: true, yoga: true } },
            ],
        });
        const el = map("source: Diary\nfield: [gym, yoga]\nper_day: avg", missing);
        expect(alphaOn(el, "2026-01-01")).toBe(0.72);
        expect(alphaOn(el, "2026-01-02")).toBe(1);
        const title = nodes(el, ".dashy-hm-cell")
            .find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")))?.getAttribute("title");
        expect(title).toBe(`${medium("2026-01-01")}: gym, yoga 0.5 (2026-01-01)`);
    });

    it("five fields: four ticked is paler than all five", () => {
        const five = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { a: true, b: true, c: true, d: true, e: false } },
                { path: "Diary/2026-01-02.md", frontmatter: { a: true, b: true, c: true, d: true, e: true } },
            ],
        });
        const el = map("source: Diary\nfield: [a, b, c, d, e]", five);
        expect(alphaOn(el, "2026-01-01")).toBe(0.72);
        expect(alphaOn(el, "2026-01-02")).toBe(1);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["5", "3–4", "2", "1"]);
    });

    it("per_day max stays flat: any ticked box makes the day", () => {
        const el = map("source: Diary\nfield: [gym, yoga]\nper_day: max", habitsCtx);
        expect(alphaOn(el, "2026-01-01")).toBe(1);
        expect(alphaOn(el, "2026-01-02")).toBe(1);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["has data"]);
    });

    it("a checkbox mixed with a number keeps the old behaviour: a ticks-only day paints full", () => {
        const mixed = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { gym: true } },
                { path: "Diary/2026-01-02.md", frontmatter: { steps: 100 } },
                { path: "Diary/2026-01-03.md", frontmatter: { steps: 300 } },
            ],
        });
        const el = map("source: Diary\nfield: [gym, steps]", mixed);
        expect(alphaOn(el, "2026-01-01")).toBe(1);
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ heatmap: "steps" holds a number in "Diary/2026-01-02.md", so the checkboxes in this list are not counted per day: a day with only ticks paints at full colour.',
        ]);
        expect(alphaOn(el, "2026-01-02")).toBeLessThan(alphaOn(el, "2026-01-03"));
        // fitted to the numbers alone, the tick never stretching it
        expect(texts(el, ".dashy-hm-leg")).toEqual(["250+", "200–249", "150–199", "100–149"]);
    });
});

describe("heatmap — zero and negative values (B-097)", () => {
    const moodCtx = mockContext({
        notes: [
            { path: "Diary/2026-01-01.md", frontmatter: { mood: 0 } },
            { path: "Diary/2026-01-02.md", frontmatter: { mood: -3 } },
            { path: "Diary/2026-01-03.md", frontmatter: { mood: 5 } },
        ],
    });

    it("a numeric 0 is painted, not treated as an empty day", () => {
        const el = map("source: Diary\nfield: mood", moodCtx);
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.includes("mood 0"));
        expect(cell?.style.backgroundColor).toBeTruthy();
    });

    it("a negative value is painted too, not an error and not an empty day", () => {
        const el = map("source: Diary\nfield: mood", moodCtx);
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.includes("mood -3"));
        expect(cell?.style.backgroundColor).toBeTruthy();
    });

    it("with explicit bands, a negative value still falls into the bottom band rather than erroring", () => {
        const el = map("source: Diary\nfield: mood\nbands: [10, 5, 0]", moodCtx);
        const zeroCell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.includes("mood 0"));
        const negCell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.includes("mood -3"));
        expect(negCell?.style.backgroundColor).toBeTruthy();
        // Both 0 and -3 sit below every threshold, so both fall into the
        // same bottom band and paint identically.
        expect(negCell?.style.backgroundColor).toBe(zeroCell?.style.backgroundColor);
    });

    it("three identical values (min == max in the data) all paint, the same colour, no NaN", () => {
        // Nothing here divides by the data's own range, so a data set with no
        // spread at all is not a special case: no NaN, no crash, just the one
        // flat colour every other value would get too.
        const flatCtx = mockContext({ notes: diary("Diary", "2026-01-01", 3, () => ({ score: 7 })) });
        const el = map("source: Diary\nfield: score", flatCtx);
        const painted = nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "");
        expect(painted).toHaveLength(3);
        for (const c of painted) expect(c.style.backgroundColor).not.toContain("NaN");
        expect(new Set(painted.map((c) => c.style.backgroundColor)).size).toBe(1);
    });
});

describe("heatmap — the caption", () => {
    it("says the year, the field, the average and how many days have data", () => {
        const caption = texts(map("source: Diary\nfield: sleep_score"), ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("2026");
        expect(caption).toContain("sleep_score");
        // 60 through 89 averages 74.5, and the caption says so. It used to
        // round to a whole number while a stat card over the same data printed
        // the decimal, and both were presented as facts.
        expect(caption).toContain("average 74.5");
        expect(caption).toContain("30 of");
    });

    it("a custom title replaces it and survives the synonym table", () => {
        // `title` is a synonym of `label` elsewhere; here it is the block's own key.
        const el = map("source: Diary\nfield: sleep_score\ntitle: My sleep");
        expect(texts(el, ".dashy-hm-title")).toEqual(["My sleep"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    // A year that spans two calendars draws two grids. Under one custom title
    // they are indistinguishable, and the second one — whose data sits off to
    // the right — reads as an empty copy of the first. Reported as a duplicate
    // by the person who wrote the block.
    it("two years under a custom title each say which year they are", () => {
        const twoYears = mockContext({
            notes: [
                ...diary("Diary", "2025-11-01", 20, (i) => ({ sleep_score: 70 + i })),
                ...diary("Diary", "2026-01-01", 20, (i) => ({ sleep_score: 60 + i })),
            ],
        });
        const el = map("source: Diary\nfield: sleep_score\ntitle: My sleep", twoYears);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(2);
        expect(texts(el, ".dashy-hm-title")).toEqual(["My sleep (2026)", "My sleep (2025)"]);
    });

    it("an item-only synonym at the root is reported as written (B-125)", () => {
        // `name` means `label`, which heatmap has only on a layer.
        const el = map("source: Diary\nfield: sleep_score\nname: My sleep");
        expect(diagnostics(el, "warning")).toEqual(['⚠️ heatmap: Unknown key "name", ignored.']);
    });

    it("root synonyms whose key heatmap has still apply", () => {
        const el = map("folder: Diary\nproperty: sleep_score\ntitle: My sleep");
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-hm-title")).toEqual(["My sleep"]);
    });

    it("a band's label written as title still labels the legend", () => {
        const el = map("source: Diary\nfield: sleep_score\nbands: [{ min: 75, title: Good }, { min: 70, name: Fair }]");
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["Good", "Fair"]);
    });

    it("one year leaves the custom title alone", () => {
        const el = map("source: Diary\nfield: sleep_score\ntitle: My sleep");
        expect(texts(el, ".dashy-hm-title")).toEqual(["My sleep"]);
    });
});

describe("heatmap — boolean checkbox fields", () => {
    // A ticked Obsidian checkbox property (`gym: true`) is the most requested
    // habit-tracker shape: a daily note with nothing but a checkbox should
    // still paint a heatmap.
    const gymCtx = mockContext({
        // day 0 (Jan 1) ticked, day 1 (Jan 2) unticked, day 2 (Jan 3) ticked.
        notes: diary("Diary", "2026-01-01", 3, (i) => ({ gym: i !== 1 })),
    });

    it("a ticked day is painted like a value of 1", () => {
        const el = map("source: Diary\nfield: gym", gymCtx);
        const jan1 = nodes(el, "a.dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(jan1?.getAttribute("title")).toContain("gym 1");
        expect(jan1?.style.backgroundColor).not.toBe("");
    });

    it("an unticked day is not painted and reads exactly like a day without data", () => {
        const el = map("source: Diary\nfield: gym", gymCtx);
        const jan2 = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-02")));
        expect(jan2?.tagName).toBe("DIV");
        expect(jan2?.style.backgroundColor).toBe("");
        expect(jan2?.getAttribute("title")).toContain("no data");
    });

    it("only the ticked days count toward the total painted", () => {
        const el = map("source: Diary\nfield: gym", gymCtx);
        const coloured = nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "");
        expect(coloured).toHaveLength(2);
    });

    it("a year that is entirely booleans drops the average from the caption", () => {
        const caption = texts(map("source: Diary\nfield: gym", gymCtx), ".dashy-hm-title")[0] ?? "";
        expect(caption).not.toContain("average");
        expect(caption).toContain("gym");
        expect(caption).toContain("2 of");
    });

    it("a year mixing numbers and booleans keeps the average", () => {
        const mixedCtx = mockContext({
            notes: [
                ...diary("Diary", "2026-01-01", 1, () => ({ steps: true })),
                ...diary("Diary", "2026-01-02", 1, () => ({ steps: 500 })),
            ],
        });
        const caption = texts(map("source: Diary\nfield: steps", mixedCtx), ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("average");
    });

    // The caption average has to agree with what a `stats` `avg` card would
    // show over the same field: both sum every recognised day and divide by
    // how many there are, a `false` counted as 0. Counting only the painted
    // days used to inflate this to (4 + 1) / 2 = 2.5.
    it("the caption average counts a false day as 0, the same as a stats avg would", () => {
        const days3Ctx = mockContext({
            notes: [
                ...diary("Diary", "2026-01-01", 1, () => ({ steps: 4 })),
                ...diary("Diary", "2026-01-02", 1, () => ({ steps: true })),
                ...diary("Diary", "2026-01-03", 1, () => ({ steps: false })),
            ],
        });
        const caption = texts(map("source: Diary\nfield: steps", days3Ctx), ".dashy-hm-title")[0] ?? "";
        const expected = formatValue((4 + 1 + 0) / 3);
        expect(caption).toContain(`average ${expected}`);
        // The false day still is not painted, so only 2 of 3 count as "present".
        expect(caption).toContain("2 of");
    });

    it("a field that is false every day still draws the year, not a no-data error", () => {
        const allFalseCtx = mockContext({
            notes: diary("Diary", "2026-01-01", 3, () => ({ gym: false })),
        });
        const el = map("source: Diary\nfield: gym", allFalseCtx);
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("0 of");
        expect(nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "")).toHaveLength(0);
    });

    // Two notes named for the same day disagreeing (a ticked one in one
    // folder, an unticked one in another) used to paint or not depending on
    // which the vault happened to list last. `streak` never had this problem:
    // it drops `false` notes before deduping date names, so any note that
    // survives keeps the day, in either order. The heatmap now agrees with it.
    it.each([
        ["ticked note listed first", [
            { path: "Personal/2026-01-02.md", frontmatter: { gym: true } },
            { path: "Work/2026-01-02.md", frontmatter: { gym: false } },
        ]],
        ["ticked note listed last", [
            { path: "Work/2026-01-02.md", frontmatter: { gym: false } },
            { path: "Personal/2026-01-02.md", frontmatter: { gym: true } },
        ]],
    ])("a ticked twin always wins over an unticked one, regardless of order (%s)", (_label, notes) => {
        const el = map("field: gym", mockContext({ notes }));
        const link = nodes(el, "a.dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-02")));
        expect(link?.getAttribute("data-href")).toBe("Personal/2026-01-02.md");
        expect(link?.getAttribute("title")).toContain("gym 1");
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("1 of");
    });
});

describe("heatmap — dated names beyond an exact YYYY-MM-DD, and date_field (B-081)", () => {
    it("a name with a day-of-week suffix is painted, same as an exact one", () => {
        const notes = [{ path: "Diary/2026-01-05 Monday.md", frontmatter: { sleep_score: 88 } }];
        const el = map("field: sleep_score", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-05")));
        expect(cell?.style.backgroundColor).not.toBe("");
        expect(cell?.getAttribute("title")).toContain("sleep_score 88");
    });

    it("two numeric notes for the same day sum into one cell", () => {
        const notes = [
            { path: "Diary/2026-01-10.md", frontmatter: { steps: 5000 } },
            { path: "Diary/2026-01-10 evening.md", frontmatter: { steps: 3000 } },
        ];
        const el = map("field: steps", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-10")));
        expect(cell?.getAttribute("title")).toContain("steps 8000");
    });

    it("a ticked and an unticked note for the same day are painted, even with a suffixed name", () => {
        const notes = [
            { path: "Diary/2026-01-15.md", frontmatter: { gym: false } },
            { path: "Diary/2026-01-15 evening.md", frontmatter: { gym: true } },
        ];
        const el = map("field: gym", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-15")));
        expect(cell?.style.backgroundColor).not.toBe("");
        // The tick makes the day painted; the value shown is still the sum
        // (1 for the tick, 0 for the miss).
        expect(cell?.getAttribute("title")).toContain("gym 1");
    });

    it.each([
        ["A-folder listed first", [
            { path: "A-folder/2026-01-11.md", frontmatter: { steps: 100 } },
            { path: "B-folder/2026-01-11.md", frontmatter: { steps: 200 } },
        ]],
        ["A-folder listed last", [
            { path: "B-folder/2026-01-11.md", frontmatter: { steps: 200 } },
            { path: "A-folder/2026-01-11.md", frontmatter: { steps: 100 } },
        ]],
    ])("the link target is deterministic regardless of input order, even with two painted contributors (%s)", (_label, notes) => {
        const el = map("field: steps", mockContext({ notes }));
        const link = nodes(el, "a.dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-11")));
        expect(link?.getAttribute("data-href")).toBe("A-folder/2026-01-11.md");
        expect(link?.getAttribute("title")).toContain("steps 300");
    });

    it("date_field reads a frontmatter property instead of the note name", () => {
        const notes = [
            { path: "Books/rich-dad.md", frontmatter: { finished: "2026-01-12", rating: 5 } },
            { path: "Books/poor-dad.md", frontmatter: { finished: "2026-01-12", rating: 3 } },
        ];
        const el = map("field: rating\ndate_field: finished", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-12")));
        expect(cell?.getAttribute("title")).toContain("rating 8");
    });

    it("date_field is unknown-key-free and appears in the diagnostics list only when misspelled", () => {
        const notes = [{ path: "Books/a.md", frontmatter: { finished: "2026-01-12", rating: 5 } }];
        const el = map("field: rating\ndate_field: finished", mockContext({ notes }));
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    // A name with an invalid calendar date is not asserted directly against
    // the grid here: `layoutYear`/`eachDay` only ever generate real calendar
    // days to look marks up by, so a fabricated key like "2026-02-30" could
    // never be found in the grid regardless of whether `resolveNoteDate`
    // validated it — the padding would pass even with that check removed.
    // The resolver's own validation is pinned where it can actually fail,
    // in `core/note-date.test.ts`, and again at the block layer in
    // `stats.test.ts` ("a note named for an impossible date...", "a real
    // leap day name counts..."), where a `streak`/`count` reading really
    // does change if an invalid name is wrongly accepted.

    it("same-day notes sum before the caption averages, not the last one read (B-081 round 2)", () => {
        const notes = [
            { path: "Diary/2026-01-13.md", frontmatter: { steps: 1000 } },
            { path: "Diary/2026-01-13 evening.md", frontmatter: { steps: 3000 } }, // day total 4000
            { path: "Diary/2026-01-14.md", frontmatter: { steps: 2000 } }, // day total 2000
        ];
        const el = map("field: steps", mockContext({ notes }));
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        // The caption always averaged over days (one Map entry per day, both
        // before and after B-081); what changed is what a day's own value
        // is: the sum of its notes, 4000 for the 13th, rather than whichever
        // one note happened to be read last. Average over the two days:
        // (4000 + 2000) / 2 = 3000, not (1000 + 3000 + 2000) / 3, which is
        // what averaging over notes instead of days would give, and not
        // (3000 + 2000) / 2 = 2500 either, which is what "last write wins"
        // on the 13th would give.
        expect(caption).toContain(`average ${formatValue((4000 + 2000) / 2)}`);
        expect(caption).toContain("2 of");
    });
});

describe("heatmap — edges", () => {
    it("no field is an error naming what is missing", () => {
        const el = map("source: Diary");
        expect(diagnostics(el, "error")[0]).toContain("field");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a field nothing carries is an error, not an empty grid", () => {
        const el = map("source: Diary\nfield: nowhere");
        expect(diagnostics(el, "error")[0]).toContain("nowhere");
        expect(diagnostics(el, "error")[0]).toContain("Check the name");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    // B-112: a field that is real but holds text, like Garmin's
    // `running: "10 km · 51min"`, used to draw the exact same "check
    // `source`" message as a field nobody ever wrote — pointing a reader
    // with the right `source` at the wrong fix.
    it("a field that holds only text is a different error than a missing field", () => {
        const el = map("source: Diary\nfield: note");
        const message = diagnostics(el, "error")[0] ?? "";
        expect(message).toContain("note");
        expect(message).toContain("text");
        expect(message).not.toContain("Check the name");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a mix of one text note and one numeric note is not an error at all", () => {
        const mixed = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { running: "10 km" } },
                { path: "Diary/2026-01-02.md", frontmatter: { running: 5 } },
            ],
        });
        const el = map("source: Diary\nfield: running", mixed);
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
    });

    // The residual case: the field itself is fine (classifyField says "ok"),
    // but no note carrying it also has a resolvable date, so there is
    // nothing to paint. `Template.md` is not named for a day and has no
    // `date_field`, so it never resolves to a date at all. This must not be
    // reported as the field missing or being text — neither is true here.
    it("a field that is fine but no note carrying it has a resolvable date keeps the original message", () => {
        const el = map(
            "source: Diary\nfield: steps",
            mockContext({ notes: [{ path: "Diary/Template.md", frontmatter: { steps: 5 } }] }),
        );
        const message = diagnostics(el, "error")[0] ?? "";
        expect(message).toContain("resolvable date");
        expect(message).not.toContain("Check the name");
        expect(message).not.toContain("holds text");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("notes not named as dates are ignored, not counted", () => {
        const caption = texts(map("source: Diary\nfield: sleep_score"), ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("30 of");
    });

    it("an unknown key warns with a suggestion and still draws", () => {
        const el = map("source: Diary\nfield: sleep_score\nfeild: x");
        expect(diagnostics(el, "warning")[0]).toContain("field");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
    });

    it("two years give two grids, newest first", () => {
        const twoYears = mockContext({
            notes: [
                ...diary("Diary", "2025-03-01", 5, () => ({ v: 1 })),
                ...diary("Diary", "2026-03-01", 5, () => ({ v: 1 })),
            ],
        });
        const el = map("source: Diary\nfield: v", twoYears);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(2);
        expect(texts(el, ".dashy-hm-title")[0]).toContain("2026");
        expect(texts(el, ".dashy-hm-title")[1]).toContain("2025");
    });

    it("a list where a set of fields was expected is reported", () => {
        const el = map("- source: Diary");
        expect(diagnostics(el, "error")).toHaveLength(1);
    });
});

describe("heatmap — nested frontmatter paths (B-100)", () => {
    const nested = mockContext({
        notes: [
            { path: "Diary/2026-01-01.md", frontmatter: { health: { sleep: 92 } } },
            { path: "Diary/2026-01-02.md", frontmatter: { health: { sleep: 60 } } },
        ],
    });

    it("renders from a nested field without a false missing-field diagnostic", () => {
        const el = map("source: Diary\nfield: health.sleep", nested);
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        const coloured = nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "");
        expect(coloured).toHaveLength(2);
    });

    it("names the dotted path when truly missing", () => {
        const el = map("source: Diary\nfield: health.steps", nested);
        expect(diagnostics(el, "error")[0]).toContain("health.steps");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a path that hits a non-object midway resolves to nothing, same as a missing field", () => {
        const flat = mockContext({
            notes: [{ path: "Diary/2026-01-01.md", frontmatter: { health: 92 } }],
        });
        const el = map("source: Diary\nfield: health.sleep", flat);
        const message = diagnostics(el, "error")[0] ?? "";
        expect(message).toContain("health.sleep");
        expect(message).toContain("Check the name");
    });
});

describe("heatmap — several fields in one heatmap (B-094)", () => {
    it("a list field renders one grid; per_day defaults to sum, same as before", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { mood_am: 5, mood_pm: 7 } }];
        const el = map("source: Diary\nfield: [mood_am, mood_pm]", mockContext({ notes }));
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toContain("12");
    });

    it("per_day: avg collapses a 5 and a 7 into 6, the day's whole mood in one cell", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { mood_am: 5, mood_pm: 7 } }];
        const el = map("source: Diary\nfield: [mood_am, mood_pm]\nper_day: avg", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toContain("6");
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("per_day: max keeps the higher of the day's readings", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { mood_am: 5, mood_pm: 7 } }];
        const el = map("source: Diary\nfield: [mood_am, mood_pm]\nper_day: max", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toContain("7");
    });

    it("an invalid per_day warns naming the options and falls back to sum", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { steps: 100 } }];
        const el = map("source: Diary\nfield: steps\nper_day: median", mockContext({ notes }));
        expect(diagnostics(el, "warning")[0]).toContain("median");
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toContain("100");
    });

    it("an empty field list is an error, not an empty grid", () => {
        const el = map("source: Diary\nfield: []", ctx);
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(diagnostics(el, "error")[0]).toContain("empty list");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a non-string entry in the field list is an error naming it", () => {
        const el = map("source: Diary\nfield: [mood_am, 5]", ctx);
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(diagnostics(el, "error")[0]).toContain("5");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("one misspelled field among several warns naming it, without hiding the rest of the data", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { mood_am: 5 } }];
        const el = map("source: Diary\nfield: [mood_am, mood_pn]", mockContext({ notes }));
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(diagnostics(el, "warning")[0]).toContain("mood_pn");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
    });

    it("every field missing from the selection errors, naming each one", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { unrelated: 1 } }];
        const el = map("source: Diary\nfield: [mood_am, mood_pm]", mockContext({ notes }));
        const errors = diagnostics(el, "error");
        expect(errors).toHaveLength(2);
        expect(errors.some((m) => m.includes("mood_am"))).toBe(true);
        expect(errors.some((m) => m.includes("mood_pm"))).toBe(true);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a dotted path inside a list works", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { health: { sleep: 80 }, mood_pm: 4 } }];
        const el = map("source: Diary\nfield: [health.sleep, mood_pm]", mockContext({ notes }));
        expect(diagnostics(el, "error")).toHaveLength(0);
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toContain("84");
    });

    it("the caption and the cell tooltip show the field names joined with a comma", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { mood_am: 5, mood_pm: 7 } }];
        const el = map("source: Diary\nfield: [mood_am, mood_pm]", mockContext({ notes }));
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("mood_am, mood_pm");
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toContain("mood_am, mood_pm");
    });

    // (5 + 7 + 8) / 3 = 6.666666666666667 unrounded: the tooltip is a
    // `title`/`aria-label`, not a card, and must not carry either the raw
    // float or `formatValue`'s narrow no-break space digit grouping.
    it("per_day: avg over three contributions rounds the tooltip to one decimal", () => {
        const notes = [
            { path: "Diary/2026-01-01.md", frontmatter: { mood_am: 5, mood_pm: 7 } },
            { path: "Diary/2026-01-01 evening.md", frontmatter: { mood_am: 8 } },
        ];
        const el = map("source: Diary\nfield: [mood_am, mood_pm]\nper_day: avg", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        // Two notes contributed (the morning/evening entries), so the
        // tooltip names how many rather than either one's name.
        expect(cell?.getAttribute("title")).toBe(`${medium("2026-01-01")}: mood_am, mood_pm 6.7 (2 notes)`);
    });

    it("a field of the wrong shape (not a string or a list) is an error naming the value", () => {
        const el = map("source: Diary\nfield: 5", ctx);
        const errors = diagnostics(el, "error");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("5");
        expect(errors[0]).not.toContain("No `field` given");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("field simply absent still reads the plain \"no field given\" error", () => {
        const el = map("source: Diary", ctx);
        expect(diagnostics(el, "error")[0]).toContain("No `field` given");
    });

    it("a duplicate entry in the field list does not count twice", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { steps: 100 } }];
        const el = map("source: Diary\nfield: [steps, steps]", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toContain("100");
        expect(cell?.getAttribute("title")).not.toContain("200");
    });
});

describe("heatmap — several activities, each its own colour (B-096)", () => {
    // gym is ticked the 1st, unticked the 2nd; run is unticked the 1st,
    // ticked the 2nd and the 3rd, where gym is not even mentioned.
    const layersCtx = mockContext({
        notes: [
            { path: "Diary/2026-01-01.md", frontmatter: { gym: true, run: false } },
            { path: "Diary/2026-01-02.md", frontmatter: { gym: false, run: true } },
            { path: "Diary/2026-01-03.md", frontmatter: { run: true } },
        ],
    });
    const cellFor = (el: HTMLElement, date: string) =>
        nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date)));
    const layersConfig = "source: Diary\nlayers:\n"
        + "  - { field: gym, color: blue }\n"
        + "  - { field: run, color: green, label: Running }";

    it("two layers render with their own explicit colours", () => {
        const el = map(layersConfig, layersCtx);
        expect(diagnostics(el, "error")).toHaveLength(0);
        // 1 Jan: only gym is painted, so its (first, blue) layer colours the cell.
        expect(cellFor(el, "2026-01-01")?.style.backgroundColor).toContain("59, 130, 246");
        // 2 Jan: gym is unticked, run is ticked — the second layer colours it.
        expect(cellFor(el, "2026-01-02")?.style.backgroundColor).toContain("34, 197, 94");
    });

    it("an overlapping day takes the first painted layer's colour, and the tooltip lists every layer", () => {
        const el = map(layersConfig, layersCtx);
        const jan1 = cellFor(el, "2026-01-01");
        // gym (painted, 1) wins the cell over run (unpainted, 0), but the
        // tooltip still says what both layers held that day, in list order.
        expect(jan1?.style.backgroundColor).toContain("59, 130, 246");
        // A single note (2026-01-01.md) holds both layers' values that day.
        expect(jan1?.getAttribute("title")).toBe(`${medium("2026-01-01")}: gym 1, Running 0 (2026-01-01)`);
    });

    it("a day only the second layer has anything for still gets a mark and the right colour", () => {
        const el = map(layersConfig, layersCtx);
        // 3 Jan: `gym` is not in the note at all, only `run` is.
        const jan3 = cellFor(el, "2026-01-03");
        expect(jan3?.style.backgroundColor).toContain("34, 197, 94");
        expect(jan3?.getAttribute("title")).toBe(`${medium("2026-01-03")}: Running 1 (2026-01-03)`);
    });

    it("a layer without a colour gets the next free palette colour, skipping ones already claimed", () => {
        const el = map(
            "source: Diary\nlayers:\n  - { field: gym, color: green }\n  - { field: run }",
            layersCtx,
        );
        // green is taken by `gym`, so `run` (implicit) gets blue, the first
        // colour in the palette that is still free.
        expect(cellFor(el, "2026-01-03")?.style.backgroundColor).toContain("59, 130, 246");
    });

    it("the legend lists every layer, swatch and label, and nothing else without `bands`", () => {
        const el = map(layersConfig, layersCtx);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["gym", "Running"]);
    });

    it("with `bands` also set, the legend shows the layers row and the bands row", () => {
        const el = map(`${layersConfig}\nbands: [90, 60]`, layersCtx);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["gym", "Running", "90+", "60–89"]);
    });

    it("the bands legend paints neutral gray in layers mode, not a layer's own colour", () => {
        const el = map(`${layersConfig}\nbands: [90, 60]`, layersCtx);
        const swatches = nodes(el, ".dashy-hm-swatch");
        // The first two swatches are the layer rows, in their own colours...
        expect(swatches[0]?.style.backgroundColor).toContain("59, 130, 246"); // gym: blue
        expect(swatches[1]?.style.backgroundColor).toContain("34, 197, 94"); // run: green
        // ...and the rest are the bands row, neither colour, PALETTE.gray instead.
        expect(swatches[2]?.style.backgroundColor).toContain("156, 163, 175");
        expect(swatches[3]?.style.backgroundColor).toContain("156, 163, 175");
    });

    it("without `layers`, the bands legend still paints in the field's own colour", () => {
        const el = map("source: Diary\nfield: sleep_score\ncolor: purple\nbands: [90, 60]", ctx);
        const swatches = nodes(el, ".dashy-hm-swatch");
        for (const s of swatches) expect(s.style.backgroundColor).toContain("139, 92, 246"); // purple
    });

    it("a layered cell links to the winning layer's note, including when the first layer is false-only", () => {
        const el = map(layersConfig, layersCtx);
        // 1 Jan: gym (first, painted) wins and links to its own note.
        expect(cellFor(el, "2026-01-01")?.getAttribute("data-href")).toBe("Diary/2026-01-01.md");
        // 2 Jan: gym is false-only, so run (second, painted) wins and links to ITS note.
        expect(cellFor(el, "2026-01-02")?.getAttribute("data-href")).toBe("Diary/2026-01-02.md");
    });

    it("a non-string `label` warns naming its position and the value, and falls back to the field name", () => {
        const el = map("source: Diary\nlayers:\n  - { field: gym, label: 5 }", layersCtx);
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(diagnostics(el, "warning").some((m) => m.includes("Layer 1") && m.includes("5"))).toBe(true);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["gym"]);
    });

    it("the caption counts a day painted by any layer, and drops the average", () => {
        const el = map(layersConfig, layersCtx);
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        expect(caption).not.toContain("average");
        expect(caption).toContain("gym, Running");
        // All three days have some layer painted (1 Jan by gym, 2 and 3 Jan by run).
        expect(caption).toContain("3 of");
    });

    it("`layers` together with `field` errors and renders nothing else", () => {
        const el = map("source: Diary\nfield: gym\nlayers:\n  - { field: run }", layersCtx);
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(diagnostics(el, "error")[0]).toContain("layers");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a top-level `color` together with `layers` warns that it is ignored, but still renders", () => {
        const el = map("source: Diary\ncolor: purple\nlayers:\n  - { field: gym }", layersCtx);
        expect(diagnostics(el, "warning").some((m) => m.includes("ignored"))).toBe(true);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
    });

    it("`layers` given as something other than a list is an error", () => {
        const el = map("source: Diary\nlayers: gym", layersCtx);
        expect(diagnostics(el, "error")[0]).toContain("gym");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("an empty `layers` list is an error", () => {
        const el = map("source: Diary\nlayers: []", layersCtx);
        expect(diagnostics(el, "error")[0]).toContain("empty");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a `layers` entry that is not a map errors naming its position", () => {
        const el = map("source: Diary\nlayers: [5]", layersCtx);
        expect(diagnostics(el, "error")[0]).toContain("Layer 1");
        expect(diagnostics(el, "error")[0]).toContain("5");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a `layers` entry without `field` errors naming its position", () => {
        const el = map("source: Diary\nlayers:\n  - { color: blue }", layersCtx);
        expect(diagnostics(el, "error")[0]).toContain("Layer 1");
        expect(diagnostics(el, "error")[0]).toContain("No `field` given");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a `layers` entry with an invalid `field` errors naming its position and the value", () => {
        const el = map("source: Diary\nlayers:\n  - { field: 5 }", layersCtx);
        expect(diagnostics(el, "error")[0]).toContain("Layer 1");
        expect(diagnostics(el, "error")[0]).toContain("5");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("an unknown key inside a layer warns, the same as anywhere else", () => {
        const el = map("source: Diary\nlayers:\n  - { field: gym, bogus: 1 }", layersCtx);
        expect(diagnostics(el, "warning").some((m) => m.includes("bogus"))).toBe(true);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
    });

    it("a layer whose field never contributes warns naming it, without breaking the rest", () => {
        const el = map(
            "source: Diary\nlayers:\n  - { field: gym }\n  - { field: nonexistent }",
            layersCtx,
        );
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(diagnostics(el, "warning").some((m) => m.includes("nonexistent"))).toBe(true);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
    });

    it("nothing resolving in any layer errors per field, as a plain `field` list does", () => {
        const el = map(
            "source: Diary\nlayers:\n  - { field: nope1 }\n  - { field: nope2 }",
            layersCtx,
        );
        const errors = diagnostics(el, "error");
        expect(errors).toHaveLength(2);
        expect(errors.some((m) => m.includes("nope1"))).toBe(true);
        expect(errors.some((m) => m.includes("nope2"))).toBe(true);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a layer's own `field` takes a dotted path and a list, the same as the block's own `field`", () => {
        const notes = [
            { path: "Diary/2026-01-01.md", frontmatter: { health: { sleep: 80 }, gym: true, run: false } },
        ];
        const el = map(
            "source: Diary\nlayers:\n  - { field: health.sleep }\n  - { field: [gym, run] }",
            mockContext({ notes }),
        );
        expect(diagnostics(el, "error")).toHaveLength(0);
        const jan1 = cellFor(el, "2026-01-01");
        // The first layer (health.sleep, 80) is the one that is painted and
        // numeric, so it colours the cell and its value reaches the tooltip.
        expect(jan1?.getAttribute("title")).toContain("health.sleep 80");
    });

    /** Same alpha-reading trick the plain-`bands` colour tests use above. */
    const alphaOf = (el: HTMLElement, title: string): number => {
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.includes(title));
        const colour = cell?.style.backgroundColor ?? "";
        const parts = /\(([^)]*)\)/.exec(colour)?.[1]?.split(",") ?? [];
        return parts.length === 4 ? Number(parts[3]) : parts.length === 3 ? 1 : 0;
    };

    // B-116, checker round 1: a checkbox layer mixed with a numeric one used
    // to let a ticked day's value (always exactly 1) become the fitted
    // scale's own minimum, painting solid gym at the weakest alpha instead
    // of full strength. The scale must come from `steps` alone, and gym
    // stays solid regardless of it.
    describe("without bands, a checkbox layer mixed with a numeric one (checker round 1)", () => {
        const mixedCtx = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { gym: true } }, // boolean winner
                { path: "Diary/2026-01-02.md", frontmatter: { steps: 2000 } }, // numeric winner, low
                { path: "Diary/2026-01-03.md", frontmatter: { steps: 8000 } }, // numeric winner, high
            ],
        });
        const mixedConfig = "source: Diary\nlayers:\n  - { field: gym, color: blue }\n  - { field: steps, color: green }";

        it("the checkbox winner always paints at full alpha, never scored against the numeric scale", () => {
            const el = map(mixedConfig, mixedCtx);
            expect(alphaOf(el, "gym 1")).toBe(1);
        });

        it("the numeric winners are scaled against each other, low below high", () => {
            const el = map(mixedConfig, mixedCtx);
            expect(alphaOf(el, "steps 8000")).toBe(1);
            expect(alphaOf(el, "steps 2000")).toBeLessThan(1);
        });

        it("the legend's bands row is fitted from steps alone, not stretched down to gym's 1", () => {
            const el = map(mixedConfig, mixedCtx);
            // 2000..8000 quartered: 6500, 5000, 3500, 2000 — nowhere near 1,
            // which a scale including gym's value would have had to reach
            // down to as its own minimum.
            expect(texts(el, ".dashy-hm-leg")).toEqual([
                "gym", "steps", "6500+", "5000–6499", "3500–4999", "2000–3499",
            ]);
        });
    });

    // B-116, checker round 1: two purely numeric layers still get a fitted
    // scale without `bands:`, same as a plain field would, and its legend
    // row stays neutral grey (B-096) rather than either layer's own colour.
    it("without bands, two numeric layers still get a fitted bands row, painted neutral grey", () => {
        const numericCtx = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { run: 5 } },
                { path: "Diary/2026-01-02.md", frontmatter: { swim: 10 } },
            ],
        });
        const el = map(
            "source: Diary\nlayers:\n  - { field: run, color: blue }\n  - { field: swim, color: green }",
            numericCtx,
        );
        expect(texts(el, ".dashy-hm-leg")).toEqual(["run", "swim", "9+", "8", "6–7", "5"]);
        const swatches = nodes(el, ".dashy-hm-swatch");
        // The first two swatches are the layer rows in their own colours;
        // the 4 bands-row swatches after them are neutral grey instead.
        for (const swatch of swatches.slice(2)) {
            expect(swatch.style.backgroundColor).toContain("156, 163, 175");
        }
    });
});

describe("heatmap — special days, skip_field (B-095)", () => {
    const specialCtx = mockContext({
        notes: [
            { path: "Diary/2026-01-01.md", frontmatter: { mood: 5 } },
            { path: "Diary/2026-01-02.md", frontmatter: { mood: 7, vacation: true } }, // painted and special
            { path: "Diary/2026-01-03.md", frontmatter: { vacation: true } }, // special, nothing painted
            { path: "Diary/2026-01-04.md", frontmatter: { mood: 4, vacation: false } }, // not special
        ],
    });
    const cellFor = (el: HTMLElement, date: string) =>
        nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date)));

    it("hatches a special day that also has a painted value, keeping its colour", () => {
        const el = map("source: Diary\nfield: mood\nskip_field: vacation", specialCtx);
        const jan2 = cellFor(el, "2026-01-02");
        expect(jan2?.classList.contains("is-skipped")).toBe(true);
        expect(jan2?.style.backgroundColor).not.toBe("");
    });

    it("hatches a special day with nothing painted too", () => {
        const el = map("source: Diary\nfield: mood\nskip_field: vacation", specialCtx);
        const jan3 = cellFor(el, "2026-01-03");
        expect(jan3?.classList.contains("is-skipped")).toBe(true);
        expect(jan3?.style.backgroundColor).toBe("");
    });

    it("does not hatch an ordinary day, painted or not", () => {
        const el = map("source: Diary\nfield: mood\nskip_field: vacation", specialCtx);
        expect(cellFor(el, "2026-01-01")?.classList.contains("is-skipped")).toBe(false);
        // vacation: false marks the day as ordinary, not special.
        expect(cellFor(el, "2026-01-04")?.classList.contains("is-skipped")).toBe(false);
    });

    it("the tooltip for a painted special day appends the day-off wording", () => {
        const el = map("source: Diary\nfield: mood\nskip_field: vacation", specialCtx);
        expect(cellFor(el, "2026-01-02")?.getAttribute("title"))
            .toBe(`${medium("2026-01-02")}: mood 7 (2026-01-02), day off`);
    });

    it("the tooltip for an empty special day says only that it is a day off", () => {
        const el = map("source: Diary\nfield: mood\nskip_field: vacation", specialCtx);
        expect(cellFor(el, "2026-01-03")?.getAttribute("title")).toBe(`${medium("2026-01-03")}: day off`);
    });

    it("the legend gains a day-off swatch only once a special day is actually drawn", () => {
        const withoutSkip = map("source: Diary\nfield: mood", specialCtx);
        expect(texts(withoutSkip, ".dashy-hm-leg")).not.toContain("Day off");

        const withSkip = map("source: Diary\nfield: mood\nskip_field: vacation", specialCtx);
        expect(texts(withSkip, ".dashy-hm-leg")).toContain("Day off");
    });

    it("the legend stays without the swatch when skip_field is set but nothing is ever special", () => {
        const el = map("source: Diary\nfield: mood\nskip_field: nonexistent", specialCtx);
        expect(texts(el, ".dashy-hm-leg")).not.toContain("Day off");
    });

    it("the caption's day count is unaffected by skip_field: a special day with no value is still not present", () => {
        const withoutSkip = map("source: Diary\nfield: mood", specialCtx);
        const withSkip = map("source: Diary\nfield: mood\nskip_field: vacation", specialCtx);
        const painted = (el: HTMLElement) =>
            nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "").length;
        expect(painted(withSkip)).toBe(painted(withoutSkip));
        expect(texts(withoutSkip, ".dashy-hm-title")[0]).toBe(texts(withSkip, ".dashy-hm-title")[0]);
    });

    it("an invalid skip_field warns naming the value and draws nothing hatched", () => {
        const el = map("source: Diary\nfield: mood\nskip_field: 5", specialCtx);
        expect(diagnostics(el, "warning").some((m) => m.includes("skip_field") && m.includes("5"))).toBe(true);
        expect(nodes(el, ".is-skipped")).toHaveLength(0);
    });

    it("works together with layers: a special day hatches regardless of which layer painted it", () => {
        const layeredCtx = mockContext({
            notes: [
                { path: "Diary/2026-01-01.md", frontmatter: { gym: true, vacation: true } },
                { path: "Diary/2026-01-02.md", frontmatter: { run: true } },
            ],
        });
        const el = map(
            "source: Diary\nskip_field: vacation\nlayers:\n  - { field: gym, color: blue }\n  - { field: run, color: green }",
            layeredCtx,
        );
        const cellFor2 = (date: string) =>
            nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date)));
        expect(cellFor2("2026-01-01")?.classList.contains("is-skipped")).toBe(true);
        expect(cellFor2("2026-01-02")?.classList.contains("is-skipped")).toBe(false);
        expect(texts(el, ".dashy-hm-leg")).toContain("Day off");
    });
});

describe("heatmap — never a year later than today (B-113)", () => {
    const TODAY = new Date(2026, 8, 24); // 24 September 2026

    afterEach(() => vi.useRealTimers());

    it("a note dated next year draws only the current year, not a second empty grid", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            { path: "Diary/2026-09-01.md", frontmatter: { steps: 100 } },
            { path: "Diary/2026-09-02.md", frontmatter: { steps: 200 } },
            { path: "Diary/2027-01-05.md", frontmatter: { steps: 300 } }, // next year
        ];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("2026");
        expect(caption).not.toContain("2027");
        // Only the two 2026 notes count; the future one is nowhere in it.
        expect(caption).toContain("2 of");
    });

    // F5: with a custom `title`, the year suffix only appears once there is
    // more than one grid to tell apart (`severalYears`, see the "two years
    // under a custom title" suite above). Computing that flag from the raw,
    // unfiltered years (which still include 2027) would append "(2026)"
    // here even though only one grid is actually drawn — this pins that it
    // is computed from what is actually drawn.
    it("a note dated next year leaves a custom title exactly alone, no year suffix", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            { path: "Diary/2026-09-01.md", frontmatter: { steps: 100 } },
            { path: "Diary/2027-01-05.md", frontmatter: { steps: 300 } }, // next year
        ];
        const el = map("source: Diary\nfield: steps\ntitle: Steps", mockContext({ notes }));
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        expect(texts(el, ".dashy-hm-title")).toEqual(["Steps"]);
    });

    it("a note dated next year plus current data still draws only the current year", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            ...diary("Diary", "2026-09-01", 3, () => ({ steps: 100 })),
            { path: "Diary/2027-06-01.md", frontmatter: { steps: 999 } },
        ];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        expect(texts(el, ".dashy-hm-title")[0]).toContain("2026");
        expect(texts(el, ".dashy-hm-title")[0]).toContain("3 of");
    });

    it("every dated note in the future still draws the current year, empty, not an error", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [{ path: "Diary/2027-01-05.md", frontmatter: { steps: 300 } }];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("2026");
        expect(caption).toContain("0 of");
    });

    // B-082: with a start-of-day hour set, a real-date note for 1 January
    // read just after midnight is still "the future" relative to the
    // effective today (31 December of the previous year), the same as a
    // note dated for next calendar year is.
    it("startDayHour 4 at 1 January 02:00: a 1 January note is future, only the previous year draws", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 1, 2, 0)); // 1 January 2026, 02:00
        const settings = { ...DEFAULT_SETTINGS, startDayHour: 4 };
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { steps: 500 } }];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }, settings));
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        // Effective today is 31 December 2025: the note's own date, 1
        // January 2026, is next year relative to it and draws nowhere.
        expect(caption).toContain("2025");
        expect(caption).not.toContain("2026");
        expect(caption).toContain("0 of");
    });

    it("a past year is unaffected: it still draws whole, same as before", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2024-01-01", 5, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        expect(texts(el, ".dashy-hm-title")[0]).toContain("2024");
    });
});

/**
 * jsdom never lays anything out, so `scrollWidth` / `clientWidth` are 0 on
 * every element (see the comment on `settled` in heatmap.ts). These tests
 * stand the scroller's metrics up by hand instead of trusting layout, the
 * same way a real browser would report them once the grid is wider than its
 * note. `.dashy-hm-scroll` is the scroller, not `.dashy-hm-wrap`: the title
 * and the weekday column live outside it and never move or fade (the fade
 * is a CSS mask keyed off the classes asserted here, not a separate
 * element, so there is nothing further to assert about it in a DOM that
 * never lays out).
 *
 * `updateScrollState` is driven by a `ResizeObserver`, not a timer, so
 * these tests install a fake one and fire it by hand rather than waiting on
 * anything — no fake timers needed here, unlike an earlier version of this
 * mechanism.
 */
describe("heatmap — the scroller says when there is more to see", () => {
    it("a grid that fits (jsdom's default 0/0/0) carries neither class", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const scroller = nodes(el, ".dashy-hm-scroll")[0]!;
        expect(scroller.classList.contains("can-scroll-left")).toBe(false);
        expect(scroller.classList.contains("can-scroll-right")).toBe(false);
    });

    it("scrolls to the end once the observer reports a real, wider-than-the-note width", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;
            expect(scroller.scrollLeft).toBe(0);

            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();

            expect(scroller.scrollLeft).toBe(600);
            expect(scroller.classList.contains("can-scroll-left")).toBe(true);
            expect(scroller.classList.contains("can-scroll-right")).toBe(false);
        });
    });

    it("stops re-asserting the end once the reader has actually scrolled", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(600);

            // A wheel event on the scroller is the reader taking over.
            scroller.dispatchEvent(new Event("wheel"));

            // A later resize with a real width no longer forces the end, or
            // a reader who scrolled back to January would get yanked
            // forward again on every later resize.
            stubMetrics(scroller, 50, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(50);
        });
    });

    /**
     * B-104: while a pane widens (a sidebar collapse animation), the browser
     * clamps `scrollLeft` down frame by frame as `scrollWidth - clientWidth`
     * shrinks under it, each clamped frame firing its own `scroll` event.
     * Before the fix, every such event looked like the reader dragging the
     * grid (it does not match the one-time `lastAssignedScrollLeft`), so the
     * very first frame flipped `settled` permanently and the grid stopped
     * following the end for good, even though the reader never touched it.
     */
    it("clamped scroll events from a widening pane do not settle the grid; it still follows the end", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            // The initial, real layout: pinned to the end, still unsettled.
            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(600);
            expect(scroller.dataset.settled).not.toBe("true");

            // Frame 1 of the pane widening: clientWidth grows 300 -> 400, the
            // grid itself stays 600 wide, so the browser clamps scrollLeft to
            // the new max (600 - 400 = 200) on its own, before this block's
            // own resize observer has fired again.
            stubMetrics(scroller, 200, 400, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.dataset.settled).not.toBe("true");

            // Frame 2: the pane keeps widening, 400 -> 450, clamped again to
            // the new max (600 - 450 = 150).
            stubMetrics(scroller, 150, 450, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.dataset.settled).not.toBe("true");

            // The animation settles and the grid itself later grows (a new
            // day added): still unsettled, so the next resize still pins to
            // the new end instead of leaving the grid stuck where the
            // animation happened to clamp it.
            stubMetrics(scroller, 150, 450, 700);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(700);
        });
    });

    it("a real reader drag (scrollLeft not at the end) still settles even while unsettled", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.dataset.settled).not.toBe("true");

            // A genuine drag to the middle: nowhere near scrollWidth - clientWidth (300).
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.dataset.settled).toBe("true");

            // Settled: a later resize no longer yanks it back to the end.
            stubMetrics(scroller, 150, 320, 620);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(150);
        });
    });

    it("an unstyled reading (scrollWidth equal to clientWidth) neither scrolls nor settles", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            // The plugin's own stylesheet has not applied yet: the browser
            // default `overflow-x: visible` reports the same number for
            // both, wider than the note or not.
            stubMetrics(scroller, 0, 452, 452);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(0);
            expect(scroller.classList.contains("can-scroll-left")).toBe(false);
            expect(scroller.classList.contains("can-scroll-right")).toBe(false);

            // The stylesheet lands: still not settled, so the real, styled
            // reading still gets its turn.
            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(600);
        });
    });

    it("a scroll event recomputes the classes from the scroller's current metrics", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            // Settle first (a real drag), so the positions below are not
            // overwritten by the deferred initial scroll mid-test.
            scroller.dispatchEvent(new Event("wheel"));

            // At the left edge: only the right side has more.
            stubMetrics(scroller, 0, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.classList.contains("can-scroll-left")).toBe(false);
            expect(scroller.classList.contains("can-scroll-right")).toBe(true);

            // Scrolled into the middle: both sides have more.
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.classList.contains("can-scroll-left")).toBe(true);
            expect(scroller.classList.contains("can-scroll-right")).toBe(true);

            // Scrolled to the right edge: only the left side has more.
            stubMetrics(scroller, 300, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.classList.contains("can-scroll-left")).toBe(true);
            expect(scroller.classList.contains("can-scroll-right")).toBe(false);
        });
    });

    it("the weekday column and the title sit outside the scroller", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const scroller = nodes(el, ".dashy-hm-scroll")[0]!;
        expect(scroller.querySelector(".dashy-hm-side")).toBeNull();
        expect(scroller.querySelector(".dashy-hm-title")).toBeNull();
    });

    it("does not leak a ResizeObserver across redraws of the same element", () => {
        class FakeResizeObserver implements ResizeObserver {
            static observeCount = 0;
            static disconnectCount = 0;
            constructor(private readonly callback: ResizeObserverCallback) {}
            observe(): void { FakeResizeObserver.observeCount += 1; }
            unobserve(): void { /* not exercised */ }
            disconnect(): void { FakeResizeObserver.disconnectCount += 1; }
        }

        const original = window.ResizeObserver;
        window.ResizeObserver = FakeResizeObserver;
        try {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(FakeResizeObserver.observeCount).toBe(1);
            expect(FakeResizeObserver.disconnectCount).toBe(0);

            // A redraw on the same element (a vault event, a settings change)
            // must disconnect the observer it made last time before making a
            // new one, or every redraw adds one more that never stops firing.
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(FakeResizeObserver.disconnectCount).toBe(1);
            expect(FakeResizeObserver.observeCount).toBe(2);

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(FakeResizeObserver.disconnectCount).toBe(2);
            expect(FakeResizeObserver.observeCount).toBe(3);
        } finally {
            window.ResizeObserver = original;
        }
    });

    it("the returned disposer disconnects the observer, and is idempotent", () => {
        class FakeResizeObserver implements ResizeObserver {
            static observeCount = 0;
            static disconnectCount = 0;
            constructor(private readonly callback: ResizeObserverCallback) {}
            observe(): void { FakeResizeObserver.observeCount += 1; }
            unobserve(): void { /* not exercised */ }
            disconnect(): void { FakeResizeObserver.disconnectCount += 1; }
        }

        const original = window.ResizeObserver;
        window.ResizeObserver = FakeResizeObserver;
        try {
            const el = host();
            // This is what `DashyBlock.onunload` (src/app/plugin.ts) calls
            // when a block is removed from the note entirely, not redrawn:
            // a redraw disconnects its own predecessor already, but nothing
            // else ever runs this cleanup for the very last draw.
            const dispose = renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(typeof dispose).toBe("function");
            expect(FakeResizeObserver.disconnectCount).toBe(0);

            dispose?.();
            expect(FakeResizeObserver.disconnectCount).toBe(1);

            // A stray double-unload finds nothing left to disconnect rather
            // than double-counting or throwing.
            dispose?.();
            expect(FakeResizeObserver.disconnectCount).toBe(1);
        } finally {
            window.ResizeObserver = original;
        }
    });

    it("without a ResizeObserver the block still draws and returns no disposer", () => {
        const original = window.ResizeObserver;
        Reflect.deleteProperty(window, "ResizeObserver");
        try {
            const el = host();
            const dispose = renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(dispose).toBeUndefined();
            expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        } finally {
            window.ResizeObserver = original;
        }
    });
});

/**
 * Every vault event redraws the block (`clearBlock` then a fresh
 * `drawYear`), which used to jump a grid the reader had scrolled by hand
 * straight back to the end. These render onto the *same* element twice
 * (`host()` once, `renderHeatmap` called on it again), the way `DashyBlock`
 * actually redraws, rather than through the `map` helper, which always
 * hands back a fresh one.
 */
describe("heatmap — restores the reader's scroll position across a redraw (B-089)", () => {
    it("a settled, mid-position scroll survives a redraw once the new grid reports a real width", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            // The reader drags the grid to the middle by hand: a wheel
            // settles it, and the scroll event that follows reports where
            // it landed.
            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.scrollLeft).toBe(150);

            // A vault event redraws the block onto the same element.
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;
            // Nothing assigned yet: the fresh element has not reported a
            // real width, same as any first draw.
            expect(redrawn.scrollLeft).toBe(0);

            stubMetrics(redrawn, 0, 300, 600);
            ManualResizeObserver.instances.at(-1)!.fire();

            expect(redrawn.scrollLeft).toBe(150);
            expect(redrawn.classList.contains("can-scroll-left")).toBe(true);
            expect(redrawn.classList.contains("can-scroll-right")).toBe(true);
            // The restore has to mark itself as actually achieved
            // (`dataset.settled`, written only by `settle()`), not merely
            // leave the seeded `pending*` snapshot sitting there unclaimed:
            // a chain of further redraws depends on this scroller's own
            // state being the one `captureScrollState` trusts next time.
            expect(redrawn.dataset.settled).toBe("true");
        });
    });

    it("a reader settled at the right edge still pins to the new grid's own end after a redraw", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 600, 300, 600); // dragged all the way to the right edge
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.classList.contains("can-scroll-right")).toBe(false);

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;

            // A wider grid than before (more days now have data).
            stubMetrics(redrawn, 0, 300, 900);
            ManualResizeObserver.instances.at(-1)!.fire();

            expect(redrawn.scrollLeft).toBe(900);
            expect(redrawn.classList.contains("can-scroll-right")).toBe(false);
        });
    });

    it("no reader interaction before a redraw still pins the new grid to its end", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            // Only the initial auto-pin fires; the reader never touches it.
            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(600);

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;

            stubMetrics(redrawn, 0, 300, 700);
            ManualResizeObserver.instances.at(-1)!.fire();

            expect(redrawn.scrollLeft).toBe(700);
        });
    });

    it("two years each restore their own scroll position independently", () => {
        const twoYears = mockContext({
            notes: [
                ...diary("Diary", "2025-03-01", 5, () => ({ v: 1 })),
                ...diary("Diary", "2026-03-01", 5, () => ({ v: 1 })),
            ],
        });
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(twoYears, "source: Diary\nfield: v", el);
            // Newest first: index 0 is 2026, index 1 is 2025.
            const [scroll2026, scroll2025] = nodes(el, ".dashy-hm-scroll");
            expect(scroll2026?.dataset.gridKey).toBe("2026");
            expect(scroll2025?.dataset.gridKey).toBe("2025");

            scroll2026!.dispatchEvent(new Event("wheel"));
            stubMetrics(scroll2026!, 100, 300, 600);
            scroll2026!.dispatchEvent(new Event("scroll"));

            scroll2025!.dispatchEvent(new Event("wheel"));
            stubMetrics(scroll2025!, 400, 300, 900);
            scroll2025!.dispatchEvent(new Event("scroll"));

            renderHeatmap(twoYears, "source: Diary\nfield: v", el);
            const [redrawn2026, redrawn2025] = nodes(el, ".dashy-hm-scroll");
            expect(redrawn2026?.dataset.gridKey).toBe("2026");
            expect(redrawn2025?.dataset.gridKey).toBe("2025");

            stubMetrics(redrawn2026!, 0, 300, 600);
            stubMetrics(redrawn2025!, 0, 300, 900);
            for (const instance of ManualResizeObserver.instances.slice(-2)) instance.fire();

            expect(redrawn2026!.scrollLeft).toBe(100);
            expect(redrawn2025!.scrollLeft).toBe(400);
        });
    });

    it("an unstyled first tick after a redraw does not consume the restore", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;

            // The unstyled reading, scrollWidth === clientWidth: the same
            // trap a first-ever draw hits before styles.css applies. Must
            // not spend the pending restore on it.
            stubMetrics(redrawn, 0, 452, 452);
            ManualResizeObserver.instances.at(-1)!.fire();
            expect(redrawn.scrollLeft).toBe(0);

            // The real, styled reading arrives on a later resize; the
            // restore is still waiting for it.
            stubMetrics(redrawn, 0, 300, 600);
            ManualResizeObserver.instances.at(-1)!.fire();
            expect(redrawn.scrollLeft).toBe(150);
        });
    });

    it("redrawing twice without further interaction keeps the restored position", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const first = nodes(el, ".dashy-hm-scroll")[0]!;
            stubMetrics(first, 0, 300, 600);
            ManualResizeObserver.instances.at(-1)!.fire();
            expect(first.scrollLeft).toBe(150);

            // A second redraw, with no interaction from the reader in between.
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const second = nodes(el, ".dashy-hm-scroll")[0]!;
            stubMetrics(second, 0, 300, 600);
            ManualResizeObserver.instances.at(-1)!.fire();
            expect(second.scrollLeft).toBe(150);
        });
    });

    // Obsidian lays an inactive tab's pane out at `display: none`, where
    // `scrollLeft`/`clientWidth`/`scrollWidth` all read 0. `captureScrollState`
    // must not ask the live DOM for these at redraw time: read live, 0/0/0
    // looks exactly like "sitting at the end, nothing to scroll to" and the
    // real position (150) would be thrown away in favour of the pin-to-end
    // default (600) the very next time the reader switched back.
    it("a hidden pane's 0/0/0 metrics at redraw time do not lose the settled position", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.scrollLeft).toBe(150);

            // The tab goes inactive right before the vault event that
            // triggers the redraw.
            stubMetrics(scroller, 0, 0, 0);

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;

            stubMetrics(redrawn, 0, 300, 600);
            ManualResizeObserver.instances.at(-1)!.fire();

            expect(redrawn.scrollLeft).toBe(150);
        });
    });

    // The new scroller's own `dataset` is seeded from the incoming snapshot
    // the moment it is created (in `drawYear`), not only once its own
    // `ResizeObserver` first ticks. Without that, a second vault event
    // landing before the first one ever measures anything would find
    // nothing to capture (`dataset.settled` never written by an element
    // that has done nothing yet) and silently fall back to the default.
    it("a second redraw before any real-width tick still carries the pending restore forward", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));

            // First redraw: its own scroller never gets a `ResizeObserver`
            // tick before the next vault event arrives.
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);

            // Second redraw, still with no tick and no reader interaction
            // anywhere in between.
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;

            stubMetrics(redrawn, 0, 300, 600);
            ManualResizeObserver.instances.at(-1)!.fire();

            expect(redrawn.scrollLeft).toBe(150);
        });
    });

    it("a hidden redraw for a reader who was at the end still pins to the new end", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 600, 300, 600); // dragged to the right edge
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.classList.contains("can-scroll-right")).toBe(false);

            // Hidden at redraw time, same as the settled-in-the-middle case above.
            stubMetrics(scroller, 0, 0, 0);

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;

            stubMetrics(redrawn, 0, 300, 900); // a wider grid than before
            ManualResizeObserver.instances.at(-1)!.fire();

            expect(redrawn.scrollLeft).toBe(900);
            expect(redrawn.classList.contains("can-scroll-right")).toBe(false);
        });
    });

    it("a reader at the end stays pinned to it across two hidden redraws in a row", () => {
        // The pane stays hidden through both redraws, so the second one has
        // only the pending snapshot to carry forward. If it dropped the
        // "at the end" half of it, the stale 300 would be restored into the
        // grown grid, a few cells short of the newest day.
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 300, 300, 600); // the right edge of a 600 grid
            scroller.dispatchEvent(new Event("scroll"));
            stubMetrics(scroller, 0, 0, 0);

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            stubMetrics(nodes(el, ".dashy-hm-scroll")[0]!, 0, 0, 0);
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;

            stubMetrics(redrawn, 0, 300, 900);
            ManualResizeObserver.instances.at(-1)!.fire();

            expect(redrawn.scrollLeft).toBe(900);
            expect(redrawn.classList.contains("can-scroll-right")).toBe(false);
        });
    });

    // The pre-existing pin-to-end contract, guarded here so a change that
    // makes the default branch call `settle()` (which would freeze it at
    // the first tick's end instead of tracking a still-growing grid) fails
    // a test rather than only showing up as a stale scroll position in a
    // real vault.
    it("keeps re-asserting a moving end on every real-width tick until the reader interacts, even across a redraw", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(600);

            // A later resize, still with no interaction: the end moved, and
            // this scroller is still following it rather than having frozen
            // at the first tick's position.
            stubMetrics(scroller, 0, 300, 900);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(900);

            // A redraw with no interaction ever having happened is still
            // "default": nothing was ever settled to restore.
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;
            stubMetrics(redrawn, 0, 300, 700);
            ManualResizeObserver.instances.at(-1)!.fire();
            expect(redrawn.scrollLeft).toBe(700);
        });
    });

    // A resize can change what `atEnd` should be with no `scroll` event at
    // all: the pane itself narrows or widens under a `scrollLeft` the
    // reader never touched. Recording the position only from `settle()`
    // and `onScroll` left this stale, so a redraw right after such a resize
    // would restore against a snapshot no longer true when it was taken.
    it("a resize tick alone (no scroll event) keeps the recorded position current", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            // The reader settles right at the end.
            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 300, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.classList.contains("can-scroll-right")).toBe(false);

            // The pane narrows: a resize tick only, no scroll event, and
            // `scrollLeft` itself does not move. There is now more to the
            // right at the same position.
            stubMetrics(scroller, 300, 200, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.classList.contains("can-scroll-right")).toBe(true);

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;
            stubMetrics(redrawn, 0, 200, 600);
            ManualResizeObserver.instances.at(-1)!.fire();

            // Restored to the position it actually still was at (300), not
            // pinned to the end (600) off a stale "atEnd: true" snapshot.
            expect(redrawn.scrollLeft).toBe(300);
        });
    });

    // The resize-tick recording above must not undo the hidden-pane guard
    // `recordPosition` already has: a 0x0 tick (the pane going inactive)
    // still has to leave whatever was last genuinely recorded alone.
    it("a hidden 0x0 resize tick after settling leaves the recorded position untouched", () => {
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));

            // The tab goes inactive: a resize tick fires with 0x0 metrics.
            stubMetrics(scroller, 0, 0, 0);
            ManualResizeObserver.instances[0]!.fire();

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;
            stubMetrics(redrawn, 0, 300, 600);
            ManualResizeObserver.instances.at(-1)!.fire();

            expect(redrawn.scrollLeft).toBe(150);
        });
    });
});

/**
 * `range` (B-093): one grid over a window ending today — `week`, `month`,
 * `year`, or a rolling `Nd` — instead of the default grid per calendar year.
 * Deterministic throughout: `today` is fixed rather than read from the wall
 * clock, the way `vi.setSystemTime` already does for the B-113 suite above.
 */
describe("heatmap — range draws one grid over a window (B-093)", () => {
    // 2026-09-28 is a Monday. 2026-01-01 is a Thursday (see calendar.test.ts),
    // and 364 days being exactly 52 weeks, 2025-09-29 lands on a Monday too.
    const TODAY = new Date(2026, 8, 28);

    afterEach(() => {
        vi.useRealTimers();
        setDateLocale(null);
    });

    const cellCount = (el: HTMLElement) =>
        nodes(el, ".dashy-hm-cell").length - nodes(el, ".dashy-hm-pad").length;

    it("range: 365d draws one grid crossing the year boundary, with the right day count and month labels", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        // Covers the whole window (2025-09-29 .. 2026-09-28) plus months
        // before and after it, so the future and past tails have something
        // to wrongly draw if the window were not actually enforced.
        const notes = diary("Diary", "2025-01-01", 700, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps\nrange: 365d", mockContext({ notes }));

        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        expect(cellCount(el)).toBe(365);

        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        // No year prefix: a range grid is always the only one, so there is
        // nothing for a year number to tell it apart from.
        expect(caption).not.toMatch(/^\d{4}/);
        expect(caption).toContain("365 of 365 days");

        // The window is 2025-09-29 .. 2026-09-28: September's own synthetic
        // start-month label collides with October's real one (both would
        // land in column 1) and is dropped (checker round 1, B-093), so the
        // grid opens on "Oct 2025" instead. From there every month is a
        // plain abbreviation except January, which — like the grid's own
        // first label — says which year once the window spans more than
        // one: "Jan 2026". The following September is not disambiguated
        // (there is no other September in this particular window to
        // confuse it with), so it stays a bare "Sep".
        expect(texts(el, ".dashy-hm-mon")).toEqual([
            "Oct 2025", "Nov", "Dec", "Jan 2026", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
        ]);
    });

    it("range: month draws the current month to date", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            { path: "Diary/2026-08-31.md", frontmatter: { steps: 1 } }, // before the window
            ...diary("Diary", "2026-09-01", 28, () => ({ steps: 1 })), // the whole month to date
            { path: "Diary/2026-09-29.md", frontmatter: { steps: 1 } }, // after today
        ];
        const el = map("source: Diary\nfield: steps\nrange: month", mockContext({ notes }));
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        expect(cellCount(el)).toBe(28);
        expect(texts(el, ".dashy-hm-title")[0]).toContain("28 of 28 days");
    });

    it("range: week draws this calendar week to date, seven cells or fewer", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            { path: "Diary/2026-09-26.md", frontmatter: { steps: 1 } }, // last week
            { path: "Diary/2026-09-27.md", frontmatter: { steps: 1 } }, // Sunday, this week
            { path: "Diary/2026-09-28.md", frontmatter: { steps: 1 } }, // Monday, today
        ];
        const el = map("source: Diary\nfield: steps\nrange: week", mockContext({ notes }));
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        expect(cellCount(el)).toBeLessThanOrEqual(7);
        expect(cellCount(el)).toBe(2);
        expect(texts(el, ".dashy-hm-title")[0]).toContain("2 of 2 days");
    });

    it("range: 3650d names the year on every January, so ten of them are told apart", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2026-09-01", 28, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps\nrange: 3650d", mockContext({ notes }));

        const januaries = texts(el, ".dashy-hm-mon").filter((label) => label.startsWith("Jan"));
        expect(januaries).toHaveLength(10);
        expect(januaries.every((label) => /^Jan \d{4}$/.test(label))).toBe(true);
        expect(new Set(januaries).size).toBe(10);
    });

    it("range: year draws the current year even when it has no data yet", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        // Only last year has notes: the field resolves, so no error, but
        // nothing lands in the window.
        const notes = diary("Diary", "2025-03-01", 10, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps\nrange: year", mockContext({ notes }));

        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        // 1 January to 28 September 2026, inclusive.
        expect(cellCount(el)).toBe(271);
        expect(nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "")).toHaveLength(0);
    });

    it("a bare number is a rolling window in days, like stats' period", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2026-08-01", 59, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps\nrange: 30", mockContext({ notes }));

        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        expect(cellCount(el)).toBe(30);
    });

    it("a custom title is used exactly as written, with no year suffix", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2025-01-01", 700, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps\nrange: 365d\ntitle: Sleep, rolling year", mockContext({ notes }));
        expect(texts(el, ".dashy-hm-title")).toEqual(["Sleep, rolling year"]);
    });

    it("range: 30d draws a rolling 30-day window ending today", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2026-08-30", 30, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps\nrange: 30d", mockContext({ notes }));
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        expect(cellCount(el)).toBe(30);
        expect(texts(el, ".dashy-hm-title")[0]).toContain("30 of 30 days");
    });

    it("an invalid range warns naming the value and the valid forms, and falls back to a grid per year", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2026-09-01", 5, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps\nrange: fortnight", mockContext({ notes }));
        const warnings = diagnostics(el, "warning");
        expect(warnings.some((m) => m.includes("range") && m.includes("fortnight") && m.includes("30d"))).toBe(true);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        // Fell back to the per-year grid, keyed by year rather than "range".
        expect(nodes(el, ".dashy-hm-scroll")[0]?.dataset.gridKey).toBe("2026");
    });

    it("a note outside the window is neither drawn nor counted, and the average is over the window's days only", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            { path: "Diary/2026-08-01.md", frontmatter: { steps: 999 } }, // well before the 30d window
            ...diary("Diary", "2026-09-19", 10, () => ({ steps: 2 })), // last 10 days of the window
        ];
        const el = map("source: Diary\nfield: steps\nrange: 30d", mockContext({ notes }));
        expect(cellCount(el)).toBe(30);
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("10 of 30 days");
        // Averaged over the 10 recognised days only (the same rule a
        // calendar-year grid already follows), not diluted by the 20 empty
        // ones and nowhere near the 999 outlier sitting outside the window.
        expect(caption).toContain(`average ${formatValue(2)}`);
    });

    it("with layers: caption drops the average, and a cell outside the window never even resolves", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            { path: "Diary/2026-08-01.md", frontmatter: { gym: true } }, // outside the 30d window
            { path: "Diary/2026-09-20.md", frontmatter: { gym: true, run: false } },
            { path: "Diary/2026-09-21.md", frontmatter: { run: true } },
        ];
        const el = map(
            "source: Diary\nrange: 30d\nlayers:\n  - { field: gym, color: blue }\n  - { field: run, color: green, label: Running }",
            mockContext({ notes }),
        );
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["gym", "Running"]);
        expect(texts(el, ".dashy-hm-title")[0]).toBe("gym, Running: 2 of 30 days");
        const cellFor = (date: string) =>
            nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date)));
        expect(cellFor("2026-09-20")?.style.backgroundColor).toContain("59, 130, 246"); // gym: blue
        expect(cellFor("2026-08-01")).toBeUndefined();
    });

    it("with bands: the legend still draws the usual scale rows", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2026-09-19", 10, (i) => ({ steps: 50 + i * 5 }));
        const el = map("source: Diary\nfield: steps\nrange: 30d\nbands: [90, 70]", mockContext({ notes }));
        expect(texts(el, ".dashy-hm-leg")).toEqual(["90+", "70–89"]);
    });

    // B-116, checker round 1: an outlier sitting outside the window used to
    // be excluded from the grid itself, but nothing pinned it out of the
    // SCALE too — a global fit over every mark this block ever produced,
    // not just the ones this one grid draws, would have let a note from
    // months ago drag the whole range grid's colours toward it.
    it("without bands: an extreme value outside the window never stretches the fitted scale", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            { path: "Diary/2026-01-01.md", frontmatter: { steps: 999999 } }, // months before the window
            ...diary("Diary", "2026-09-19", 10, (i) => ({ steps: 100 + i * 10 })), // 100..190, inside it
        ];
        const el = map("source: Diary\nfield: steps\nrange: 30d", mockContext({ notes }));
        // Fitted from 100..190 alone: 168, 145, 123, 100 — nowhere near a
        // scale that had to reach up to 999999.
        expect(texts(el, ".dashy-hm-leg")).toEqual(["168+", "145–167", "123–144", "100–122"]);
    });

    it("with skip_field: the day-off legend row only appears once the special day is inside the window", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const outside = mockContext({
            notes: [{ path: "Diary/2026-08-01.md", frontmatter: { steps: 1, vacation: true } }],
        });
        const outsideEl = map("source: Diary\nfield: steps\nrange: 30d\nskip_field: vacation", outside);
        expect(texts(outsideEl, ".dashy-hm-leg")).not.toContain("Day off");

        const inside = mockContext({
            notes: [{ path: "Diary/2026-09-20.md", frontmatter: { steps: 1, vacation: true } }],
        });
        const insideEl = map("source: Diary\nfield: steps\nrange: 30d\nskip_field: vacation", inside);
        expect(texts(insideEl, ".dashy-hm-leg")).toContain("Day off");
    });

    it("keys its scroller with a stable range key, not a year", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2026-09-19", 10, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps\nrange: 30d", mockContext({ notes }));
        expect(nodes(el, ".dashy-hm-scroll")[0]?.dataset.gridKey).toBe("range");
    });

    it("firstDay Sunday vs Monday shifts the pad count the same way a calendar-year grid does", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2025-01-01", 700, () => ({ steps: 1 }));
        const context = mockContext({ notes });

        const sundayFirst = map("source: Diary\nfield: steps\nrange: 365d", context);
        expect(nodes(sundayFirst, ".dashy-hm-pad")).toHaveLength(1);

        setDateLocale("ru");
        const mondayFirst = map("source: Diary\nfield: steps\nrange: 365d", context);
        expect(nodes(mondayFirst, ".dashy-hm-pad")).toHaveLength(0);
    });

    it("a range grid's scroll position survives a redraw independently of any year grid's own bookkeeping", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2026-09-19", 10, () => ({ steps: 1 }));
        const rangeCtx = mockContext({ notes });
        withManualResizeObserver(() => {
            const el = host();
            renderHeatmap(rangeCtx, "source: Diary\nfield: steps\nrange: 30d", el);
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;
            expect(scroller.dataset.gridKey).toBe("range");

            scroller.dispatchEvent(new Event("wheel"));
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));

            renderHeatmap(rangeCtx, "source: Diary\nfield: steps\nrange: 30d", el);
            const redrawn = nodes(el, ".dashy-hm-scroll")[0]!;
            expect(redrawn.scrollLeft).toBe(0); // not yet reported a real width

            stubMetrics(redrawn, 0, 300, 600);
            ManualResizeObserver.instances.at(-1)!.fire();
            expect(redrawn.scrollLeft).toBe(150);
        });
    });
});

describe("heatmap — today's cell gets a ring (B-099)", () => {
    const TODAY = new Date(2026, 8, 24); // 24 September 2026

    afterEach(() => vi.useRealTimers());

    const cellFor = (el: HTMLElement, date: string) =>
        nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date)));

    it("rings today's cell on a year grid, and no other cell", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            { path: "Diary/2026-09-23.md", frontmatter: { steps: 100 } },
            { path: "Diary/2026-09-24.md", frontmatter: { steps: 200 } }, // today
            { path: "Diary/2026-09-25.md", frontmatter: { steps: 300 } }, // future, not even drawn
        ];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        expect(cellFor(el, "2026-09-24")?.classList.contains("is-today")).toBe(true);
        expect(cellFor(el, "2026-09-23")?.classList.contains("is-today")).toBe(false);
        expect(nodes(el, ".is-today")).toHaveLength(1);
    });

    it("is absent on a past year's own grid; only the current year's grid rings", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            ...diary("Diary", "2025-03-01", 3, () => ({ steps: 1 })),
            ...diary("Diary", "2026-09-22", 3, () => ({ steps: 1 })),
        ];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(2);
        // Newest first (`yearsOf`, core/calendar.ts): index 0 is 2026, index 1 is 2025.
        const [wrap2026, wrap2025] = nodes(el, ".dashy-hm-wrap");
        expect(wrap2026?.querySelectorAll(".is-today")).toHaveLength(1);
        expect(wrap2025?.querySelectorAll(".is-today")).toHaveLength(0);
    });

    it("rings today's cell on a range grid, at the window's own last day", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = diary("Diary", "2026-09-15", 10, () => ({ steps: 1 }));
        const el = map("source: Diary\nfield: steps\nrange: 30d", mockContext({ notes }));
        expect(cellFor(el, "2026-09-24")?.classList.contains("is-today")).toBe(true);
        expect(nodes(el, ".is-today")).toHaveLength(1);
    });

    it("startDayHour shifts which cell counts as today, the same as it shifts the grid's own end", () => {
        vi.useFakeTimers();
        // 24 September 2026, 02:00: before the 04:00 start-of-day boundary,
        // so the effective day is still the 23rd (core/today.ts).
        vi.setSystemTime(new Date(2026, 8, 24, 2, 0));
        const settings = { ...DEFAULT_SETTINGS, startDayHour: 4 };
        const notes = [
            { path: "Diary/2026-09-23.md", frontmatter: { steps: 1 } },
            { path: "Diary/2026-09-24.md", frontmatter: { steps: 2 } },
        ];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }, settings));
        // The grid itself stops at the effective today, 23 September: the
        // 24th, calendar-real but not yet effectively arrived, is not drawn
        // at all, let alone rung.
        expect(cellFor(el, "2026-09-23")?.classList.contains("is-today")).toBe(true);
        expect(cellFor(el, "2026-09-24")).toBeUndefined();
        expect(nodes(el, ".is-today")).toHaveLength(1);
    });

    it("a day that is both today and a day off carries both classes, and the tooltip appends both markers in order", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [{ path: "Diary/2026-09-24.md", frontmatter: { steps: 5, vacation: true } }];
        const el = map("source: Diary\nfield: steps\nskip_field: vacation", mockContext({ notes }));
        const cell = cellFor(el, "2026-09-24");
        expect(cell?.classList.contains("is-today")).toBe(true);
        expect(cell?.classList.contains("is-skipped")).toBe(true);
        // "day off" (B-095) reads as a property of the day's own data, so it
        // comes first; "today" is a note about the day itself and comes last.
        const expected = `${medium("2026-09-24")}: steps 5 (2026-09-24), day off, today`;
        expect(cell?.getAttribute("title")).toBe(expected);
        expect(cell?.getAttribute("aria-label")).toBe(expected);
    });

    it("an empty today marked a day off reads the day-off wording plus today", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [
            { path: "Diary/2026-09-01.md", frontmatter: { steps: 10 } }, // keeps the field from resolving to "no data" everywhere
            { path: "Diary/2026-09-24.md", frontmatter: { vacation: true } }, // today, nothing painted
        ];
        const el = map("source: Diary\nfield: steps\nskip_field: vacation", mockContext({ notes }));
        expect(cellFor(el, "2026-09-24")?.getAttribute("title")).toBe(`${medium("2026-09-24")}: day off, today`);
    });

    it("a plain empty today reads the no-data wording plus today", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        // No note dated today at all: the cell is drawn empty regardless,
        // one of every day the year's grid lays out.
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { steps: 10 } }];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        expect(cellFor(el, "2026-09-24")?.getAttribute("title")).toBe(`${medium("2026-09-24")}: no data, today`);
    });

    it("a painted today that is not a day off appends only the today marker", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [{ path: "Diary/2026-09-24.md", frontmatter: { steps: 5 } }];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        expect(cellFor(el, "2026-09-24")?.getAttribute("title")).toBe(`${medium("2026-09-24")}: steps 5 (2026-09-24), today`);
    });

    it("adds no legend row of its own", () => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const notes = [{ path: "Diary/2026-09-24.md", frontmatter: { steps: 5 } }];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        expect(texts(el, ".dashy-hm-leg").some((label) => /today/i.test(label))).toBe(false);
    });
});

describe("heatmap — cell tooltip: locale date, value and the contributing note (B-092)", () => {
    it("a locale-medium date, not the raw ISO key, plus the one note behind the value", () => {
        const notes = [{ path: "Diary/2026-01-01.md", frontmatter: { steps: 100 } }];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toBe(`${medium("2026-01-01")}: steps 100 (2026-01-01)`);
    });

    it("two notes on the same day: how many, not either one's name", () => {
        const notes = [
            { path: "Diary/2026-01-01.md", frontmatter: { steps: 100 } },
            { path: "Diary/2026-01-01 evening.md", frontmatter: { steps: 200 } },
        ];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toBe(`${medium("2026-01-01")}: steps 300 (2 notes)`);
    });

    it("three notes: still a count, in the language's right plural form", () => {
        const notes = [
            { path: "Diary/2026-01-01.md", frontmatter: { steps: 100 } },
            { path: "Diary/2026-01-01 b.md", frontmatter: { steps: 100 } },
            { path: "Diary/2026-01-01 c.md", frontmatter: { steps: 100 } },
        ];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toContain("(3 notes)");
    });

    it("an empty cell carries no note part at all", () => {
        // A note elsewhere keeps `steps` resolvable, so the field itself is
        // not the reason 1 January stays empty.
        const notes = [{ path: "Diary/2026-01-05.md", frontmatter: { steps: 5 } }];
        const el = map("source: Diary\nfield: steps", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-01-01")));
        expect(cell?.getAttribute("title")).toBe(`${medium("2026-01-01")}: no data`);
    });
});

describe("heatmap — mobile: tap to read, tap again to open (B-092)", () => {
    afterEach(() => {
        Platform.isMobile = false;
    });

    const mobileNotes = [
        { path: "Diary/2026-01-01.md", frontmatter: { steps: 100 } },
        { path: "Diary/2026-01-02.md", frontmatter: { steps: 200 } },
    ];
    const mobileCtx = mockContext({ notes: mobileNotes });

    /** A real, cancelable click, the way a tap ultimately reaches the DOM. */
    function tap(el: HTMLElement): MouseEvent {
        const event = new MouseEvent("click", { bubbles: true, cancelable: true });
        el.dispatchEvent(event);
        return event;
    }

    const cellFor = (el: HTMLElement, date: string) =>
        nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date))) as HTMLElement;

    it("desktop: a click is left alone, and the grid draws no status line at all", () => {
        Platform.isMobile = false;
        const el = map("source: Diary\nfield: steps", mobileCtx);
        const cell = cellFor(el, "2026-01-01");
        const event = tap(cell);
        expect(event.defaultPrevented).toBe(false);
        expect(cell.classList.contains("is-selected")).toBe(false);
        expect(nodes(el, ".dashy-hm-status")).toHaveLength(0);
    });

    it("first tap shows the cell's tooltip on the status line, selects it, and does not open it", () => {
        Platform.isMobile = true;
        const el = map("source: Diary\nfield: steps", mobileCtx);
        const status = nodes(el, ".dashy-hm-status")[0];
        expect(status?.getAttribute("aria-live")).toBe("polite");
        expect(status?.textContent).toBe("");

        const cell = cellFor(el, "2026-01-01");
        const event = tap(cell);
        expect(event.defaultPrevented).toBe(true);
        expect(cell.classList.contains("is-selected")).toBe(true);
        expect(status?.textContent).toBe(cell.getAttribute("title"));
    });

    it("a second tap on the same cell is left alone, so Obsidian's own click opens it", () => {
        Platform.isMobile = true;
        const el = map("source: Diary\nfield: steps", mobileCtx);
        const cell = cellFor(el, "2026-01-01");
        tap(cell); // first tap: selects, intercepted
        const second = tap(cell);
        expect(second.defaultPrevented).toBe(false);
        expect(cell.classList.contains("is-selected")).toBe(true);
    });

    it("tapping a different cell moves the selection and the status line", () => {
        Platform.isMobile = true;
        const el = map("source: Diary\nfield: steps", mobileCtx);
        const cell1 = cellFor(el, "2026-01-01");
        const cell2 = cellFor(el, "2026-01-02");
        tap(cell1);
        expect(cell1.classList.contains("is-selected")).toBe(true);

        const event = tap(cell2);
        expect(event.defaultPrevented).toBe(true);
        expect(cell1.classList.contains("is-selected")).toBe(false);
        expect(cell2.classList.contains("is-selected")).toBe(true);
        expect(nodes(el, ".dashy-hm-status")[0]?.textContent).toBe(cell2.getAttribute("title"));
    });

    it("a cell with nothing to open still shows the line on tap", () => {
        Platform.isMobile = true;
        const el = map("source: Diary\nfield: steps", mobileCtx);
        // 3 January has no note in this fixture at all.
        const cell = cellFor(el, "2026-01-03");
        expect(cell.tagName).toBe("DIV");
        const event = tap(cell);
        expect(event.defaultPrevented).toBe(true);
        expect(cell.classList.contains("is-selected")).toBe(true);
        expect(nodes(el, ".dashy-hm-status")[0]?.textContent).toBe(cell.getAttribute("title"));
    });

    it("a redraw resets the selection", () => {
        Platform.isMobile = true;
        const el = host();
        renderHeatmap(mobileCtx, "source: Diary\nfield: steps", el);
        tap(cellFor(el, "2026-01-01"));
        expect(cellFor(el, "2026-01-01").classList.contains("is-selected")).toBe(true);

        renderHeatmap(mobileCtx, "source: Diary\nfield: steps", el);
        expect(cellFor(el, "2026-01-01").classList.contains("is-selected")).toBe(false);
        expect(nodes(el, ".dashy-hm-status")[0]?.textContent).toBe("");
    });

    it("a multi-year heatmap shares one selection and one status line across every grid", () => {
        Platform.isMobile = true;
        const twoYears = mockContext({
            notes: [
                { path: "Diary/2025-06-01.md", frontmatter: { steps: 100 } },
                { path: "Diary/2026-01-01.md", frontmatter: { steps: 200 } },
            ],
        });
        const el = map("source: Diary\nfield: steps", twoYears);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(2);
        // One line for the whole block, not one per year's grid.
        expect(nodes(el, ".dashy-hm-status")).toHaveLength(1);

        const cell2025 = cellFor(el, "2025-06-01");
        const cell2026 = cellFor(el, "2026-01-01");

        tap(cell2025);
        expect(cell2025.classList.contains("is-selected")).toBe(true);
        expect(nodes(el, ".dashy-hm-status")[0]?.textContent).toBe(cell2025.getAttribute("title"));

        const event = tap(cell2026);
        expect(event.defaultPrevented).toBe(true);
        // Tapping a cell in the other year's grid moves the ONE selection,
        // rather than each grid ending up with a cell of its own.
        expect(cell2025.classList.contains("is-selected")).toBe(false);
        expect(cell2026.classList.contains("is-selected")).toBe(true);
        expect(nodes(el, ".dashy-hm-status")[0]?.textContent).toBe(cell2026.getAttribute("title"));
    });
});

// B-121: a heatmap over durations: tooltips, the caption's average and the
// legend all read as `7h 30m`, the values themselves counted in minutes.
describe("heatmap — durations", () => {
    const TODAY = new Date(2026, 8, 24, 12);
    const nights: Record<string, string> = {
        "2026-09-13": "6h", "2026-09-14": "6h 30m", "2026-09-15": "7h", "2026-09-16": "6h", "2026-09-17": "6h 55m",
        "2026-09-20": "7h 30m", "2026-09-21": "6:45", "2026-09-22": "8h", "2026-09-23": "5h 58min", "2026-09-24": "7h 12m",
    };
    // 1945 + 2125 = 4070 minutes over 10 days: an average of 407, 6h 47m.
    const sleepCtx = mockContext({
        notes: [
            ...Object.entries(nights).map(([date, sleep]) => ({
                path: `Diary/${date}.md`, frontmatter: { sleep, steps: 5000, gym: date.endsWith("0") },
            })),
            { path: "Mixed/2026-09-20.md", frontmatter: { sleep: "7h" } },
            { path: "Mixed/2026-09-21.md", frontmatter: { sleep: 400 } },
        ],
    });

    const render = (config: string): HTMLElement => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderHeatmap(sleepCtx, config, el);
        return el;
    };
    const titleOf = (el: HTMLElement, date: string): string | null | undefined =>
        nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date)))?.getAttribute("title");

    afterEach(() => {
        vi.useRealTimers();
        setLocale("en");
    });

    it("a cell's tooltip and the caption's average read as durations", () => {
        const el = render("source: Diary\nfield: sleep");
        expect(titleOf(el, "2026-09-23")).toBe(`${medium("2026-09-23")}: sleep 5h 58m (2026-09-23)`);
        expect(texts(el, ".dashy-hm-title")).toEqual(["2026, sleep: average 6h 47m, 10 of 267 days"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("the auto-fitted legend reads in hours and minutes", () => {
        const el = render("source: Diary\nfield: sleep");
        expect(texts(el, ".dashy-hm-leg")).toEqual(["7h 30m+", "6h 59m–7h 29m", "6h 29m–6h 58m", "5h 58m–6h 28m"]);
    });

    it("explicit bands take durations, and a plain number there means minutes", () => {
        expect(texts(render("source: Diary\nfield: sleep\nbands: [8h, 7h, 6h]"), ".dashy-hm-leg"))
            .toEqual(["8h+", "7h–7h 59m", "6h–6h 59m"]);
        expect(texts(render("source: Diary\nfield: sleep\nbands: [480, 420]"), ".dashy-hm-leg"))
            .toEqual(["8h+", "7h–7h 59m"]);
    });

    it("a band decides by minutes: 8h paints at full strength, 5h 58m in the bottom band", () => {
        const el = render("source: Diary\nfield: sleep\nbands: [8h, 7h, 6h]");
        const alpha = (date: string): string => {
            const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium(date)));
            return cell?.style.backgroundColor ?? "";
        };
        expect(alpha("2026-09-22")).not.toContain("0.46");
        expect(alpha("2026-09-23")).toContain("0.46");
    });

    it("a mixed field is counted in minutes, shown plain, and warned about", () => {
        const el = render("source: Mixed\nfield: sleep");
        expect(titleOf(el, "2026-09-20")).toBe(`${medium("2026-09-20")}: sleep 420 (2026-09-20)`);
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ heatmap: "sleep" mixes durations ("Mixed/2026-09-20.md") and plain numbers ("Mixed/2026-09-21.md"). '
            + "All of them are counted as minutes and shown as plain numbers.",
        ]);
    });

    it("a duration band threshold on a plain field warns", () => {
        const el = render("source: Diary\nfield: steps\nbands: [2h, 1h]");
        expect(texts(el, ".dashy-hm-leg")).toEqual(["120+", "60–119"]);
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ heatmap: `bands` threshold "2h" is a duration, but "steps" holds plain numbers. It is applied as minutes.',
        ]);
    });

    it("layers: each layer's tooltip part in its own kind; a checkbox layer keeps the legend plain", () => {
        const el = render(
            "source: Diary\nlayers:\n  - { field: gym, label: Gym }\n  - { field: sleep, label: Sleep }");
        expect(titleOf(el, "2026-09-20")).toBe(`${medium("2026-09-20")}: Gym 1, Sleep 7h 30m (2026-09-20)`);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("layers of durations only: the legend reads as durations", () => {
        const el = render("source: Diary\nlayers:\n  - { field: sleep, label: Sleep }\nbands: [8h, 7h]");
        expect(texts(el, ".dashy-hm-leg")).toEqual(["Sleep", "8h+", "7h–7h 59m"]);
    });

    it("layers: a mix within one layer warns naming that layer's field; a duration band on plain layers warns", () => {
        const mixed = render("source: Mixed\nlayers:\n  - { field: sleep }");
        expect(diagnostics(mixed, "warning")[0]).toContain('"sleep" mixes durations');
        const plain = render("source: Diary\nlayers:\n  - { field: steps }\n  - { field: gym }\nbands: [2h]");
        expect(diagnostics(plain, "warning")).toEqual([
            '⚠️ heatmap: `bands` threshold "2h" is a duration, but "steps, gym" holds plain numbers. It is applied as minutes.',
        ]);
    });

    it("explicit duration bands: a night of 7h 59m 40s reads 8h and paints the top band", () => {
        const notes = [
            { path: "Diary/2026-09-20.md", frontmatter: { sleep: "7:59:40" } },
            { path: "Diary/2026-09-21.md", frontmatter: { sleep: "7h" } },
        ];
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderHeatmap(mockContext({ notes }), "source: Diary\nfield: sleep\nbands: [8h, 7h]", el);
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith(medium("2026-09-20")));
        expect(cell?.getAttribute("title")).toBe(`${medium("2026-09-20")}: sleep 8h (2026-09-20)`);
        // The top band paints at full alpha: no alpha component in the colour.
        expect(cell?.style.backgroundColor).toMatch(/^rgb\(/);
    });

    it("layers of different kinds: duration bands still read as durations when a layer holds them", () => {
        const el = render(
            "source: Diary\nlayers:\n  - { field: gym, label: Gym }\n  - { field: sleep, label: Sleep }\nbands: [8h, 7h]");
        expect(texts(el, ".dashy-hm-leg")).toEqual(["Gym", "Sleep", "8h+", "7h–7h 59m"]);
    });

    it("the text-field error mentions durations as an accepted value", () => {
        const notes = [{ path: "Diary/2026-09-20.md", frontmatter: { sleep: "slept badly" } }];
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderHeatmap(mockContext({ notes }), "source: Diary\nfield: sleep", el);
        expect(diagnostics(el, "error")[0]).toContain("not a number, a duration like `7h 30m` or a checkbox");
    });

    it("in Russian, the tooltip and the caption use the catalog's units", () => {
        setLocale("ru");
        const el = render("source: Diary\nfield: sleep\nbands: [8h, 7h]");
        expect(titleOf(el, "2026-09-23")).toContain("sleep 5\u00A0ч 58\u00A0мин");
        expect(texts(el, ".dashy-hm-title")[0]).toContain("6\u00A0ч 47\u00A0мин");
        expect(texts(el, ".dashy-hm-leg")).toEqual(["8\u00A0ч+", "7\u00A0ч–7\u00A0ч 59\u00A0мин"]);
    });
});
