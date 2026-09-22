import { describe, it, expect } from "vitest";
import { readTrendDays, sparkBars, MIN_TREND_DAYS, MAX_TREND_DAYS } from "./sparkline";

describe("readTrendDays", () => {
    it("reads the form the spec uses", () => {
        expect(readTrendDays("30d")).toBe(30);
    });

    it("a bare number is the same thing", () => {
        expect(readTrendDays(30)).toBe(30);
        expect(readTrendDays("30")).toBe(30);
    });

    it("spaces and case do not matter", () => {
        expect(readTrendDays("  90 D ")).toBe(90);
    });

    it("the window has to be long enough to have a shape", () => {
        expect(readTrendDays(MIN_TREND_DAYS)).toBe(MIN_TREND_DAYS);
        expect(readTrendDays(MIN_TREND_DAYS - 1)).toBeNull();
        expect(readTrendDays(0)).toBeNull();
    });

    it("and short enough for a card", () => {
        expect(readTrendDays(MAX_TREND_DAYS)).toBe(MAX_TREND_DAYS);
        expect(readTrendDays(MAX_TREND_DAYS + 1)).toBeNull();
    });

    it("anything else is refused rather than guessed at", () => {
        for (const raw of ["last month", "30 days", "1w", "", "-5", "3.5", null, undefined, {}, []]) {
            expect(readTrendDays(raw), String(raw)).toBeNull();
        }
    });
});

describe("sparkBars", () => {
    it("the largest value is full height and the smallest is the floor", () => {
        const bars = sparkBars([10, 20, 30]);
        expect(bars[2]).toBe(100);
        expect(bars[0]).toBeLessThan(20);
        expect(bars[0]).toBeGreaterThan(0);
    });

    it("keeps the shape of the run, not its distance from zero", () => {
        // 70..80 scaled from zero would be a flat line saying nothing.
        const bars = sparkBars([70, 75, 80]);
        expect(bars[0]).toBeLessThan(bars[1]!);
        expect(bars[1]).toBeLessThan(bars[2]!);
    });

    it("a run that never changes is full, not flattened to nothing", () => {
        expect(sparkBars([5, 5, 5])).toEqual([100, 100, 100]);
    });

    it("one value is one full bar", () => {
        expect(sparkBars([42])).toEqual([100]);
    });

    it("nothing to plot is no bars", () => {
        expect(sparkBars([])).toEqual([]);
    });

    it("every bar stays inside the box", () => {
        for (const bar of sparkBars([-50, 0, 3, 1000])) {
            expect(bar).toBeGreaterThanOrEqual(0);
            expect(bar).toBeLessThanOrEqual(100);
        }
    });

    it("negative values are plotted by their shape too", () => {
        const bars = sparkBars([-10, -5, 0]);
        expect(bars[0]).toBeLessThan(bars[2]!);
        expect(bars[2]).toBe(100);
    });

    it("one bar per value, in order", () => {
        expect(sparkBars([1, 9, 2, 8])).toHaveLength(4);
        expect(sparkBars([1, 9, 2, 8])[1]).toBe(100);
    });
});
