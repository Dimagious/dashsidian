import { describe, it, expect } from "vitest";
import { readChart, bucketize, chartCaption, windowBucket, type ChartSpec } from "./chart";
import type { FixedWindow, PeriodContext } from "./period";
import { periodNames } from "./period-name";
import type { NoteRecord } from "./source";
import { parseConfig, isRecord } from "../shared/parse";
import { parsePeriodStart } from "../adapters/datetime";
import schema from "../blocks/schema.json";

/** B-129: a chart over a fixed window. Today is Tuesday 6 October 2026. */
const TODAY = new Date(2026, 9, 6);
const ROOT = Object.keys(schema.blocks.chart.root);
const ITEM = Object.keys(schema.blocks.chart.item);
const names = periodNames({}, parsePeriodStart);

const read = (yaml: string, noteName = "2026-W40"): ReturnType<typeof readChart> => {
    const { value } = parseConfig(yaml, { root: ROOT, item: ITEM });
    if (!isRecord(value)) throw new Error("not a map");
    const context: PeriodContext = { names, noteName };
    return readChart(value, ITEM, context, TODAY);
};

const spec = (yaml: string, noteName?: string): ChartSpec => {
    const out = read(yaml, noteName);
    if (!out.spec) throw new Error(out.diagnostics.map((d) => d.message).join("; "));
    return out.spec;
};

const note = (name: string, frontmatter: Record<string, unknown>): NoteRecord =>
    ({ path: `Diary/${name}.md`, name, folder: "Diary", tags: [], frontmatter });

describe("readChart: `range` as a fixed window", () => {
    it("`range: note` in a weekly note is that week, a day per point", () => {
        const s = spec("field: steps\nrange: note");
        expect(s.range).toEqual({ kind: "fixed", unit: "week", start: "2026-09-28", end: "2026-10-04" });
        expect(s.bucket).toBe("day");
    });

    it("without `bucket` the window picks one by its length: a month by day, a quarter by week, a year by month", () => {
        expect(spec("field: steps\nrange: note", "2026-09").bucket).toBe("day");
        expect(spec("field: steps\nrange: 2026-Q3").bucket).toBe("week");
        expect(spec("field: steps\nrange: 2025").bucket).toBe("month");
        expect(spec("field: steps\nrange: { from: 2026-09-01 }").bucket).toBe("week");
    });

    it("a written `bucket` wins, and an unreadable one falls back by the window too", () => {
        expect(spec("field: steps\nrange: 2025\nbucket: week").bucket).toBe("week");
        const out = read("field: steps\nrange: 2026-Q3\nbucket: fortnight");
        expect(out.spec?.bucket).toBe("week");
        expect(out.diagnostics.map((d) => d.level)).toEqual(["warning"]);
    });

    it("`from` and `to` reach the chart as written: `from` is not taken for `source`", () => {
        expect(spec("field: steps\nrange: { from: 2026-09-01, to: 2026-09-30 }").range)
            .toEqual({ kind: "fixed", unit: "span", start: "2026-09-01", end: "2026-09-30" });
    });

    it("a window that cannot be built is an error and no chart", () => {
        const out = read("field: steps\nrange: note", "Ideas");
        expect(out.spec).toBeNull();
        expect(out.diagnostics).toEqual([{
            level: "error",
            message: '`range: note` needs a note named like a day, week, month, quarter or year, and this note is "Ideas". '
                + "Name it in one of these formats: YYYY-MM-DD, GGGG-[W]WW, YYYY-MM, YYYY-[Q]Q, YYYY.",
        }]);
        expect(read("field: steps\nrange: { to: 2026-09-30 }").spec).toBeNull();
    });

    it("without `today` an open window is measured to its own start", () => {
        const { value } = parseConfig("field: steps\nrange: { from: 2026-09-01 }", { root: ROOT, item: ITEM });
        if (!isRecord(value)) throw new Error("not a map");
        expect(readChart(value, ITEM, { names }).spec?.bucket).toBe("day");
    });
});

describe("windowBucket: the length thresholds", () => {
    const from = (start: string, end: string): FixedWindow => ({ kind: "fixed", unit: "span", start, end });
    it("31 days is still days, 32 weeks; 182 days is still weeks, 183 months", () => {
        expect(windowBucket(from("2026-01-01", "2026-01-31"), TODAY)).toBe("day");
        expect(windowBucket(from("2026-01-01", "2026-02-01"), TODAY)).toBe("week");
        expect(windowBucket(from("2026-01-01", "2026-07-01"), TODAY)).toBe("week");
        expect(windowBucket(from("2026-01-01", "2026-07-02"), TODAY)).toBe("month");
    });
});

