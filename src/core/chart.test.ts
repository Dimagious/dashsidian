import { describe, it, expect, afterEach } from "vitest";
import {
    readChart, bucketize, chartFieldStatus, chartCaption, spanText, formatPoint, formatAxis, bucketTooltip, defaultRange,
    MAX_SERIES, MAX_BUCKETS, type ChartSpec,
} from "./chart";
import { PALETTE } from "./palette";
import type { NoteRecord } from "./source";
import { parseConfig, isRecord } from "../shared/parse";
import { setLocale } from "../i18n";
import schema from "../blocks/schema.json";

const ROOT = Object.keys(schema.blocks.chart.root);
const ITEM = Object.keys(schema.blocks.chart.item);

afterEach(() => setLocale("en"));

const note = (path: string, frontmatter: Record<string, unknown> = {}): NoteRecord => {
    const slash = path.lastIndexOf("/");
    const name = path.slice(slash + 1).replace(/\.md$/, "");
    return { path, name, folder: slash === -1 ? "" : path.slice(0, slash), tags: [], frontmatter };
};

/** The block's own parse, so synonyms and the root/item key sets behave exactly as they do in a note. */
const read = (yaml: string): ReturnType<typeof readChart> => {
    const { value } = parseConfig(yaml, { root: ROOT, item: ITEM });
    if (!isRecord(value)) throw new Error("not a map");
    return readChart(value, ITEM);
};

const spec = (yaml: string): ChartSpec => {
    const out = read(yaml);
    if (!out.spec) throw new Error(out.diagnostics.map((d) => d.message).join("; "));
    return out.spec;
};

const messages = (yaml: string, level: "error" | "warning"): string[] =>
    read(yaml).diagnostics.filter((d) => d.level === level).map((d) => d.message);

// 2026-09-30 is a Wednesday.
const WED = new Date(2026, 8, 30);

describe("readChart: the happy path and its defaults", () => {
    it("a bare source and field is a daily line over the last 30 days, linked, summed", () => {
        const s = spec("source: Diary\nfield: sleep_score");
        expect(s).toMatchObject({
            single: true, bucket: "day", type: "line", link: true, range: { kind: "days", days: 30 },
        });
        expect(s.series).toEqual([{ fields: ["sleep_score"], agg: "sum", label: "sleep_score", color: PALETTE.blue }]);
        expect(read("source: Diary\nfield: sleep_score").diagnostics).toEqual([]);
    });

    it("the default range follows the bucket: 30 days, 26 weeks, 12 months", () => {
        expect(spec("field: x\nbucket: week").range).toEqual(defaultRange("week"));
        expect(defaultRange("week")).toEqual({ kind: "days", days: 182 });
        expect(spec("field: x\nbucket: month").range).toEqual({ kind: "days", days: 365 });
        expect(spec("field: x\nbucket: month\nrange: year").range).toEqual({ kind: "year" });
    });

    it("every key is read: type, unit, precision, goal, link, title, label, color, date_field", () => {
        const s = spec([
            "field: run_km", "type: bar", "unit: km", "precision: 1", "goal: 40", "link: false",
            "title: Running", "label: Run", "color: orange", "date_field: day", "agg: max",
        ].join("\n"));
        expect(s).toMatchObject({ type: "bar", unit: "km", precision: 1, goal: { value: 40, duration: false }, goalText: "40", link: false, title: "Running", dateField: "day" });
        expect(s.series[0]).toEqual({ fields: ["run_km"], agg: "max", label: "Run", color: PALETTE.orange });
    });

    it("a goal written as a duration is minutes", () => {
        expect(spec("field: sleep\ngoal: 8h").goal).toEqual({ value: 480, duration: true });
        expect(spec("field: sleep\ngoal: 8h").goalText).toBe("8h");
    });

    it("`agg: count` needs no field and counts notes under a translated label", () => {
        const s = spec("source: Diary\nagg: count");
        expect(s.series).toEqual([{ fields: [], agg: "count", label: "notes", color: PALETTE.blue }]);
        setLocale("ru");
        expect(spec("agg: count").series[0]?.label).toBe("заметки");
    });
});

