import { describe, it, expect, vi, afterEach } from "vitest";
import { renderStats } from "./stats";
import { mockContext, diary, recentDiary, host, texts, nodes, diagnostics } from "../test/vault";

// 10 days, sleep_score 70..79, steps 1000..1900, two of them tagged.
const ctx = mockContext({
    notes: [
        ...diary("Diary", "2026-01-01", 10, (i) => ({ sleep_score: 70 + i, steps: 1000 + i * 100 })),
        { path: "Books/one.md", frontmatter: { year: 2026, rating: 5 }, tags: ["read"] },
        { path: "Books/two.md", frontmatter: { year: 2025, rating: 3 }, tags: ["read"] },
    ],
});

const card = (config: string) => {
    const el = host();
    renderStats(ctx, config, el);
    return el;
};

describe("stats — the numbers are the real ones", () => {
    it("count counts the selection, not the vault", () => {
        expect(texts(card("items:\n  - { label: Days, source: Diary, agg: count }"), ".dashy-stat-value"))
            .toEqual(["10"]);
    });

    it("sum, avg, min, max, latest and streak each compute their own answer", () => {
        const el = card(`items:
  - { label: Sum, source: Diary, field: sleep_score, agg: sum }
  - { label: Avg, source: Diary, field: sleep_score, agg: avg }
  - { label: Min, source: Diary, field: sleep_score, agg: min }
  - { label: Max, source: Diary, field: sleep_score, agg: max }
  - { label: Latest, source: Diary, field: sleep_score, agg: latest }
  - { label: Streak, source: Diary, field: sleep_score, agg: streak }`);
        expect(texts(el, ".dashy-stat-value")).toEqual(["745", "74.5", "70", "79", "79", "10"]);
    });

    it("`where` narrows the selection before counting", () => {
        expect(texts(card('items:\n  - { label: This year, source: Books, where: "year = 2026", agg: count }'), ".dashy-stat-value"))
            .toEqual(["1"]);
    });

    it("a tag narrows it too", () => {
        expect(texts(card("items:\n  - { label: Read, tag: read, agg: count }"), ".dashy-stat-value"))
            .toEqual(["2"]);
    });

    it("precision is respected, and the default rounds to one decimal", () => {
        const el = card(`items:
  - { label: Exact, source: Diary, field: sleep_score, agg: avg, precision: 3 }
  - { label: Default, source: Diary, field: sleep_score, agg: avg }`);
        expect(texts(el, ".dashy-stat-value")).toEqual(["74.500", "74.5"]);
    });

    it("a long number is grouped for reading", () => {
        expect(texts(card("items:\n  - { label: Steps, source: Diary, field: steps, agg: sum }"), ".dashy-stat-value")[0])
            .toBe("14 500");
    });

    it("the unit rides with the number but stays a separate element", () => {
        const el = card("items:\n  - { label: Steps, source: Diary, field: steps, agg: sum, unit: st }");
        expect(texts(el, ".dashy-stat-unit")).toEqual(["st"]);
        // A real space, not only a CSS margin: "14 500st" is what a screen
        // reader would otherwise say.
        expect(nodes(el, ".dashy-stat-value")[0]?.textContent).toBe("14\u202F500 st");
    });

    it("label, icon and sub land where they were asked to", () => {
        const el = card("items:\n  - { label: Sleep, source: Diary, agg: count, icon: 🛌, sub: nightly }");
        expect(texts(el, ".dashy-stat-label")).toEqual(["Sleep"]);
        expect(texts(el, ".dashy-stat-icon")).toEqual(["🛌"]);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["nightly"]);
    });
});

