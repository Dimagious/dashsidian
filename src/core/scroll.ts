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

/**
 * What a scroller looked like right before a redraw wiped it: whether the
 * reader (or an earlier restore) had settled it, where it sat, and whether
 * that position was the right edge. Captured from the DOM by the caller, not
 * computed here, so this module stays free of it.
 */
export interface ScrollSnapshot {
    /** The reader had taken over this scroller, or an earlier restore already had. */
    settled: boolean;
    /** `scrollLeft` at the moment it was captured. */
    scrollLeft: number;
    /** Whether that position was the right edge (the same 1px tolerance as `scrollEdges`). */
    atEnd: boolean;
}

/**
 * What a newly drawn scroller should do about a remembered position, decided
 * from a `ScrollSnapshot` plus the new grid's own metrics:
 *
 * - `"restore"`: apply `scrollLeft` now (clamped to the new grid's own
 *   range) and stop re-asserting the pin-to-end default, the same as a
 *   reader's own scroll would.
 * - `"pending"`: there is a position worth restoring, but the new scroller
 *   has not reported a real, overflowing width yet (an unstyled first read
 *   or a grid still off-document reads `scrollWidth === clientWidth`, same
 *   trap the initial pin-to-end scroll works around). Try again on the next
 *   resize; nothing has been spent yet.
 * - `"default"`: nothing saved is worth restoring (no snapshot, the reader
 *   was not settled, or was already at the end), so the caller falls back
 *   to today's pin-to-end behaviour.
 */
export type ScrollRestoreOutcome =
    | { kind: "restore"; scrollLeft: number }
    | { kind: "pending" }
    | { kind: "default" };

/**
 * A settled, not-at-the-end snapshot survives a redraw: the new grid starts
 * where the reader left the old one instead of jumping back to the end. An
 * unsettled or already-at-the-end snapshot is not worth restoring, because
 * the pin-to-end default already lands there on its own.
 */
export function resolveScrollRestore(
    saved: ScrollSnapshot | undefined,
    clientWidth: number,
    scrollWidth: number,
): ScrollRestoreOutcome {
    if (!saved || !saved.settled || saved.atEnd) return { kind: "default" };
    if (scrollWidth <= clientWidth) return { kind: "pending" };
    const max = scrollWidth - clientWidth;
    const scrollLeft = Math.min(Math.max(saved.scrollLeft, 0), max);
    return { kind: "restore", scrollLeft };
}
