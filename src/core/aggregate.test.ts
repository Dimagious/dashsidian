import { describe, it, expect } from "vitest";
import { aggregate, numberAt, series, isAgg } from "./aggregate";
import type { NoteRecord } from "./source";

const day = (name: string, fm: Record<string, unknown>): NoteRecord => ({
    path: `Дневник/${name}.md`, name, folder: "Дневник", tags: [], frontmatter: fm,
});

const days = [
    day("2026-09-19", { sleep_score: 92 }),
    day("2026-09-20", { sleep_score: 69 }),
    day("2026-09-21", { sleep_score: 92 }),
    day("2026-09-23", { sleep_score: 80 }),
];

describe("numberAt", () => {
    it("берёт число", () => expect(numberAt(days[0]!, "sleep_score")).toBe(92));
    it("приводит числовую строку", () => expect(numberAt(day("x", { v: "42" }), "v")).toBe(42));
    it("нечисло — null", () => {
        expect(numberAt(day("x", { v: "ага" }), "v")).toBeNull();
        expect(numberAt(day("x", {}), "v")).toBeNull();
        expect(numberAt(day("x", { v: "" }), "v")).toBeNull();
    });
});

describe("aggregate", () => {
    it("count не требует поля", () => expect(aggregate(days, { agg: "count" })).toBe(4));
    it("sum", () => expect(aggregate(days, { agg: "sum", field: "sleep_score" })).toBe(333));
    it("avg", () => expect(aggregate(days, { agg: "avg", field: "sleep_score" })).toBe(83.25));
    it("min/max", () => {
        expect(aggregate(days, { agg: "min", field: "sleep_score" })).toBe(69);
        expect(aggregate(days, { agg: "max", field: "sleep_score" })).toBe(92);
    });
    it("latest берёт самую свежую дату", () => {
        expect(aggregate(days, { agg: "latest", field: "sleep_score" })).toBe(80);
    });
    it("streak — самая длинная цепочка подряд", () => {
        expect(aggregate(days, { agg: "streak", field: "sleep_score" })).toBe(3);
    });
    it("без поля для sum — null, а не ноль", () => {
        expect(aggregate(days, { agg: "sum" })).toBeNull();
    });
    it("пустая выборка — null", () => {
        expect(aggregate([], { agg: "avg", field: "x" })).toBeNull();
    });
});

describe("series", () => {
    it("отдаёт последние N по возрастанию даты", () => {
        expect(series(days, "sleep_score", 2)).toEqual([92, 80]);
    });
});

describe("isAgg", () => {
    it("узнаёт свои", () => {
        expect(isAgg("avg")).toBe(true);
        expect(isAgg("median")).toBe(false);
    });
});
