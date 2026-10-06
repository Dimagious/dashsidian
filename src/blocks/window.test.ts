import { describe, it, expect, afterEach } from "vitest";
import { renderStats } from "./stats";
import { renderProgress } from "./progress";
import { renderTiles } from "./tiles";
import { renderHeatmap } from "./heatmap";
import { renderChart } from "./chart";
import { notStartedNotice, windowLabel } from "./window";
import type { BlockContext } from "./context";
import { mockContext, diary, host, texts, nodes, diagnostics, type FakeVault, type FakeNote } from "../test/vault";
import { setDateLocale } from "../adapters/datetime";

/**
 * B-129, ADR 0006: a window taken from the note a block sits in, a period
 * written out, or `from`/`to`. Today is Tuesday 20 October 2026, well after
 * ISO week 40 (Monday 28 September to Sunday 4 October).
 */
const TODAY = new Date(2026, 9, 20);

/** A block drawn inside the note at `sourcePath`, on `today`. */
const at = (vault: FakeVault, sourcePath: string, today: Date = TODAY): BlockContext =>
    ({ ...mockContext(vault), today: () => today, sourcePath });

const draw = (render: (ctx: BlockContext, source: string, el: HTMLElement) => unknown, ctx: BlockContext, source: string): HTMLElement => {
    const el = host();
    render(ctx, source, el);
    return el;
};

/** A note for every day from `from` for `days` days, all carrying `gym: true` and `n`, the day's position. */
const daily = (from: string, days: number, extra: (i: number) => Record<string, unknown> = () => ({})): FakeNote[] =>
    diary("Diary", from, days, (i) => ({ gym: true, n: i, ...extra(i) }));

afterEach(() => setDateLocale(null));

