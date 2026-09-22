import { describe, it, expect } from "vitest";
import { toRgb, rgba, DEFAULT_COLOR } from "./palette";

describe("toRgb", () => {
    it("понимает имя", () => expect(toRgb("purple")).toEqual([139, 92, 246]));
    it("не чувствителен к регистру и пробелам", () => expect(toRgb("  Purple ")).toEqual([139, 92, 246]));
    it("понимает hex с решёткой и без", () => {
        expect(toRgb("#3b82f6")).toEqual([59, 130, 246]);
        expect(toRgb("3b82f6")).toEqual([59, 130, 246]);
    });
    it("понимает готовую тройку", () => expect(toRgb([1, 2, 3])).toEqual([1, 2, 3]));
    it("на мусоре отдаёт цвет по умолчанию, а не падает", () => {
        expect(toRgb("не цвет")).toEqual(DEFAULT_COLOR);
        expect(toRgb(undefined)).toEqual(DEFAULT_COLOR);
        expect(toRgb([1, 2])).toEqual(DEFAULT_COLOR);
    });
});

describe("rgba", () => {
    it("собирает строку", () => expect(rgba([1, 2, 3], 0.5)).toBe("rgba(1, 2, 3, 0.5)"));
});
