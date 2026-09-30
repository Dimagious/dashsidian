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
        // `true` and `[5]` used to pass through Number() as 1 and 5, silently.
        for (const goal of ["soon", null, {}, [], [5], true, false]) {
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

// B-121: a goal written as a duration.
describe("readProgress — duration goals", () => {
    it("goal: 8h is 480 minutes, remembered as written", () => {
        const { spec, diagnostics } = readProgress({ agg: "avg", field: "sleep", goal: "8h" }, "Sleep");
        expect(diagnostics).toEqual([]);
        expect(spec).toEqual({
            agg: "avg", field: "sleep", goal: 480, durationThresholds: [{ key: "goal", value: "8h" }],
        });
    });

    it("the clock form works too", () => {
        expect(readProgress({ agg: "avg", field: "sleep", goal: "7:30" }, "Sleep").spec?.goal).toBe(450);
    });

    it("a numeric string goal stays a plain number, not a duration", () => {
        const { spec } = readProgress({ agg: "sum", field: "km", goal: "200" }, "Run");
        expect(spec?.goal).toBe(200);
        expect(spec?.durationThresholds).toBeUndefined();
    });

    it("text that is neither says a number or a duration is expected", () => {
        const { spec, diagnostics } = readProgress({ agg: "avg", field: "sleep", goal: "eight hours" }, "Sleep");
        expect(spec).toBeNull();
        expect(diagnostics.map((d) => d.message)).toEqual(['"Sleep": `goal:` needs a number or a duration like `7h 30m`. There is nothing to measure against.']);
    });

    it("a zero duration goal is not positive", () => {
        const { spec, diagnostics } = readProgress({ agg: "avg", field: "sleep", goal: "0h" }, "Sleep");
        expect(spec).toBeNull();
        // Printed as written, not as the minutes it became.
        expect(diagnostics[0]?.message).toBe('"Sleep": a goal of 0h leaves nothing to fill. It must be above zero.');
    });
});