describe("bucketize over a fixed window", () => {
    it("a closed week: seven days, nothing partial, notes after its end left out", () => {
        const notes = [
            note("2026-09-27", { steps: 100 }),
            note("2026-09-28", { steps: 1 }),
            note("2026-10-04", { steps: 7 }),
            note("2026-10-05", { steps: 1000 }),
        ];
        const { buckets, diagnostics } = bucketize(notes, spec("field: steps\nrange: note"), TODAY, 1);
        expect(buckets.map((b) => b.key)).toEqual([
            "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
        ]);
        expect(buckets.map((b) => b.values[0])).toEqual([1, null, null, null, null, null, 7]);
        expect(buckets.some((b) => b.partial)).toBe(false);
        expect(diagnostics).toEqual([]);
    });

    it("a closed month by week: the first week starts before the 1st but counts only the month's days, and the last is not `so far`", () => {
        const notes = [note("2026-08-31", { steps: 500 }), note("2026-09-01", { steps: 2 }), note("2026-09-30", { steps: 3 })];
        const { buckets } = bucketize(notes, spec("field: steps\nrange: 2026-09\nbucket: week"), TODAY, 1);
        expect(buckets[0]?.key).toBe("2026-08-31");
        expect(buckets[0]?.values).toEqual([2]);
        expect(buckets.at(-1)?.values).toEqual([3]);
        expect(buckets.at(-1)?.end).toBe("2026-10-04");
        expect(buckets.some((b) => b.partial)).toBe(false);
    });

    it("a window still running behaves as now: it ends today and its last bucket is partial", () => {
        const { buckets } = bucketize([], spec("field: steps\nrange: 2026-Q4"), TODAY, 1);
        expect(buckets.map((b) => b.key)).toEqual(["2026-09-28", "2026-10-05"]);
        expect(buckets.map((b) => b.partial)).toEqual([false, true]);
    });

    it("a week window starts its week on its own first day, whatever the locale's is", () => {
        // A locale week from Sunday 27 September, in an interface whose week starts on Monday.
        const s: ChartSpec = {
            ...spec("field: steps\nbucket: week"),
            range: { kind: "fixed", unit: "week", start: "2026-09-27", end: "2026-10-03" },
        };
        const notes = [note("2026-09-27", { steps: 1 }), note("2026-10-03", { steps: 2 })];
        const { buckets } = bucketize(notes, s, TODAY, 1);
        expect(buckets.map((b) => [b.key, b.values[0]])).toEqual([["2026-09-27", 3]]);
    });

    it("a week still on its first day is one day point so far, and does not warn (B-171)", () => {
        // Monday 5 October 2026, the first day of ISO week 41.
        const monday = new Date(2026, 9, 5);
        const fromNote = bucketize([], spec("field: steps\nrange: note", "2026-W41"), monday, 1);
        expect(fromNote.buckets.map((b) => b.key)).toEqual(["2026-10-05"]);
        expect(fromNote.diagnostics).toEqual([]);
        expect(bucketize([], spec("field: steps\nrange: 2026-W41"), monday, 1).diagnostics).toEqual([]);
    });

    it("a calendar `week` or `month` on its first day does not warn either (B-171)", () => {
        const week = bucketize([], spec("field: steps\nrange: week"), new Date(2026, 9, 5), 1);
        expect(week.buckets).toHaveLength(1);
        expect(week.diagnostics).toEqual([]);
        const month = bucketize([], spec("field: steps\nrange: month"), new Date(2026, 9, 1), 1);
        expect(month.buckets).toHaveLength(1);
        expect(month.diagnostics).toEqual([]);
    });

    it("a window that is one bucket as a whole still warns, running or not (B-171)", () => {
        const message = "The window is no longer than one `bucket`, so there is no trend to see. Widen `range` or pick a smaller `bucket`.";
        // A running week by week: one bucket however many days are left.
        expect(bucketize([], spec("field: steps\nrange: 2026-W41\nbucket: week"), new Date(2026, 9, 5), 1)
            .diagnostics.map((d) => d.message)).toEqual([message]);
        // `from` alone ends today: started today, it is a single day.
        expect(bucketize([], spec("field: steps\nrange: { from: 2026-10-06 }"), TODAY, 1)
            .diagnostics.map((d) => d.message)).toEqual([message]);
    });

    it("a bucket longer than the window warns even when the window straddles two of them (B-171)", () => {
        const message = "The window is no longer than one `bucket`, so there is no trend to see. Widen `range` or pick a smaller `bucket`.";
        // ISO week 40 runs from Monday 28 September into October: two month buckets of a few days each.
        const out = bucketize([], spec("field: steps\nrange: 2026-W40\nbucket: month"), TODAY, 1);
        expect(out.buckets.map((b) => b.key)).toEqual(["2026-09-01", "2026-10-01"]);
        expect(out.diagnostics.map((d) => d.message)).toEqual([message]);
        // So does a rolling week by month on a day it spans two months: 27 September to 3 October.
        const rolling = bucketize([], spec("field: steps\nrange: 7d\nbucket: month"), new Date(2026, 9, 3), 1);
        expect(rolling.buckets).toHaveLength(2);
        expect(rolling.diagnostics.map((d) => d.message)).toEqual([message]);
        // A window of exactly one shortest month is not shorter than the bucket.
        expect(bucketize([], spec("field: steps\nrange: { from: 2026-02-15, to: 2026-03-14 }\nbucket: month"), TODAY, 1)
            .diagnostics).toEqual([]);
    });

    it("a single day is one bucket and warns", () => {
        const out = bucketize([], spec("field: steps\nrange: note", "2026-10-01"), TODAY, 1);
        expect(out.buckets.map((b) => b.key)).toEqual(["2026-10-01"]);
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "The window is no longer than one `bucket`, so there is no trend to see. Widen `range` or pick a smaller `bucket`.",
        ]);
    });
});

describe("chartCaption over a fixed window", () => {
    it("names the window instead of `last N days`", () => {
        const s = spec("field: steps\nrange: 2026-09");
        expect(chartCaption(s, 30, "September 2026")).toBe("steps: sum per day, September 2026");
        expect(chartCaption(s, 30)).toBe("steps: sum per day, last 30 days");
    });
});
