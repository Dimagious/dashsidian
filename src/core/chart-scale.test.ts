import { describe, it, expect } from "vitest";
import { chartDomain, niceTicks } from "./chart-scale";
import { formatValue } from "./stat";
import { formatDuration } from "./duration";

describe("chartDomain", () => {
    it("a line covers its data's own minimum to maximum", () => {
        expect(chartDomain([72, null, 90, 81], { zeroBased: false })).toEqual({ min: 72, max: 90 });
    });

    it("bars always include zero, with positive data", () => {
        expect(chartDomain([12, 30, 25], { zeroBased: true })).toEqual({ min: 0, max: 30 });
    });

    it("bars hang below zero with negative data, and span both sides with mixed", () => {
        expect(chartDomain([-0.4, -1.2], { zeroBased: true })).toEqual({ min: -1.2, max: 0 });
        expect(chartDomain([-2, 5], { zeroBased: true })).toEqual({ min: -2, max: 5 });
    });

    it("a flat line is padded symmetrically instead of collapsing to zero height", () => {
        expect(chartDomain([7, 7, 7], { zeroBased: false })).toEqual({ min: 6.3, max: 7.7 });
        expect(chartDomain([0, 0], { zeroBased: false })).toEqual({ min: -1, max: 1 });
    });

    it("an all-zero bar chart opens upwards", () => {
        expect(chartDomain([0, 0, null], { zeroBased: true })).toEqual({ min: 0, max: 1 });
    });

    it("a goal outside the data extends the domain, above or below", () => {
        expect(chartDomain([20, 30], { zeroBased: true, goal: 40 })).toEqual({ min: 0, max: 40 });
        expect(chartDomain([70, 80], { zeroBased: false, goal: 60 })).toEqual({ min: 60, max: 80 });
    });

    it("nothing to scale is null, but a goal alone is still a domain", () => {
        expect(chartDomain([null, null], { zeroBased: false })).toBeNull();
        expect(chartDomain([], { zeroBased: true })).toBeNull();
        expect(chartDomain([null], { zeroBased: false, goal: 8 })).toEqual({ min: 7.2, max: 8.8 });
    });
});

describe("niceTicks", () => {
    it("three nice numbers covering the range, the domain rounded out to them", () => {
        expect(niceTicks(0, 30, 3)).toEqual([0, 20, 40]);
        expect(niceTicks(72, 90, 3)).toEqual([70, 80, 90]);
        expect(niceTicks(6.3, 7.7, 3)).toEqual([6, 7, 8]);
    });

    it("never more than asked for, and always covering both ends", () => {
        for (const [min, max] of [[0, 1], [3, 97], [5.5, 9.5], [-12, 40], [0.02, 0.09], [1200, 98000], [-1.2, 0]]) {
            const ticks = niceTicks(min!, max!, 3);
            expect(ticks.length, `${min}..${max}`).toBeLessThanOrEqual(3);
            expect(ticks.length, `${min}..${max}`).toBeGreaterThanOrEqual(2);
            expect(ticks[0]!, `${min}..${max}`).toBeLessThanOrEqual(min!);
            expect(ticks[ticks.length - 1]!, `${min}..${max}`).toBeGreaterThanOrEqual(max!);
        }
    });

    it("a range crossing zero puts a tick on zero", () => {
        expect(niceTicks(-2, 5, 3)).toEqual([-5, 0, 5]);
    });

    it("no two labels read the same at the data's precision (the B-116 lesson)", () => {
        // A narrow integer range at precision 0 would otherwise tick at 0.5.
        const ticks = niceTicks(3, 4, 3, { grain: 1 });
        const labels = ticks.map((v) => formatValue(v, 0));
        expect(new Set(labels).size).toBe(labels.length);
        expect(ticks).toEqual([3, 4]);
        // The default grain is one decimal, what `roundedValue` keeps.
        const fine = niceTicks(0.01, 0.03, 3).map((v) => formatValue(v));
        expect(new Set(fine).size).toBe(fine.length);
    });

    it("values carry no floating point noise", () => {
        expect(niceTicks(0.1, 0.5, 3)).toEqual([0, 0.5]);
        expect(niceTicks(0.1, 0.3, 3, { grain: 0.01 })).toEqual([0.1, 0.2, 0.3]);
    });

    it("durations step on the clock: whole hours, not powers of ten minutes", () => {
        // 5h 30m to 8h 10m of sleep.
        const ticks = niceTicks(330, 490, 3, { duration: true, grain: 1 / 60 });
        expect(ticks).toEqual([180, 360, 540]);
        expect(ticks.map((v) => formatDuration(v))).toEqual(["3h", "6h", "9h"]);
        // A weekly sum in the tens of hours, and more than a day.
        expect(niceTicks(2800, 3200, 3, { duration: true }).every((v) => v % 60 === 0)).toBe(true);
        expect(niceTicks(0, 20000, 3, { duration: true })).toEqual([0, 14400, 28800]);
    });

    it("duration labels never repeat: whole minutes from an hour up, seconds below it", () => {
        for (const [min, max] of [[447.2, 447.6], [61, 61.4], [59.2, 59.6], [0.1, 0.4]]) {
            const labels = niceTicks(min!, max!, 3, { duration: true }).map((v) => formatDuration(v));
            expect(new Set(labels).size, `${min}..${max}: ${labels.join(", ")}`).toBe(labels.length);
        }
        expect(niceTicks(447.2, 447.6, 3, { duration: true }).map((v) => formatDuration(v))).toEqual(["7h 27m", "7h 28m"]);
        // Under an hour a step of seconds is still allowed.
        expect(niceTicks(0.1, 0.4, 3, { duration: true }).map((v) => formatDuration(v))).toEqual(["0m", "15s", "30s"]);
    });

    it("an empty or inverted range is a single value, not a loop", () => {
        expect(niceTicks(5, 5, 3)).toEqual([5]);
        expect(niceTicks(9, 1, 3)).toEqual([9]);
        expect(niceTicks(Number.NaN, 1, 3)).toEqual([Number.NaN]);
    });
});
