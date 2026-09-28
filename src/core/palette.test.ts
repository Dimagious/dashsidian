import { describe, it, expect } from "vitest";
import { toRgb, rgba, assignLayerColors, DEFAULT_COLOR, PALETTE } from "./palette";

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

describe("assignLayerColors", () => {
    it("keeps every explicit colour as is", () => {
        expect(assignLayerColors([PALETTE.pink, PALETTE.red])).toEqual([PALETTE.pink, PALETTE.red]);
    });

    it("fills in the missing ones with the palette, in its declared order", () => {
        expect(assignLayerColors([undefined, undefined])).toEqual([PALETTE.blue, PALETTE.green]);
    });

    it("an implicit colour skips one an earlier entry already claimed explicitly", () => {
        // blue, the first in the palette, is taken by the first entry, so the
        // second (implicit) one gets green rather than colliding with it.
        expect(assignLayerColors([PALETTE.blue, undefined])).toEqual([PALETTE.blue, PALETTE.green]);
    });

    it("an implicit colour also skips one a LATER entry claims explicitly", () => {
        // The explicit colour is seeded up front, before any implicit entry
        // is assigned, regardless of where in the list it sits.
        expect(assignLayerColors([undefined, PALETTE.blue])).toEqual([PALETTE.green, PALETTE.blue]);
    });

    it("two implicit entries never collide with each other", () => {
        expect(assignLayerColors([undefined, undefined, undefined]))
            .toEqual([PALETTE.blue, PALETTE.green, PALETTE.cyan]);
    });

    it("running past the end of the palette falls back to the default colour", () => {
        const explicit = Object.values(PALETTE); // claims every palette colour explicitly
        expect(assignLayerColors([...explicit, undefined])).toEqual([...explicit, DEFAULT_COLOR]);
    });

    it("two entries explicitly asking for the same colour both keep it", () => {
        // Not this function's job to deduplicate a deliberate choice.
        expect(assignLayerColors([PALETTE.red, PALETTE.red])).toEqual([PALETTE.red, PALETTE.red]);
    });
});
