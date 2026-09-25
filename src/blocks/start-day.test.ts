import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToday } from "./today";
import { renderHeatmap } from "./heatmap";
import { renderCountdown } from "./countdown";
import { renderStats } from "./stats";
import { renderProgress } from "./progress";
import { setDateLocale } from "../adapters/datetime";
import { DEFAULT_SETTINGS } from "../types";
import { mockContext, diary, host, texts, nodes } from "../test/vault";

/**
 * "New day starts at" (B-082): every block reads "today" through
 * `ctx.today()`, which is `effectiveToday(new Date(), settings.startDayHour)`
 * (`core/today.ts`). These are the integration tests that prove the wiring:
 * the arithmetic itself is covered exhaustively in `core/today.test.ts`.
 */

describe("today block — the day can start after midnight", () => {
    afterEach(() => vi.useRealTimers());

    it("before the boundary hour, the date and the daily-note link are still yesterday's", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 24, 2, 0)); // Thursday, 02:00
        const ctx = mockContext({}, { ...DEFAULT_SETTINGS, dailyFolder: "Diary", startDayHour: 4 });
        const el = host();
        renderToday(ctx, "daily: true", el);
        expect(texts(el, ".dashy-today-date")).toEqual(["Wednesday, September 23, 2026"]);
        expect(nodes(el, "a.dashy-today-chip")[0]?.getAttribute("data-href")).toBe("Diary/2026-09-23.md");
    });

    it("at the boundary hour, the date and the link have already moved on", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 24, 4, 0));
        const ctx = mockContext({}, { ...DEFAULT_SETTINGS, dailyFolder: "Diary", startDayHour: 4 });
        const el = host();
        renderToday(ctx, "daily: true", el);
        expect(texts(el, ".dashy-today-date")).toEqual(["Thursday, September 24, 2026"]);
        expect(nodes(el, "a.dashy-today-chip")[0]?.getAttribute("data-href")).toBe("Diary/2026-09-24.md");
    });

    it("the first day of a week just after midnight still links the previous week's note", () => {
        vi.useFakeTimers();
        // Sunday 2026-09-20, 02:00. The English locale starts the week on
        // Sunday, so the calendar date is already week 39, while the
        // effective day, Saturday the 19th, still belongs to week 38. A
        // Monday would not tell the two apart: Sunday and Monday share a
        // week here.
        vi.setSystemTime(new Date(2026, 8, 20, 2, 0));
        const ctx = mockContext({}, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderToday(ctx, "weekly: true", el);
        expect(nodes(el, "a.dashy-today-chip")[0]?.getAttribute("data-href")).toBe("2026-W38.md");
    });

    it("the 1st of a month just after midnight still links the previous month's monthly note", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 1, 2, 0)); // 1 October, 02:00: effective today is 30 September
        const ctx = mockContext({}, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderToday(ctx, "monthly: true", el);
        expect(nodes(el, "a.dashy-today-chip")[0]?.getAttribute("data-href")).toBe("2026-09.md");
    });
});

describe("heatmap block — today's cell waits for the boundary hour", () => {
    afterEach(() => vi.useRealTimers());

    // 267 consecutive daily notes, 2026-01-01 through 2026-09-24.
    const notes = diary("Diary", "2026-01-01", 267, (i) => ({ v: i + 1 }));

    it("before the boundary hour, the grid stops at yesterday", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 24, 2, 0));
        const ctx = mockContext({ notes }, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderHeatmap(ctx, "source: Diary\nfield: v", el);
        // 1 January to 23 September 2026 inclusive.
        expect(nodes(el, ".dashy-hm-cell:not(.dashy-hm-pad)")).toHaveLength(266);
    });

    it("at the boundary hour, today's own cell is drawn", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 24, 4, 0));
        const ctx = mockContext({ notes }, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderHeatmap(ctx, "source: Diary\nfield: v", el);
        // 1 January to 24 September 2026 inclusive.
        expect(nodes(el, ".dashy-hm-cell:not(.dashy-hm-pad)")).toHaveLength(267);
    });
});

describe("countdown block — days left is counted from the effective today", () => {
    afterEach(() => vi.useRealTimers());

    const config = "items:\n  - { label: Race, date: 2026-09-25 }";

    it("before the boundary hour, one more day is left", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 24, 2, 0));
        const ctx = mockContext({}, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderCountdown(ctx, config, el);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["2"]);
    });

    it("at the boundary hour, the count has already moved on", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 24, 4, 0));
        const ctx = mockContext({}, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderCountdown(ctx, config, el);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["1"]);
    });
});

