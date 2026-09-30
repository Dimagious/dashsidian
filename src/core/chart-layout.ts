/**
 * Turning a chart's bucket values into coordinates (ADR 0005). Pure: no
 * DOM, no Obsidian. `blocks/chart.ts` only emits the elements this
 * describes, and re-runs it on every resize without touching the
 * aggregation behind it.
 */

export type ChartType = "line" | "bar";

export interface LayoutInput {
    /** per bucket, one value per series; null is a gap, never a zero */
    values: readonly (readonly (number | null)[])[];
    /** whether the last bucket is still in progress (drawn lighter or hollow) */
    lastPartial: boolean;
    type: ChartType;
    /** the labelled gridlines from `niceTicks`; the first and last are the domain. Empty for an empty plot */
    ticks: readonly number[];
    goal?: number;
    width: number;
    height: number;
    /** the longest y label, in characters, to size the left gutter */
    labelChars: number;
}

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface LinePoint {
    series: number;
    bucket: number;
    x: number;
    y: number;
    partial: boolean;
}

export interface BarRect extends Rect {
    series: number;
    bucket: number;
    partial: boolean;
}

export interface ChartLayout {
    plot: Rect;
    /** one per bucket, left to right, tiling the plot width exactly: the hit row */
    columns: { left: number; width: number }[];
    ticks: { value: number; y: number }[];
    /** where zero sits, clamped into the plot: the bars' baseline */
    zeroY: number;
    goalY?: number;
    /** one polyline per contiguous run of non-null buckets, per series, as SVG `points` */
    lines: { series: number; points: string }[];
    /** point markers: every point with 30 buckets or fewer, else lone points only, plus a partial last one */
    points: LinePoint[];
    bars: BarRect[];
    /** bucket indices that get an x label: at most six, always the first and the last */
    xLabels: number[];
}

/** Room above the plot for the top label, and below it for the x labels. */
const TOP = 10;
const BOTTOM = 20;
const RIGHT = 4;
/** An 11px label averages about this many pixels per character. */
const CHAR_WIDTH = 6.5;
const GUTTER_PAD = 6;
/** Below this many buckets every line point gets a marker. */
const MARKER_LIMIT = 30;
/** How much of a bucket column its bars fill; the rest is the gap between columns. */
const BAR_FILL = 0.8;
/** Roughly the width one x label needs so its neighbours do not collide. */
const LABEL_SPACING = 64;
const MAX_X_LABELS = 6;

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * At most `max` evenly spread bucket indices, the first and the last always
 * among them. One bucket is one label; none is none.
 */
export function xLabelIndices(count: number, max: number): number[] {
    if (count <= 0) return [];
    if (count === 1) return [0];
    const k = Math.max(2, Math.min(count, max));
    const out: number[] = [];
    for (let i = 0; i < k; i++) {
        const index = Math.round((i * (count - 1)) / (k - 1));
        if (out[out.length - 1] !== index) out.push(index);
    }
    return out;
}

export function chartLayout(input: LayoutInput): ChartLayout {
    const buckets = input.values.length;
    const gutter = input.labelChars > 0 ? input.labelChars * CHAR_WIDTH + GUTTER_PAD : GUTTER_PAD;
    const plot: Rect = {
        left: round2(gutter),
        top: TOP,
        width: round2(Math.max(1, input.width - gutter - RIGHT)),
        height: Math.max(1, input.height - TOP - BOTTOM),
    };

    const lo = input.ticks[0] ?? 0;
    const hi = input.ticks[input.ticks.length - 1] ?? 1;
    const span = hi > lo ? hi - lo : 1;
    const yOf = (v: number): number => round2(plot.top + ((hi - v) / span) * plot.height);
    const clampY = (y: number): number => Math.min(plot.top + plot.height, Math.max(plot.top, y));

    const colWidth = plot.width / Math.max(1, buckets);
    const columns = Array.from({ length: buckets }, (_, i) => ({
        left: round2(plot.left + i * colWidth),
        width: round2(colWidth),
    }));

    const zeroY = clampY(yOf(0));
    const ticks = input.ticks.map((value) => ({ value, y: yOf(value) }));
    const seriesCount = input.values.reduce((n, row) => Math.max(n, row.length), 0);
    const isPartial = (bucket: number): boolean => input.lastPartial && bucket === buckets - 1;

    const lines: ChartLayout["lines"] = [];
    const points: LinePoint[] = [];
    const bars: BarRect[] = [];

    if (input.type === "line") {
        for (let s = 0; s < seriesCount; s++) {
            let run: LinePoint[] = [];
            const flush = (): void => {
                if (run.length > 1) lines.push({ series: s, points: run.map((p) => `${p.x},${p.y}`).join(" ") });
                for (const p of run) {
                    if (run.length === 1 || buckets <= MARKER_LIMIT || p.partial) points.push(p);
                }
                run = [];
            };
            for (let b = 0; b < buckets; b++) {
                const v = input.values[b]?.[s] ?? null;
                if (v === null) {
                    flush();
                    continue;
                }
                run.push({ series: s, bucket: b, x: round2(plot.left + (b + 0.5) * colWidth), y: yOf(v), partial: isPartial(b) });
            }
            flush();
        }
    } else {
        const group = colWidth * BAR_FILL;
        const barWidth = group / Math.max(1, seriesCount);
        for (let b = 0; b < buckets; b++) {
            for (let s = 0; s < seriesCount; s++) {
                const v = input.values[b]?.[s] ?? null;
                if (v === null) continue;
                const y = clampY(yOf(v));
                bars.push({
                    series: s,
                    bucket: b,
                    left: round2(plot.left + b * colWidth + (colWidth - group) / 2 + s * barWidth),
                    top: Math.min(y, zeroY),
                    width: round2(barWidth),
                    height: round2(Math.abs(zeroY - y)),
                    partial: isPartial(b),
                });
            }
        }
    }

    const out: ChartLayout = {
        plot,
        columns,
        ticks,
        zeroY,
        lines,
        points,
        bars,
        xLabels: xLabelIndices(buckets, Math.max(2, Math.min(MAX_X_LABELS, Math.floor(plot.width / LABEL_SPACING)))),
    };
    if (input.goal !== undefined) out.goalY = clampY(yOf(input.goal));
    return out;
}
