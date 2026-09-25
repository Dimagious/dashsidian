import { describe, it, expect } from "vitest";
import { scrollEdges, resolveScrollRestore, type ScrollSnapshot } from "./scroll";

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

describe("resolveScrollRestore", () => {
    const settledMiddle: ScrollSnapshot = { settled: true, scrollLeft: 150, atEnd: false };

    it("restores a settled, mid-position snapshot once the new grid overflows", () => {
        expect(resolveScrollRestore(settledMiddle, 300, 600)).toEqual({ kind: "restore", scrollLeft: 150 });
    });

    it("clamps the restored position when the new grid is narrower than the saved one", () => {
        // A month with fewer days than the year that was captured: the new
        // scrollable range (700 - 300 = 400) is shorter than the saved 600.
        const wideSave: ScrollSnapshot = { settled: true, scrollLeft: 600, atEnd: false };
        expect(resolveScrollRestore(wideSave, 300, 700)).toEqual({ kind: "restore", scrollLeft: 400 });
    });

    it("falls back to the default pin-to-end when the saved snapshot was at the end", () => {
        const atEnd: ScrollSnapshot = { settled: true, scrollLeft: 300, atEnd: true };
        expect(resolveScrollRestore(atEnd, 300, 600)).toEqual({ kind: "default" });
    });

    it("falls back to the default pin-to-end when the reader had never settled it", () => {
        const neverSettled: ScrollSnapshot = { settled: false, scrollLeft: 150, atEnd: false };
        expect(resolveScrollRestore(neverSettled, 300, 600)).toEqual({ kind: "default" });
    });

    it("falls back to the default pin-to-end when there is nothing saved at all", () => {
        expect(resolveScrollRestore(undefined, 300, 600)).toEqual({ kind: "default" });
    });

    it("stays pending while the new grid has not reported a real, overflowing width yet", () => {
        // The unstyled 452/452 reading (scrollWidth === clientWidth): the
        // restore must not be spent on it, unlike "default", which would
        // have nothing to do here either but for a different reason.
        expect(resolveScrollRestore(settledMiddle, 452, 452)).toEqual({ kind: "pending" });
    });

    it("a pending restore is still resolvable once a later call reports a real width", () => {
        // Same snapshot, two calls: first while the grid is unstyled, then
        // once the real, narrower layout lands, the same way the block
        // calls this again on every resize.
        expect(resolveScrollRestore(settledMiddle, 452, 452)).toEqual({ kind: "pending" });
        expect(resolveScrollRestore(settledMiddle, 300, 600)).toEqual({ kind: "restore", scrollLeft: 150 });
    });
});
