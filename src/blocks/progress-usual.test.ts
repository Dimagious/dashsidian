import { describe, it, expect, afterEach } from "vitest";
import { renderProgress } from "./progress";
import type { BlockContext } from "./context";
import { mockContext, diary, host, texts, nodes, diagnostics, type FakeNote } from "../test/vault";
import { setLocale } from "../i18n";
import { setDateLocale } from "../adapters/datetime";

/**
 * B-209, `goal: usual`: a goal set by the bar's own past periods. Today is
 * Monday 9 November 2026; the English locale's week starts on Sunday.
 */
const TODAY = new Date(2026, 10, 9);

const at = (notes: FakeNote[], sourcePath = "Home.md"): BlockContext =>
    ({ ...mockContext({ notes }), today: () => TODAY, sourcePath });

const draw = (ctx: BlockContext, config: string): HTMLElement => {
    const el = host();
    renderProgress(ctx, config, el);
    return el;
};

const titles = (el: HTMLElement): (string | null)[] =>
    nodes(el, ".dashy-progress-value").map((v) => v.getAttribute("title"));

// 1 km a day from 1 July to today: July 31, August 31, September 30, October 31, November 9.
const daily = at(diary("Diary", "2026-07-01", 132, () => ({ km: 1 })));

afterEach(() => {
    setLocale("en");
    setDateLocale("en");
});

