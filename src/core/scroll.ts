/**
 * Deciding whether a scrolled element has more content to either side.
 *
 * Pure module: no Obsidian, no DOM. `scrollEdges` takes the three numbers a
 * scrollable element reports about itself (`scrollLeft`, `clientWidth`,
 * `scrollWidth`) and answers "is there more to the left" / "is there more to
 * the right" so a caller can show a hint (a fading edge, an arrow) without
 * touching the DOM itself.
 */

export interface ScrollEdges {
    /** There is unscrolled content to the left: the caller can scroll left. */
    canScrollLeft: boolean;
    /** There is unscrolled content to the right: the caller can scroll right. */
    canScrollRight: boolean;
}

/**
 * A 1px tolerance on both ends absorbs sub-pixel layout rounding, which would
 * otherwise flag a grid that exactly fits as still scrollable in one
 * direction, or leave a hairline of "can scroll" state at rest.
 */
const TOLERANCE = 1;

/**
 * `scrollLeft`, `clientWidth` and `scrollWidth` are exactly the numbers a
 * scrollable HTML element exposes, passed in rather than read from the DOM so
 * this stays testable without a layout engine.
 */
export function scrollEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): ScrollEdges {
    return {
        canScrollLeft: scrollLeft > TOLERANCE,
        canScrollRight: scrollLeft + clientWidth < scrollWidth - TOLERANCE,
    };
}
