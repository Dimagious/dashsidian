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

    it("latest ignores a note that is not named for a day", () => {
        // A Template.md in the diary folder sorts after every date, and its
        // placeholder number became the "latest" reading.
        const withTemplate = [...days, day("Template", { sleep_score: 999 })];
        expect(aggregate(withTemplate, { agg: "latest", field: "sleep_score" })).toBe(80);
    });

    it("streak counts a day once however many notes carry its name", () => {
        const twice = [...days, day("2026-09-20", { sleep_score: 70 })];
        expect(aggregate(twice, { agg: "streak", field: "sleep_score" })).toBe(3);
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

const key = (back: number): string => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};
const recent = (back: number, fm: Record<string, unknown>): NoteRecord => day(key(back), fm);
const TODAY = new Date();

describe("series", () => {
    it("takes the days inside the window, oldest first", () => {
        const notes = [recent(2, { v: 1 }), recent(1, { v: 2 }), recent(0, { v: 3 })];
        expect(series(notes, "v", 3, TODAY)).toEqual([1, 2, 3]);
    });

    it("a window is days, not notes: older ones stay out", () => {
        // Taking the last N notes let a diary that stopped in 2024 draw a
        // "last 30 days" shape out of 2024.
        const notes = [day("2024-05-01", { v: 99 }), recent(1, { v: 2 }), recent(0, { v: 3 })];
        expect(series(notes, "v", 3, TODAY)).toEqual([2, 3]);
    });

    it("a note dated in the future is not in a trailing window", () => {
        const notes = [recent(0, { v: 1 }), recent(-5, { v: 99 })];
        expect(series(notes, "v", 7, TODAY)).toEqual([1]);
    });

    it("a day just outside the window is excluded", () => {
        expect(series([recent(3, { v: 9 })], "v", 3, TODAY)).toEqual([]);
        expect(series([recent(2, { v: 9 })], "v", 3, TODAY)).toEqual([9]);
    });

    it("a gap is left out rather than drawn as a zero", () => {
        const notes = [recent(2, { v: 1 }), recent(0, { v: 3 })];
        expect(series(notes, "v", 3, TODAY)).toEqual([1, 3]);
    });

    it("a day whose note lacks the field is left out too", () => {
        const notes = [recent(1, { other: 1 }), recent(0, { v: 3 })];
        expect(series(notes, "v", 2, TODAY)).toEqual([3]);
    });

    it("notes not named for a day are never in the window", () => {
        expect(series([day("Template", { v: 99 })], "v", 30, TODAY)).toEqual([]);
    });
});

describe("isAgg", () => {
    it("recognises its own", () => {
        expect(isAgg("avg")).toBe(true);
        expect(isAgg("median")).toBe(false);
    });
});
