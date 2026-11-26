import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHeatmap } from "./heatmap";
import { renderStats } from "./stats";
import { renderChart } from "./chart";
import type { BlockContext } from "./context";
import { mockContext, diary, host, texts, nodes, diagnostics, type FakeNote } from "../test/vault";
import { setWeekStart, setDateLocale } from "../adapters/datetime";

// "Week starts on" (B-231): the setting replaces the language's first day in
// every block that draws a week. English starts on Sunday, so each Monday
// result below is the setting at work and not the locale.

const ctx = mockContext({ notes: diary("Diary", "2026-09-25", 20, () => ({ gym: true })) });
// 2026-10-08 is a Thursday.
const TODAY = new Date(2026, 9, 8, 12, 0, 0);
const WEEK = "source: Diary\nfield: gym\nrange: week\nlayout: calendar";

afterEach(() => {
    setWeekStart(null);
    setDateLocale(null);
    vi.useRealTimers();
});

function draw(): HTMLElement {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    const el = host();
    renderHeatmap(ctx, WEEK, el);
    return el;
}

describe("week start setting in a block", () => {
    it("auto follows the English locale: Sunday first, 4 to 10 October", () => {
        const el = draw();
        expect(diagnostics(el, "error")).toEqual([]);
        expect(texts(el, ".dashy-hm-cal-wd")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
        expect(texts(el, ".dashy-hm-cal-num")).toEqual(["4", "5", "6", "7", "8", "9", "10"]);
    });

    it("Monday under an English (Sunday) locale moves the weekday row and the window", () => {
        setWeekStart(1);
        const el = draw();
        expect(texts(el, ".dashy-hm-cal-wd")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
        expect(texts(el, ".dashy-hm-cal-num")).toEqual(["5", "6", "7", "8", "9", "10", "11"]);
    });

    it("Saturday starts the week on 3 October", () => {
        setWeekStart(6);
        const el = draw();
        expect(texts(el, ".dashy-hm-cal-wd")[0]).toBe("Sat");
        expect(texts(el, ".dashy-hm-cal-num")).toEqual(["3", "4", "5", "6", "7", "8", "9"]);
    });

    it("the setting wins over a Monday-first language too", () => {
        setDateLocale("ru");
        setWeekStart(0);
        const el = draw();
        expect(texts(el, ".dashy-hm-cal-wd")[0]).toBe("вс");
        expect(texts(el, ".dashy-hm-cal-num")).toEqual(["4", "5", "6", "7", "8", "9", "10"]);
    });
});

describe("stats compare and chart weeks with a Monday start (B-231)", () => {
    // 2026-09-24 is a Thursday. Sunday the 20th is ticked: with a Monday start it belongs
    // to the week before, so this week is Mon 21 .. Thu 24 (4) and the one before it
    // Mon 14 .. Thu 17 (2). With the English Sunday start it would be 5 against 3.
    const gym = (days: number[]): FakeNote[] => days.map((d) => ({ path: `Diary/2026-09-${d}.md`, frontmatter: { gym: true } }));
    const notes = gym([14, 17, 20, 21, 22, 23, 24]);
    const STATS = "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, compare: true }";

    function stats(day: Date): HTMLElement {
        vi.useFakeTimers();
        vi.setSystemTime(day);
        const el = host();
        renderStats(mockContext({ notes }), STATS, el);
        return el;
    }

    it("auto: Sunday the 20th is in this week", () => {
        expect(texts(stats(new Date(2026, 8, 24, 12)), ".dashy-stat-value")).toEqual(["5"]);
    });

    it("Monday: this week is 21 to 24 and last week's same stretch is 14 to 17", () => {
        setWeekStart(1);
        const el = stats(new Date(2026, 8, 24, 12));
        expect(texts(el, ".dashy-stat-value")).toEqual(["4"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▲ +2 (was 2)"]);
    });

    it("chart week buckets start on Monday and say so in the tooltip", () => {
        setWeekStart(1);
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 30, 12));
        const el = host();
        renderChart(mockContext({ notes: diary("Diary", "2026-09-14", 17, () => ({ steps: 1000 })) }), "source: Diary\nfield: steps\nbucket: week\nrange: 14d", el);
        const titles = nodes(el, ".dashy-chart-hit").map((h) => h.getAttribute("title") ?? "");
        expect(titles).toHaveLength(3);
        expect(titles[0]).toMatch(/^Week of Mon Sep 14, 2026/);
        expect(titles[1]).toMatch(/^Week of Mon Sep 21, 2026: steps 7000 \(7 notes\)/);
        expect(titles[2]).toMatch(/^Week of Mon Sep 28, 2026.*so far/);
    });
});

describe("a named week keeps Obsidian's locale start whatever the setting says (B-231)", () => {
    const at = (path: string, today: Date, notes: FakeNote[]): BlockContext => ({ ...mockContext({ notes }), today: () => today, sourcePath: path });
    const count = (ctx: BlockContext, period: string): HTMLElement => {
        const el = host();
        renderStats(ctx, `source: Diary\nperiod: ${period}\nitems:\n  - { label: N, agg: count, field: gym }`, el);
        return el;
    };
    // 26 September to 5 October, every day noted. W40 is the seven days 28 September to 4 October.
    const notes = diary("Diary", "2026-09-26", 10, () => ({ gym: true }));
    const TODAY_AFTER = new Date(2026, 9, 20);

    it("2026-W40 counts the same seven days under Auto and Monday", () => {
        const auto = texts(count(at("Home.md", TODAY_AFTER, notes), "2026-W40"), ".dashy-stat-value");
        setWeekStart(1);
        const monday = texts(count(at("Home.md", TODAY_AFTER, notes), "2026-W40"), ".dashy-stat-value");
        expect(auto).toEqual(["7"]);
        expect(monday).toEqual(["7"]);
    });

    it("period: note in a note named 2026-W40 stays on the same seven days", () => {
        setWeekStart(1);
        expect(texts(count(at("Reviews/2026-W40.md", TODAY_AFTER, notes), "note"), ".dashy-stat-value")).toEqual(["7"]);
    });

    it("a week that has not started yet still says when it starts, where the name puts it", () => {
        setWeekStart(1);
        // Without a weekly format saved the name reads as an ISO week: W42 starts on Monday 12 October, with or without the setting.
        const el = count(at("Home.md", new Date(2026, 9, 8), notes), "2026-W42");
        expect(texts(el, ".dashy-notice")).toEqual(["This window starts on Oct 12, 2026, so there is nothing to count yet."]);
    });

    it("period: week with a Monday start has already begun on a Monday", () => {
        setWeekStart(1);
        // Monday 5 October: the week is just that day, where the Sunday start would reach back to the 4th.
        const el = count(at("Home.md", new Date(2026, 9, 5), notes), "week");
        expect(texts(el, ".dashy-stat-value")).toEqual(["1"]);
    });
});
