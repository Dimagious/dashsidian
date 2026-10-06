import { describe, it, expect, afterEach } from "vitest";
import { renderStats } from "./stats";
import type { BlockContext } from "./context";
import { mockContext, diary, host, texts, nodes, diagnostics, type FakeNote } from "../test/vault";
import { setLocale } from "../i18n";

/**
 * B-135, `compare: usual`: the delta against the card's own average before
 * the window, not against the previous period. Today is Thursday 24
 * September 2026; the English locale's week starts on Sunday, so
 * `period: week` is Sun 20 .. Thu 24.
 */
const TODAY = new Date(2026, 8, 24);

const at = (notes: FakeNote[], sourcePath = "Home.md", today: Date = TODAY): BlockContext =>
    ({ ...mockContext({ notes }), today: () => today, sourcePath });

const draw = (ctx: BlockContext, config: string): HTMLElement => {
    const el = host();
    renderStats(ctx, config, el);
    return el;
};

// 1 .. 19 September at 85 every day; the week averages 82 (80, 84, 82, 81, 83).
const history = diary("Diary", "2026-09-01", 19, () => ({ sleep_score: 85 }));
const thisWeek = diary("Diary", "2026-09-20", 5, (i) => ({ sleep_score: [80, 84, 82, 81, 83][i] }));
const sleep = at([...history, ...thisWeek]);

afterEach(() => setLocale("en"));

