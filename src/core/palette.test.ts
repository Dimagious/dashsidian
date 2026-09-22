import { describe, it, expect } from "vitest";
import { toRgb, rgba, DEFAULT_COLOR } from "./palette";

describe("toRgb", () => {
    it("understands a name", () => expect(toRgb("purple")).toEqual([139, 92, 246]));
    it("ignores case and spaces", () => expect(toRgb("  Purple ")).toEqual([139, 92, 246]));
    it("understands hex with and without the hash", () => {
        expect(toRgb("#3b82f6")).toEqual([59, 130, 246]);
        expect(toRgb("3b82f6")).toEqual([59, 130, 246]);
    });
    it("understands a ready triple", () => expect(toRgb([1, 2, 3])).toEqual([1, 2, 3]));
    it("falls back to the default colour on rubbish instead of failing", () => {
        expect(toRgb("not a colour")).toEqual(DEFAULT_COLOR);
        expect(toRgb(undefined)).toEqual(DEFAULT_COLOR);
        expect(toRgb([1, 2])).toEqual(DEFAULT_COLOR);
    });
});

describe("rgba", () => {
    it("builds the string", () => expect(rgba([1, 2, 3], 0.5)).toBe("rgba(1, 2, 3, 0.5)"));
});
