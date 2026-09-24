import { describe, it, expect } from "vitest";
import { scrollEdges } from "./scroll";

describe("scrollEdges", () => {
    it("a grid that fits has nothing to scroll to on either side", () => {
        expect(scrollEdges(0, 300, 300)).toEqual({ canScrollLeft: false, canScrollRight: false });
    });

    it("at the left edge, only the right side has more", () => {
        expect(scrollEdges(0, 300, 600)).toEqual({ canScrollLeft: false, canScrollRight: true });
    });

    it("in the middle, both sides have more", () => {
        expect(scrollEdges(150, 300, 600)).toEqual({ canScrollLeft: true, canScrollRight: true });
    });

    it("at the right edge, only the left side has more", () => {
        expect(scrollEdges(300, 300, 600)).toEqual({ canScrollLeft: true, canScrollRight: false });
    });

    it("a 1px tolerance keeps a grid that fits from reading as scrollable in either direction", () => {
        // Sub-pixel layout rounding can leave scrollWidth a hair past
        // clientWidth even when nothing actually scrolls.
        expect(scrollEdges(0, 300, 300.6)).toEqual({ canScrollLeft: false, canScrollRight: false });
        expect(scrollEdges(0.6, 300, 300.6)).toEqual({ canScrollLeft: false, canScrollRight: false });
    });

    it("does not read a 2px overshoot at the left as still scrollable", () => {
        expect(scrollEdges(2, 300, 600)).toEqual({ canScrollLeft: true, canScrollRight: true });
        expect(scrollEdges(1, 300, 600)).toEqual({ canScrollLeft: false, canScrollRight: true });
    });

    it("does not read a near-end position as still able to scroll right", () => {
        // scrollLeft + clientWidth is 1px short of scrollWidth: within tolerance.
        expect(scrollEdges(299, 300, 600)).toEqual({ canScrollLeft: true, canScrollRight: false });
        expect(scrollEdges(298, 300, 600)).toEqual({ canScrollLeft: true, canScrollRight: true });
    });
});
