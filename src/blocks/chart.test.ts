import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Platform } from "obsidian";
import { renderChart } from "./chart";
import { mockContext, countingContext, diary, host, texts, nodes, diagnostics, type FakeNote } from "../test/vault";
import { setLocale } from "../i18n";
import { registerBlocks } from "../app/register";

// 2026-09-30 is a Wednesday; the test locale (moment's `en`) starts weeks on Sunday.
const TODAY = new Date(2026, 8, 30, 12);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
});
afterEach(() => {
    vi.useRealTimers();
    Platform.isMobile = false;
    setLocale("en");
});

/** Ten days of diary ending today: steps every day, sleep as a duration, gym as a checkbox. */
const tenDays = (): FakeNote[] => diary("Diary", "2026-09-21", 10, (i) => ({
    steps: 1000 * (i + 1),
    sleep: `7h ${i * 3}min`,
    gym: i % 2 === 0,
    mood: 3 + (i % 3),
}));

const chart = (config: string, notes: FakeNote[] = tenDays()): HTMLElement => {
    const el = host();
    renderChart(mockContext({ notes }), config, el);
    return el;
};

const hits = (el: HTMLElement): HTMLElement[] => nodes(el, ".dashy-chart-hit");
const titles = (el: HTMLElement): string[] => hits(el).map((h) => h.getAttribute("title") ?? "");

describe("chart: what it draws", () => {
    it("one SVG, a caption, and one hit column per day bucket, each linking its note", () => {
        const el = chart("source: Diary\nfield: steps\nrange: 10d");
        expect(nodes(el, "svg.dashy-chart-svg")).toHaveLength(1);
        expect(texts(el, ".dashy-chart-title")).toEqual(["steps: sum per day, last 10 days"]);
        expect(hits(el)).toHaveLength(10);
        expect(nodes(el, "a.dashy-chart-hit.internal-link")).toHaveLength(10);
        expect(hits(el)[9]!.getAttribute("data-href")).toBe("Diary/2026-09-30.md");
        expect(titles(el)[9]).toBe("Sep 30, 2026: steps 10000 (2026-09-30)");
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a day with no note is a plain column saying no data, and a gap in the line", () => {
        const notes = tenDays().filter((n) => !n.path.includes("2026-09-25"));
        const el = chart("source: Diary\nfield: steps\nrange: 10d", notes);
        const empty = hits(el)[4]!;
        expect(empty.tagName).toBe("DIV");
        expect(empty.getAttribute("title")).toBe("Sep 25, 2026: no data");
        expect(nodes(el, "polyline.dashy-chart-line")).toHaveLength(2);
    });

    it("clicking a day opens the first contributing note by path", () => {
        const notes: FakeNote[] = [
            { path: "Work/2026-09-30.md", frontmatter: { steps: 1 } },
            { path: "Personal/2026-09-30.md", frontmatter: { steps: 2 } },
        ];
        const el = chart("field: steps\nrange: 2d", notes);
        const today = hits(el)[1]!;
        expect(today.getAttribute("href")).toBe("Personal/2026-09-30.md");
        expect(today.getAttribute("title")).toBe("Sep 30, 2026: steps 3 (2 notes)");
    });

    it("week buckets are plain columns, never links, and name the day the week starts on", () => {
        const el = chart("source: Diary\nfield: steps\nbucket: week\nrange: 14d");
        expect(nodes(el, "a.dashy-chart-hit")).toHaveLength(0);
        expect(titles(el)).toEqual([
            "Week of Sun Sep 13, 2026: no data",
            "Week of Sun Sep 20, 2026: steps 21000 (6 notes)",
            "Week of Sun Sep 27, 2026: steps 34000 (4 notes), so far",
        ]);
        expect(hits(el)[2]!.classList.contains("is-partial")).toBe(true);
    });

    it("`link: false` keeps day buckets from linking", () => {
        const el = chart("source: Diary\nfield: steps\nrange: 3d\nlink: false");
        expect(nodes(el, "a.dashy-chart-hit")).toHaveLength(0);
        expect(hits(el)).toHaveLength(3);
    });

    it("bars start at the zero line; the partial last bar is flagged", () => {
        const el = chart("source: Diary\nfield: steps\nbucket: week\nrange: 14d\ntype: bar");
        const bars = nodes(el, "rect.dashy-chart-bar");
        expect(bars).toHaveLength(2);
        expect(bars.map((b) => b.classList.contains("is-partial"))).toEqual([false, true]);
        const axis = nodes(el, "line.dashy-chart-axis")[0]!;
        for (const bar of bars) {
            expect(Number(bar.getAttribute("y")) + Number(bar.getAttribute("height"))).toBeCloseTo(Number(axis.getAttribute("y1")), 1);
        }
    });

    it("the partial last point of a line is hollow", () => {
        const el = chart("source: Diary\nfield: steps\nbucket: week\nrange: 14d");
        const points = nodes(el, "circle.dashy-chart-point");
        expect(points.map((p) => p.classList.contains("is-partial"))).toEqual([false, true]);
    });

    it("three labelled y gridlines and as many x labels as fit, first and last always", () => {
        const el = chart("source: Diary\nfield: steps\nrange: 30d");
        const labels = texts(el, "text.dashy-chart-label");
        // y labels come first: 1000 to 10000 steps scale to 0, 5000, 10 000.
        expect(labels.slice(0, 3)).toEqual(["0", "5000", "10\u202f000"]);
        expect(nodes(el, "line.dashy-chart-grid")).toHaveLength(3);
        const xs = labels.slice(nodes(el, "line.dashy-chart-grid").length);
        // 551px of plot at 64px a label: eight, where the old cap stopped at six.
        expect(xs).toEqual(["1 Sep", "5 Sep", "9 Sep", "13 Sep", "18 Sep", "22 Sep", "26 Sep", "30 Sep"]);
    });

    it("the unit rides on the top y label and in the tooltip, not on every label", () => {
        const el = chart("source: Diary\nfield: steps\nrange: 3d\nunit: st");
        const grid = nodes(el, "line.dashy-chart-grid").length;
        const ys = texts(el, "text.dashy-chart-label").slice(0, grid);
        expect(ys.filter((y) => y.endsWith(" st"))).toHaveLength(1);
        expect(ys[ys.length - 1]).toMatch(/ st$/);
        expect(titles(el)[2]).toBe("Sep 30, 2026: steps 10000 st (2026-09-30)");
    });

    it("month buckets carry the year on the first label and on January once the window spans two years", () => {
        vi.setSystemTime(new Date(2027, 1, 10, 12));
        const notes = diary("Diary", "2026-10-01", 120, (i) => ({ steps: i }));
        const el = chart("source: Diary\nfield: steps\nbucket: month\nrange: 150d", notes);
        const xs = texts(el, "text.dashy-chart-label").slice(nodes(el, "line.dashy-chart-grid").length);
        expect(xs[0]).toBe("Sep 2026");
        expect(xs).toContain("Jan 2027");
        expect(xs).toContain("Oct");
        expect(titles(el)[0]).toBe("Sep 2026: no data");
    });

    it("day and week labels name the year on the first label and after 1 January", () => {
        vi.setSystemTime(new Date(2027, 1, 10, 12));
        const notes = diary("Diary", "2026-12-01", 60, (i) => ({ steps: i }));
        const el = chart("source: Diary\nfield: steps\nbucket: week\nrange: 120d", notes);
        const xs = texts(el, "text.dashy-chart-label").slice(nodes(el, "line.dashy-chart-grid").length);
        expect(xs[0]).toMatch(/ 2026$/);
        const firstNew = xs.findIndex((x, i) => i > 0 && x.endsWith(" 2027"));
        expect(firstNew).toBeGreaterThan(0);
        // Only the first label of each year carries it.
        expect(xs.filter((x) => / \d{4}$/.test(x))).toHaveLength(2);
        // A window inside one year never shows a year.
        vi.setSystemTime(TODAY);
        const plain = chart("source: Diary\nfield: steps\nrange: 10d");
        expect(texts(plain, "text.dashy-chart-label").some((x) => / \d{4}$/.test(x))).toBe(false);
    });

    it("the SVG is an image with a summary; every column carries its tooltip as a label", () => {
        const el = chart("source: Diary\nfield: steps\nrange: 3d\ntype: bar\nlabel: Steps");
        const graphic = nodes(el, "svg")[0]!;
        expect(graphic.getAttribute("role")).toBe("img");
        expect(graphic.getAttribute("aria-label")).toBe("Bar chart: Steps, last 3 days");
        expect(hits(el).map((h) => h.getAttribute("aria-label"))).toEqual(titles(el));
    });
});