describe("stats — the trend beside the number", () => {
    // A trailing window needs dates near now, or it is empty and proves nothing.
    const recent = mockContext({ notes: recentDiary("Recent", 40, (i) => ({ v: 60 + i })) });
    const trend = (config: string) => {
        const el = host();
        renderStats(recent, config, el);
        return el;
    };

    it("sketches one bar per day inside the window", () => {
        const el = trend("items:\n  - { label: Sleep, source: Recent, field: v, agg: avg, trend: 30d }");
        expect(nodes(el, ".dashy-stat-bar")).toHaveLength(30);
    });

    it("a shorter window takes the latest days, not the first", () => {
        const el = trend("items:\n  - { label: Sleep, source: Recent, field: v, agg: avg, trend: 3d }");
        const heights = nodes(el, ".dashy-stat-bar").map((b) => Number.parseFloat(b.style.height));
        expect(heights).toHaveLength(3);
        // v climbs with the date, so the last three climb too
        expect(heights[0]).toBeLessThan(heights[2]!);
    });

    it("the tallest bar is full height", () => {
        const el = trend("items:\n  - { label: Sleep, source: Recent, field: v, agg: avg, trend: 30d }");
        const heights = nodes(el, ".dashy-stat-bar").map((b) => Number.parseFloat(b.style.height));
        expect(Math.max(...heights)).toBe(100);
    });

    it("a diary that stopped months ago draws no trend at all", () => {
        // The window is days, not notes: ten notes from January are not the
        // last thirty days of anything.
        const el = card("items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, trend: 30d }");
        expect(nodes(el, ".dashy-stat-bar")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-value"), "the number still works").toEqual(["74.5"]);
    });

    it("no trend asked for means no bars at all", () => {
        const el = card("items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg }");
        expect(nodes(el, ".dashy-stat-trend")).toHaveLength(0);
    });

    it("a trend without a field warns instead of drawing nothing silently", () => {
        const el = card("items:\n  - { label: Days, source: Diary, agg: count, trend: 30d }");
        expect(diagnostics(el, "warning")[0]).toContain("field");
        expect(nodes(el, ".dashy-stat-bar")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-value"), "the number still works").toEqual(["10"]);
    });

    it("an unreadable window warns and the card survives", () => {
        const el = card("items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avg, trend: last month }");
        expect(diagnostics(el, "warning")[0]).toContain("30d");
        expect(texts(el, ".dashy-stat-value")).toEqual(["74.5"]);
    });

    it("a selection with no dated notes draws no bars", () => {
        const el = card("items:\n  - { label: Books, source: Books, field: rating, agg: avg, trend: 30d }");
        expect(nodes(el, ".dashy-stat-bar")).toHaveLength(0);
    });
});

describe("stats — nothing to count is not zero", () => {
    it("an empty selection shows a dash, marked as empty", () => {
        const el = card("items:\n  - { label: Nowhere, source: 99-Empty, field: steps, agg: sum }");
        const value = nodes(el, ".dashy-stat-value")[0];
        expect(value?.textContent).toBe("—");
        expect(value?.className).toContain("is-empty");
    });

    it("count over an empty selection is an honest zero, not a dash", () => {
        const el = card("items:\n  - { label: Nowhere, source: 99-Empty, agg: count }");
        expect(nodes(el, ".dashy-stat-value")[0]?.className).not.toContain("is-empty");
        expect(texts(el, ".dashy-stat-value")).toEqual(["0"]);
    });

    it("a unit is not printed next to a dash", () => {
        const el = card("items:\n  - { label: Nowhere, source: 99-Empty, field: steps, agg: sum, unit: st }");
        expect(nodes(el, ".dashy-stat-unit")).toHaveLength(0);
    });
});

describe("stats — edges", () => {
    it("a typo in the aggregate errors with a suggestion, and the card shows a dash", () => {
        const el = card("items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avgg }");
        expect(diagnostics(el, "error")[0]).toContain("avg");
        expect(texts(el, ".dashy-stat-value")).toEqual(["—"]);
    });

    it("an aggregate that needs a field says which card is missing one", () => {
        const el = card("items:\n  - { label: Sleep, source: Diary, agg: avg }");
        expect(diagnostics(el, "error")[0]).toContain("Sleep");
        expect(diagnostics(el, "error")[0]).toContain("field");
    });

    it("one broken card does not take the others down", () => {
        const el = card(`items:
  - { label: Fine, source: Diary, agg: count }
  - { label: Broken, source: Diary, agg: avg }
  - { label: Also fine, source: Diary, field: steps, agg: max }`);
        expect(texts(el, ".dashy-stat-value")).toEqual(["10", "—", "1900"]);
    });

    it("a single card written as a bare object draws, and warns about nothing", () => {
        const el = card("{ label: Days, source: Diary, agg: count }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["10"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("diagnostics come before the cards, so the error is read first", () => {
        const el = card("items:\n  - { label: Broken, source: Diary, agg: avg }");
        const children = Array.from(el.children).map((c) => c.className);
        expect(children[0]).toBe("dashy-diagnostics");
    });

    it("a folder nothing is filed under says so, instead of a silent zero", () => {
        // The first block a newcomer inserts points at the author's folders.
        const el = card("items:\n  - { label: Inbox, source: 00-Inbox, agg: count }");
        expect(diagnostics(el, "warning")[0]).toContain("00-Inbox");
        expect(texts(el, ".dashy-stat-value")).toEqual(["0"]);
    });

    it("four cards on the same missing folder complain once, not four times", () => {
        const el = card(`items:
  - { label: A, source: Nowhere, agg: count }
  - { label: B, source: Nowhere, agg: count }
  - { label: C, source: Nowhere, agg: count }
  - { label: D, source: Nowhere, agg: count }`);
        expect(diagnostics(el, "warning")).toHaveLength(1);
    });

    it("an existing folder that happens to be empty is not reported", () => {
        const el = card("items:\n  - { label: Books, source: Books, agg: count }");
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("an empty block says so once and draws no grid", () => {
        const el = card("   ");
        expect(diagnostics(el, "error")).toEqual(["⛔ stats: The block is empty."]);
        expect(nodes(el, ".dashy-stats")).toHaveLength(0);
    });

    it("a list with no items says which key was expected", () => {
        const el = card("columns: 3\nitems: []");
        expect(diagnostics(el, "error")[0]).toContain("items");
    });

    it("a where nobody can read warns instead of quietly showing a zero", () => {
        const el = card('items:\n  - { label: Filtered, source: Diary, where: "year = 2026 and rating >= 5", agg: count }');
        expect(diagnostics(el, "warning")[0]).toContain("only one is supported");
        // Unfiltered rather than an unexplained zero, and the warning says so.
        expect(texts(el, ".dashy-stat-value")).toEqual(["10"]);
    });

    it("columns are clamped to what fits", () => {
        const el = card("columns: 99\nitems:\n  - { label: A, source: Diary, agg: count }");
        expect(nodes(el, ".dashy-stats")[0]?.style.getPropertyValue("--dashy-stat-columns")).toBe("6");
    });

    it("a bad precision warns but the number is still shown", () => {
        const el = card("items:\n  - { label: Avg, source: Diary, field: sleep_score, agg: avg, precision: 9 }");
        expect(diagnostics(el, "warning")[0]).toContain("precision");
        expect(texts(el, ".dashy-stat-value")).toEqual(["74.5"]);
    });
});

describe("stats — period narrows before counting", () => {
    // A fixed "today" so the windows below are exact rather than relative:
    // 2026-09-24 is a Thursday, and the English locale's week starts Sunday.
    const TODAY = new Date(2026, 8, 24);

    afterEach(() => vi.useRealTimers());

    // gym: 1 in March (year only), 1 on the 18th (month only), then the
    // current week 20..24 reads 1,0,1,1,1 — a checkbox habit tracker, the
    // shape B-079 exists for. The 25th is tomorrow and must never count, and
    // last year's 24th proves the year window does not reach back that far.
    const period = mockContext({
        notes: [
            { path: "Diary/2026-03-01.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-18.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-20.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-21.md", frontmatter: { gym: false } },
            { path: "Diary/2026-09-22.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-23.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-24.md", frontmatter: { gym: true } },
            { path: "Diary/2026-09-25.md", frontmatter: { gym: true } },
            { path: "Diary/2025-09-24.md", frontmatter: { gym: true } },
        ],
    });

    const withToday = (config: string) => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(period, config, el);
        return el;
    };

    it("week sums only the current calendar week, ending today", () => {
        const el = withToday("items:\n  - { label: Gym this week, source: Diary, field: gym, agg: sum, period: week }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["4"]);
    });

    it("month reaches further back than week", () => {
        const el = withToday("items:\n  - { label: Gym this month, source: Diary, field: gym, agg: sum, period: month }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["5"]);
    });

    it("year reaches further back than month", () => {
        const el = withToday("items:\n  - { label: Gym this year, source: Diary, field: gym, agg: sum, period: year }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["6"]);
    });

    it("a rolling Nd window is exact, not rounded to a calendar unit", () => {
        const el = withToday("items:\n  - { label: Gym 3d, source: Diary, field: gym, agg: sum, period: 3d }");
        // 22nd, 23rd, 24th: 1 + 1 + 1
        expect(texts(el, ".dashy-stat-value")).toEqual(["3"]);
    });

    it("count also respects the window, not only a field aggregate", () => {
        const el = withToday("items:\n  - { label: Diary entries this week, source: Diary, agg: count, period: week }");
        // 20th, 21st, 22nd, 23rd, 24th — five entries, the 25th excluded as tomorrow
        expect(texts(el, ".dashy-stat-value")).toEqual(["5"]);
    });

    it("trend keeps its own trailing window, independent of period", () => {
        const el = withToday(
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, trend: 30d }",
        );
        // The trend still draws from the full selection, not the period window.
        expect(nodes(el, ".dashy-stat-bar").length).toBeGreaterThan(5);
    });

    it("date_field reads a frontmatter property instead of the note name", () => {
        const books = mockContext({
            notes: [
                { path: "Books/book-1.md", frontmatter: { finished: "2026-09-22" } },
                { path: "Books/book-2.md", frontmatter: { finished: "2025-09-22" } },
                { path: "Books/book-3.md", frontmatter: { rating: 5 } },
            ],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(
            books,
            "items:\n  - { label: Books this week, source: Books, agg: count, period: week, date_field: finished }",
            el,
        );
        expect(texts(el, ".dashy-stat-value")).toEqual(["1"]);
    });

    it("an unreadable period warns and the card draws without a window", () => {
        const el = withToday("items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: fortnight }");
        expect(diagnostics(el, "warning")[0]).toContain("fortnight");
        // Unfiltered: every gym value in the whole selection, not just a window.
        expect(texts(el, ".dashy-stat-value")).toEqual(["8"]);
    });

    it("selected notes with no name-date and no date_field warn instead of showing a silent dash", () => {
        const books = mockContext({
            notes: [{ path: "Books/book-1.md", frontmatter: { rating: 5 } }],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(books, "items:\n  - { label: Books, source: Books, agg: count, period: month }", el);
        expect(diagnostics(el, "warning")[0]).toContain("date_field");
    });

    it("a date_field that names nothing on any note warns and names the field", () => {
        const books = mockContext({
            notes: [{ path: "Books/book-1.md", frontmatter: { rating: 5 } }],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(
            books,
            "items:\n  - { label: Books, source: Books, agg: count, period: month, date_field: finished }",
            el,
        );
        expect(diagnostics(el, "warning")[0]).toContain("finished");
    });

    it("date_field without period warns that it has no effect", () => {
        const el = withToday("items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, date_field: finished }");
        expect(diagnostics(el, "warning")[0]).toContain("date_field");
    });

    it("an empty week is an honest zero, not a warning", () => {
        const lastYear = mockContext({
            notes: [{ path: "Diary/2025-09-24.md", frontmatter: { gym: true } }],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(
            lastYear,
            "items:\n  - { label: Diary entries this week, source: Diary, agg: count, period: week }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-value")).toEqual(["0"]);
    });

    it("a field aggregate over an empty week shows a dash, its usual rule for nothing to count", () => {
        const lastYear = mockContext({
            notes: [{ path: "Diary/2025-09-24.md", frontmatter: { gym: true } }],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(
            lastYear,
            "items:\n  - { label: Gym this week, source: Diary, field: gym, agg: sum, period: week }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-value")).toEqual(["—"]);
    });
});

describe("stats — compare against the previous period", () => {
    // 2026-09-24 is a Thursday, and the English locale's week starts Sunday,
    // so the current week is Sun 20 .. Thu 24 and the previous one, the same
    // stretch to date, is Sun 13 .. Thu 17.
    const TODAY = new Date(2026, 8, 24);

    afterEach(() => vi.useRealTimers());

    const previousWeek = [
        { path: "Diary/2026-09-13.md", frontmatter: { gym: true, mood: 5, steps: 100 } },
        { path: "Diary/2026-09-14.md", frontmatter: { gym: false, mood: 5, steps: 100 } },
        { path: "Diary/2026-09-15.md", frontmatter: { gym: false, mood: 5, steps: 100 } },
        { path: "Diary/2026-09-16.md", frontmatter: { gym: false, mood: 5, steps: 100 } },
        { path: "Diary/2026-09-17.md", frontmatter: { gym: true, mood: 5, steps: 100 } },
        // Friday and Saturday, ticked, sit past Thursday — the same weekday
        // today falls on. They must never count: "the same stretch to date"
        // is Sun .. Thu, not the whole previous week. If the code ever
        // regressed to comparing against the whole previous week, the gym
        // sum below would read 4, not 2, and the assertions below would fail.
        { path: "Diary/2026-09-18.md", frontmatter: { gym: true, mood: 5, steps: 100 } },
        { path: "Diary/2026-09-19.md", frontmatter: { gym: true, mood: 5, steps: 100 } },
    ];
    // gym sum 2 (to date) / 4 (whole week), mood avg 5, steps sum 500 (to date).
    const currentWeek = [
        { path: "Diary/2026-09-20.md", frontmatter: { gym: true, mood: 3, steps: 100 } },
        { path: "Diary/2026-09-21.md", frontmatter: { gym: false, mood: 3, steps: 100 } },
        { path: "Diary/2026-09-22.md", frontmatter: { gym: true, mood: 3, steps: 100 } },
        { path: "Diary/2026-09-23.md", frontmatter: { gym: true, mood: 3, steps: 100 } },
        { path: "Diary/2026-09-24.md", frontmatter: { gym: true, mood: 3, steps: 100 } },
    ];
    // gym sum 4 (up 2 from last week), mood avg 3 (down 2), steps sum 500 (flat).
    const compareCtx = mockContext({ notes: [...previousWeek, ...currentWeek] });

    const withToday = (config: string) => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(compareCtx, config, el);
        return el;
    };

    it("a rise shows an up arrow, a plus sign and what it compares with", () => {
        const el = withToday(
            "items:\n  - { label: Gym this week, source: Diary, field: gym, agg: sum, period: week, compare: true }",
        );
        expect(texts(el, ".dashy-stat-value")).toEqual(["4"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▲ +2"]);
        const delta = nodes(el, ".dashy-stat-delta")[0];
        expect(delta?.className).toContain("dashy-stat-delta-neutral");
        expect(delta?.getAttribute("title")).toBe("vs the same days last week: 2");
    });

    it("`better: up` colours a rise good", () => {
        const el = withToday(
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, compare: true, better: up }",
        );
        expect(nodes(el, ".dashy-stat-delta")[0]?.className).toContain("dashy-stat-delta-good");
    });

    it("`better: down` colours the same rise bad, for a number where less is better", () => {
        const el = withToday(
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, compare: true, better: down }",
        );
        expect(nodes(el, ".dashy-stat-delta")[0]?.className).toContain("dashy-stat-delta-bad");
    });

    it("a fall shows a down arrow and a real minus sign", () => {
        const el = withToday(
            "items:\n  - { label: Mood, source: Diary, field: mood, agg: avg, period: week, compare: true, better: down }",
        );
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▼ −2"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.className).toContain("dashy-stat-delta-good");
    });

    it("no change stays neutral even with `better` set", () => {
        const el = withToday(
            "items:\n  - { label: Steps, source: Diary, field: steps, agg: sum, period: week, compare: true, better: up }",
        );
        expect(texts(el, ".dashy-stat-delta")).toEqual(["= 0"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.className).toContain("dashy-stat-delta-neutral");
    });

    it("nothing in the previous window means no delta at all, not a made-up one", () => {
        // The original `period` fixture above has no note dated in Sun 13 .. Thu 17.
        const noPreviousData = mockContext({ notes: currentWeek });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(
            noPreviousData,
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, compare: true }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-value")).toEqual(["4"]);
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
    });

    it("nothing in the current window either: a dash and no delta", () => {
        const el = withToday(
            "items:\n  - { label: Nowhere, source: 99-Empty, field: gym, agg: sum, period: week, compare: true }",
        );
        expect(texts(el, ".dashy-stat-value")).toEqual(["—"]);
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
    });

    it("`compare` without `period` warns and draws no delta", () => {
        const el = withToday(
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, compare: true }",
        );
        expect(diagnostics(el, "warning")[0]).toContain("compare");
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
        // Unfiltered: every gym value across both weeks, 4 (whole previous week,
        // Fri/Sat included) + 4 (current).
        expect(texts(el, ".dashy-stat-value")).toEqual(["8"]);
    });

    it("`better` without `compare` warns, and the card still draws its value", () => {
        const el = withToday(
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, better: up }",
        );
        expect(diagnostics(el, "warning")[0]).toContain("better");
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-value")).toEqual(["4"]);
    });

    it("an unrecognised `better` warns and the delta stays neutral rather than disappearing", () => {
        const el = withToday(
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, compare: true, better: sideways }",
        );
        expect(diagnostics(el, "warning")[0]).toContain("sideways");
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▲ +2"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.className).toContain("dashy-stat-delta-neutral");
    });

    it("the arrow is decorative and hidden from a screen reader", () => {
        const el = withToday(
            "items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, compare: true }",
        );
        const arrow = el.querySelector(".dashy-stat-delta-arrow");
        expect(arrow?.getAttribute("aria-hidden")).toBe("true");
    });

    // The `yaml` package hands these back exactly as written — none of them
    // is the boolean `true` — and used to draw with no delta and no warning.
    it.each([
        ["compare: yes", "yes"],
        ['compare: "true"', "true"],
        ["compare: 1", "1"],
    ])("a non-boolean %s warns and names the value instead of silently doing nothing", (yaml, shown) => {
        const el = withToday(`items:\n  - { label: Gym, source: Diary, field: gym, agg: sum, period: week, ${yaml} }`);
        expect(diagnostics(el, "warning")[0]).toContain(shown);
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-value")).toEqual(["4"]);
    });

    it("count refuses a phantom delta against an empty previous window too", () => {
        // `count` never returns null, so a naive null-check would compare
        // today's real count against a made-up 0 from an empty window.
        const noPreviousData = mockContext({ notes: currentWeek });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(
            noPreviousData,
            "items:\n  - { label: Diary entries, source: Diary, agg: count, period: week, compare: true }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-value")).toEqual(["5"]);
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
    });

    it("streak refuses `compare` outright: a warning, and the streak itself still draws", () => {
        const el = withToday(
            "items:\n  - { label: Gym streak, source: Diary, field: gym, agg: streak, period: week, compare: true }",
        );
        expect(diagnostics(el, "warning")[0]).toContain("streak");
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
        expect(texts(el, ".dashy-stat-value")).toEqual(["3"]);
    });

    it("the delta is computed from the values as displayed, not the raw difference", () => {
        // A single note per window: previous 10.4, current 10.6. At
        // `precision: 0` those display as 10 and 11 — a visible difference of
        // 1 — while the raw difference, 0.2, rounds to 0.
        const roundingCtx = mockContext({
            notes: [
                { path: "Diary/2026-09-13.md", frontmatter: { score: 10.4 } },
                { path: "Diary/2026-09-20.md", frontmatter: { score: 10.6 } },
            ],
        });
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderStats(
            roundingCtx,
            "items:\n  - { label: Score, source: Diary, field: score, agg: avg, period: week, compare: true, precision: 0 }",
            el,
        );
        expect(texts(el, ".dashy-stat-value")).toEqual(["11"]);
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▲ +1"]);
    });
});