describe("readChart: synonyms and the title/label collision (ADR 0004)", () => {
    it("property, colour, target, aggregate and folder all land on their keys", () => {
        const s = spec("folder: Diary\nproperty: steps\ncolour: green\ntarget: 9000\naggregate: avg");
        expect(s.series[0]).toMatchObject({ fields: ["steps"], agg: "avg", color: PALETTE.green });
        expect(s.goal?.value).toBe(9000);
    });

    it("a root `title` stays the heading and `label` stays the series name", () => {
        const s = spec("field: steps\ntitle: Steps per day\nlabel: Steps");
        expect(s.title).toBe("Steps per day");
        expect(s.series[0]?.label).toBe("Steps");
    });

    it("`name` at the root is the series label; `title` in a series entry is that entry's label", () => {
        expect(spec("field: steps\nname: Walking").series[0]?.label).toBe("Walking");
        const s = spec("series:\n  - { property: run_km, title: Run, colour: cyan, aggregate: max }");
        expect(s.series[0]).toEqual({ fields: ["run_km"], agg: "max", label: "Run", color: PALETTE.cyan });
        expect(s.title).toBeUndefined();
    });
});

describe("readChart: series", () => {
    it("each entry may override the root agg; colours skip the explicit ones", () => {
        const s = spec([
            "agg: avg",
            "series:",
            "  - { field: run_km, label: Run }",
            "  - { field: bike_km, color: blue, agg: sum }",
            "  - { field: [mood_am, mood_pm, mood_am] }",
        ].join("\n"));
        expect(s.single).toBe(false);
        expect(s.series.map((x) => x.agg)).toEqual(["avg", "sum", "avg"]);
        // blue is claimed by entry 2, so entry 1 takes the next one, entry 3 the one after.
        expect(s.series.map((x) => x.color)).toEqual([PALETTE.green, PALETTE.blue, PALETTE.cyan]);
        // A repeated field in a list is folded in once.
        expect(s.series[2]).toMatchObject({ fields: ["mood_am", "mood_pm"], label: "mood_am, mood_pm" });
    });

    it("a count entry needs no field; next to one it warns and ignores it", () => {
        const out = read("series:\n  - { agg: count, label: Entries }\n  - { field: gym, agg: count }");
        expect(out.spec?.series.map((x) => [x.fields, x.label])).toEqual([[[], "Entries"], [[], "notes"]]);
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "Series 2: `agg: count` counts dated notes and reads no `field`. The field is ignored.",
        ]);
    });

    it(`at most ${MAX_SERIES}, with a message that says to split`, () => {
        const five = ["series:", ...["a", "b", "c", "d", "e"].map((f) => `  - { field: ${f} }`)].join("\n");
        expect(read(five).spec).toBeNull();
        expect(messages(five, "error")).toEqual([
            "`series` has 5 entries, and at most 4 fit one chart. Split them into two blocks.",
        ]);
        const four = ["series:", ...["a", "b", "c", "d"].map((f) => `  - { field: ${f} }`)].join("\n");
        expect(read(four).spec?.series).toHaveLength(4);
    });

    it("not a list, empty, an entry that is not a map, an entry without a field: each its own error", () => {
        expect(messages("series: run_km", "error")).toEqual(["`series` expects a list of maps, got \"run_km\"."]);
        expect(messages("series: []", "error")).toEqual(["`series` is an empty list. Add at least one series."]);
        expect(messages("series:\n  - run_km\n  - { label: Bike }", "error")).toEqual([
            "Series 1 must be a map with a `field`, got \"run_km\".",
            "Series 2: No `field` given. There is no number to plot.",
        ]);
        expect(messages("series:\n  - { field: [] }", "error")).toEqual([
            "Series 1: `field` is an empty list. Add at least one property name.",
        ]);
    });

    it("an unknown key and a bad label inside an entry warn without failing it", () => {
        const out = read("series:\n  - { field: run_km, colr: red, label: 5 }");
        expect(out.spec?.series[0]?.label).toBe("run_km");
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "Series 1: Unknown key \"colr\". Did you mean \"color\"?",
            "Series 1: `label` expects a name, got \"5\".",
        ]);
    });

    it("`color` and `label` next to `series` warn: each entry carries its own", () => {
        expect(messages("color: red\nlabel: All\nseries:\n  - { field: a }", "warning")).toEqual([
            "`color` is ignored: each entry in `series` carries its own colour instead.",
            "`label` is ignored: each entry in `series` carries its own label instead.",
        ]);
    });
});

