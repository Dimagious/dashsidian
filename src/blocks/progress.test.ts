import { describe, it, expect, vi, afterEach } from "vitest";
import { renderProgress } from "./progress";
import { mockContext, diary, host, texts, nodes, diagnostics } from "../test/vault";

const ctx = mockContext({
    notes: diary("Diary", "2026-01-01", 10, (i) => ({ km: i + 1 })),
});

const bars = (config: string) => {
    const el = host();
    renderProgress(ctx, config, el);
    return el;
};

describe("progress — the bar says what the number says", () => {
    it("percent and width agree while below the goal", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40 }");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["25%"]);
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("25%");
    });

    it("the value reads as current over goal", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40 }");
        expect(texts(el, ".dashy-progress-value")[0]).toContain("10 / 40");
    });

    it("a unit follows both numbers, once", () => {
        const el = bars("items:\n  - { label: Run, source: Diary, field: km, agg: sum, goal: 100, unit: km }");
        expect(texts(el, ".dashy-progress-value")[0]).toBe("55 / 100 km 55%");
    });

    it("`target` is accepted as a synonym of goal", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, target: 40 }");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["25%"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("icon and sub are drawn when given", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40, icon: 📔, sub: this year }");
        expect(texts(el, ".dashy-progress-icon")).toEqual(["📔"]);
        expect(texts(el, ".dashy-progress-sub")).toEqual(["this year"]);
    });
});

describe("progress — past the goal", () => {
    it("the percent keeps climbing past 100", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 4 }");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["250%"]);
    });

    it("but the bar itself stops at full", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 4 }");
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("100%");
    });

    it("a met goal is marked, since width can no longer say it", () => {
        const el = bars(`items:
  - { label: Under, source: Diary, agg: count, goal: 40 }
  - { label: Exactly, source: Diary, agg: count, goal: 10 }
  - { label: Over, source: Diary, agg: count, goal: 4 }`);
        const rows = nodes(el, ".dashy-progress-row").map((r) => r.className);
        expect(rows[0]).not.toContain("is-complete");
        expect(rows[1]).toContain("is-complete");
        expect(rows[2]).toContain("is-complete");
    });
});

describe("progress — edges", () => {
    it("a missing goal errors and the row is marked broken, not zero", () => {
        const el = bars("items:\n  - { label: No goal, source: Diary, agg: count }");
        expect(diagnostics(el, "error")[0]).toContain("goal");
        const row = nodes(el, ".dashy-progress-row")[0];
        expect(row?.className).toContain("is-broken");
        expect(row?.className).not.toContain("is-complete");
    });

    it("a broken row shows dashes on both sides, not a zero", () => {
        const el = bars("items:\n  - { label: No goal, source: Diary, agg: count }");
        expect(texts(el, ".dashy-progress-value")[0]).toBe("— / —");
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("0%");
    });

    it("a goal of zero is refused rather than dividing by it", () => {
        const el = bars("items:\n  - { label: Zero, source: Diary, agg: count, goal: 0 }");
        expect(diagnostics(el, "error")[0]).toContain("0");
        expect(texts(el, ".dashy-progress-percent")).toHaveLength(0);
    });

    it("nothing counted leaves the bar empty but the goal visible", () => {
        const el = bars("items:\n  - { label: Nowhere, source: 99-Empty, field: km, agg: sum, goal: 100 }");
        expect(texts(el, ".dashy-progress-value")[0]).toBe("— / 100");
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("0%");
    });

    it("one broken row does not take the others down", () => {
        const el = bars(`items:
  - { label: Fine, source: Diary, agg: count, goal: 40 }
  - { label: Broken, source: Diary, agg: count }
  - { label: Also fine, source: Diary, agg: count, goal: 20 }`);
        expect(texts(el, ".dashy-progress-percent")).toEqual(["25%", "50%"]);
        expect(nodes(el, ".dashy-progress-row")).toHaveLength(3);
    });

    it("an empty block says so once", () => {
        const el = bars("   ");
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(nodes(el, ".dashy-progress-row")).toHaveLength(0);
    });

    it("an unknown key warns and the bar is still drawn", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40, colour2: red }");
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(nodes(el, ".dashy-progress-row")).toHaveLength(1);
    });
});