describe("stats — compare: usual (B-135)", () => {
    it("a week under the usual level: the card's own number, a down arrow, red under better: up", () => {
        const el = draw(sleep,
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: usual, better: up }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["82"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −3"]);
        const delta = nodes(el, ".dashy-stat-delta")[0];
        expect(delta?.className).toContain("dashy-stat-delta-bad");
        expect(delta?.getAttribute("title")).toBe("vs usual: 85");
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("better: down turns the same fall good", () => {
        const el = draw(sleep,
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: usual, better: down }");
        expect(nodes(el, ".dashy-stat-delta")[0]?.className).toContain("dashy-stat-delta-good");
    });

    it("the window is left out of the usual level", () => {
        // Were the week part of it, the usual level would read (19 × 85 + 5 × 40) / 24 = 75.6
        // and the delta −35.6; without it, 85 and −45.
        const low = diary("Diary", "2026-09-20", 5, () => ({ sleep_score: 40 }));
        const el = draw(at([...history, ...low]),
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: usual }");
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −45"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.getAttribute("title")).toBe("vs usual: 85");
    });

    it("compare: true on the same notes still compares with the same days last week", () => {
        const el = draw(sleep,
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: true, better: up }");
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −3"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.getAttribute("title")).toBe("vs the same days last week: 85");
    });

    it("no note before the window: no delta, a muted hint, and no warning", () => {
        const el = draw(at(thisWeek),
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: usual }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["82"]);
        expect(nodes(el, ".dashy-stat-delta-arrow")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-delta-hint")).toEqual(["no history before this period"]);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(diagnostics(el, "error")).toEqual([]);
    });

    it("notes before the window that never carry the field are no history either", () => {
        const bare = diary("Diary", "2026-09-01", 19, () => ({ mood: 3 }));
        const el = draw(at([...bare, ...thisWeek]),
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: usual }");
        expect(texts(el, ".dashy-stat-delta-hint")).toEqual(["no history before this period"]);
        expect(nodes(el, ".dashy-stat-delta-arrow")).toHaveLength(0);
    });

    it("an empty window draws a dash and no hint: there is nothing to compare yet", () => {
        const el = draw(at(history),
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: usual }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["—"]);
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
    });

    it("the hint is translated", () => {
        setLocale("ru");
        const el = draw(at(thisWeek),
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: usual }");
        expect(texts(el, ".dashy-stat-delta-hint")).toEqual(["до этого периода данных нет"]);
    });

    it("any aggregate but avg warns and draws no delta, while the card keeps its number", () => {
        const el = draw(sleep,
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: sum, period: week, compare: usual }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["410"]);
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ stats: "Sleep": `compare: usual` works only with `agg: avg`. The usual level is an average, so no delta is drawn.',
        ]);
    });

    it("without a period it says it needs one", () => {
        const el = draw(sleep, "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, compare: usual }");
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ stats: "Sleep": `compare` needs `period` set. There is nothing to compare against.',
        ]);
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
    });

    it("durations: the usual level and the delta read as durations", () => {
        const nights = [
            ...diary("Diary", "2026-09-01", 19, () => ({ sleep: "7h" })),
            ...diary("Diary", "2026-09-20", 5, () => ({ sleep: "6h 12m" })),
        ];
        const el = draw(at(nights),
            "items:\n  - { label: Sleep, source: Diary, field: sleep, agg: avg, period: week, compare: usual, better: up }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["6h 12m"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −48m"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.getAttribute("title")).toBe("vs usual: 7h");
    });

    it("decimals follow the card's precision on both the delta and the usual level", () => {
        const odd = diary("Diary", "2026-09-01", 3, (i) => ({ sleep_score: [80, 81, 81][i] }));
        const el = draw(at([...odd, ...thisWeek]),
            "items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: usual, precision: 2 }");
        // usual (80 + 81 + 81) / 3 = 80.67; the week 82.00.
        expect(texts(el, ".dashy-stat-value")).toEqual(["82.00"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▲ +1.33"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.getAttribute("title")).toBe("vs usual: 80.67");
    });

    it("date_field decides which notes are history, as it decides the window", () => {
        // Names carry no date; `logged` does. The name order is the reverse of the dates.
        const logged = (name: string, date: string, score: number): FakeNote =>
            ({ path: `Log/${name}.md`, frontmatter: { logged: date, sleep_score: score } });
        const notes = [
            logged("a", "2026-09-22", 82),
            logged("b", "2026-09-10", 90),
            logged("c", "2026-09-02", 80),
        ];
        const el = draw(at(notes),
            "items:\n  - { label: Sleep, source: Log, field: sleep_score, agg: avg, period: week, date_field: logged, compare: usual }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["82"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −3"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.getAttribute("title")).toBe("vs usual: 85");
    });

    it("an inherited root period serves compare: usual", () => {
        const el = draw(sleep, `source: Diary
period: week
items:
  - { label: Sleep, field: sleep_score, agg: avg, compare: usual }`);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −3"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.getAttribute("title")).toBe("vs usual: 85");
    });

    it("a weekly review note: period: note counts its own week, and what came after it is not history", () => {
        // ISO week 40 is Mon 28 September .. Sun 4 October; today is 20 October.
        const notes = [
            ...diary("Diary", "2026-09-01", 27, () => ({ sleep_score: 85 })),
            ...diary("Diary", "2026-09-28", 7, () => ({ sleep_score: 82 })),
            ...diary("Diary", "2026-10-05", 16, () => ({ sleep_score: 50 })),
        ];
        const el = draw(at(notes, "Reviews/2026-W40.md", new Date(2026, 9, 20)), `source: Diary
period: note
items:
  - { label: Sleep, field: sleep_score, agg: avg, compare: usual, better: up }`);
        expect(diagnostics(el, "error")).toEqual([]);
        expect(texts(el, ".dashy-stat-value")).toEqual(["82"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −3"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.getAttribute("title")).toBe("vs usual: 85");
    });

    it("layout: inline draws the same small arrow after the label, and the hint only as a tooltip on the number", () => {
        const el = draw(sleep, `layout: inline
items:
  - { label: sleep, source: Diary, field: sleep_score, agg: avg, period: week, compare: usual, better: up }
  - { label: fresh, source: Diary, field: sleep_score, agg: avg, period: { from: 2026-09-01, to: 2026-09-05 }, compare: usual }`);
        const items = nodes(el, ".dashy-stat-inline");
        // The hint never sits in the nowrap line, where it would overflow a narrow pane.
        expect(items.map((i) => i.textContent)).toEqual(["82 sleep ▼ −3", "85 fresh"]);
        expect(nodes(el, ".dashy-stat-delta-hint")).toHaveLength(0);
        const delta = items[0]?.querySelector(".dashy-stat-delta");
        expect(delta?.className).toContain("dashy-stat-delta-bad");
        expect(delta?.getAttribute("title")).toBe("vs usual: 85");
        expect(items[0]?.querySelector(".dashy-stat-inline-value")?.hasAttribute("title")).toBe(false);
        expect(items[1]?.querySelector(".dashy-stat-inline-value")?.getAttribute("title")).toBe("no history before this period");
    });
});