describe("readChart: every row of the diagnostics table", () => {
    it("both field and series", () => {
        expect(read("field: a\nseries:\n  - { field: b }").spec).toBeNull();
        expect(messages("field: a\nseries:\n  - { field: b }", "error")).toEqual([
            "`series` and `field` are both set. Use one: `field` for one line, `series` for several.",
        ]);
    });

    it("a root field list is an error naming both right spellings, not a silently summed line", () => {
        const out = read("source: Diary\nfield: [gym, run]");
        expect(out.spec).toBeNull();
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "`field` takes one property here. Use `series:` for several lines, or `series: [{field: [a, b]}]` to fold them into one.",
        ]);
    });

    it("neither field nor series, unless agg is count", () => {
        expect(messages("source: Diary", "error")).toEqual([
            "No `field` or `series` given. There is no number to plot. Add `field:`, or `agg: count` to count notes.",
        ]);
        expect(read("source: Diary\nagg: count").spec).not.toBeNull();
    });

    it("a field of the wrong shape", () => {
        expect(messages("field: { a: 1 }", "error")).toEqual(["`field` expects a property name, got \"{\"a\":1}\"."]);
        expect(messages("field: \"  \"", "error")).toEqual(["`field` expects a property name, got \"  \"."]);
    });

    it("an unknown agg is an error, with the nearest guess, at the root or in a series", () => {
        expect(messages("field: a\nagg: avgg", "error")).toEqual([
            "Unknown aggregate \"avgg\". Did you mean \"avg\"? Available: sum, avg, min, max, count.",
        ]);
        expect(messages("field: a\nagg: latest", "error")).toEqual([
            "Unknown aggregate \"latest\". Available: sum, avg, min, max, count.",
        ]);
        expect(messages("series:\n  - { field: a, agg: streak }", "error")).toEqual([
            "Series 1: Unknown aggregate \"streak\". Available: sum, avg, min, max, count.",
        ]);
        expect(read("field: a\nagg: avgg").spec).toBeNull();
    });

    it("`agg: count` with a root field warns and ignores the field", () => {
        const out = read("field: gym\nagg: count");
        expect(out.spec?.series[0]).toMatchObject({ fields: [], label: "notes" });
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "`agg: count` counts dated notes and reads no `field`. The field is ignored.",
        ]);
    });

    it("type, bucket and range fall back with a warning", () => {
        const out = read("field: a\ntype: pie\nbucket: quarter\nrange: fortnight");
        expect(out.spec).toMatchObject({ type: "line", bucket: "day", range: { kind: "days", days: 30 } });
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "`bucket` expects day, week, month or year, got \"quarter\". Using day.",
            "`range` expects week, month, year or a rolling window such as 30d, got \"fortnight\". Using the default for the bucket.",
            "`type` expects line or bar, got \"pie\". Drawing a line.",
        ]);
    });

    it("goal, precision and unit that cannot be read warn and are dropped", () => {
        const out = read("field: a\ngoal: lots\nprecision: 9\nunit: 5");
        expect(out.spec?.goal).toBeUndefined();
        expect(out.spec?.precision).toBeUndefined();
        expect(out.spec?.unit).toBeUndefined();
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "`unit` expects text, got \"5\". Ignored.",
            "`precision` expects a whole number from 0 to 6, got \"9\". Rounding the default way.",
            "`goal` expects a number or a duration like `7h 30m`, got \"lots\". Ignored.",
        ]);
    });

    it("a blank unit or title is simply absent, not a warning", () => {
        const out = read("field: a\nunit: \"\"\ntitle: \"\"");
        expect(out.spec?.unit).toBeUndefined();
        expect(out.spec?.title).toBeUndefined();
        expect(out.diagnostics).toEqual([]);
    });

    it("a root label of the wrong shape warns and falls back to the field name", () => {
        const out = read("field: steps\nlabel: [a]");
        expect(out.spec?.series[0]?.label).toBe("steps");
        expect(out.diagnostics.map((d) => d.message)).toEqual(["`label` expects a name, got \"[\"a\"]\"."]);
    });
});