describe("progress — a field no note carries warns, not a silent zero (B-111)", () => {
    it("sum over a field nothing carries is a dash with a warning naming it", () => {
        const el = bars("items:\n  - { label: Run, source: Diary, field: nope, agg: sum, goal: 100 }");
        expect(texts(el, ".dashy-progress-value")[0]).toBe("— / 100");
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("Run");
        expect(diagnostics(el, "warning")[0]).toContain("nope");
    });

    it("streak over a field nothing carries is a dash too, not an honest 0", () => {
        const el = bars("items:\n  - { label: Gym streak, source: Diary, field: nope, agg: streak, goal: 5 }");
        expect(texts(el, ".dashy-progress-value")[0]).toBe("— / 5");
        expect(diagnostics(el, "warning")[0]).toContain("nope");
    });

    it("a text field warns with the not-numeric message, mentioning where + count", () => {
        const running = mockContext({
            notes: [
                { path: "Diary/2026-09-19.md", frontmatter: { running: "10 km" } },
                { path: "Diary/2026-09-20.md", frontmatter: { running: "5 km" } },
            ],
        });
        const el = host();
        renderProgress(
            running,
            "items:\n  - { label: Running, source: Diary, field: running, agg: sum, goal: 20 }",
            el,
        );
        const warning = diagnostics(el, "warning")[0] ?? "";
        expect(warning).toContain("running");
        expect(warning).toContain("where");
        expect(warning).toContain("count");
        expect(warning).not.toContain("Check the name");
    });

    it("a field present with only false checkboxes stays a clean 0 for streak, no warning", () => {
        const allFalse = mockContext({
            notes: [
                { path: "Diary/2026-09-19.md", frontmatter: { gym: false } },
                { path: "Diary/2026-09-20.md", frontmatter: { gym: false } },
            ],
        });
        const el = host();
        renderProgress(
            allFalse,
            "items:\n  - { label: Gym streak, source: Diary, field: gym, agg: streak, goal: 5 }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-progress-value")[0]).toContain("0 / 5");
    });

    it("a field present only outside the period window stays an unwarned dash (B-079)", () => {
        const TODAY = new Date(2026, 8, 24);
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const lastYear = mockContext({
            notes: [
                { path: "Diary/2025-09-24.md", frontmatter: { gym: true } },
                // Inside this week's window, but without the field: without
                // this, checking the field against the period-narrowed
                // window (wrong) and against the whole selection (correct)
                // both see an empty set and agree by accident.
                { path: "Diary/2026-09-24.md", frontmatter: { other: 1 } },
            ],
        });
        const el = host();
        renderProgress(
            lastYear,
            "items:\n  - { label: Gym this week, source: Diary, field: gym, agg: sum, period: week, goal: 5 }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-progress-value")[0]).toBe("— / 5");
        vi.useRealTimers();
    });

    it("streak over an empty period window is a dash too, not a zero (F4)", () => {
        const TODAY = new Date(2026, 8, 24);
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const lastYear = mockContext({
            notes: [{ path: "Diary/2025-09-24.md", frontmatter: { gym: true } }],
        });
        const el = host();
        renderProgress(
            lastYear,
            "items:\n  - { label: Gym streak, source: Diary, field: gym, agg: streak, period: week, goal: 5 }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-progress-value")[0]).toBe("— / 5");
        vi.useRealTimers();
    });

    it("a field nothing carries over an empty selection stays quiet: the folder warning covers it (F2)", () => {
        const el = bars("items:\n  - { label: Nowhere, source: 99-Empty, field: nope, agg: sum, goal: 5 }");
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("99-Empty");
    });
});

