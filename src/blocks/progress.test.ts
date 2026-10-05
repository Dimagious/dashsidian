import { describe, it, expect, vi, afterEach } from "vitest";
import { renderProgress } from "./progress";
import { mockContext, diary, host, texts, nodes, diagnostics } from "../test/vault";
import { setLocale } from "../i18n";

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

    it("a single bar written without items still reads target as goal (B-125)", () => {
        const el = bars("label: Days\nfolder: Diary\nagg: count\ntarget: 40");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["25%"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("icon and sub are drawn when given", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40, icon: 📔, sub: this year }");
        expect(texts(el, ".dashy-progress-icon")).toEqual(["📔"]);
        expect(texts(el, ".dashy-progress-sub")).toEqual(["this year"]);
    });
});

describe("progress — a nested frontmatter path in field (B-100)", () => {
    const nested = mockContext({
        notes: [
            { path: "Diary/2026-01-01.md", frontmatter: { health: { steps: 4000 } } },
            { path: "Diary/2026-01-02.md", frontmatter: { health: { steps: 6000 } } },
        ],
    });
    const nestedBars = (config: string) => {
        const el = host();
        renderProgress(nested, config, el);
        return el;
    };

    it("sums a dotted path towards the goal", () => {
        const el = nestedBars("items:\n  - { label: Steps, source: Diary, field: health.steps, agg: sum, goal: 20000 }");
        expect(texts(el, ".dashy-progress-value")[0]).toContain("10 000 / 20 000");
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("a truly missing nested path warns and names it", () => {
        const el = nestedBars("items:\n  - { label: Km, source: Diary, field: health.km, agg: sum, goal: 100 }");
        expect(diagnostics(el, "warning")[0]).toContain("health.km");
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

describe("progress — columns (B-102)", () => {
    it("without columns the grid stays one bar per row, unchanged", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40 }");
        expect(nodes(el, ".dashy-progress")[0]?.style.getPropertyValue("--dashy-progress-columns")).toBe("1");
    });

    it("columns reach the grid as a custom property", () => {
        const el = bars("columns: 3\nitems:\n  - { label: Days, source: Diary, agg: count, goal: 40 }");
        expect(nodes(el, ".dashy-progress")[0]?.style.getPropertyValue("--dashy-progress-columns")).toBe("3");
    });

    it("columns are clamped to what the grid can show", () => {
        for (const [given, expected] of [["0", "1"], ["99", "4"], ["-4", "1"]] as const) {
            const el = bars(`columns: ${given}\nitems:\n  - { label: Days, source: Diary, agg: count, goal: 40 }`);
            expect(nodes(el, ".dashy-progress")[0]?.style.getPropertyValue("--dashy-progress-columns")).toBe(expected);
        }
    });

    it("only a several-column grid is marked for the phone's two-column narrowing", () => {
        const one = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40 }");
        expect(nodes(one, ".dashy-progress")[0]?.classList.contains("is-multi")).toBe(false);
        const three = bars("columns: 3\nitems:\n  - { label: Days, source: Diary, agg: count, goal: 40 }");
        expect(nodes(three, ".dashy-progress")[0]?.classList.contains("is-multi")).toBe(true);
    });

    it("the root keys are still checked when there is an items list", () => {
        const el = bars("colums: 3\nitems:\n  - { label: Days, source: Diary, agg: count, goal: 40 }");
        expect(diagnostics(el, "warning")[0]).toContain("columns");
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

describe("progress — streak threshold and weekdays, end to end (B-101)", () => {
    it("at_least turns streak into a threshold on the day's summed field", () => {
        const steps = mockContext({
            notes: [
                { path: "Diary/2026-09-18.md", frontmatter: { steps: 4999 } },
                { path: "Diary/2026-09-19.md", frontmatter: { steps: 5000 } },
                { path: "Diary/2026-09-20.md", frontmatter: { steps: 6000 } },
            ],
        });
        const el = host();
        renderProgress(
            steps,
            "items:\n  - { label: Active streak, source: Diary, field: steps, agg: streak, at_least: 5000, goal: 5 }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-progress-value")[0]).toContain("2 / 5");
    });

    it("days: weekdays bridges a weekend gap: Friday to Monday is a run of two", () => {
        const gym = mockContext({
            notes: [
                { path: "Diary/2026-09-18.md", frontmatter: { gym: true } }, // Friday
                { path: "Diary/2026-09-21.md", frontmatter: { gym: true } }, // Monday
            ],
        });
        const el = host();
        renderProgress(
            gym,
            "items:\n  - { label: Gym streak, source: Diary, field: gym, agg: streak, days: weekdays, goal: 5 }",
            el,
        );
        expect(texts(el, ".dashy-progress-value")[0]).toContain("2 / 5");
    });

    it("at_least/at_most/days on a non-streak bar warn once and are ignored", () => {
        const el = bars(
            "items:\n  - { label: Run, source: Diary, field: km, agg: sum, at_least: 5, goal: 100 }",
        );
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("at_least");
    });

    it("a threshold on a streak with no field warns and is ignored", () => {
        const el = bars("items:\n  - { label: Streak, source: Diary, agg: streak, at_least: 5, goal: 5 }");
        expect(diagnostics(el, "warning")[0]).toContain("field");
        // Without the (ignored) threshold, every diary day counts.
        expect(texts(el, ".dashy-progress-value")[0]).toContain("10 / 5");
    });
});

describe("progress — current_streak, end to end (B-118)", () => {
    afterEach(() => vi.useRealTimers());

    it("measures the run going on now against the goal, today counted once filled", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 22, 12));
        const steps = mockContext({
            notes: [
                { path: "Diary/2026-09-19.md", frontmatter: { steps: 3000 } },
                { path: "Diary/2026-09-20.md", frontmatter: { steps: 6000 } },
                { path: "Diary/2026-09-21.md", frontmatter: { steps: 7000 } },
                { path: "Diary/2026-09-22.md", frontmatter: { steps: 5000 } },
            ],
        });
        const el = host();
        renderProgress(
            steps,
            "items:\n  - { label: Current streak, source: Diary, field: steps, agg: current_streak, at_least: 5000, goal: 10 }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-progress-value")[0]).toBe("3 / 10 30%");
    });
});

// B-121: a progress bar over durations, with a goal written as one.
describe("progress — durations", () => {
    // Thursday. In English the week starts on Sunday: this week is 20..24
    // September, the same days last week 13..17.
    const TODAY = new Date(2026, 8, 24, 12);
    const nights: Record<string, string> = {
        "2026-09-13": "6h", "2026-09-14": "6h 30m", "2026-09-15": "7h", "2026-09-16": "6h", "2026-09-17": "6h 55m",
        "2026-09-20": "7h 30m", "2026-09-21": "6:45", "2026-09-22": "8h", "2026-09-23": "5h 58min", "2026-09-24": "7h 12m",
    };
    // This week: 450 + 405 + 480 + 358 + 432 = 2125 minutes, avg 425 (7h 5m).
    // Last week: 360 + 390 + 420 + 360 + 415 = 1945 minutes, avg 389 (6h 29m).
    const sleepCtx = mockContext({
        notes: [
            ...Object.entries(nights).map(([date, sleep]) => ({ path: `Diary/${date}.md`, frontmatter: { sleep, steps: 5000 } })),
            { path: "Mixed/2026-09-20.md", frontmatter: { sleep: "7h" } },
            { path: "Mixed/2026-09-21.md", frontmatter: { sleep: 400 } },
        ],
    });

    const render = (config: string): HTMLElement => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderProgress(sleepCtx, config, el);
        return el;
    };

    afterEach(() => {
        vi.useRealTimers();
        setLocale("en");
    });

    it("goal: 8h against an average of 7h 5m: both read as durations, 425 of 480 minutes is 89%", () => {
        const el = render("items:\n  - { label: Sleep, source: Diary, field: sleep, agg: avg, period: week, goal: 8h }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["7h 5m / 8h 89%"]);
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("89%");
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a plain goal on a duration field means minutes and reads as a duration", () => {
        const el = render("items:\n  - { label: Sleep, source: Diary, field: sleep, agg: sum, period: week, goal: 2400 }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["35h 25m / 40h 89%"]);
    });

    it("a unit is dropped with a warning", () => {
        const el = render(
            "items:\n  - { label: Sleep, source: Diary, field: sleep, agg: avg, period: week, goal: 8h, unit: h }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["7h 5m / 8h 89%"]);
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ progress: "Sleep": `unit: h` is ignored. "sleep" holds durations, which already carry their own units.',
        ]);
    });

    it("a duration goal on a streak warns: the streak counts days, not time", () => {
        const el = render("items:\n  - { label: Nights, source: Diary, field: sleep, agg: streak, goal: 8h }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["5 / 480 1%"]);
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ progress: "Nights": `goal: 8h` is a duration, but `agg: streak` counts days or notes, not time. It is applied as minutes.',
        ]);
    });

    it("a duration goal against plain numbers warns", () => {
        const el = render("items:\n  - { label: Steps, source: Diary, field: steps, agg: latest, goal: 1h 40m }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["5000 / 100 5000%"]);
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ progress: "Steps": `goal: 1h 40m` is a duration, but "steps" holds plain numbers. It is applied as minutes.',
        ]);
    });

    it("in Russian", () => {
        setLocale("ru");
        const el = render("items:\n  - { label: Sleep, source: Diary, field: sleep, agg: avg, period: week, goal: 8h }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["7\u00A0ч 5\u00A0мин / 8\u00A0ч 89%"]);
    });
});

describe("progress — selection at the block root (B-131)", () => {
    // km on the 10 diary days reads 1..10.
    it("every bar inherits the root source and where", () => {
        const el = bars(`source: Diary
where: "km > 5"
items:
  - { label: Days, agg: count, goal: 10 }
  - { label: Run, field: km, agg: sum, goal: 100 }`);
        expect(texts(el, ".dashy-progress-percent")).toEqual(["50%", "40%"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a bar's own where narrows further, and its own source replaces the root's", () => {
        const el = bars(`source: Diary
where: "km > 5"
items:
  - { label: Long, where: "km >= 9", agg: count, goal: 10 }
  - { label: Elsewhere, source: Nowhere, agg: count, goal: 10 }`);
        expect(texts(el, ".dashy-progress-percent")).toEqual(["20%", "0%"]);
        expect(diagnostics(el, "warning")).toEqual([
            "⚠️ progress: Nothing is filed under `Nowhere`. The numbers below count nothing. Point `source` at a folder of your own.",
        ]);
    });

    it("an unreadable root where is reported once for the whole block", () => {
        const el = bars(`source: Diary
where: [km > 5, "km <"]
items:
  - { label: A, agg: count, goal: 10 }
  - { label: B, agg: count, goal: 10 }`);
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("`km <` in `where` could not be read");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["100%", "100%"]);
    });

    it("a root period applies to every bar, and a bar's own replaces it", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10));
        try {
            const el = bars(`source: Diary
period: 3d
items:
  - { label: Three days, agg: count, goal: 10 }
  - { label: Year, agg: count, goal: 10, period: year }`);
            expect(texts(el, ".dashy-progress-percent")).toEqual(["30%", "100%"]);
            expect(diagnostics(el, "warning")).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });
});