describe("bucketize: boundaries", () => {
    it("a week starts on Monday or Sunday by firstDay, and a window starting mid-week snaps back", () => {
        const s = spec("field: v\nbucket: week\nrange: 10d");
        // 10 days back from Wed 30 Sep is Mon 21 Sep.
        expect(bucketize([], s, WED, 1).buckets.map((b) => b.key)).toEqual(["2026-09-21", "2026-09-28"]);
        // With Sunday first, Mon 21 Sep falls in the week of Sun 20 Sep.
        expect(bucketize([], s, WED, 0).buckets.map((b) => b.key)).toEqual(["2026-09-20", "2026-09-27"]);
        const odd = spec("field: v\nbucket: week\nrange: 12d");
        // 12 days back is Sat 19 Sep: snapped back to Mon 14 Sep, never a two-day first week.
        expect(bucketize([], odd, WED, 1).buckets.map((b) => b.key)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
    });

    it("months of 28, 29, 30 and 31 days each end on their own last day", () => {
        const s = spec("field: v\nbucket: month\nrange: 365d");
        const leap = bucketize([], s, new Date(2024, 3, 15), 1).buckets;
        const ends = Object.fromEntries(leap.map((b) => [b.key, b.end]));
        expect(ends["2024-02-01"]).toBe("2024-02-29");
        expect(ends["2024-01-01"]).toBe("2024-01-31");
        expect(ends["2023-11-01"]).toBe("2023-11-30");
        const plain = bucketize([], s, new Date(2026, 3, 15), 1).buckets;
        expect(plain.find((b) => b.key === "2026-02-01")?.end).toBe("2026-02-28");
    });

    it("a window crossing 1 January keeps both years in order", () => {
        const s = spec("field: v\nbucket: month\nrange: 90d");
        expect(bucketize([], s, new Date(2027, 0, 10), 1).buckets.map((b) => b.key))
            .toEqual(["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"]);
    });

    it("a DST switch inside the window does not change the bucket count", () => {
        const s = spec("field: v\nrange: 30d");
        // Europe on 2026-03-29, the US on 2026-03-08.
        const buckets = bucketize([], s, new Date(2026, 3, 5), 1).buckets;
        expect(buckets).toHaveLength(30);
        expect(buckets[0]?.key).toBe("2026-03-07");
        expect(buckets[29]?.key).toBe("2026-04-05");
    });

    it("the default 26-week window is 26 full weeks and the current one", () => {
        const buckets = bucketize([], spec("field: v\nbucket: week"), WED, 1).buckets;
        expect(buckets).toHaveLength(27);
        expect(buckets.filter((b) => b.partial)).toHaveLength(1);
    });

    it(`clipping at ${MAX_BUCKETS} keeps the most recent buckets and says so`, () => {
        const out = bucketize([], spec("field: v\nrange: 3650d"), WED, 1);
        expect(out.buckets).toHaveLength(MAX_BUCKETS);
        expect(out.buckets[out.buckets.length - 1]?.key).toBe("2026-09-30");
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "The window holds more than 400 buckets, so only the most recent 400 are drawn. Try `bucket: week`.",
        ]);
    });

    it("too many weeks suggest months, not weeks again", () => {
        const out = bucketize([], spec("field: v\nbucket: week\nrange: 3650d"), WED, 1);
        expect(out.buckets).toHaveLength(MAX_BUCKETS);
        // 400 weeks back from the week of Mon 28 Sep 2026.
        expect(out.buckets[0]?.key).toBe("2019-02-04");
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "The window holds more than 400 buckets, so only the most recent 400 are drawn. Try `bucket: month`.",
        ]);
        // The longest `range` is about 121 months: a month bucket is never clipped.
        expect(bucketize([], spec("field: v\nbucket: month\nrange: 3650d"), WED, 1).diagnostics).toEqual([]);
    });

    it("fewer than two buckets warns, and is still drawn", () => {
        const out = bucketize([], spec("field: v\nbucket: month\nrange: week"), WED, 1);
        expect(out.buckets.map((b) => b.key)).toEqual(["2026-09-01"]);
        expect(out.diagnostics.map((d) => d.message)).toEqual([
            "The window holds a single bucket, so there is no trend to see. Widen `range` or pick a smaller `bucket`.",
        ]);
    });
});

