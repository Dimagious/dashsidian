import { describe, it, expect } from "vitest";
import { readBands, bandFor } from "./bands";

describe("readBands — короткая форма", () => {
    it("верхняя полоса открыта сверху, остальные ограничены предыдущей", () => {
        expect(readBands([90, 80, 60]).map((b) => b.label)).toEqual(["90+", "80–89", "60–79"]);
    });

    it("не порождает перевёрнутых диапазонов вроде 12000–11999", () => {
        for (const b of readBands([12000, 8000, 5000])) {
            const m = /^(\d+)–(\d+)$/.exec(b.label);
            if (m) expect(Number(m[1])).toBeLessThan(Number(m[2]));
        }
    });

    it("сортирует пороги по убыванию независимо от порядка на входе", () => {
        expect(readBands([60, 90, 80]).map((b) => b.min)).toEqual([90, 80, 60]);
    });

    it("прозрачность убывает от верхней полосы к нижней", () => {
        const alphas = readBands([90, 80, 60]).map((b) => b.alpha);
        expect(alphas[0]).toBeGreaterThan(alphas[1]!);
        expect(alphas[1]).toBeGreaterThan(alphas[2]!);
    });

    it("полос больше, чем прозрачностей — последняя повторяется, а не undefined", () => {
        for (const b of readBands([100, 90, 80, 70, 60, 50])) {
            expect(typeof b.alpha).toBe("number");
        }
    });

    it("одна полоса", () => {
        expect(readBands([50]).map((b) => b.label)).toEqual(["50+"]);
    });
});

describe("readBands — полная форма", () => {
    it("берёт подписи как есть и сортирует по убыванию", () => {
        const bands = readBands([
            { min: 60, alpha: 0.4, label: "средний" },
            { min: 90, alpha: 1, label: "отличный" },
        ]);
        expect(bands.map((b) => b.label)).toEqual(["отличный", "средний"]);
    });

    it("недостающие поля подставляет, а не падает", () => {
        const [b] = readBands([{ min: 10 }]);
        expect(b?.alpha).toBe(1);
        expect(b?.label).toContain("10");
    });
});

describe("readBands — вырожденные входы", () => {
    it("пусто и мусор дают одну полосу на всё", () => {
        for (const input of [undefined, [], "строка", 42]) {
            const bands = readBands(input);
            expect(bands).toHaveLength(1);
            expect(bands[0]?.min).toBe(Number.NEGATIVE_INFINITY);
        }
    });
});

describe("bandFor", () => {
    const bands = readBands([90, 80, 60]);
    it("берёт первую подходящую", () => {
        expect(bandFor(bands, 95)?.label).toBe("90+");
        expect(bandFor(bands, 85)?.label).toBe("80–89");
        expect(bandFor(bands, 60)?.label).toBe("60–79");
    });
    it("ниже всех порогов — ничего", () => {
        expect(bandFor(bands, 10)).toBeUndefined();
    });
});
