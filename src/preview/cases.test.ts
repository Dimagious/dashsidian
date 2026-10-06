import { describe, it, expect, afterEach } from "vitest";
import { CASES } from "./cases";
import { BLOCKS, fakeVault, previewContext, withDates } from "./fixture";
import { setLocale, AVAILABLE_LOCALES } from "../i18n";

/**
 * The stand is a developer tool, but a stale one is worse than none: it was
 * rebuilt from scratch every time it was wanted, because nothing held it to the
 * code it draws. This does.
 */

const ctx = previewContext(fakeVault());
afterEach(() => setLocale("en"));

const render = (index: number): HTMLElement => {
    const item = CASES[index]!;
    const el = document.createElement("div");
    BLOCKS[item.block]?.(ctx, withDates(item.source), el);
    return el;
};

describe("preview cases", () => {
    it("names only blocks that exist", () => {
        for (const item of CASES) {
            expect(BLOCKS[item.block], item.block).toBeTypeOf("function");
        }
    });

    it("covers every block the plugin registers", () => {
        const used = new Set(CASES.map((c) => c.block));
        expect([...Object.keys(BLOCKS)].filter((b) => !used.has(b))).toEqual([]);
    });

    it("every case draws something", () => {
        CASES.forEach((item, i) => {
            expect(render(i).children.length, item.title).toBeGreaterThan(0);
        });
    });

    it("draws in every language we ship", () => {
        for (const locale of AVAILABLE_LOCALES) {
            setLocale(locale);
            CASES.forEach((item, i) => {
                expect(render(i).children.length, `${locale} / ${item.title}`).toBeGreaterThan(0);
            });
        }
    });

    it("the stand shows the awkward states, not only the pretty ones", () => {
        const all = CASES.map((_, i) => render(i).innerHTML).join("");
        expect(all, "a broken config").toContain("dashy-diag-error");
        expect(all, "a warning").toContain("dashy-diag-warning");
        expect(all, "nothing to count").toContain("is-empty");
        expect(all, "a goal already met").toContain("is-complete");
        expect(all, "a note not created yet").toContain("is-missing");
        expect(all, "a window not started yet (B-129)").toContain("dashy-notice");
    });

    it("the dated window cases move with the calendar (B-129)", () => {
        const closed = CASES.find((c) => c.source.includes("LAST_WEEK"))!;
        expect(withDates(closed.source)).not.toContain("LAST_WEEK");
        expect(withDates(closed.source)).toMatch(/period: \d{4}-W\d{2}\n/);
        const html = render(CASES.indexOf(closed)).innerHTML;
        expect(html).toContain("dashy-stat-delta");
        expect(html).not.toContain("dashy-diag");
    });

    it("the dated cases move with the calendar", () => {
        const countdown = CASES.find((c) => c.source.includes("TODAY"))!;
        expect(withDates(countdown.source)).not.toContain("TODAY");
        expect(withDates(countdown.source)).toContain(String(new Date().getFullYear()));
    });

    it("the duration cases draw durations, not dashes or raw minutes (B-121)", () => {
        const stats = CASES.findIndex((c) => c.title.startsWith("stats — длительности"));
        const progress = CASES.findIndex((c) => c.title.startsWith("progress — длительность"));
        const values = Array.from(render(stats).querySelectorAll(".dashy-stat-value"), (n) => n.textContent ?? "");
        // The average and the monthly sum read as durations; the streak counts nights.
        expect(values[0]).toMatch(/^\d+h( \d+m)?$/);
        expect(values[1]).toMatch(/^\d+h( \d+m)?$/);
        expect(values[2]).toMatch(/^\d+$/);
        const bar = render(progress).querySelector(".dashy-progress-value")?.textContent ?? "";
        expect(bar).toMatch(/^\d+h( \d+m)? \/ 8h \d+%$/);
    });

    it("the chart cases draw lines, bars, a partial week, durations and an empty window (ADR 0005)", () => {
        const html = CASES.map((c, i) => (c.block === "chart" ? render(i).innerHTML : "")).join("");
        expect(html).toContain("dashy-chart-line");
        expect(html).toContain("dashy-chart-bar is-partial");
        expect(html).toContain("dashy-chart-empty");
        expect(html).toContain("dashy-chart-legend");
        const durations = CASES.findIndex((c) => c.title.startsWith("chart — длительности"));
        const labels = Array.from(render(durations).querySelectorAll(".dashy-chart-leg"), (n) => n.textContent ?? "");
        expect(labels).toEqual(["goal 7h"]);
    });

    it("the fake vault has gaps, so a heatmap is not a solid wall", () => {
        const notes = fakeVault().filter((n) => n.folder === "Diary");
        expect(notes.length).toBeLessThan(120);
        expect(notes.length).toBeGreaterThan(100);
    });
});