describe("bucket: year (B-147)", () => {
    // 2026-10-05 is a Monday; ten years back reaches into 2016.
    const OCT5 = new Date(2026, 9, 5);
    const keys = (yaml: string, today: Date = OCT5): string[] =>
        bucketize([], spec(yaml), today, 1).buckets.map((b) => b.key);

    it("defaults to ten years, the longest range, and an explicit range wins", () => {
        expect(spec("field: books\nbucket: year").range).toEqual({ kind: "days", days: 3650 });
        expect(defaultRange("year")).toEqual({ kind: "days", days: 3650 });
        expect(spec("field: books\nbucket: year\nrange: 1095d").range).toEqual({ kind: "days", days: 1095 });
        expect(spec("field: books\nbucket: year\nrange: year").range).toEqual({ kind: "year" });
        expect(read("field: books\nbucket: year").diagnostics).toEqual([]);
    });

    it("the default window is every calendar year it touches, from 1 January, never clipped", () => {
        const out = bucketize([], spec("field: books\nbucket: year"), OCT5, 1);
        expect(out.buckets.map((b) => b.key)).toEqual([
            "2016-01-01", "2017-01-01", "2018-01-01", "2019-01-01", "2020-01-01", "2021-01-01",
            "2022-01-01", "2023-01-01", "2024-01-01", "2025-01-01", "2026-01-01",
        ]);
        expect(out.buckets.map((b) => b.end).slice(-3)).toEqual(["2024-12-31", "2025-12-31", "2026-12-31"]);
        expect(out.buckets.map((b) => b.partial).filter(Boolean)).toHaveLength(1);
        expect(out.buckets.at(-1)?.partial).toBe(true);
        expect(out.diagnostics).toEqual([]);
        // 3650 days are ten years less two or three leap days: at the very end
        // of December the start already falls in the next year, so ten columns.
        expect(keys("field: books\nbucket: year", new Date(2026, 11, 28))[0]).toBe("2016-01-01");
        expect(keys("field: books\nbucket: year", new Date(2026, 11, 31))).toHaveLength(10);
        expect(keys("field: books\nbucket: year", new Date(2026, 11, 31))[0]).toBe("2017-01-01");
    });

    it("an explicit range snaps its start back to 1 January; a single year warns", () => {
        // 1095 days back from 5 Oct 2026 is 7 Oct 2023.
        expect(keys("field: v\nbucket: year\nrange: 1095d")).toEqual(["2023-01-01", "2024-01-01", "2025-01-01", "2026-01-01"]);
        const single = bucketize([], spec("field: v\nbucket: year\nrange: year"), OCT5, 1);
        expect(single.buckets.map((b) => b.key)).toEqual(["2026-01-01"]);
        expect(single.diagnostics.map((d) => d.message)).toEqual([
            "The window holds a single bucket, so there is no trend to see. Widen `range` or pick a smaller `bucket`.",
        ]);
    });

    it("31 December and 1 January land in different years; today on 31 December is not partial", () => {
        const notes = [
            note("Books/2024-12-31.md", { pages: 300 }),
            note("Books/2025-01-01.md", { pages: 200 }),
            note("Books/2025-12-31.md", { pages: 50 }),
        ];
        const s = spec("field: pages\nbucket: year\nrange: 730d");
        // 730 days ending 31 Dec 2025 start exactly on 1 Jan 2024 (a leap year).
        const dec31 = bucketize(notes, s, new Date(2025, 11, 31), 1).buckets;
        expect(dec31.map((b) => [b.key, b.values[0], b.partial])).toEqual([
            ["2024-01-01", 300, false],
            ["2025-01-01", 250, false],
        ]);
        // A day earlier the 31 December note is in the future and 2025 is still running.
        const dec30 = bucketize(notes, s, new Date(2025, 11, 30), 1).buckets;
        expect(dec30.at(-1)).toMatchObject({ key: "2025-01-01", values: [200], partial: true });
    });

    it("a year without data is a gap for sum and a plain 0 for count", () => {
        const notes = [
            note("Books/2023-03-01.md", { pages: 120 }),
            note("Books/2023-11-20.md", { pages: 80 }),
            note("Books/2026-02-14.md", { pages: 400 }),
        ];
        const sum = bucketize(notes, spec("field: pages\nbucket: year\nrange: 1095d"), OCT5, 1);
        expect(sum.buckets.map((b) => b.values[0])).toEqual([200, null, null, 400]);
        expect(sum.buckets[0]?.notes.map((n) => n.path)).toEqual(["Books/2023-03-01.md", "Books/2023-11-20.md"]);
        const count = bucketize(notes, spec("agg: count\nbucket: year\nrange: 1095d"), OCT5, 1);
        expect(count.buckets.map((b) => b.values[0])).toEqual([2, 0, 0, 1]);
    });

    it("several series fold per year, each with its own aggregate; a partial year is not annualised", () => {
        const notes = [
            note("Races/2025-04-12.md", { km: 21, time: 110 }),
            note("Races/2025-10-05.md", { km: 42, time: 245 }),
            note("Races/2026-05-01.md", { km: 10, time: 48 }),
        ];
        const s = spec("bucket: year\nrange: 730d\nseries:\n  - { field: km, label: Distance }\n  - { field: time, agg: max }\n  - { agg: count }");
        const out = bucketize(notes, s, OCT5, 1);
        expect(out.buckets.map((b) => [b.key, ...b.values])).toEqual([
            ["2024-01-01", null, null, 0],
            ["2025-01-01", 63, 245, 2],
            ["2026-01-01", 10, 48, 1],
        ]);
    });

    it("the caption says per year and counts the years", () => {
        expect(chartCaption(spec("agg: count\nbucket: year\nlabel: Books"), 11)).toBe("Books: count per year, last 11 years");
        expect(spanText("year", 1)).toBe("last 1 year");
        setLocale("ru");
        expect(spanText("year", 1)).toBe("последний 1 год");
        expect(spanText("year", 3)).toBe("последние 3 года");
        expect(spanText("year", 11)).toBe("последние 11 лет");
        expect(chartCaption(spec("agg: count\nbucket: year\nlabel: Книги"), 11)).toBe("Книги: количество за год, последние 11 лет");
    });
});

