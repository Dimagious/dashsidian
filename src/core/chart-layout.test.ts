import { describe, it, expect } from "vitest";
import { chartLayout, xLabelIndices, type LayoutInput } from "./chart-layout";

const base: LayoutInput = {
    values: [[1], [2], [3], [4]],
    lastPartial: false,
    type: "line",
    ticks: [0, 2, 4],
    width: 400,
    height: 160,
    labelChars: 1,
};

describe("xLabelIndices", () => {
    it("the first and the last are always among them", () => {
        for (const count of [2, 3, 7, 30, 31, 400]) {
            const picked = xLabelIndices(count, 6);
            expect(picked[0], `${count}`).toBe(0);
            expect(picked[picked.length - 1], `${count}`).toBe(count - 1);
            expect(picked.length, `${count}`).toBeLessThanOrEqual(6);
        }
    });

    it("evenly spread, never repeated", () => {
        expect(xLabelIndices(30, 6)).toEqual([0, 6, 12, 17, 23, 29]);
        expect(xLabelIndices(3, 6)).toEqual([0, 1, 2]);
    });

    it("a narrow plot drops to the first and the last", () => {
        expect(xLabelIndices(90, 2)).toEqual([0, 89]);
    });

    it("one bucket is one label, none is none", () => {
        expect(xLabelIndices(1, 6)).toEqual([0]);
        expect(xLabelIndices(0, 6)).toEqual([]);
    });
});

describe("chartLayout", () => {
    it("hit columns tile the plot width exactly, left to right", () => {
        const layout = chartLayout({ ...base, values: Array.from({ length: 7 }, (_, i) => [i]) });
        const { plot, columns } = layout;
        expect(columns).toHaveLength(7);
        expect(columns[0]!.left).toBe(plot.left);
        const last = columns[columns.length - 1]!;
        expect(last.left + last.width).toBeCloseTo(plot.left + plot.width, 1);
        for (let i = 1; i < columns.length; i++) {
            expect(columns[i]!.left).toBeCloseTo(columns[i - 1]!.left + columns[i - 1]!.width, 1);
        }
    });

    it("the left gutter grows with the longest y label", () => {
        const narrow = chartLayout({ ...base, labelChars: 1 });
        const wide = chartLayout({ ...base, labelChars: 8 });
        expect(wide.plot.left).toBeGreaterThan(narrow.plot.left);
        expect(wide.plot.width).toBeLessThan(narrow.plot.width);
    });

    it("the first tick sits at the bottom of the plot, the last at the top", () => {
        const { plot, ticks } = chartLayout(base);
        expect(ticks.map((tk) => tk.value)).toEqual([0, 2, 4]);
        expect(ticks[0]!.y).toBe(plot.top + plot.height);
        expect(ticks[2]!.y).toBe(plot.top);
        expect(ticks[1]!.y).toBe(plot.top + plot.height / 2);
    });

    it("a line splits at a gap into separate runs, a lone point keeps a marker", () => {
        const layout = chartLayout({
            ...base,
            values: Array.from({ length: 40 }, (_, i) => [i === 5 || i === 20 ? null : i % 4]),
        });
        // Runs: 0..4, 6..19, 21..39 around the two gaps.
        expect(layout.lines).toHaveLength(3);
        expect(layout.lines[0]!.points.split(" ")).toHaveLength(5);
        // More than 30 buckets: no markers except for lone points (none here).
        expect(layout.points).toEqual([]);

        const lone = chartLayout({ ...base, values: Array.from({ length: 40 }, (_, i) => [i === 10 ? 3 : null]) });
        expect(lone.lines).toEqual([]);
        expect(lone.points).toHaveLength(1);
        expect(lone.points[0]!.bucket).toBe(10);
    });

    it("30 buckets or fewer mark every point; the partial last one is flagged", () => {
        const layout = chartLayout({ ...base, lastPartial: true });
        expect(layout.points).toHaveLength(4);
        expect(layout.points.map((p) => p.partial)).toEqual([false, false, false, true]);
        expect(layout.bars).toEqual([]);
    });

    it("over 30 buckets the partial last point still gets its hollow marker", () => {
        const layout = chartLayout({ ...base, values: Array.from({ length: 35 }, () => [2]), lastPartial: true });
        expect(layout.points).toHaveLength(1);
        expect(layout.points[0]).toMatchObject({ bucket: 34, partial: true });
    });

    it("bars start at zero, grouped side by side per bucket, a null bucket drawing nothing", () => {
        const layout = chartLayout({
            ...base,
            type: "bar",
            values: [[4, 2], [null, 1], [2, null]],
            ticks: [0, 2, 4],
        });
        expect(layout.lines).toEqual([]);
        expect(layout.bars).toHaveLength(4);
        const zero = layout.zeroY;
        expect(zero).toBe(layout.plot.top + layout.plot.height);
        for (const bar of layout.bars) expect(bar.top + bar.height).toBeCloseTo(zero, 1);
        const [a, b] = layout.bars;
        // Two series in one bucket: same width, the second right of the first.
        expect(a!.width).toBe(b!.width);
        expect(b!.left).toBeCloseTo(a!.left + a!.width, 1);
        // The value 4 fills the plot, the value 2 half of it.
        expect(a!.height).toBe(layout.plot.height);
        expect(b!.height).toBe(layout.plot.height / 2);
    });

    it("negative bars hang below the zero line", () => {
        const layout = chartLayout({ ...base, type: "bar", values: [[-2], [2]], ticks: [-2, 0, 2] });
        const [down, up] = layout.bars;
        expect(down!.top).toBe(layout.zeroY);
        expect(up!.top + up!.height).toBe(layout.zeroY);
        expect(layout.zeroY).toBe(layout.plot.top + layout.plot.height / 2);
    });

    it("the partial last bar is flagged, the others are not", () => {
        const layout = chartLayout({ ...base, type: "bar", lastPartial: true });
        expect(layout.bars.map((b) => b.partial)).toEqual([false, false, false, true]);
    });

    it("the goal line lands at its value, clamped into the plot", () => {
        const layout = chartLayout({ ...base, goal: 3 });
        expect(layout.goalY).toBe(layout.plot.top + layout.plot.height / 4);
        expect(chartLayout({ ...base, goal: 99 }).goalY).toBe(layout.plot.top);
        expect(chartLayout(base).goalY).toBeUndefined();
    });

    it("an empty plot still lays out an axis and its columns", () => {
        const layout = chartLayout({ ...base, values: [[null], [null]], ticks: [], labelChars: 0 });
        expect(layout.ticks).toEqual([]);
        expect(layout.columns).toHaveLength(2);
        expect(layout.lines).toEqual([]);
        expect(layout.points).toEqual([]);
        expect(layout.zeroY).toBe(layout.plot.top + layout.plot.height);
    });

    it("a wide plot labels at most six buckets, a narrow one only the ends", () => {
        const many = Array.from({ length: 60 }, () => [1]);
        expect(chartLayout({ ...base, values: many, width: 900 }).xLabels).toHaveLength(6);
        expect(chartLayout({ ...base, values: many, width: 120 }).xLabels).toEqual([0, 59]);
    });
});