// B-145: race times written to the second read as a clock, the goal with them.
describe("progress: race times as a clock", () => {
    const raceCtx = mockContext({
        notes: [
            { path: "Parkrun/2026-09-19.md", frontmatter: { time: "0:18:51" } },
            { path: "Parkrun/2026-09-20.md", frontmatter: { time: "0:19:40" } },
            { path: "Mixed/2026-09-20.md", frontmatter: { time: "0:18:51" } },
            { path: "Mixed/2026-09-21.md", frontmatter: { time: "19:40" } },
        ],
    });
    const render = (config: string): HTMLElement => {
        const el = host();
        renderProgress(raceCtx, config, el);
        return el;
    };

    it("the value and the goal read H:MM:SS: 1131 of 1200 seconds is 94%", () => {
        const el = render('items:\n  - { label: 5k, source: Parkrun, field: time, agg: min, goal: "0:20:00" }');
        expect(texts(el, ".dashy-progress-value")).toEqual(["0:18:51 / 0:20:00 94%"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a field where one value lacks seconds keeps hours and minutes: 19:40 is nineteen hours", () => {
        const el = render("items:\n  - { label: 5k, source: Mixed, field: time, agg: max, goal: 20h }");
        expect(texts(el, ".dashy-progress-value")).toEqual(["19h 40m / 20h 98%"]);
    });
});