describe("bucketize: the partial last bucket", () => {
    it("today mid-week leaves the current week partial, and only that one", () => {
        const buckets = bucketize([], spec("field: v\nbucket: week\nrange: 14d"), WED, 1).buckets;
        expect(buckets.map((b) => b.partial)).toEqual([false, false, true]);
    });

    it("today on the last day of its week or month is not partial", () => {
        // Sun 4 Oct ends a Monday-first week.
        const week = bucketize([], spec("field: v\nbucket: week\nrange: 14d"), new Date(2026, 9, 4), 1).buckets;
        expect(week[week.length - 1]?.partial).toBe(false);
        // 30 September ends its month.
        const month = bucketize([], spec("field: v\nbucket: month"), WED, 1).buckets;
        expect(month[month.length - 1]).toMatchObject({ key: "2026-09-01", partial: false });
        expect(bucketize([], spec("field: v\nbucket: month"), new Date(2026, 8, 29), 1).buckets.at(-1)?.partial).toBe(true);
    });

    it("a day bucket is never partial", () => {
        expect(bucketize([], spec("field: v"), WED, 1).buckets.some((b) => b.partial)).toBe(false);
    });
});

describe("bucketize: values", () => {
    const week = spec("field: v\nbucket: week\nrange: 14d");

    it("an empty bucket is a gap for sum, avg, min and max, a plain 0 for count", () => {
        const notes = [note("D/2026-09-29.md", { v: 5 })];
        for (const agg of ["sum", "avg", "min", "max"]) {
            const out = bucketize(notes, spec(`field: v\nbucket: week\nrange: 14d\nagg: ${agg}`), WED, 1);
            expect(out.buckets.map((b) => b.values[0]), agg).toEqual([null, null, 5]);
        }
        const count = bucketize(notes, spec("agg: count\nbucket: week\nrange: 14d"), WED, 1);
        expect(count.buckets.map((b) => b.values[0])).toEqual([0, 0, 1]);
    });

    it("a false-only bucket is 0, not a gap; a ticked day counts 1", () => {
        const notes = [
            note("D/2026-09-15.md", { gym: false }),
            note("D/2026-09-16.md", { gym: false }),
            note("D/2026-09-29.md", { gym: true }),
            note("D/2026-09-30.md", { gym: true }),
        ];
        // 21 days back is Thu 10 Sep, snapped back to Mon 7 Sep: four weeks.
        const out = bucketize(notes, spec("field: gym\nbucket: week\nrange: 21d"), WED, 1);
        expect(out.buckets.map((b) => b.values[0])).toEqual([null, 0, null, 2]);
    });

    it("two notes on one day contribute twice: a week's avg matches a stats card's", () => {
        // Mon 6, Tue 8 twice (Personal and Work): (6 + 8 + 8) / 3, not (6 + 8) / 2.
        const notes = [
            note("Diary/2026-09-28.md", { sleep: 6 }),
            note("Personal/2026-09-29.md", { sleep: 8 }),
            note("Work/2026-09-29.md", { sleep: 8 }),
        ];
        const avg = bucketize(notes, spec("field: sleep\nbucket: week\nrange: week\nagg: avg"), WED, 1);
        expect(avg.buckets[0]?.values[0]).toBeCloseTo(22 / 3, 10);
        const day = bucketize(notes, spec("field: sleep\nrange: 3d"), WED, 1);
        expect(day.buckets.map((b) => b.values[0])).toEqual([6, 16, null]);
    });

    it("a note contributing through two fields of a list counts each value once", () => {
        const notes = [note("D/2026-09-30.md", { mood_am: 3, mood_pm: 5 })];
        const s = spec("series:\n  - { field: [mood_am, mood_pm, mood_am], agg: avg }\nrange: 2d");
        const out = bucketize(notes, s, WED, 1);
        expect(out.buckets.map((b) => b.values[0])).toEqual([null, 4]);
        expect(out.buckets[1]?.notes).toEqual([{ path: "D/2026-09-30.md", name: "2026-09-30" }]);
    });

    it("min and max take the bucket's extremes; series are independent", () => {
        const notes = [
            note("D/2026-09-28.md", { run: 5, bike: 20 }),
            note("D/2026-09-29.md", { run: 12 }),
        ];
        const s = spec("range: week\nbucket: week\nseries:\n  - { field: run, agg: max }\n  - { field: run, agg: min }\n  - { field: bike }\n  - { agg: count }");
        expect(bucketize(notes, s, WED, 1).buckets[0]?.values).toEqual([12, 5, 20, 2]);
    });

    it("the contributing notes are listed by path, whatever order the vault handed them in", () => {
        const notes = [note("Z/2026-09-30.md", { v: 1 }), note("A/2026-09-30.md", { v: 2 }), note("M/2026-09-30.md", { x: 1 })];
        const out = bucketize(notes, spec("field: v\nrange: 1d"), WED, 1);
        expect(out.buckets[0]?.notes.map((n) => n.path)).toEqual(["A/2026-09-30.md", "Z/2026-09-30.md"]);
    });
});

