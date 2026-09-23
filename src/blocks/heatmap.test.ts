import { describe, it, expect } from "vitest";
import { renderHeatmap } from "./heatmap";
import { mockContext, diary, host, texts, nodes, diagnostics } from "../test/vault";

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

    it("without bands there is one legend entry covering everything", () => {
        expect(texts(map("source: Diary\nfield: sleep_score"), ".dashy-hm-leg")).toEqual(["has data"]);
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
        expect(texts(el, ".dashy-hm-title")).toEqual(["My sleep — 2026", "My sleep — 2025"]);
    });

    it("one year leaves the custom title alone", () => {
        const el = map("source: Diary\nfield: sleep_score\ntitle: My sleep");
        expect(texts(el, ".dashy-hm-title")).toEqual(["My sleep"]);
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