describe("stats block — period, compare and trend follow the effective today", () => {
    afterEach(() => {
        vi.useRealTimers();
        setDateLocale(null);
    });

    // 2026-09-21 is a Monday.
    const sundayFirstConfig = "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week }";
    const sundayFirstNotes = [
        { path: "Diary/2026-09-20.md", frontmatter: { gym: true } },
        { path: "Diary/2026-09-21.md", frontmatter: { gym: true } },
    ];

    it("period: week, Sunday-first (English default): before the boundary hour, only Sunday counts", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 21, 2, 0));
        const ctx = mockContext({ notes: sundayFirstNotes }, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderStats(ctx, sundayFirstConfig, el);
        expect(texts(el, ".dashy-stat-value")).toEqual(["1"]);
    });

    it("period: week, Sunday-first: at the boundary hour, Monday joins the same week", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 21, 4, 0));
        const ctx = mockContext({ notes: sundayFirstNotes }, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderStats(ctx, sundayFirstConfig, el);
        expect(texts(el, ".dashy-stat-value")).toEqual(["2"]);
    });

    // A Monday-first locale (`ru`): the week 2026-09-14 .. 2026-09-20 is the
    // one that just ended, and 2026-09-21 starts a fresh one.
    const mondayFirstNotes = diary("Diary", "2026-09-14", 8, () => ({ gym: true }));

    it("period: week, Monday-first locale: before the boundary hour, the finished week still counts", () => {
        setDateLocale("ru");
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 21, 2, 0));
        const ctx = mockContext({ notes: mondayFirstNotes }, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderStats(ctx, sundayFirstConfig, el);
        expect(texts(el, ".dashy-stat-value")).toEqual(["7"]);
    });

    it("period: week, Monday-first locale: at the boundary hour, a fresh week has just started", () => {
        setDateLocale("ru");
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 21, 4, 0));
        const ctx = mockContext({ notes: mondayFirstNotes }, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderStats(ctx, sundayFirstConfig, el);
        expect(texts(el, ".dashy-stat-value")).toEqual(["1"]);
    });

    it("compare's previous window shifts the same way period's current window does", () => {
        const notes = [
            { path: "Diary/2026-09-13.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-14.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-20.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-21.md", frontmatter: { gym: true } },
        ];
        const config =
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, compare: true }";

        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 21, 2, 0)); // before the boundary: effective today is Sunday
        const before = host();
        renderStats(mockContext({ notes }, { ...DEFAULT_SETTINGS, startDayHour: 4 }), config, before);
        expect(texts(before, ".dashy-stat-value")).toEqual(["1"]);
        expect(nodes(before, ".dashy-stat-delta")[0]?.getAttribute("title")).toBe("vs the same days last week: 1");

        vi.setSystemTime(new Date(2026, 8, 21, 4, 0)); // at the boundary: effective today moves to Monday
        const after = host();
        renderStats(mockContext({ notes }, { ...DEFAULT_SETTINGS, startDayHour: 4 }), config, after);
        expect(texts(after, ".dashy-stat-value")).toEqual(["2"]);
        expect(nodes(after, ".dashy-stat-delta")[0]?.getAttribute("title")).toBe("vs the same days last week: 2");
    });

    it("trend drops a day once it falls out of the window ending at the effective today", () => {
        const ctx = mockContext(
            { notes: [{ path: "Diary/2026-09-19.md", frontmatter: { v: 5 } }] },
            { ...DEFAULT_SETTINGS, startDayHour: 4 },
        );
        const config = "items:\n  - { label: V, source: Diary, field: v, agg: avg, trend: 2d }";

        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 21, 2, 0)); // effective today: Sunday 2026-09-20, 19th is in range
        const before = host();
        renderStats(ctx, config, before);
        expect(nodes(before, ".dashy-stat-bar")).toHaveLength(1);

        vi.setSystemTime(new Date(2026, 8, 21, 4, 0)); // effective today: Monday 2026-09-21, 19th fell out
        const after = host();
        renderStats(ctx, config, after);
        expect(nodes(after, ".dashy-stat-bar")).toHaveLength(0);
    });
});

describe("progress block — period follows the effective today", () => {
    afterEach(() => vi.useRealTimers());

    const notes = [
        { path: "Diary/2026-09-20.md", frontmatter: { gym: true } },
        { path: "Diary/2026-09-21.md", frontmatter: { gym: true } },
    ];
    const config = "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, goal: 5 }";

    it("before the boundary hour, only the earlier day of the week counts", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 21, 2, 0));
        const ctx = mockContext({ notes }, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderProgress(ctx, config, el);
        expect(texts(el, ".dashy-progress-value")[0]).toContain("1 / 5");
    });

    it("at the boundary hour, both days of the week count", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 21, 4, 0));
        const ctx = mockContext({ notes }, { ...DEFAULT_SETTINGS, startDayHour: 4 });
        const el = host();
        renderProgress(ctx, config, el);
        expect(texts(el, ".dashy-progress-value")[0]).toContain("2 / 5");
    });
});

describe("startDayHour 0 — exactly today's own behaviour (regression pin)", () => {
    it("the current calendar day already counts moments after midnight", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 21, 0, 5)); // 00:05, default setting
        const ctx = mockContext(
            { notes: [{ path: "Diary/2026-09-21.md", frontmatter: { gym: true } }] },
            DEFAULT_SETTINGS,
        );
        const el = host();
        renderStats(ctx, "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week }", el);
        expect(texts(el, ".dashy-stat-value")).toEqual(["1"]);
        vi.useRealTimers();
    });
});