describe("bucketize: which notes land where", () => {
    it("undated notes are dropped; a selection with none dated says so through anyDated", () => {
        const out = bucketize([note("D/Template.md", { v: 99 })], spec("field: v"), WED, 1);
        expect(out.anyDated).toBe(false);
        expect(out.buckets.every((b) => b.values[0] === null)).toBe(true);
        expect(bucketize([note("D/2020-01-01.md", { v: 1 })], spec("field: v"), WED, 1).anyDated).toBe(true);
    });

    it("notes dated after today, or before the window, are never drawn", () => {
        const notes = [note("D/2026-10-01.md", { v: 7 }), note("D/2026-08-01.md", { v: 7 }), note("D/2026-09-30.md", { v: 1 })];
        const out = bucketize(notes, spec("field: v\nrange: 3d"), WED, 1);
        expect(out.buckets.map((b) => b.values[0])).toEqual([null, null, 1]);
    });

    it("date_field reads a datetime string for its date part, and a Date by its local day", () => {
        const notes = [
            note("Log/run-a.md", { when: "2026-09-29T23:30", v: 3 }),
            note("Log/run-b.md", { when: new Date(2026, 8, 30), v: 4 }),
            note("Log/2026-09-30.md", { v: 100 }),
        ];
        const out = bucketize(notes, spec("field: v\nrange: 2d\ndate_field: when"), WED, 1);
        expect(out.buckets.map((b) => [b.key, b.values[0]])).toEqual([["2026-09-29", 3], ["2026-09-30", 4]]);
    });
});