describe("chart: series, legend and goal", () => {
    const three = [
        "source: Diary", "type: bar", "bucket: week", "range: 14d", "goal: 20000",
        "series:",
        "  - { field: steps, label: Walk }",
        "  - { field: mood, label: Mood, color: orange }",
        "  - { field: gym, label: Gym }",
    ].join("\n");

    it("grouped bars per bucket, never stacked, and a legend swatch per series plus the goal", () => {
        const el = chart(three);
        // Two weeks with data, three series each.
        expect(nodes(el, "rect.dashy-chart-bar")).toHaveLength(6);
        expect(texts(el, ".dashy-chart-leg")).toEqual(["Walk", "Mood", "Gym", "goal 20000"]);
        const swatches = nodes(el, ".dashy-chart-swatch");
        expect(swatches[0]!.style.backgroundColor).toBe("rgb(59, 130, 246)");
        expect(swatches[1]!.style.backgroundColor).toBe("rgb(245, 158, 11)");
        expect(swatches[3]!.classList.contains("is-goal")).toBe(true);
        expect(nodes(el, "line.dashy-chart-goal")).toHaveLength(1);
        // B-175: the value is named in the legend only, not again over the last bar.
        expect(texts(el, "text").filter((s) => s.includes("goal"))).toEqual([]);
    });

    it("a week of bars with a goal labels all seven days, the goal only in the legend (B-175)", () => {
        const el = chart("source: Diary\nfield: steps\ntype: bar\nrange: 7d\ngoal: 10000");
        const xs = texts(el, "text.dashy-chart-label").slice(nodes(el, "line.dashy-chart-grid").length);
        expect(xs).toEqual(["24 Sep", "25 Sep", "26 Sep", "27 Sep", "28 Sep", "29 Sep", "30 Sep"]);
        expect(nodes(el, "line.dashy-chart-goal")).toHaveLength(1);
        expect(texts(el, ".dashy-chart-leg")).toEqual(["goal 10000"]);
    });

    it("the tooltip lists every series with a value", () => {
        const el = chart(three);
        expect(titles(el)[2]).toBe("Week of Sun Sep 27, 2026: Walk 34000, Mood 15, Gym 2 (4 notes), so far");
    });

    it("a single series without a goal needs no legend: the caption names it", () => {
        expect(nodes(chart("source: Diary\nfield: steps"), ".dashy-chart-legend")).toHaveLength(0);
    });

    it("the goal is always on screen, even far above the data", () => {
        const el = chart("source: Diary\nfield: mood\nrange: 5d\ngoal: 100");
        const grid = nodes(el, "line.dashy-chart-grid");
        const top = Math.min(...grid.map((g) => Number(g.getAttribute("y1"))));
        const goal = nodes(el, "line.dashy-chart-goal")[0]!;
        expect(Number(goal.getAttribute("y1"))).toBeGreaterThanOrEqual(top);
        expect(texts(el, "text.dashy-chart-label")).toContain("100");
    });

    it("a count series draws the number of dated notes per bucket", () => {
        const el = chart("source: Diary\nagg: count\nbucket: week\nrange: 14d\ntype: bar");
        expect(titles(el)).toEqual([
            "Week of Sun Sep 13, 2026: notes 0",
            "Week of Sun Sep 20, 2026: notes 6 (6 notes)",
            "Week of Sun Sep 27, 2026: notes 4 (4 notes), so far",
        ]);
    });

    it("`where` narrows the selection exactly like every other block", () => {
        const el = chart("source: Diary\nagg: count\nrange: 10d\nwhere: \"mood >= 5\"");
        const counts = titles(el).map((x) => (/notes (\d)/.exec(x) ?? [])[1]);
        expect(counts.filter((c) => c === "1")).toHaveLength(3);
    });

    /** The days whose bucket counted a note, from the hit columns' tooltips. */
    const countedDays = (el: HTMLElement): string[] =>
        titles(el).filter((x) => /notes 1 /.test(x)).map((x) => x.slice(0, x.indexOf(":")));

    it("`where` joined with `and` keeps only the notes where every condition holds", () => {
        const el = chart("source: Diary\nagg: count\nrange: 10d\nwhere: \"mood >= 5 and gym = true\"");
        expect(countedDays(el)).toEqual(["Sep 23, 2026", "Sep 29, 2026"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("`where` written as a list is the same filter as `and`", () => {
        const el = chart("source: Diary\nagg: count\nrange: 10d\nwhere: [\"mood >= 4\", gym = true]");
        expect(countedDays(el)).toEqual(["Sep 23, 2026", "Sep 25, 2026", "Sep 29, 2026"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });
});

describe("chart: durations (B-121)", () => {
    it("a series of durations reads as durations in the tooltip, the y axis and the goal", () => {
        const el = chart("source: Diary\nfield: sleep\nagg: avg\nrange: 3d\ngoal: 8h");
        expect(titles(el)[2]).toBe("Sep 30, 2026: sleep 7h 27m (2026-09-30)");
        const grid = nodes(el, "line.dashy-chart-grid").length;
        const ys = texts(el, "text.dashy-chart-label").slice(0, grid);
        expect(ys.every((y) => /^\d+h( \d+m)?$/.test(y))).toBe(true);
        expect(texts(el, ".dashy-chart-leg")).toEqual(["goal 8h"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a plain goal against durations means minutes and reads as a duration", () => {
        const el = chart("source: Diary\nfield: sleep\nrange: 3d\nagg: max\ngoal: 450");
        expect(texts(el, ".dashy-chart-leg")).toEqual(["goal 7h 30m"]);
    });

    it("`unit` on a duration series is ignored with a warning", () => {
        const el = chart("source: Diary\nfield: sleep\nrange: 3d\nunit: h");
        expect(diagnostics(el, "warning")).toEqual([
            "⚠️ chart: `unit: h` is ignored for \"sleep\", which holds durations that already carry their own units.",
        ]);
        expect(titles(el)[2]).not.toContain(" h ");
    });

    it("a duration goal against plain numbers warns and is applied as minutes", () => {
        const el = chart("source: Diary\nfield: steps\nrange: 3d\ngoal: 2h");
        expect(diagnostics(el, "warning")).toEqual([
            "⚠️ chart: `goal: 2h` is a duration, but the chart holds plain numbers. It is applied as minutes.",
        ]);
        expect(texts(el, ".dashy-chart-leg")).toEqual(["goal 120"]);
    });

    it("a field mixing durations and plain numbers warns and shows plain numbers", () => {
        const notes: FakeNote[] = [
            { path: "Diary/2026-09-29.md", frontmatter: { sleep: "7h" } },
            { path: "Diary/2026-09-30.md", frontmatter: { sleep: 400 } },
        ];
        const el = chart("source: Diary\nfield: sleep\nrange: 2d", notes);
        expect(diagnostics(el, "warning")).toEqual([
            "⚠️ chart: \"sleep\" mixes durations (\"Diary/2026-09-29.md\") and plain numbers (\"Diary/2026-09-30.md\"). All of them are counted as minutes and shown as plain numbers.",
        ]);
        expect(titles(el)[0]).toBe("Sep 29, 2026: sleep 420 (2026-09-29)");
    });

    it("next to a plain series the shared axis stays plain; each tooltip keeps its own kind", () => {
        const el = chart("source: Diary\nrange: 2d\nseries:\n  - { field: sleep }\n  - { field: mood }");
        expect(titles(el)[1]).toBe("Sep 30, 2026: sleep 7h 27m, mood 3 (2026-09-30)");
        const grid = nodes(el, "line.dashy-chart-grid").length;
        expect(texts(el, "text.dashy-chart-label").slice(0, grid).some((y) => y.includes("h"))).toBe(false);
    });
});

describe("chart: race times as a clock (B-145)", () => {
    const races: FakeNote[] = [
        { path: "Diary/2026-09-28.md", frontmatter: { run: "2:18:05", sleep: "7h 30m" } },
        { path: "Diary/2026-09-29.md", frontmatter: { run: "2:17:45", sleep: "7h" } },
        { path: "Diary/2026-09-30.md", frontmatter: { run: "2h 16m 32s", sleep: "6h 45m" } },
    ];

    it("the tooltip reads H:MM:SS; the y axis and the goal keep hours and minutes", () => {
        const el = chart('source: Diary\nfield: run\nrange: 3d\ngoal: "2:15:00"', races);
        expect(titles(el)).toEqual([
            "Sep 28, 2026: run 2:18:05 (2026-09-28)",
            "Sep 29, 2026: run 2:17:45 (2026-09-29)",
            "Sep 30, 2026: run 2:16:32 (2026-09-30)",
        ]);
        const grid = nodes(el, "line.dashy-chart-grid").length;
        const ys = texts(el, "text.dashy-chart-label").slice(0, grid);
        expect(ys.length).toBeGreaterThan(0);
        expect(ys.some((y) => y.includes(":"))).toBe(false);
        expect(texts(el, ".dashy-chart-leg")).toEqual(["goal 2h 15m"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("each series decides for itself: race times as a clock, sleep in hours and minutes", () => {
        const el = chart("source: Diary\nrange: 1d\nseries:\n  - { field: run }\n  - { field: sleep }", races);
        expect(titles(el)).toEqual(["Sep 30, 2026: run 2:16:32, sleep 6h 45m (2026-09-30)"]);
    });

    it("one value without seconds turns the series back to hours and minutes", () => {
        const notes: FakeNote[] = [...races, { path: "Diary/2026-09-27.md", frontmatter: { run: "2:20" } }];
        const el = chart("source: Diary\nfield: run\nrange: 1d", notes);
        expect(titles(el)).toEqual(["Sep 30, 2026: run 2h 17m (2026-09-30)"]);
    });
});

describe("chart: bucket: year (B-147)", () => {
    /** Books finished, sparse across years: none in 2016-2018 or 2021, one shelf a year otherwise. */
    const books: FakeNote[] = [
        { path: "Books/2019-12-31.md", frontmatter: { pages: 300 } },
        { path: "Books/2020-01-01.md", frontmatter: { pages: 200 } },
        { path: "Books/2020-06-15.md", frontmatter: { pages: 100 } },
        { path: "Books/2022-03-01.md", frontmatter: { pages: 250 } },
        { path: "Books/2024-02-29.md", frontmatter: { pages: 420 } },
        { path: "Books/2026-09-01.md", frontmatter: { pages: 180 } },
    ];

    it("ten years by default: one column per calendar year, labelled with the year alone", () => {
        const el = chart("source: Books\nagg: count\nbucket: year\ntype: bar", books);
        expect(texts(el, ".dashy-chart-title")).toEqual(["notes: count per year, last 11 years"]);
        expect(hits(el)).toHaveLength(11);
        const xs = texts(el, "text.dashy-chart-label").slice(nodes(el, "line.dashy-chart-grid").length);
        expect(xs[0]).toBe("2016");
        expect(xs[xs.length - 1]).toBe("2026");
        expect(xs.every((x) => /^20\d\d$/.test(x))).toBe(true);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("tooltips name the year; an empty year is 0 for count, the running year says so far", () => {
        const el = chart("source: Books\nagg: count\nbucket: year\ntype: bar", books);
        expect(titles(el)).toEqual([
            "2016: notes 0",
            "2017: notes 0",
            "2018: notes 0",
            "2019: notes 1 (2019-12-31)",
            "2020: notes 2 (2 notes)",
            "2021: notes 0",
            "2022: notes 1 (2022-03-01)",
            "2023: notes 0",
            "2024: notes 1 (2024-02-29)",
            "2025: notes 0",
            "2026: notes 1 (2026-09-01), so far",
        ]);
        expect(hits(el)[10]!.classList.contains("is-partial")).toBe(true);
        // Year columns never link, like week and month ones.
        expect(nodes(el, "a.dashy-chart-hit")).toHaveLength(0);
    });

    it("an explicit range wins; a summed year with no data is a gap, and the goal is drawn", () => {
        const el = chart("source: Books\nfield: pages\nbucket: year\nrange: 1095d\ngoal: 400", books);
        expect(titles(el)).toEqual([
            "2023: no data",
            "2024: pages 420 (2024-02-29)",
            "2025: no data",
            "2026: pages 180 (2026-09-01), so far",
        ]);
        // Two lone values between gaps: two points, no line drawn through the empty years.
        expect(nodes(el, "polyline.dashy-chart-line")).toHaveLength(0);
        expect(nodes(el, "circle.dashy-chart-point")).toHaveLength(2);
        expect(nodes(el, "line.dashy-chart-goal")).toHaveLength(1);
        expect(texts(el, ".dashy-chart-leg")).toEqual(["goal 400"]);
    });

    it("works the same as `dashy-chart`, the name left when Obsidian Charts owns `chart`", () => {
        const blocks: Record<string, typeof renderChart> = {};
        registerBlocks({ chart: renderChart }, (name, block) => {
            blocks[name] = block;
        }, (id) => id === "obsidian-charts");
        expect(Object.keys(blocks)).toEqual(["dashy-chart"]);
        const el = host();
        const config = "source: Books\nbucket: year\nrange: 730d\nseries:\n  - { field: pages, label: Pages }\n  - { agg: count, label: Books }";
        blocks["dashy-chart"]!(mockContext({ notes: books }), config, el);
        expect(texts(el, ".dashy-chart-title")).toEqual(["Pages, Books: per year, last 3 years"]);
        expect(titles(el)).toEqual([
            "2024: Pages 420, Books 1 (2024-02-29)",
            "2025: Books 0",
            "2026: Pages 180, Books 1 (2026-09-01), so far",
        ]);
    });
});

describe("chart: x labels sit under their points (B-157)", () => {
    const races: FakeNote[] = [2021, 2022, 2023, 2024, 2025, 2026].map((y, i) => ({
        path: `Races/${y}-05-01.md`,
        frontmatter: { km: 10 + i },
    }));
    const xLabels = (el: HTMLElement): Element[] =>
        nodes(el, "text.dashy-chart-label").slice(nodes(el, "line.dashy-chart-grid").length);
    const num = (node: Element, name: string): number => Number(node.getAttribute(name));

    it("six yearly points: every label, the first and the last too, is centred on its point", () => {
        const el = chart("source: Races\nfield: km\nbucket: year\nrange: 1826d", races);
        const labels = xLabels(el);
        expect(labels.map((l) => l.textContent)).toEqual(["2021", "2022", "2023", "2024", "2025", "2026"]);
        const points = nodes(el, "circle.dashy-chart-point");
        expect(points).toHaveLength(6);
        labels.forEach((label, i) => {
            expect(label.getAttribute("text-anchor"), `${i}`).toBe("middle");
            expect(num(label, "x"), `${i}`).toBe(num(points[i]!, "cx"));
        });
    });

    it("a bar chart follows the same rule: each year under the middle of its bar", () => {
        const el = chart("source: Races\nfield: km\nbucket: year\nrange: 1826d\ntype: bar", races);
        const labels = xLabels(el);
        const bars = nodes(el, "rect.dashy-chart-bar");
        expect(bars).toHaveLength(6);
        labels.forEach((label, i) => {
            expect(label.getAttribute("text-anchor"), `${i}`).toBe("middle");
            expect(num(label, "x"), `${i}`).toBeCloseTo(num(bars[i]!, "x") + num(bars[i]!, "width") / 2, 1);
        });
    });

    it("labels that would cross an edge are pinned to it; the ones between stay centred", () => {
        vi.setSystemTime(new Date(2027, 1, 10, 12));
        const notes = diary("Diary", "2026-12-01", 60, (i) => ({ steps: i }));
        // A day per bucket: the end columns are a few pixels wide, "14 Oct 2026" and "10 Feb" are not.
        const el = chart("source: Diary\nfield: steps\nrange: 120d", notes);
        const labels = xLabels(el);
        expect(labels.length).toBeGreaterThan(2);
        const first = labels[0]!;
        expect(first.textContent).toBe("14 Oct 2026");
        expect(first.getAttribute("text-anchor")).toBe("start");
        expect(num(first, "x")).toBe(0);
        const last = labels[labels.length - 1]!;
        expect(last.textContent).toBe("10 Feb");
        expect(last.getAttribute("text-anchor")).toBe("end");
        // The fallback width of a plot jsdom does not measure.
        expect(num(last, "x")).toBe(600);
        const centers = hits(el).map((h) => parseFloat(h.style.left) + parseFloat(h.style.width) / 2);
        for (const label of labels.slice(1, -1)) {
            expect(label.getAttribute("text-anchor")).toBe("middle");
            const x = num(label, "x");
            expect(Math.min(...centers.map((c) => Math.abs(c - x)))).toBeLessThan(0.02);
        }
    });

    it("a single point is labelled right under it", () => {
        const el = chart("source: Races\nfield: km\nbucket: year\nrange: 30d", races);
        const labels = xLabels(el);
        const points = nodes(el, "circle.dashy-chart-point");
        expect(labels.map((l) => l.textContent)).toEqual(["2026"]);
        expect(points).toHaveLength(1);
        expect(labels[0]!.getAttribute("text-anchor")).toBe("middle");
        expect(num(labels[0]!, "x")).toBe(num(points[0]!, "cx"));
    });
});

describe("chart: an empty window is not an error", () => {
    it("draws the axes and says no data in the window", () => {
        const old = diary("Diary", "2025-01-01", 5, (i) => ({ steps: i }));
        const el = chart("source: Diary\nfield: steps", old);
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-chart-empty")).toEqual(["No data in the last 30 days"]);
        expect(nodes(el, "line.dashy-chart-axis")).toHaveLength(1);
        expect(hits(el)).toHaveLength(30);
    });

    it("a window with data has no placeholder", () => {
        expect(nodes(chart("source: Diary\nfield: steps"), ".dashy-chart-empty")).toHaveLength(0);
    });
});

describe("chart: every diagnostic reaches the note, under the block's name", () => {
    it("not a map", () => {
        expect(diagnostics(chart("just text"), "error")).toEqual([
            "⛔ chart: Expected a set of fields, for example `source:` and `field:`.",
        ]);
    });

    it("a YAML error keeps its own message and line", () => {
        expect(diagnostics(chart("field: [a"), "error")[0]).toMatch(/^⛔ chart \(line \d+\): Could not parse YAML/);
    });

    it("a config error draws nothing but the error", () => {
        const el = chart("source: Diary\nfield: [steps, mood]");
        expect(diagnostics(el, "error")).toEqual([
            "⛔ chart: `field` takes one property here. Use `series:` for several lines, or `series: [{field: [a, b]}]` to fold them into one.",
        ]);
        expect(nodes(el, "svg")).toHaveLength(0);
    });

    it("a key from a neighbouring block names what it is here", () => {
        const el = chart("source: Diary\nfield: steps\nper_day: avg\nperiod: month\ntrend: 30d\nlayers: []\nhieght: 200");
        expect(diagnostics(el, "warning")).toEqual([
            "⚠️ chart: Unknown key \"per_day\". In this block it is called \"agg\".",
            "⚠️ chart: Unknown key \"period\". In this block it is called \"range\".",
            "⚠️ chart: Unknown key \"trend\". In this block it is called \"range\".",
            "⚠️ chart: Unknown key \"layers\". In this block it is called \"series\".",
            "⚠️ chart: Unknown key \"hieght\", ignored.",
        ]);
    });

    it("a missing folder and an unreadable where warn, as in every block", () => {
        expect(diagnostics(chart("source: Nowhere\nagg: count"), "warning")[0]).toBe(
            "⚠️ chart: Nothing is filed under `Nowhere`. The numbers below count nothing. Point `source` at a folder of your own.",
        );
        expect(diagnostics(chart("source: Diary\nfield: steps\nwhere: \"mood > 3 or gym = true\""), "warning")[0])
            .toMatch(/^⚠️ chart: `where: mood > 3 or gym = true` uses `or`, which is not supported/);
    });

    it("a source of only spaces reads like no source, and a padded one like the folder (B-156)", () => {
        const plain = titles(chart("source: Diary\nfield: steps\nrange: 10d"));
        expect(plain).toHaveLength(10);
        const spaced = chart('source: "   "\nfield: steps\nrange: 10d');
        expect(titles(spaced)).toEqual(plain);
        expect(diagnostics(spaced, "warning")).toEqual([]);
        const padded = chart('source: " Diary "\nfield: steps\nrange: 10d');
        expect(titles(padded)).toEqual(plain);
        expect(diagnostics(padded, "warning")).toEqual([]);
    });

    it("a missing field, a text field and an undated one each say what is wrong", () => {
        const notes: FakeNote[] = [
            { path: "Diary/2026-09-30.md", frontmatter: { running: "10 km · 51min" } },
            { path: "Diary/Template.md", frontmatter: { weight: 80 } },
        ];
        expect(diagnostics(chart("source: Diary\nfield: stpes", notes), "error")).toEqual([
            "⛔ chart: No note in the selection has \"stpes\". Check the name and `source`.",
        ]);
        expect(diagnostics(chart("source: Diary\nfield: running", notes), "error")[0]).toMatch(/^⛔ chart: "running" holds text/);
        expect(diagnostics(chart("source: Diary\nfield: weight", notes), "error")).toEqual([
            "⛔ chart: \"weight\" holds numbers only on notes without a date. Name daily notes YYYY-MM-DD, set `date_format:` if they are named another way, like DD.MM.YYYY, or add `date_field:` if the date lives in a property.",
        ]);
    });

    it("a dead series next to a live one warns instead of failing", () => {
        const el = chart("source: Diary\nseries:\n  - { field: steps }\n  - { field: stpes }");
        expect(diagnostics(el, "warning")).toEqual([
            "⚠️ chart: \"stpes\" never contributed a value here. Check the name, or that it actually holds a number, a duration like `7h 30m` or a checkbox.",
        ]);
        expect(nodes(el, "svg")).toHaveLength(1);
    });

    it("a selection with no dated note warns, naming date_field when one is set", () => {
        const notes: FakeNote[] = [{ path: "Diary/Template.md", frontmatter: { steps: 5 } }];
        expect(diagnostics(chart("source: Diary\nfield: steps", notes), "warning")).toEqual([
            "⚠️ chart: None of the selected notes has a name starting with a date like YYYY-MM-DD. Set `date_format:` if the names write it another way, like DD.MM.YYYY, or add `date_field:` if the date lives in a property instead.",
        ]);
        expect(diagnostics(chart("source: Diary\nfield: steps\ndate_field: when", notes), "warning")).toEqual([
            "⚠️ chart: None of the selected notes has a date in \"when\".",
        ]);
    });

    it("too many buckets and a single bucket both warn and still draw", () => {
        const many = chart("source: Diary\nfield: steps\nrange: 3650d");
        expect(diagnostics(many, "warning")[0]).toMatch(/only the most recent 400 are drawn/);
        expect(hits(many)).toHaveLength(400);
        const one = chart("source: Diary\nfield: steps\nbucket: month\nrange: week");
        expect(diagnostics(one, "warning")[0]).toMatch(/no longer than one `bucket`/);
        expect(hits(one)).toHaveLength(1);
    });

    it("diagnostics are translated", () => {
        setLocale("ru");
        expect(diagnostics(chart("source: Diary\nfield: [a, b]"), "error")[0]).toMatch(/^⛔ chart: Здесь `field` принимает одно свойство/);
    });
});

describe("chart: redraws and resizes", () => {
    it("a redraw replaces the chart rather than appending a second one", () => {
        const ctx = mockContext({ notes: tenDays() });
        const el = host();
        renderChart(ctx, "source: Diary\nfield: steps", el);
        renderChart(ctx, "source: Diary\nfield: steps", el);
        expect(nodes(el, "svg")).toHaveLength(1);
        expect(nodes(el, ".dashy-chart")).toHaveLength(1);
    });

    it("a redraw disconnects the previous observer; the disposer disconnects the last", () => {
        const made: { disconnected: number }[] = [];
        class FakeResizeObserver implements ResizeObserver {
            private readonly record = { disconnected: 0 };
            constructor(_callback: ResizeObserverCallback) { made.push(this.record); }
            observe(): void { /* no layout in jsdom */ }
            unobserve(): void { /* not exercised */ }
            disconnect(): void { this.record.disconnected += 1; }
        }
        const original = window.ResizeObserver;
        window.ResizeObserver = FakeResizeObserver;
        try {
            const ctx = mockContext({ notes: tenDays() });
            const el = host();
            renderChart(ctx, "source: Diary\nfield: steps", el);
            const dispose = renderChart(ctx, "source: Diary\nfield: steps", el);
            expect(made.map((m) => m.disconnected)).toEqual([1, 0]);
            expect(typeof dispose).toBe("function");
            if (typeof dispose === "function") dispose();
            expect(made.map((m) => m.disconnected)).toEqual([1, 1]);
        } finally {
            window.ResizeObserver = original;
        }
    });

    it("a resize lays the SVG out again at the new width without walking the vault again", () => {
        let fire: () => void = () => undefined;
        class ManualResizeObserver implements ResizeObserver {
            constructor(callback: ResizeObserverCallback) { fire = () => callback([], this); }
            observe(): void { /* fired by hand */ }
            unobserve(): void { /* not exercised */ }
            disconnect(): void { /* not exercised */ }
        }
        const original = window.ResizeObserver;
        window.ResizeObserver = ManualResizeObserver;
        try {
            const { ctx, walks } = countingContext({ notes: tenDays() });
            const el = host();
            renderChart(ctx, "source: Diary\nfield: steps\nrange: 10d", el);
            const svg = nodes(el, "svg")[0]!;
            expect(svg.getAttribute("viewBox")).toBe("0 0 600 160");
            const walked = walks();
            const plot = nodes(el, ".dashy-chart-plot")[0]!;
            Object.defineProperty(plot, "clientWidth", { value: 300, configurable: true });
            Object.defineProperty(plot, "clientHeight", { value: 120, configurable: true });
            fire();
            expect(svg.getAttribute("viewBox")).toBe("0 0 300 120");
            const last = hits(el)[9]!;
            expect(Number.parseFloat(last.style.left) + Number.parseFloat(last.style.width)).toBeLessThanOrEqual(300);
            expect(walks()).toBe(walked);
            // The same size again repaints nothing.
            const before = svg.innerHTML;
            fire();
            expect(svg.innerHTML).toBe(before);
        } finally {
            window.ResizeObserver = original;
        }
    });
});

describe("chart: on a phone (B-092)", () => {
    it("the first tap writes the tooltip into the status line; a second tap on a day opens it", () => {
        Platform.isMobile = true;
        const el = chart("source: Diary\nfield: steps\nrange: 3d");
        const status = nodes(el, ".dashy-chart-status")[0]!;
        expect(status.getAttribute("aria-live")).toBe("polite");
        const [first, second] = [hits(el)[2]!, hits(el)[1]!];

        const tap = (node: HTMLElement): boolean => {
            const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
            node.dispatchEvent(evt);
            return evt.defaultPrevented;
        };
        expect(tap(first)).toBe(true);
        expect(status.textContent).toBe("Sep 30, 2026: steps 10000 (2026-09-30)");
        expect(first.classList.contains("is-selected")).toBe(true);

        expect(tap(second)).toBe(true);
        expect(first.classList.contains("is-selected")).toBe(false);
        expect(second.classList.contains("is-selected")).toBe(true);

        // The same bucket again: left alone, so Obsidian's link handling opens the note.
        expect(tap(second)).toBe(false);
    });

    it("no status line and no interception on desktop", () => {
        const el = chart("source: Diary\nfield: steps\nrange: 3d");
        expect(nodes(el, ".dashy-chart-status")).toHaveLength(0);
        const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
        hits(el)[2]!.dispatchEvent(evt);
        expect(evt.defaultPrevented).toBe(false);
    });
});

describe("chart: colours", () => {
    it("no colour literal is emitted outside rgba(palette)", () => {
        const el = chart([
            "source: Diary", "type: bar", "goal: 5", "bucket: week",
            "series:", "  - { field: steps, color: \"#8b6cef\" }", "  - { field: mood }",
        ].join("\n"));
        const html = el.innerHTML;
        expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        // jsdom reads an inline `rgba(..., 1)` back as `rgb(...)`; either way
        // the only colours are the series' own, the written one and the
        // next palette colour. Everything else comes from CSS tokens.
        const colours = new Set([...html.matchAll(/rgba?\((\d+), (\d+), (\d+)/g)].map((m) => `${m[1]},${m[2]},${m[3]}`));
        expect([...colours].sort()).toEqual(["139,108,239", "59,130,246"]);
    });
});

describe("chart: a source or tag that is not text is an error (B-160)", () => {
    it("source: 2024 says to quote it", () => {
        const el = chart("source: 2024\nfield: steps\nrange: 10d");
        expect(diagnostics(el, "error")).toEqual([
            '⛔ chart: `source` must be a folder name in text, got `2024`, so it was ignored and the whole vault is read. Put the folder name in quotes, as written: `source: "2024"`.',
        ]);
    });

    it("quoted, a folder named 2024 is charted without a word", () => {
        const el = chart('source: "2024"\nfield: steps\nrange: 10d', diary("2024", "2026-09-21", 10, (i) => ({ steps: 100 * (i + 1) })));
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(hits(el)).toHaveLength(10);
    });

    it("tag: true names the one-tag fix", () => {
        const el = chart("source: Diary\ntag: true\nfield: steps\nrange: 10d");
        expect(diagnostics(el, "error")).toEqual([
            "⛔ chart: `tag` must be one tag name in text, got `true`, so it was ignored and the tag filter is dropped. Name one tag, like `tag: book`.",
        ]);
    });
});

describe("chart: dates not written as YYYY-MM-DD (B-120)", () => {
    /** The same ten days as `tenDays`, named DD.MM.YYYY. */
    const dotted = (): FakeNote[] => tenDays().map((n) => {
        const [y, m, d] = n.path.slice("Diary/".length, -".md".length).split("-");
        return { ...n, path: `Diary/${d}.${m}.${y}.md` };
    });
    const render = (config: string, vault: Parameters<typeof mockContext>[0]) => {
        const el = host();
        renderChart(mockContext(vault), config, el);
        return el;
    };

    it("without a format the names are undated, and the block says so", () => {
        const el = render("source: Diary\nfield: steps\nrange: 10d", { notes: dotted() });
        expect(diagnostics(el, "warning")[0]).toContain("None of the selected notes has a name starting with a date");
    });

    it("the Daily notes day format buckets every note", () => {
        const el = render("source: Diary\nfield: steps\nrange: 10d", { notes: dotted(), dailyNotes: { format: "DD.MM.YYYY" } });
        expect(titles(el)[9]).toBe("Sep 30, 2026: steps 10000 (30.09.2026)");
        expect(hits(el)[9]!.getAttribute("data-href")).toBe("Diary/30.09.2026.md");
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("date_format does the same with no settings, and wins over them", () => {
        const el = render("source: Diary\nfield: steps\nrange: 10d\ndate_format: DD.MM.YYYY", {
            notes: dotted(),
            dailyNotes: { format: "MM.DD.YYYY" },
        });
        expect(titles(el)[0]).toBe("Sep 21, 2026: steps 1000 (21.09.2026)");
        expect(titles(el)[9]).toBe("Sep 30, 2026: steps 10000 (30.09.2026)");
    });

    it("a date_format no note fits warns, naming it and the first note", () => {
        const el = render("source: Diary\nfield: steps\nrange: 10d\ndate_format: YYYYMMDD", { notes: dotted() });
        expect(diagnostics(el, "warning")).toContain(
            "⚠️ chart: `date_format: YYYYMMDD` fits none of the selected notes: \"21.09.2026\", for one, is not written that way.",
        );
    });
});
