import { describe, it, expect } from "vitest";
import { parseConfig, canonicalize, asItems, unknownKeys, nearest, isRecord } from "./parse";

describe("canonicalize", () => {
    it("приводит синонимы к каноническим ключам", () => {
        expect(canonicalize({ folder: "X", title: "Y", emoji: "📥" }))
            .toEqual({ source: "X", label: "Y", icon: "📥" });
    });
    it("работает рекурсивно по массивам", () => {
        expect(canonicalize([{ from: "A" }, { name: "B" }]))
            .toEqual([{ source: "A" }, { label: "B" }]);
    });
    it("не трогает скаляры", () => {
        expect(canonicalize(42)).toBe(42);
        expect(canonicalize(null)).toBeNull();
    });
});

describe("parseConfig", () => {
    it("разбирает валидный YAML", () => {
        const r = parseConfig("source: Дневник\nfield: sleep_score");
        expect(r.value).toEqual({ source: "Дневник", field: "sleep_score" });
        expect(r.diagnostics).toHaveLength(0);
    });
    it("пустой блок — ошибка, а не падение", () => {
        expect(parseConfig("   ").diagnostics[0]?.level).toBe("error");
    });
    it("битый YAML возвращает диагностику, а не бросает", () => {
        const r = parseConfig("items:\n  - { label: X\n");
        expect(r.value).toBeNull();
        expect(r.diagnostics[0]?.level).toBe("error");
    });
});

describe("asItems", () => {
    it("принимает голый массив", () => {
        expect(asItems([{ label: "A" }])).toHaveLength(1);
    });
    it("принимает объект с items", () => {
        expect(asItems({ columns: 4, items: [{ label: "A" }, { label: "B" }] })).toHaveLength(2);
    });
    it("одиночный объект считает списком из одного", () => {
        expect(asItems({ label: "A" })).toHaveLength(1);
    });
    it("мусор — пустой список", () => {
        expect(asItems("строка")).toHaveLength(0);
    });
});

describe("unknownKeys", () => {
    it("молчит про известные", () => {
        expect(unknownKeys({ label: "A", icon: "x" }, ["label", "icon"])).toHaveLength(0);
    });
    it("подсказывает похожий ключ", () => {
        const d = unknownKeys({ lable: "A" }, ["label", "icon"]);
        expect(d[0]?.level).toBe("warning");
        expect(d[0]?.message).toContain("label");
    });
    it("для совсем чужого ключа подсказку не выдумывает", () => {
        const d = unknownKeys({ совершенноДругое: 1 }, ["label"]);
        expect(d[0]?.message).toContain("пропущен");
    });
});

describe("nearest", () => {
    it("находит близкое", () => expect(nearest("feild", ["field", "label"])).toBe("field"));
    it("далёкое не тянет", () => expect(nearest("zzzzzz", ["field"])).toBeNull());
});

describe("isRecord", () => {
    it("отличает объект от массива и null", () => {
        expect(isRecord({})).toBe(true);
        expect(isRecord([])).toBe(false);
        expect(isRecord(null)).toBe(false);
    });
});