describe("chartFieldStatus", () => {
    const notes = [
        note("D/2026-09-30.md", { steps: 100, running: "10 km · 51min" }),
        note("D/Template.md", { weight: 80 }),
    ];

    it("missing, text, only on undated notes, and fine: four different answers", () => {
        expect(chartFieldStatus(notes, "stpes")).toBe("missing");
        expect(chartFieldStatus(notes, "running")).toBe("not-numeric");
        expect(chartFieldStatus(notes, "weight")).toBe("undated");
        expect(chartFieldStatus(notes, "steps")).toBe("ok");
    });
});

describe("chartCaption and spanText", () => {
    it("a written title wins", () => {
        expect(chartCaption(spec("field: gym\ntitle: Gym days per month"), 12)).toBe("Gym days per month");
    });

    it("the automatic caption names the label, the aggregate, the bucket and the span", () => {
        expect(chartCaption(spec("field: sleep_score\nagg: avg"), 30)).toBe("sleep_score: average per day, last 30 days");
        expect(chartCaption(spec("field: gym\nbucket: month"), 12)).toBe("gym: sum per month, last 12 months");
        expect(chartCaption(spec("agg: count\nbucket: week"), 1)).toBe("notes: count per week, last 1 week");
    });

    it("several series join their labels; different aggregates drop the aggregate word", () => {
        const same = spec("bucket: week\nseries:\n  - { field: run_km, label: Run }\n  - { field: bike_km, label: Bike }");
        expect(chartCaption(same, 26)).toBe("Run, Bike: sum per week, last 26 weeks");
        const mixed = spec("series:\n  - { field: a, agg: max }\n  - { field: b }");
        expect(chartCaption(mixed, 30)).toBe("a, b: per day, last 30 days");
    });

    it("the bucket noun agrees with the count in Russian", () => {
        setLocale("ru");
        expect(spanText("day", 1)).toBe("последний 1 день");
        expect(spanText("week", 3)).toBe("последние 3 недели");
        expect(spanText("month", 12)).toBe("последние 12 месяцев");
    });
});

describe("formatPoint and formatAxis", () => {
    it("a plain number is rounded like a card, without digit grouping, then the unit", () => {
        expect(formatPoint(12345.678, { duration: false })).toBe("12345.7");
        expect(formatPoint(12.345, { duration: false, precision: 2, unit: "km" })).toBe("12.35 km");
    });

    it("a duration reads as one and never takes the unit", () => {
        expect(formatPoint(358, { duration: true, unit: "h" })).toBe("5h 58m");
        expect(formatAxis(480, { duration: true })).toBe("8h");
    });

    it("B-145: with clock, a point reads H:MM:SS; an axis label ignores clock and keeps the unit form", () => {
        expect(formatPoint(136 + 32 / 60, { duration: true, clock: true })).toBe("2:16:32");
        expect(formatPoint(136 + 32 / 60, { duration: true })).toBe("2h 17m");
        expect(formatAxis(120, { duration: true, clock: true })).toBe("2h");
    });

    it("an axis label groups digits like a card and keeps the precision", () => {
        // A narrow no-break space, the card's own group separator.
        expect(formatAxis(40000, { duration: false })).toBe("40\u202f000");
        expect(formatAxis(2, { duration: false, precision: 1 })).toBe("2.0");
    });
});

describe("bucketTooltip", () => {
    const one = [{ path: "D/2026-09-30.md", name: "2026-09-30" }];

    it("one series: date, label, value, then the note it came from", () => {
        expect(bucketTooltip({ date: "Sep 30, 2026", parts: [{ label: "sleep", value: "81" }], notes: one, partial: false }))
            .toBe("Sep 30, 2026: sleep 81 (2026-09-30)");
    });

    it("several series list every one with a value; several notes are counted", () => {
        const notes = [...one, { path: "W/2026-09-30.md", name: "2026-09-30" }];
        expect(bucketTooltip({
            date: "Week of Sun Sep 27, 2026",
            parts: [{ label: "Run", value: "12 km" }, { label: "Bike", value: null }, { label: "Swim", value: "2 km" }],
            notes,
            partial: true,
        })).toBe("Week of Sun Sep 27, 2026: Run 12 km, Swim 2 km (2 notes), so far");
    });

    it("no value anywhere says no data, not a zero", () => {
        expect(bucketTooltip({ date: "Sep 29, 2026", parts: [{ label: "a", value: null }], notes: [], partial: false }))
            .toBe("Sep 29, 2026: no data");
    });
});