describe("progress — period narrows before counting", () => {
    // Same fixed "today" and the same week/month/year shape as stats.test.ts:
    // week reads 4, month 5. See that file for the day-by-day breakdown.
    const TODAY = new Date(2026, 8, 24);

    afterEach(() => vi.useRealTimers());

    const period = mockContext({
        notes: [
            { path: "Diary/2026-09-18.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-20.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-21.md", frontmatter: { gym: false } },
            { path: "Diary/2026-09-22.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-23.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-24.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-25.md", frontmatter: { gym: true } },
        ],
    });

    const withToday = (config: string) => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderProgress(period, config, el);
        return el;
    };

    it("the goal is measured against the period's value, not the whole selection", () => {
        const el = withToday(
            "items:\n  - { label: Gym this week, source: Diary, field: gym, agg: sum, period: week, goal: 5 }",
        );
        expect(texts(el, ".dashy-progress-value")[0]).toContain("4 / 5");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["80%"]);
    });

    it("a wider window reaches a goal a narrower one would not", () => {
        const el = withToday(
            "items:\n  - { label: Gym this month, source: Diary, field: gym, agg: sum, period: month, goal: 5 }",
        );
        expect(nodes(el, ".dashy-progress-row")[0]?.className).toContain("is-complete");
    });

    it("date_field reads a frontmatter property instead of the note name", () => {
        const books = mockContext({
            notes: [
                { path: "Books/book-1.md", frontmatter: { finished: "2026-09-22" } },
                { path: "Books/book-2.md", frontmatter: { finished: "2025-09-22" } },
            ],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderProgress(
            books,
            "items:\n  - { label: Books this year, source: Books, agg: count, period: year, date_field: finished, goal: 24 }",
            el,
        );
        expect(texts(el, ".dashy-progress-value")[0]).toContain("1 / 24");
    });

    it("an unreadable period warns and the bar draws unfiltered, not broken or silently narrowed", () => {
        const el = withToday(
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: fortnight, goal: 5 }",
        );
        expect(diagnostics(el, "warning")[0]).toContain("fortnight");
        // The whole selection, not the (ignored) period window: six of the
        // seven notes are true, past the goal of 5.
        expect(texts(el, ".dashy-progress-value")[0]).toContain("6 / 5");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["120%"]);
        expect(nodes(el, ".dashy-progress-row")[0]?.className).not.toContain("is-broken");
    });

    it("selected notes with no date and no date_field warn", () => {
        const books = mockContext({ notes: [{ path: "Books/book-1.md", frontmatter: { rating: 5 } }] });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderProgress(books, "items:\n  - { label: Books, source: Books, agg: count, period: month, goal: 10 }", el);
        expect(diagnostics(el, "warning")[0]).toContain("date_field");
    });

    it("date_field without period warns that it has no effect", () => {
        const el = withToday(
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, goal: 5, date_field: finished }",
        );
        expect(diagnostics(el, "warning")[0]).toContain("date_field");
    });

    it("an empty week is an honest zero, not a warning", () => {
        const lastYear = mockContext({
            notes: [{ path: "Diary/2025-09-24.md", frontmatter: { gym: true } }],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderProgress(
            lastYear,
            "items:\n  - { label: Gym this week, source: Diary, agg: count, period: week, goal: 5 }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-progress-value")[0]).toContain("0 / 5");
    });

    it("a suffixed name inside the period window still counts (B-081)", () => {
        const books = mockContext({
            notes: [
                { path: "Diary/2026-09-20 Sunday.md", frontmatter: { gym: true } },
                { path: "Diary/2026-09-21_Monday.md", frontmatter: { gym: true } },
            ],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderProgress(
            books,
            "items:\n  - { label: Gym this week, source: Diary, field: gym, agg: sum, period: week, goal: 5 }",
            el,
        );
        expect(texts(el, ".dashy-progress-value")[0]).toContain("2 / 5");
    });

    it("date_field feeds streak even with no period, and is not reported unused (B-081)", () => {
        const books = mockContext({
            notes: [
                { path: "Books/a.md", frontmatter: { finished: "2026-09-01" } },
                { path: "Books/b.md", frontmatter: { finished: "2026-09-02" } },
                { path: "Books/c.md", frontmatter: { finished: "2026-09-10" } }, // gap
            ],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderProgress(
            books,
            "items:\n  - { label: Reading streak, source: Books, agg: streak, date_field: finished, goal: 5 }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-progress-value")[0]).toContain("2 / 5");
    });

    it("date_field feeds latest even with no period (B-081)", () => {
        const books = mockContext({
            notes: [
                { path: "Books/a.md", frontmatter: { finished: "2026-09-01", rating: 3 } },
                { path: "Books/b.md", frontmatter: { finished: "2026-09-10", rating: 5 } },
            ],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderProgress(
            books,
            "items:\n  - { label: Last rating, source: Books, field: rating, agg: latest, date_field: finished, goal: 5 }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-progress-value")[0]).toContain("5 / 5");
    });

    it("an unreadable period next to date_field warns once, about the period, not twice (B-081 round 2)", () => {
        const books = mockContext({ notes: [{ path: "Diary/2026-09-24.md", frontmatter: { gym: true } }] });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderProgress(
            books,
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: fortnight, date_field: finished, goal: 5 }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("fortnight");
    });
});
