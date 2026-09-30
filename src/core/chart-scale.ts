/**
 * The y scale of a `chart` block (ADR 0005): which range of values the plot
 * covers and where its labelled gridlines sit. Pure numbers: no Obsidian, no
 * DOM, no i18n.
 */

export interface Domain {
    min: number;
    max: number;
}

export interface DomainOptions {
    /** bars: the baseline is always zero, a bar's length is its value */
    zeroBased: boolean;
    /** a `goal` line, folded in so it is always on screen */
    goal?: number;
}

/**
 * The raw range the plot has to cover, before nice rounding: every non-null
 * value, plus `goal`, plus zero for bars. A flat range (every value equal)
 * gets a symmetric pad instead of a zero-height scale and a division by zero
 * later; an all-zero bar chart opens upwards, to 0..1, since bars never hang
 * below a baseline nothing crossed. Null when there is nothing at all to
 * scale: the caller draws an empty plot.
 */
export function chartDomain(values: readonly (number | null)[], opts: DomainOptions): Domain | null {
    const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
    if (opts.goal !== undefined && Number.isFinite(opts.goal)) finite.push(opts.goal);
    if (!finite.length) return null;

    let min = finite.reduce((a, b) => Math.min(a, b));
    let max = finite.reduce((a, b) => Math.max(a, b));
    if (opts.zeroBased) {
        min = Math.min(0, min);
        max = Math.max(0, max);
        if (min === 0 && max === 0) return { min: 0, max: 1 };
    }
    if (min === max) {
        const pad = Math.abs(min) * 0.1 || 1;
        return { min: min - pad, max: max + pad };
    }
    return { min, max };
}

export interface TickOptions {
    /**
     * The smallest step worth labelling: `10^-precision`, or 0.1 without a
     * precision (the one decimal `roundedValue` keeps). A step never goes
     * below it, so two gridlines never print the same label (the B-116
     * lesson from `bands.ts`). For durations the step is also never below
     * what `formatDuration` prints: a minute from an hour up, a second below.
     */
    grain?: number;
    /** values are minutes: steps follow the clock (15m, 30m, 1h, 2h) rather than powers of ten */
    duration?: boolean;
}

/** Minutes, in the order a clock reads them: seconds, minutes, hours, days. */
const DURATION_STEPS = [
    1 / 60, 2 / 60, 5 / 60, 10 / 60, 15 / 60, 30 / 60,
    1, 2, 5, 10, 15, 30,
    60, 120, 180, 240, 360, 720,
    1440,
];

/** Floating point noise off a computed step or tick: 0.30000000000000004 back to 0.3. */
function tidy(n: number): number {
    return Number(n.toPrecision(12));
}

/**
 * The next candidate step above `step`: 1, 2, 5 times a power of ten, or
 * the clock-shaped list for durations, continued past a day by 2, 5, 10
 * times as many days.
 */
function nextStep(step: number, duration: boolean): number {
    if (duration) {
        const listed = DURATION_STEPS.find((s) => s > step);
        if (listed !== undefined) return listed;
        return tidy(nextStep(step / 1440, false) * 1440);
    }
    const power = 10 ** Math.floor(Math.log10(step));
    const m = tidy(step / power);
    return tidy((m < 2 ? 2 : m < 5 ? 5 : 10) * power);
}

/** The smallest candidate step that is at least `raw`. */
function firstStep(raw: number, duration: boolean): number {
    let step = duration ? (DURATION_STEPS[0] ?? 1) : 10 ** Math.floor(Math.log10(raw));
    while (step < raw) step = nextStep(step, duration);
    return step;
}

/**
 * At most `count` labelled gridline values at nice numbers covering
 * `min..max`: the first at or below `min`, the last at or above `max`, all
 * one step apart. The caller then uses the first and last as the plot's
 * domain, so a line runs from its data's own minimum to maximum, rounded
 * out to the tick grain. Two values never come back equal after formatting
 * at `grain`: the step is always a whole multiple of it.
 *
 * `min >= max` (a caller that skipped `chartDomain`'s padding) returns the
 * single value rather than looping.
 */
export function niceTicks(min: number, max: number, count: number, opts: TickOptions = {}): number[] {
    if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) return [min];
    // A duration prints whole minutes from an hour up and seconds below it
    // (`formatDuration`), so its grain follows the size of the values, not
    // a precision: 7h 27m 12s and 7h 27m 36s would both read "7h 27m".
    const durationGrain = Math.max(Math.abs(min), Math.abs(max)) >= 60 ? 1 : 1 / 60;
    const grain = Math.max(opts.grain ?? 0, opts.duration ? durationGrain : opts.grain ?? 0.1);
    // Three at least: a range crossing zero always needs a tick below it,
    // one at it and one above, so two would never fit.
    const wanted = Math.max(3, count);
    const raw = Math.max((max - min) / (wanted - 1), grain);

    const duration = opts.duration ?? false;
    // Steps only grow, and once one is wider than both ends the ticks are
    // at most -step, 0, step, so this always returns.
    for (let step = firstStep(raw, duration); ; step = nextStep(step, duration)) {
        const lo = Math.floor(tidy(min / step)) * step;
        const hi = Math.ceil(tidy(max / step)) * step;
        const n = Math.round((hi - lo) / step) + 1;
        if (n <= wanted) return Array.from({ length: n }, (_, i) => tidy(lo + i * step));
    }
}
