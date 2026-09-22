import { describe, it, expect } from "vitest";
import { aggregate, numberAt, series, isAgg } from "./aggregate";
import type { NoteRecord } from "./source";

const day = (name: string, fm: Record<string, unknown>): NoteRecord => ({
    path: `Diary/${name}.md`, name, folder: "Diary", tags: [], frontmatter: fm,
});

const days = [
    day("2026-09-19", { sleep_score: 92 }),
    day("2026-09-20", { sleep_score: 69 }),
    day("2026-09-21", { sleep_score: 92 }),
    day("2026-09-23", { sleep_score: 80 }),
];

describe("numberAt", () => {
    it("takes a number", () => expect(numberAt(days[0]!, "sleep_score")).toBe(92));
    it("coerces a numeric string", () => expect(numberAt(day("x", { v: "42" }), "v")).toBe(42));
    it("a non-number is null", () => {
        expect(numberAt(day("x", { v: "nope" }), "v")).toBeNull();
        expect(numberAt(day("x", {}), "v")).toBeNull();
        expect(numberAt(day("x", { v: "" }), "v")).toBeNull();
    });
});

describe("aggregate", () => {
    it("count needs no field", () => expect(aggregate(days, { agg: "count" })).toBe(4));
    it("sum", () => expect(aggregate(days, { agg: "sum", field: "sleep_score" })).toBe(333));
    it("avg", () => expect(aggregate(days, { agg: "avg", field: "sleep_score" })).toBe(83.25));
    it("min/max", () => {
        expect(aggregate(days, { agg: "min", field: "sleep_score" })).toBe(69);
        expect(aggregate(days, { agg: "max", field: "sleep_score" })).toBe(92);
    });
    it("latest takes the freshest date", () => {
        expect(aggregate(days, { agg: "latest", field: "sleep_score" })).toBe(80);
    });
    it("streak is the longest consecutive run", () => {
        expect(aggregate(days, { agg: "streak", field: "sleep_score" })).toBe(3);
    });
    it("sum without a field is null, not zero", () => {
        expect(aggregate(days, { agg: "sum" })).toBeNull();
    });
    it("an empty selection is null", () => {
        expect(aggregate([], { agg: "avg", field: "x" })).toBeNull();
    });
});

describe("series", () => {
    it("returns the last N by ascending date", () => {
        expect(series(days, "sleep_score", 2)).toEqual([92, 80]);
    });
});

describe("isAgg", () => {
    it("recognises its own", () => {
        expect(isAgg("avg")).toBe(true);
        expect(isAgg("median")).toBe(false);
    });
});
