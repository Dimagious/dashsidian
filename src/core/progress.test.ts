import { describe, it, expect } from "vitest";
import { readProgress, percentOf, barWidth } from "./progress";

describe("readProgress", () => {
    it("carries the goal alongside the aggregate", () => {
        const { spec, diagnostics } = readProgress(
            { label: "Books", source: "Books", agg: "count", goal: 50 }, "Books");
        expect(spec).toEqual({ agg: "count", goal: 50 });
        expect(diagnostics).toEqual([]);
    });

    it("keeps everything a card would read", () => {
        const { spec } = readProgress(
            { agg: "sum", field: "distance_km", goal: 200, unit: "km", precision: 1 }, "Running");
        expect(spec).toEqual({ agg: "sum", field: "distance_km", goal: 200, unit: "km", precision: 1 });
    });

    it("a numeric string goal is accepted", () => {
        expect(readProgress({ agg: "count", goal: "50" }, "X").spec?.goal).toBe(50);
    });

    it("no goal is an error — there is nothing to measure against", () => {
        const { spec, diagnostics } = readProgress({ agg: "count" }, "Books");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.level).toBe("error");
    });

    it("a goal that is not a number is an error, not NaN on screen", () => {
        for (const goal of ["soon", null, {}, []]) {
            const { spec, diagnostics } = readProgress({ agg: "count", goal }, "X");
            expect(spec).toBeNull();
            expect(diagnostics[0]?.level).toBe("error");
        }
    });

    it("zero and negative goals are refused", () => {
        for (const goal of [0, -10]) {
            const { spec, diagnostics } = readProgress({ agg: "count", goal }, "X");
            expect(spec).toBeNull();
            expect(diagnostics.at(-1)?.message).toContain(String(goal));
        }
    });

    it("an aggregate error from the card layer still comes through", () => {
        const { spec, diagnostics } = readProgress({ agg: "avg", goal: 10 }, "Sleep");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("field");
    });

    it("the goal is checked even when the aggregate is already broken", () => {
        const { diagnostics } = readProgress({ agg: "avg" }, "Sleep");
        expect(diagnostics).toHaveLength(2);
    });
});

describe("percentOf", () => {
    it("counts the share of the goal", () => {
        expect(percentOf(12, 50)).toBe(24);
        expect(percentOf(50, 50)).toBe(100);
    });

    it("rounds to a whole percent", () => {
        expect(percentOf(1, 3)).toBe(33);
    });

    it("does not cap going past the goal", () => {
        expect(percentOf(250, 200)).toBe(125);
    });

    it("nothing counted is null, not zero", () => {
        expect(percentOf(null, 50)).toBeNull();
    });

    it("zero counted is zero percent, not null", () => {
        expect(percentOf(0, 50)).toBe(0);
    });

    it("a goal of zero gives null instead of Infinity", () => {
        expect(percentOf(10, 0)).toBeNull();
    });
});

describe("barWidth", () => {
    it("follows the percent inside the range", () => {
        expect(barWidth(24)).toBe(24);
    });

    it("never goes past full", () => {
        expect(barWidth(125)).toBe(100);
    });

    it("never goes negative", () => {
        expect(barWidth(-5)).toBe(0);
    });

    it("null is an empty bar", () => {
        expect(barWidth(null)).toBe(0);
    });
});
