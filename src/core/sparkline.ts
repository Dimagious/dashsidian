/**
 * The little shape next to a number. Pure layer.
 *
 * Bars rather than a line: a card is a hundred-odd pixels wide, an SVG polyline
 * there is a lot of machinery for a picture three pixels tall, and bars follow
 * the theme's colours without a stroke to tint.
 */

/** Shortest window worth a shape, and the longest one a card can show. */
export const MIN_TREND_DAYS = 2;
export const MAX_TREND_DAYS = 365;

/**
 * `30d`, `30`, `90 d` — all the same thing. Anything else is null and the
 * caller reports it; guessing at "last month" would be inventing a contract.
 */
export function readTrendDays(raw: unknown): number | null {
    const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
    const match = /^(\d+)\s*d?$/i.exec(text);
    if (!match?.[1]) return null;
    const days = Number(match[1]);
    return days >= MIN_TREND_DAYS && days <= MAX_TREND_DAYS ? days : null;
}

/** The shortest bar still has to be visible, or a low run reads as missing data. */
const FLOOR_PERCENT = 12;

/**
 * Values to bar heights in percent.
 *
 * Scaled between the smallest and the largest of the window, not from zero: a
 * sparkline is about the shape of the run, and sleep scores of 70 to 80 plotted
 * from zero are a flat line that says nothing.
 *
 * A run that never changes comes out full height — every value really is the
 * maximum — rather than collapsing to the floor.
 */
export function sparkBars(values: readonly number[]): number[] {
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    return values.map((v) => {
        const ratio = span === 0 ? 1 : (v - min) / span;
        return Math.round(FLOOR_PERCENT + (100 - FLOOR_PERCENT) * ratio);
    });
}