describe("progress: goal: usual (B-209)", () => {
    it("a monthly sum against the mean of the 4 months before, rounded as the value is", () => {
        const el = draw(daily, "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual, unit: km, precision: 0 }");
        // (31 + 30 + 31 + 31) / 4 = 30.75, shown as 31; 9 of 31 is 29%.
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / usual 31 km 29%"]);
        expect(titles(el)).toEqual(["average of 4 past periods"]);
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("29%");
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-notice")).toEqual([]);
    });

    it("without precision a mean of whole sums stays whole, as the sums are", () => {
        const el = draw(daily, "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual }");
        // 30.75 shown as 31, and 9 of 31 is 29%.
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / usual 31 29%"]);
    });

    it("without precision a mean of fractional values keeps one decimal, as a value does", () => {
        const notes = [
            ...diary("Diary", "2026-09-01", 30, () => ({ km: 1.5 })),
            ...diary("Diary", "2026-10-01", 40, () => ({ km: 1 })),
        ];
        const el = draw(at(notes), "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, goal: { usual: 2 } }");
        // A sum: September 45 and October 31, both whole, so 38.
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / usual 38 24%"]);
        const avg = draw(at(notes), "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: avg, goal: { usual: 2 } }");
        // September 1.5, October 1: 1.25 shown as 1.3.
        expect(texts(avg, ".dashy-progress-value")).toEqual(["1 / usual 1.3 77%"]);
    });

    it("works under the alias target", () => {
        const el = draw(daily, "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, target: usual, precision: 0 }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / usual 31 29%"]);
    });

    it("{ usual: 2 } averages the two nearest months", () => {
        const el = draw(daily, "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, goal: { usual: 2 } }");
        // (31 + 30) / 2 = 30.5, shown whole as the sums are: 31.
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / usual 31 29%"]);
        expect(titles(el)).toEqual(["average of 2 past periods"]);
    });

    it("a bad count warns and still draws over 4 periods", () => {
        const el = draw(daily, "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, goal: { usual: 0 }, precision: 0 }");
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ progress: "Running": `goal: { usual: 0 }` expects a whole number of periods from 1 to 120. The last 4 are used.',
        ]);
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / usual 31 29%"]);
    });

    describe("weeks start on the locale's first day", () => {
        // Kilometres on Sundays only: 11 October 10, 18th 20, 25th 30, 1 November 40, 8 November 50.
        const sundays: FakeNote[] = [10, 20, 30, 40, 50].map((km, i) => ({
            path: `Diary/2026-${["10-11", "10-18", "10-25", "11-01", "11-08"][i] ?? ""}.md`,
            frontmatter: { km },
        }));
        const config = "source: Diary\nitems:\n  - { label: Week, field: km, agg: sum, period: week, goal: usual }";

        it("Sunday first: this week holds 8 November, the 4 before it 11 October to 7 November", () => {
            const el = draw(at(sundays), config);
            expect(texts(el, ".dashy-progress-value")).toEqual(["50 / usual 25 200%"]);
        });

        it("Monday first: this week is today alone, with nothing summed yet; the 4 before it 12 October to 8 November", () => {
            setDateLocale("ru");
            const el = draw(at(sundays), config);
            expect(texts(el, ".dashy-progress-value")).toEqual(["— / usual 35"]);
        });
    });

    it("a rolling 30d steps back 30 days at a time, and a stretch before the first note is skipped", () => {
        // From 11 September: the 30 days before this window (11 September to
        // 10 October) are full; the stretch before them ends 10 September.
        const el = draw(at(diary("Diary", "2026-09-11", 60, () => ({ km: 1 }))),
            "source: Diary\nitems:\n  - { label: Running, field: km, agg: sum, period: 30d, goal: usual }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["30 / usual 30 100%"]);
        expect(titles(el)).toEqual(["average of 1 past period"]);
    });

    it("period: note in a monthly review takes the 4 months before the named one", () => {
        // A review of October: June to September, June skipped as before the
        // first note, so July 31, August 31 and September 30.
        const el = draw(at(diary("Diary", "2026-07-01", 132, () => ({ km: 1 })), "Reviews/2026-10.md"),
            "source: Diary\nperiod: note\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual, precision: 1 }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["31.0 / usual 30.7 101%"]);
        expect(titles(el)).toEqual(["average of 3 past periods"]);
    });

    it("a named quarter takes the quarters before it", () => {
        // 2026-Q4 runs to today: 40 days; Q3 holds 92; Q2 and before lie before the first note.
        const el = draw(daily, "source: Diary\nperiod: 2026-Q4\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["40 / usual 92 43%"]);
    });

    it("an empty month after the first note counts as zero for a sum", () => {
        // July full, August and September empty, October full: (31 + 0 + 0 + 31) / 4.
        const notes = [
            ...diary("Diary", "2026-07-01", 31, () => ({ km: 1 })),
            ...diary("Diary", "2026-10-01", 40, () => ({ km: 1 })),
        ];
        const el = draw(at(notes), "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / usual 16 56%"]);
    });

    it("an empty month is skipped for an average", () => {
        const notes = [
            ...diary("Diary", "2026-07-01", 31, () => ({ sleep: 80 })),
            ...diary("Diary", "2026-10-01", 40, () => ({ sleep: 70 })),
        ];
        const el = draw(at(notes), "source: Diary\nperiod: month\nitems:\n  - { label: Sleep, field: sleep, agg: avg, goal: usual }");
        // (80 + 70) / 2, not (80 + 0 + 0 + 70) / 4.
        expect(texts(el, ".dashy-progress-value")).toEqual(["70 / usual 75 93%"]);
        expect(titles(el)).toEqual(["average of 2 past periods"]);
    });

    it("no history before the window: the value alone, no bar, and a notice saying why", () => {
        const el = draw(at(diary("Diary", "2026-11-01", 9, () => ({ km: 2 }))),
            "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual, unit: km }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["18 km"]);
        expect(nodes(el, ".dashy-progress-track")).toHaveLength(0);
        expect(texts(el, ".dashy-notice")).toEqual([
            '"Running": no history before this period yet, so there is no usual goal to measure against. The value is shown without a bar.',
        ]);
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a usual of 0 sets no goal either", () => {
        const notes = [
            ...diary("Diary", "2026-07-01", 123, () => ({ km: 0 })),
            ...diary("Diary", "2026-11-01", 9, () => ({ km: 1 })),
        ];
        const el = draw(at(notes), "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["9"]);
        expect(nodes(el, ".dashy-progress-track")).toHaveLength(0);
        expect(texts(el, ".dashy-notice")).toEqual([
            '"Running": the usual over past periods is 0, which leaves nothing to fill. The value is shown without a bar.',
        ]);
    });

    it("a usual that rounds to 0 at the bar's precision is no goal", () => {
        // 1 note with 0.4 a month, shown at precision 0.
        const notes: FakeNote[] = ["07", "08", "09", "10", "11"].map((m) => ({ path: `Diary/2026-${m}-02.md`, frontmatter: { km: 0.4 } }));
        const el = draw(at(notes), "source: Diary\nperiod: month\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual, precision: 0 }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["0"]);
        expect(texts(el, ".dashy-notice")).toHaveLength(1);
    });

    it("without a period it is an error naming the fix, and the bar draws broken", () => {
        const el = draw(daily, "source: Diary\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual }");
        expect(diagnostics(el, "error")).toEqual([
            '⛔ progress: "Running": `goal: usual` needs `period`, the window whose past periods set the goal. Add `period: month`, `period: week` or `period: 30d` to the bar or to the block root.',
        ]);
        expect(texts(el, ".dashy-progress-value")).toEqual(["— / —"]);
        expect(nodes(el, ".dashy-progress-row")[0]?.className).toContain("is-broken");
    });

    it("{ from, to } warns that it does not repeat and shows the value alone", () => {
        const el = draw(daily,
            "source: Diary\nitems:\n  - { label: Running, field: km, agg: sum, goal: usual, period: { from: 2026-11-01, to: 2026-11-30 } }");
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ progress: "Running": `goal: usual` needs a period that repeats, like `month`, `week`, `30d` or `2026-10`. A `from`/`to` span has no periods before it, so the value is shown without a goal.',
        ]);
        expect(texts(el, ".dashy-progress-value")).toEqual(["9"]);
        expect(nodes(el, ".dashy-progress-track")).toHaveLength(0);
        expect(texts(el, ".dashy-notice")).toEqual([]);
    });

    it("a duration field: the goal is averaged in minutes and shown as a duration", () => {
        const notes = [
            ...diary("Diary", "2026-09-01", 30, () => ({ sleep: "7h" })),
            ...diary("Diary", "2026-10-01", 31, () => ({ sleep: "8h" })),
            ...diary("Diary", "2026-11-01", 9, () => ({ sleep: "7h 30m" })),
        ];
        const el = draw(at(notes), "source: Diary\nperiod: month\nitems:\n  - { label: Sleep, field: sleep, agg: avg, goal: usual }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["7h 30m / usual 7h 30m 100%"]);
    });

    it("inherits period from the block root, and a bar's own period replaces it", () => {
        const el = draw(daily,
            "source: Diary\nperiod: month\nitems:\n  - { label: Month, field: km, agg: sum, goal: usual, precision: 0 }\n  - { label: Year, field: km, agg: sum, goal: usual, period: year }");
        // The year: 2025 and before lie wholly before the first note, so no history.
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / usual 31 29%", "132"]);
        expect(texts(el, ".dashy-notice")).toEqual([
            '"Year": no history before this period yet, so there is no usual goal to measure against. The value is shown without a bar.',
        ]);
    });

    it("a fixed goal next to it is drawn as before", () => {
        const el = draw(daily,
            "source: Diary\nperiod: month\nitems:\n  - { label: Fixed, field: km, agg: sum, goal: 30 }\n  - { label: Usual, field: km, agg: sum, goal: usual, precision: 0 }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / 30 30%", "9 / usual 31 29%"]);
        expect(titles(el)).toEqual([null, "average of 4 past periods"]);
    });

    it("a window not started yet draws no usual goal and no notice about history", () => {
        const el = draw(daily,
            "source: Diary\nitems:\n  - { label: Fixed, field: km, agg: sum, goal: 30, period: month }\n  - { label: December, field: km, agg: sum, goal: usual, period: 2026-12 }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / 30 30%", "— / —"]);
        expect(texts(el, ".dashy-notice")).toEqual(["This window starts on Dec 1, 2026, so there is nothing to count yet."]);
    });

    it("Russian: the caption, the tooltip and the notice", () => {
        setLocale("ru");
        const el = draw(daily, "source: Diary\nperiod: month\nitems:\n  - { label: Бег, field: km, agg: sum, goal: usual, unit: км, precision: 0 }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["9 / обычно 31 км 29%"]);
        expect(titles(el)).toEqual(["среднее за 4 прошлых периода"]);
        const none = draw(at(diary("Diary", "2026-11-01", 9, () => ({ km: 2 }))),
            "source: Diary\nperiod: month\nitems:\n  - { label: Бег, field: km, agg: sum, goal: usual }");
        expect(texts(none, ".dashy-notice")).toEqual([
            "\"Бег\": до этого периода данных ещё нет, обычную цель не из чего посчитать. Значение показано без полосы.",
        ]);
    });
});