describe("stats over a window from the note (B-129)", () => {
    // 26 September to 20 October: every day logged.
    const vault: FakeVault = { notes: daily("2026-09-26", 25) };

    it("a weekly review counts its own week, however late it is opened; a card's own `period` replaces the root's", () => {
        const el = draw(renderStats, at(vault, "Reviews/2026-W40.md"), `source: Diary
period: note
items:
  - { label: Days, agg: count }
  - { label: Gym, field: gym, agg: sum }
  - { label: This month, agg: count, period: month }`);
        expect(texts(el, ".dashy-stat-value")).toEqual(["7", "7", "20"]);
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("every kind of written period works the same, `from`/`to` included", () => {
        const el = draw(renderStats, at(vault, "Home.md"), `source: Diary
items:
  - { label: Day, agg: count, period: 2026-10-01 }
  - { label: Week, agg: count, period: 2026-W40 }
  - { label: Month, agg: count, period: 2026-09 }
  - { label: Quarter, agg: count, period: 2026-Q3 }
  - { label: Year, agg: count, period: 2026 }
  - { label: Span, agg: count, period: { from: 2026-09-30, to: 2026-10-02 } }
  - { label: Open, agg: count, period: { from: 2026-10-15 } }`);
        expect(texts(el, ".dashy-stat-value")).toEqual(["1", "7", "5", "5", "25", "3", "6"]);
        expect(diagnostics(el, "error")).toEqual([]);
    });

    it("`compare` on a closed week is against the whole week before", () => {
        const notes = [
            ...diary("Diary", "2026-09-21", 7, (i) => ({ gym: i < 5 })),
            ...diary("Diary", "2026-09-28", 7, (i) => ({ gym: i < 3 })),
        ];
        const el = draw(renderStats, at({ notes }, "Reviews/2026-W40.md"),
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: note, compare: true }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["3"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −2"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.title).toBe("vs the week before: 5");
    });

    it("`compare` on a closed month is against the whole month before: June against all 31 days of May", () => {
        const notes = [...diary("Diary", "2026-05-01", 31, () => ({})), ...diary("Diary", "2026-06-01", 30, () => ({}))];
        const el = draw(renderStats, at({ notes }, "Reviews/2026-06.md"),
            "items:\n  - { label: Days, source: Diary, agg: count, period: note, compare: true }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["30"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −1"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.title).toBe("vs the month before: 31");
    });

    it("`compare` on `from`/`to` is against as many days right before `from`", () => {
        // 25 August onwards: seven of the ten days before 1 September have a note.
        const notes = diary("Diary", "2026-08-25", 17, () => ({}));
        const el = draw(renderStats, at({ notes }, "Home.md"),
            "items:\n  - { label: Days, source: Diary, agg: count, period: { from: 2026-09-01, to: 2026-09-10 }, compare: true }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["10"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▲ +3"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.title).toBe("vs the 10 days before: 7");
    });

    it("`compare` on a week still running is against the same days last week, as `period: week` is", () => {
        // ISO week 43 runs Monday 19 October to Sunday 25 October; today is its Tuesday.
        const notes = [
            ...diary("Diary", "2026-10-12", 3, () => ({})),
            ...diary("Diary", "2026-10-19", 2, () => ({})),
        ];
        const el = draw(renderStats, at({ notes }, "Reviews/2026-W43.md"),
            "items:\n  - { label: Days, source: Diary, agg: count, period: note, compare: true }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["2"]);
        // The 14th, a Wednesday, is past the same days last week.
        expect(nodes(el, ".dashy-stat-delta")[0]?.title).toBe("vs the same days last week: 2");
        expect(texts(el, ".dashy-stat-delta")).toEqual(["= 0"]);
    });

    it("`current_streak` counts back from the window's last day, `streak` stays inside the window, `trend` ends there", () => {
        // 25 to 30 September, then 2 to 4 October: six days, a gap, three days, and nothing after.
        const notes = [...daily("2026-09-25", 6), ...daily("2026-10-02", 3)];
        const el = draw(renderStats, at({ notes }, "Reviews/2026-W40.md"), `source: Diary
period: note
items:
  - { label: Now, field: gym, agg: current_streak }
  - { label: Best, field: gym, agg: streak }
  - { label: Count, agg: count, field: n, trend: 7d }`);
        // Without the window: no current streak on 20 October, and a best of six.
        expect(texts(el, ".dashy-stat-value")).toEqual(["3", "3", "6"]);
        expect(nodes(el, ".dashy-stat-bar")).toHaveLength(6);
    });

    describe("`current_streak` gives no grace to a closed window's last day (B-173)", () => {
        const streak = (period: string): string => `source: Diary\nitems:\n  - { label: Now, field: gym, agg: current_streak, period: ${period} }`;
        const value = (notes: FakeNote[], period: string, sourcePath = "Home.md"): string[] =>
            texts(draw(renderStats, at({ notes }, sourcePath), streak(period)), ".dashy-stat-value");
        // ISO week 40, Monday 28 September to Sunday 4 October: every day ticked but Sunday.
        const noSunday = diary("Diary", "2026-09-28", 7, (i) => ({ gym: i < 6 }));

        it("an unticked last day of a closed week is 0, however the week is written", () => {
            expect(value(noSunday, "note", "Reviews/2026-W40.md")).toEqual(["0"]);
            expect(value(noSunday, "2026-W40")).toEqual(["0"]);
            expect(value(noSunday, "{ from: 2026-09-28, to: 2026-10-04 }")).toEqual(["0"]);
        });

        it("a closed week ticked every day is 7", () => {
            expect(value(diary("Diary", "2026-09-28", 7, () => ({ gym: true })), "note", "Reviews/2026-W40.md")).toEqual(["7"]);
        });

        it("a transparent last day is skipped, not forgiven: `days: weekdays` counts Monday to Friday", () => {
            const el = draw(renderStats, at({ notes: noSunday }, "Reviews/2026-W40.md"),
                "source: Diary\nperiod: note\nitems:\n  - { label: Now, field: gym, agg: current_streak, days: weekdays }");
            expect(texts(el, ".dashy-stat-value")).toEqual(["5"]);
        });

        it("a window still running keeps today's grace, one ending today included", () => {
            // ISO week 43 from Monday 19 October; today, Tuesday the 20th, not ticked yet.
            const notes = diary("Diary", "2026-10-14", 7, (i) => ({ gym: i < 6 }));
            expect(value(notes, "note", "Reviews/2026-W43.md")).toEqual(["1"]);
            expect(value(notes, "{ from: 2026-10-14, to: 2026-10-20 }")).toEqual(["6"]);
        });

        it("a moving `period: week` and no `period` at all keep today's grace", () => {
            // 14 to 19 October ticked, today the 20th not yet; the test locale's week starts on Sunday the 18th.
            const notes = diary("Diary", "2026-10-14", 7, (i) => ({ gym: i < 6 }));
            expect(value(notes, "week")).toEqual(["2"]);
            const el = draw(renderStats, at({ notes }, "Home.md"), "source: Diary\nitems:\n  - { label: Now, field: gym, agg: current_streak }");
            expect(texts(el, ".dashy-stat-value")).toEqual(["6"]);
        });
    });

    it("a week that has not started yet draws no cards, only the day it starts, and is no error", () => {
        const el = draw(renderStats, at(vault, "Reviews/2026-W45.md"),
            "source: Diary\nperiod: note\nitems:\n  - { label: Days, agg: count }\n  - { label: Gym, field: gym, agg: sum }");
        expect(nodes(el, ".dashy-stat")).toHaveLength(0);
        expect(texts(el, ".dashy-notice")).toEqual(["This window starts on Nov 2, 2026, so there is nothing to count yet."]);
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("next to a card that counts, a card waiting for its window shows a dash and the notice", () => {
        const el = draw(renderStats, at(vault, "Home.md"),
            "source: Diary\nitems:\n  - { label: Now, agg: count, period: 2026-W43 }\n  - { label: Later, agg: count, period: 2026-W45 }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["2", "—"]);
        expect(texts(el, ".dashy-notice")).toHaveLength(1);
    });

    it("a note not named for a period: one error for the block, naming it and the formats, and every card a dash", () => {
        const el = draw(renderStats, at(vault, "Dashboards/Home.md"),
            "source: Diary\nperiod: note\nitems:\n  - { label: Days, agg: count }\n  - { label: Gym, field: gym, agg: sum, compare: true }");
        expect(diagnostics(el, "error")).toEqual([
            '⛔ stats: `period: note` needs a note named like a day, week, month, quarter or year, and this note is "Home". '
            + "Name it in one of these formats: YYYY-MM-DD, GGGG-[W]WW, YYYY-MM, YYYY-[Q]Q, YYYY.",
        ]);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-stat-value")).toEqual(["—", "—"]);
    });

    it("a card's own broken `period` with `compare` is one error, not also `compare needs period`", () => {
        const el = draw(renderStats, at(vault, "Home.md"),
            "items:\n  - { label: Days, source: Diary, agg: count, period: note, compare: true }");
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a card's own `period: note` that cannot be read names the card", () => {
        const el = draw(renderStats, at(vault, "Home.md"), "items:\n  - { label: Days, source: Diary, agg: count, period: note }");
        expect(diagnostics(el, "error")[0]).toMatch(/^⛔ stats: "Days": `period: note` needs a note named like a day/);
        expect(texts(el, ".dashy-stat-value")).toEqual(["—"]);
    });

    it("`to` without `from`, and `from` after `to`, are errors and count nothing", () => {
        const el = draw(renderStats, at(vault, "Home.md"), `source: Diary
items:
  - { label: A, agg: count, period: { to: 2026-09-30 } }
  - { label: B, agg: count, period: { from: 2026-09-30, to: 2026-09-01 } }`);
        expect(diagnostics(el, "error")).toEqual([
            '⛔ stats: "A": `period` has `to` but no `from`. A window needs a start: add `from:` with a date like 2026-09-01.',
            '⛔ stats: "B": `period` starts after it ends: `from: 2026-09-30` is later than `to: 2026-09-01`. Swap them.',
        ]);
        expect(texts(el, ".dashy-stat-value")).toEqual(["—", "—"]);
    });

    it("a Periodic Notes locale week is the seven days its name stands for, even when the interface starts weeks elsewhere", () => {
        // The app's moment is English, whose `ww` weeks start on Sunday; Dashy speaks German, whose weeks start on Monday.
        setDateLocale("de");
        const notes = daily("2026-09-26", 9);
        const el = draw(renderStats, at({ notes, periodicNotes: { weekly: { format: "gggg-[W]ww" } } }, "Weekly/2026-W40.md"), `source: Diary
period: note
items:
  - { label: Days, agg: count }
  - { label: First, field: n, agg: min }
  - { label: Last, field: n, agg: max }`);
        // Sunday 27 September (n = 1) to Saturday 3 October (n = 7); the ISO week would be 2 to 8.
        expect(texts(el, ".dashy-stat-value")).toEqual(["7", "1", "7"]);
    });

    it("a weekly note Periodic Notes made with no format saved is its locale week, not the ISO one (B-171)", () => {
        const notes = daily("2026-09-26", 9);
        const vault: FakeVault = { notes, periodicNotes: { weekly: { enabled: true, folder: "Weekly", format: "" } } };
        const el = draw(renderStats, at(vault, "Weekly/2026-W40.md"), `source: Diary
period: note
items:
  - { label: First, field: n, agg: min }
  - { label: Last, field: n, agg: max }`);
        // The plugin's default `gggg-[W]ww` under English: Sunday 27 September (n = 1) to Saturday 3 October (n = 7).
        expect(texts(el, ".dashy-stat-value")).toEqual(["1", "7"]);
        // Without the plugin the same name is the ISO week, Monday 28 September (n = 2) to Sunday 4 October (n = 8).
        const iso = draw(renderStats, at({ notes }, "Weekly/2026-W40.md"), `source: Diary
period: note
items:
  - { label: First, field: n, agg: min }
  - { label: Last, field: n, agg: max }`);
        expect(texts(iso, ".dashy-stat-value")).toEqual(["2", "8"]);
    });
});

describe("progress over a window from the note (B-129)", () => {
    const notes = diary("Diary", "2026-09-01", 50, () => ({ km: 2 }));

    it("a monthly note measures the goal against its own month", () => {
        const el = draw(renderProgress, at({ notes }, "Reviews/2026-09.md"),
            "items:\n  - { label: Running, source: Diary, field: km, agg: sum, goal: 100, unit: km, period: note }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["60 / 100 km 60%"]);
    });

    it("a month that has not started yet draws no bars, only the day it starts", () => {
        const el = draw(renderProgress, at({ notes }, "Reviews/2026-12.md"),
            "source: Diary\nperiod: note\nitems:\n  - { label: Running, field: km, agg: sum, goal: 100 }");
        expect(nodes(el, ".dashy-progress-row")).toHaveLength(0);
        expect(texts(el, ".dashy-notice")).toEqual(["This window starts on Dec 1, 2026, so there is nothing to count yet."]);
    });

    it("next to a bar that counts, a waiting bar keeps its goal and shows no value", () => {
        const el = draw(renderProgress, at({ notes }, "Home.md"), `source: Diary
items:
  - { label: Now, field: km, agg: sum, goal: 100, unit: km, period: 2026-10 }
  - { label: Later, field: km, agg: sum, goal: 100, unit: km, period: 2026-12 }`);
        expect(texts(el, ".dashy-progress-value")).toEqual(["40 / 100 km 40%", "— / 100 km"]);
        expect(nodes(el, ".dashy-progress-row.is-broken")).toHaveLength(0);
    });

    it("`current_streak` gives no grace to a closed week's last day, and keeps it for a week still running (B-173)", () => {
        const bar = (notes: FakeNote[], sourcePath: string): string[] => texts(draw(renderProgress, at({ notes }, sourcePath),
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: current_streak, goal: 7, period: note }"), ".dashy-progress-value");
        // ISO week 40 ticked every day but Sunday 4 October, then every day.
        expect(bar(diary("Diary", "2026-09-28", 7, (i) => ({ gym: i < 6 })), "Reviews/2026-W40.md")).toEqual(["0 / 7 0%"]);
        expect(bar(diary("Diary", "2026-09-28", 7, () => ({ gym: true })), "Reviews/2026-W40.md")).toEqual(["7 / 7 100%"]);
        // ISO week 43: Monday ticked, today, Tuesday 20 October, not yet.
        expect(bar(diary("Diary", "2026-10-19", 2, (i) => ({ gym: i === 0 })), "Reviews/2026-W43.md")).toEqual(["1 / 7 14%"]);
    });

    it("a note not named for a period is an error and a broken bar", () => {
        const el = draw(renderProgress, at({ notes }, "Home.md"),
            "items:\n  - { label: Running, source: Diary, field: km, agg: sum, goal: 100, period: note }");
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(nodes(el, ".dashy-progress-row.is-broken")).toHaveLength(1);
        expect(texts(el, ".dashy-progress-value")).toEqual(["— / 100"]);
    });
});

describe("tiles badge over a window from the note (B-129)", () => {
    const vault: FakeVault = { notes: daily("2026-09-26", 25) };

    it("`badge: count` with `period: note` counts the notes of the note's week", () => {
        const el = draw(renderTiles, at(vault, "Reviews/2026-W40.md"),
            "items:\n  - { label: Workouts, path: Diary, badge: count, period: note }");
        expect(texts(el, ".dashy-tile-badge")).toEqual(["7"]);
    });

    it("a week that has not started yet shows no badge and says when it starts", () => {
        const el = draw(renderTiles, at(vault, "Reviews/2026-W45.md"),
            "items:\n  - { label: Workouts, path: Diary, badge: count, period: note }");
        expect(nodes(el, ".dashy-tile")).toHaveLength(1);
        expect(nodes(el, ".dashy-tile-badge")).toHaveLength(0);
        expect(texts(el, ".dashy-notice")).toEqual(["This window starts on Nov 2, 2026, so there is nothing to count yet."]);
    });

    it("a note not named for a period is an error and no badge", () => {
        const el = draw(renderTiles, at(vault, "Home.md"), "items:\n  - { label: Workouts, path: Diary, badge: count, period: note }");
        expect(diagnostics(el, "error")[0]).toContain('this note is "Home"');
        expect(nodes(el, ".dashy-tile-badge")).toHaveLength(0);
    });
});

describe("heatmap over a window from the note (B-129)", () => {
    // Gym on every other day from 1 September to 20 October.
    const vault: FakeVault = { notes: diary("Diary", "2026-09-01", 50, (i) => ({ gym: i % 2 === 0 })) };

    it("`layout: calendar` in a monthly note draws that month, with nothing dimmed once it is over", () => {
        const el = draw(renderHeatmap, at(vault, "Reviews/2026-09.md"),
            "source: Diary\nfield: gym\nrange: note\nlayout: calendar");
        expect(texts(el, ".dashy-hm-cal-month")).toEqual(["September 2026"]);
        expect(texts(el, ".dashy-hm-cal-num")).toHaveLength(30);
        expect(texts(el, ".dashy-hm-cal-num")[0]).toBe("1");
        expect(nodes(el, ".dashy-hm-cal-day.is-future")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-dot")).toHaveLength(15);
        expect(texts(el, ".dashy-hm-title")).toEqual(["gym: 15 of 30 days"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a calendar on the current month still dims the days after today", () => {
        const el = draw(renderHeatmap, at(vault, "Reviews/2026-10.md"),
            "source: Diary\nfield: gym\nrange: note\nlayout: calendar");
        expect(texts(el, ".dashy-hm-cal-month")).toEqual(["October 2026"]);
        expect(nodes(el, ".dashy-hm-cal-day.is-future")).toHaveLength(11);
    });

    it("a weekly note's calendar is its locale week, its first column the week's own first day", () => {
        setDateLocale("de");
        const el = draw(renderHeatmap, at({ ...vault, periodicNotes: { weekly: { format: "gggg-[W]ww" } } }, "Weekly/2026-W40.md"),
            "source: Diary\nfield: gym\nrange: note\nlayout: calendar");
        expect(texts(el, ".dashy-hm-cal-wd")[0]).toBe("So.");
        expect(texts(el, ".dashy-hm-cal-num")).toEqual(["27", "28", "29", "30", "1", "2", "3"]);
    });

    it("a written week draws one grid of that week", () => {
        // 28 September is day 27 of the diary, an odd one: gym on the 29th, 1st and 3rd.
        const el = draw(renderHeatmap, at(vault, "Home.md"), "source: Diary\nfield: gym\nrange: 2026-W40");
        expect(texts(el, ".dashy-hm-title")).toEqual(["Sep 28, 2026 to Oct 4, 2026, gym: 3 of 7 days"]);
    });

    it("a grid over a moving window keeps its caption; a written month is named", () => {
        const moving = draw(renderHeatmap, at(vault, "Home.md"), "source: Diary\nfield: gym\nrange: week");
        // Sunday 18 to Tuesday 20 October in the English test locale: no name in front.
        expect(texts(moving, ".dashy-hm-title")).toEqual(["gym: 1 of 3 days"]);
        const named = draw(renderHeatmap, at(vault, "Home.md"), "source: Diary\nlayers: [{ field: gym }]\nrange: 2026-09");
        expect(texts(named, ".dashy-hm-title")).toEqual(["September 2026, gym: 15 of 30 days"]);
    });

    it("seven days of `from`/`to` from a Wednesday are not a calendar week: the calendar warns and the grid is drawn", () => {
        const el = draw(renderHeatmap, at(vault, "Home.md"),
            "source: Diary\nfield: gym\nrange: { from: 2026-09-30, to: 2026-10-06 }\nlayout: calendar");
        expect(nodes(el, ".dashy-hm-cal")).toHaveLength(0);
        expect(diagnostics(el, "warning")[0]).toContain("`layout: calendar` needs a month or a week");
    });

    it("a window that has not started yet draws no grid, only the day it starts", () => {
        const el = draw(renderHeatmap, at(vault, "Reviews/2026-11.md"), "source: Diary\nfield: gym\nrange: note\nlayout: calendar");
        expect(nodes(el, ".dashy-hm-wrap")).toHaveLength(0);
        expect(texts(el, ".dashy-notice")).toEqual(["This window starts on Nov 1, 2026, so there is nothing to count yet."]);
    });

    it("`range: note` in a note not named for a period is an error and no grid, with layers too", () => {
        for (const config of [
            "source: Diary\nfield: gym\nrange: note",
            "source: Diary\nlayers: [{ field: gym }]\nrange: note",
        ]) {
            const el = draw(renderHeatmap, at(vault, "Home.md"), config);
            expect(diagnostics(el, "error")[0]).toMatch(/^⛔ heatmap: `range: note` needs a note named like a day/);
            expect(nodes(el, ".dashy-hm-wrap")).toHaveLength(0);
        }
    });

    it("layers follow a written month too", () => {
        const el = draw(renderHeatmap, at(vault, "Home.md"),
            "source: Diary\nlayers: [{ field: gym }]\nrange: 2026-09\nlayout: calendar");
        expect(texts(el, ".dashy-hm-cal-month")).toEqual(["September 2026"]);
    });
});

describe("chart over a window from the note (B-129)", () => {
    const vault: FakeVault = { notes: diary("Diary", "2025-01-01", 658, (i) => ({ steps: 1000 + i })) };

    it("`range: note` in a weekly note draws its seven days, named in the heading, nothing `so far`", () => {
        const el = draw(renderChart, at(vault, "Reviews/2026-W40.md"), "source: Diary\nfield: steps\nrange: note");
        expect(texts(el, ".dashy-chart-title")).toEqual(["steps: sum per day, Sep 28, 2026 to Oct 4, 2026"]);
        expect(nodes(el, ".dashy-chart-hit")).toHaveLength(7);
        expect(nodes(el, ".is-partial")).toHaveLength(0);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("`range: note` in this week's note on its first day draws that day and does not warn (B-171)", () => {
        // Monday 19 October, the first day of ISO week 43.
        const el = draw(renderChart, at(vault, "Reviews/2026-W43.md", new Date(2026, 9, 19)), "source: Diary\nfield: steps\nrange: note");
        expect(texts(el, ".dashy-chart-title")).toEqual(["steps: sum per day, Oct 19, 2026 to Oct 25, 2026"]);
        expect(nodes(el, ".dashy-chart-hit")).toHaveLength(1);
        expect(diagnostics(el, "warning")).toEqual([]);
        // A day's note is a single bucket as a whole, and still says so.
        const day = draw(renderChart, at(vault, "Reviews/2026-10-19.md", new Date(2026, 9, 19)), "source: Diary\nfield: steps\nrange: note");
        expect(diagnostics(day, "warning")).toHaveLength(1);
        expect(diagnostics(day, "warning")[0]).toMatch(/no longer than one `bucket`/);
    });

    it("without `bucket` a quarter draws weeks and a year months; a written `bucket` wins", () => {
        const quarter = draw(renderChart, at(vault, "Home.md"), "source: Diary\nfield: steps\nrange: 2026-Q3");
        // 29 June (the Monday of 1 July's week) to the week of 28 September.
        expect(nodes(quarter, ".dashy-chart-hit")).toHaveLength(14);
        const year = draw(renderChart, at(vault, "Home.md"), "source: Diary\nfield: steps\nrange: 2025");
        expect(nodes(year, ".dashy-chart-hit")).toHaveLength(12);
        expect(texts(year, ".dashy-chart-title")).toEqual(["steps: sum per month, 2025"]);
        // An unreadable `bucket` warns and falls back by the window as well.
        const unread = draw(renderChart, at(vault, "Home.md"), "source: Diary\nfield: steps\nrange: 2025\nbucket: quarter");
        expect(diagnostics(unread, "warning")).toHaveLength(1);
        expect(nodes(unread, ".dashy-chart-hit")).toHaveLength(12);
        const byWeek = draw(renderChart, at(vault, "Home.md"), "source: Diary\nfield: steps\nrange: 2026-09\nbucket: week");
        expect(texts(byWeek, ".dashy-chart-title")).toEqual(["steps: sum per week, September 2026"]);
    });

    it("a window with no data says so by its name", () => {
        const el = draw(renderChart, at(vault, "Reviews/2024-09.md"), "source: Diary\nfield: steps\nrange: note");
        expect(texts(el, ".dashy-chart-empty")).toEqual(["No data for September 2024"]);
    });

    it("a window that has not started yet draws no chart, only the day it starts", () => {
        const el = draw(renderChart, at(vault, "Reviews/2026-W45.md"), "source: Diary\nfield: steps\nrange: note");
        expect(nodes(el, ".dashy-chart")).toHaveLength(0);
        expect(texts(el, ".dashy-notice")).toEqual(["This window starts on Nov 2, 2026, so there is nothing to count yet."]);
    });

    it("`range: note` in a note not named for a period is an error and no chart", () => {
        const el = draw(renderChart, at(vault, "Home.md"), "source: Diary\nfield: steps\nrange: note");
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(nodes(el, ".dashy-chart")).toHaveLength(0);
    });
});

describe("window captions", () => {
    it("name each kind of window the way a reader would", () => {
        const today = TODAY;
        expect(windowLabel({ kind: "fixed", unit: "day", start: "2026-10-01", end: "2026-10-01" }, today)).toBe("Oct 1, 2026");
        expect(windowLabel({ kind: "fixed", unit: "month", start: "2026-10-01", end: "2026-10-31" }, today)).toBe("October 2026");
        expect(windowLabel({ kind: "fixed", unit: "year", start: "2026-01-01", end: "2026-12-31" }, today)).toBe("2026");
        expect(windowLabel({ kind: "fixed", unit: "quarter", start: "2026-10-01", end: "2026-12-31" }, today))
            .toBe("Oct 1, 2026 to Dec 31, 2026");
        expect(windowLabel({ kind: "fixed", unit: "span", start: "2026-10-01" }, today)).toBe("Oct 1, 2026 to Oct 20, 2026");
        expect(windowLabel({ kind: "days", days: 30 }, today)).toBeUndefined();
        expect(notStartedNotice("2026-11-02")).toBe("This window starts on Nov 2, 2026, so there is nothing to count yet.");
    });
});
