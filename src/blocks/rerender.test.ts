import { describe, it, expect } from "vitest";
import { renderTiles } from "./tiles";
import { renderStats } from "./stats";
import { renderProgress } from "./progress";
import { renderToday } from "./today";
import { renderCountdown } from "./countdown";
import { renderHeatmap } from "./heatmap";
import { mockContext, diary, host, nodes } from "../test/vault";

/**
 * Obsidian may run a code block processor again over an element it has already
 * rendered — enabling the plugin with the note already open does it. Caught by
 * a real Obsidian showing every block twice; this is the guard.
 */

const ctx = mockContext({ notes: diary("Diary", "2026-01-01", 10, (i) => ({ v: i + 1 })) });

const cases: [string, (el: HTMLElement) => void, string][] = [
    ["tiles", (el) => renderTiles(ctx, "items:\n  - { label: A, path: Diary }", el), ".dashy-tile"],
    ["stats", (el) => renderStats(ctx, "items:\n  - { label: A, source: Diary, agg: count }", el), ".dashy-stat"],
    ["progress", (el) => renderProgress(ctx, "items:\n  - { label: A, source: Diary, agg: count, goal: 40 }", el), ".dashy-progress-row"],
    ["today", (el) => renderToday(ctx, "daily: true", el), ".dashy-today-chip"],
    ["countdown", (el) => renderCountdown(ctx, "items:\n  - { label: A, date: 2099-01-01 }", el), ".dashy-countdown-card"],
    ["heatmap", (el) => renderHeatmap(ctx, "source: Diary\nfield: v", el), ".dashy-hm-grid"],
];

describe("rendering twice into the same element", () => {
    for (const [name, render, selector] of cases) {
        it(`${name} replaces its output instead of appending a second copy`, () => {
            const el = host();
            render(el);
            const once = nodes(el, selector).length;
            expect(once).toBeGreaterThan(0);

            render(el);
            expect(nodes(el, selector)).toHaveLength(once);
        });
    }

    it("diagnostics are not repeated either", () => {
        const el = host();
        renderStats(ctx, "items:\n  - { label: Broken, source: Diary, agg: avg }", el);
        renderStats(ctx, "items:\n  - { label: Broken, source: Diary, agg: avg }", el);
        expect(nodes(el, ".dashy-diag-error")).toHaveLength(1);
    });
});
