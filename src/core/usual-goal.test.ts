import { describe, it, expect, afterEach } from "vitest";
import { usualWindows, usualGoal, roundedGoal, usualGoalProblem, USUAL_PERIODS, MAX_USUAL_PERIODS } from "./usual-goal";
import { readProgress } from "./progress";
import type { FixedWindow, Period } from "./period";
import type { NoteRecord } from "./source";
import { setLocale, tPlural } from "../i18n";

/** B-209, `goal: usual`. Today is Monday 9 November 2026. */
const TODAY = new Date(2026, 10, 9);
const SUNDAY = 0;
const MONDAY = 1;

const fixed = (unit: FixedWindow["unit"], start: string, end?: string): FixedWindow =>
    end === undefined ? { kind: "fixed", unit, start } : { kind: "fixed", unit, start, end };

const note = (name: string, frontmatter: Record<string, unknown> = {}): NoteRecord =>
    ({ path: `Diary/${name}.md`, name, folder: "Diary", tags: [], frontmatter });

/** One note a day from `from` for `days` days, `fields(i)` as its frontmatter. */
function days(from: string, count: number, fields: (i: number) => Record<string, unknown>): NoteRecord[] {
    const [y, m, d] = from.split("-").map(Number) as [number, number, number];
    return Array.from({ length: count }, (_, i) => {
        const date = new Date(y, m - 1, d + i);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        return note(key, fields(i));
    });
}

afterEach(() => setLocale("en"));

describe("usualWindows: the periods before the window (B-209)", () => {
    it("period: month is the 4 calendar months before this one, the nearest first", () => {
        expect(usualWindows({ kind: "month" }, TODAY, MONDAY, 4)).toEqual([
            { start: "2026-10-01", end: "2026-10-31" },
            { start: "2026-09-01", end: "2026-09-30" },
            { start: "2026-08-01", end: "2026-08-31" },
            { start: "2026-07-01", end: "2026-07-31" },
        ]);
    });

    it("steps across New Year and keeps February's own length", () => {
        expect(usualWindows({ kind: "month" }, new Date(2027, 1, 10), MONDAY, 3)).toEqual([
            { start: "2027-01-01", end: "2027-01-31" },
            { start: "2026-12-01", end: "2026-12-31" },
            { start: "2026-11-01", end: "2026-11-30" },
        ]);
        expect(usualWindows({ kind: "month" }, new Date(2026, 2, 31), MONDAY, 1)).toEqual([
            { start: "2026-02-01", end: "2026-02-28" },
        ]);
    });

    it("period: week starts every past week on the locale's first day", () => {
        // Monday 9 November: a Monday-first week starts today, a Sunday-first one yesterday.
        expect(usualWindows({ kind: "week" }, TODAY, MONDAY, 2)).toEqual([
            { start: "2026-11-02", end: "2026-11-08" },
            { start: "2026-10-26", end: "2026-11-01" },
        ]);
        expect(usualWindows({ kind: "week" }, TODAY, SUNDAY, 2)).toEqual([
            { start: "2026-11-01", end: "2026-11-07" },
            { start: "2026-10-25", end: "2026-10-31" },
        ]);
    });

    it("a rolling 30d steps back 30 days at a time, back to back", () => {
        // This window: 11 October to 9 November.
        expect(usualWindows({ kind: "days", days: 30 }, TODAY, MONDAY, 2)).toEqual([
            { start: "2026-09-11", end: "2026-10-10" },
            { start: "2026-08-12", end: "2026-09-10" },
        ]);
    });

    it("period: year is the whole years before this one", () => {
        expect(usualWindows({ kind: "year" }, TODAY, MONDAY, 2)).toEqual([
            { start: "2025-01-01", end: "2025-12-31" },
            { start: "2024-01-01", end: "2024-12-31" },
        ]);
    });

    it("a named month, quarter, week and day step back from their own start, closed or running", () => {
        // A closed month, as `period: note` in `2026-10` reads it.
        expect(usualWindows(fixed("month", "2026-10-01", "2026-10-31"), TODAY, MONDAY, 2)).toEqual([
            { start: "2026-09-01", end: "2026-09-30" },
            { start: "2026-08-01", end: "2026-08-31" },
        ]);
        // The running quarter `2026-Q4`.
        expect(usualWindows(fixed("quarter", "2026-10-01", "2026-12-31"), TODAY, MONDAY, 2)).toEqual([
            { start: "2026-07-01", end: "2026-09-30" },
            { start: "2026-04-01", end: "2026-06-30" },
        ]);
        // A locale week `2026-W40` starting on a Sunday keeps its Sunday, whatever `firstDay` says.
        expect(usualWindows(fixed("week", "2026-09-27", "2026-10-03"), TODAY, MONDAY, 2)).toEqual([
            { start: "2026-09-20", end: "2026-09-26" },
            { start: "2026-09-13", end: "2026-09-19" },
        ]);
        expect(usualWindows(fixed("day", "2026-11-01", "2026-11-01"), TODAY, MONDAY, 2)).toEqual([
            { start: "2026-10-31", end: "2026-10-31" },
            { start: "2026-10-30", end: "2026-10-30" },
        ]);
        expect(usualWindows(fixed("year", "2026-01-01", "2026-12-31"), TODAY, MONDAY, 1)).toEqual([
            { start: "2025-01-01", end: "2025-12-31" },
        ]);
    });

    it("a window not started yet still steps back from its own start", () => {
        expect(usualWindows(fixed("month", "2026-12-01", "2026-12-31"), TODAY, MONDAY, 1)).toEqual([
            { start: "2026-11-01", end: "2026-11-30" },
        ]);
    });

    it("{ from, to } does not repeat: there is nothing of the same kind before it", () => {
        expect(usualWindows(fixed("span", "2026-09-01", "2026-09-30"), TODAY, MONDAY, 4)).toBeNull();
        expect(usualWindows(fixed("span", "2026-09-01"), TODAY, MONDAY, 4)).toBeNull();
    });
});

describe("usualGoal: the mean over past periods (B-209)", () => {
    const months = usualWindows({ kind: "month" }, TODAY, MONDAY, 4) ?? [];

    it("a monthly sum: the mean of July to October", () => {
        // 1 km a day from 1 July: July 31, August 31, September 30, October 31.
        const notes = days("2026-07-01", 132, () => ({ km: 1 }));
        expect(usualGoal(notes, months, { agg: "sum", field: "km" })).toEqual({ value: 30.75, counted: 4, whole: true });
    });

    it("{ usual: 2 } takes the two nearest", () => {
        const notes = days("2026-07-01", 132, () => ({ km: 1 }));
        const two = usualWindows({ kind: "month" }, TODAY, MONDAY, 2) ?? [];
        expect(usualGoal(notes, two, { agg: "sum", field: "km" })).toEqual({ value: 30.5, counted: 2, whole: true });
    });

    it("skips the months before the first dated note, and counts an empty month after it as zero", () => {
        // The diary starts on 20 August: July is skipped, August (12 days)
        // counts in part, September is empty and counts as 0, October holds 10.
        const notes = [
            ...days("2026-08-20", 12, () => ({ km: 1 })),
            ...days("2026-10-01", 10, () => ({ km: 1 })),
        ];
        expect(usualGoal(notes, months, { agg: "sum", field: "km" })).toEqual({ value: 22 / 3, counted: 3, whole: true });
        expect(usualGoal(notes, months, { agg: "count" })).toEqual({ value: 22 / 3, counted: 3, whole: true });
    });

    it("an undated note does not move the first date back", () => {
        const notes = [note("Someday", { km: 99 }), ...days("2026-10-01", 31, () => ({ km: 2 }))];
        expect(usualGoal(notes, months, { agg: "sum", field: "km" })).toEqual({ value: 62, counted: 1, whole: true });
    });

    it("tells whether every period's value was whole", () => {
        const notes = [
            ...days("2026-09-01", 30, () => ({ sleep: 7.5 })),
            ...days("2026-10-01", 31, () => ({ sleep: 7 })),
        ];
        expect(usualGoal(notes, months, { agg: "avg", field: "sleep" })).toEqual({ value: 7.25, counted: 2, whole: false });
    });

    it("an average skips an empty month instead of counting it as zero", () => {
        const notes = [
            ...days("2026-07-01", 31, () => ({ sleep: 80 })),
            ...days("2026-10-01", 31, () => ({ sleep: 70 })),
        ];
        expect(usualGoal(notes, months, { agg: "avg", field: "sleep" })).toEqual({ value: 75, counted: 2, whole: true });
    });

    it("a sum over notes that lack the field counts as zero after the first note", () => {
        const notes = [
            ...days("2026-07-01", 31, () => ({ km: 4 })),
            ...days("2026-08-01", 92, () => ({ other: 1 })),
        ];
        expect(usualGoal(notes, months, { agg: "sum", field: "km" })).toEqual({ value: 31, counted: 4, whole: true });
    });

    it("no note before the window: no goal", () => {
        const notes = days("2026-11-01", 9, () => ({ km: 1 }));
        expect(usualGoal(notes, months, { agg: "sum", field: "km" })).toEqual({ value: null, counted: 0, whole: true });
        expect(usualGoal([], months, { agg: "count" })).toEqual({ value: null, counted: 0, whole: true });
    });

    it("durations are averaged in minutes", () => {
        const notes = [
            ...days("2026-09-01", 30, () => ({ sleep: "7h" })),
            ...days("2026-10-01", 31, () => ({ sleep: "8h" })),
        ];
        expect(usualGoal(notes, months, { agg: "avg", field: "sleep" })).toEqual({ value: 450, counted: 2, whole: true });
    });

    it("reads dates from date_field when one is given", () => {
        const notes = [
            note("Dune", { read: "2026-09-12" }),
            note("Solaris", { read: "2026-10-03" }),
            note("Piranesi", { read: "2026-10-20" }),
        ];
        expect(usualGoal(notes, months, { agg: "count", dateField: "read" })).toEqual({ value: 1.5, counted: 2, whole: true });
    });

    it("a current streak in a past month counts back from its last day, without grace", () => {
        // Ticked 25 to 31 October: 7 days up to the month's last day; September's run ended on the 10th.
        const notes = [
            ...days("2026-09-01", 10, () => ({ gym: true })),
            ...days("2026-10-25", 7, () => ({ gym: true })),
        ];
        const two = usualWindows({ kind: "month" }, TODAY, MONDAY, 2) ?? [];
        expect(usualGoal(notes, two, { agg: "current_streak", field: "gym" })).toEqual({ value: 3.5, counted: 2, whole: true });
    });
});

describe("roundedGoal (B-209)", () => {
    it("rounds the way the value is printed", () => {
        expect(roundedGoal(47.75, { precision: 0 })).toBe(48);
        expect(roundedGoal(47.75, { precision: 2, whole: true })).toBe(47.75);
        expect(roundedGoal(47.75, {})).toBe(47.8);
        expect(roundedGoal(48, {})).toBe(48);
        expect(roundedGoal(0.3, { precision: 0 })).toBe(0);
        expect(roundedGoal(452.4, { duration: true })).toBe(452);
        expect(roundedGoal(18.85, { duration: true, clock: true })).toBe(18.85);
    });

    it("a mean of whole values stays whole without precision, as the values do", () => {
        expect(roundedGoal(30.75, { whole: true })).toBe(31);
        expect(roundedGoal(27.5, { whole: true })).toBe(28);
        expect(roundedGoal(30.75, { whole: false })).toBe(30.8);
    });
});

describe("usualGoalProblem (B-209)", () => {
    const month: Period = { kind: "month" };

    it("no period at all is an error naming the fix", () => {
        expect(usualGoalProblem('"Running"', null, false)).toEqual({
            level: "error",
            message: '"Running": `goal: usual` needs `period`, the window whose past periods set the goal. Add `period: month`, `period: week` or `period: 30d` to the bar or to the block root.',
        });
    });

    it("a span warns that it does not repeat", () => {
        expect(usualGoalProblem('"Running"', fixed("span", "2026-09-01", "2026-09-30"), true)?.level).toBe("warning");
        expect(usualGoalProblem('"Running"', fixed("span", "2026-09-01", "2026-09-30"), true)?.message)
            .toContain("needs a period that repeats");
    });

    it("a period that was written but did not read is left to its own diagnostic", () => {
        expect(usualGoalProblem('"Running"', null, true)).toBeNull();
    });

    it("a repeating period is fine", () => {
        expect(usualGoalProblem('"Running"', month, true)).toBeNull();
        expect(usualGoalProblem('"Running"', fixed("month", "2026-10-01", "2026-10-31"), true)).toBeNull();
    });
});

describe("readProgress: goal: usual (B-209)", () => {
    it("reads `usual` in any case and around spaces", () => {
        expect(readProgress({ agg: "count", goal: "usual" }, "X").spec?.goal).toEqual({ usual: USUAL_PERIODS });
        expect(readProgress({ agg: "count", goal: " Usual " }, "X").spec?.goal).toEqual({ usual: 4 });
    });

    it("reads { usual: N } with a whole N of 1 or more", () => {
        const { spec, diagnostics } = readProgress({ agg: "count", goal: { usual: 2 } }, "X");
        expect(spec?.goal).toEqual({ usual: 2 });
        expect(diagnostics).toEqual([]);
        expect(readProgress({ agg: "count", goal: { usual: 1 } }, "X").spec?.goal).toEqual({ usual: 1 });
    });

    it("a count that is not a whole number from 1 to the cap warns and falls back to 4", () => {
        for (const bad of [0, -2, 2.5, "two", null, MAX_USUAL_PERIODS + 1, 1e9, 1e300]) {
            const { spec, diagnostics } = readProgress({ agg: "count", goal: { usual: bad } }, "Runs");
            expect(spec?.goal).toEqual({ usual: 4 });
            expect(diagnostics.map((d) => d.level)).toEqual(["warning"]);
        }
        expect(readProgress({ agg: "count", goal: { usual: 0 } }, "Runs").diagnostics[0]?.message)
            .toBe('"Runs": `goal: { usual: 0 }` expects a whole number of periods from 1 to 120. The last 4 are used.');
    });

    it("takes the cap itself: ten years of months", () => {
        expect(MAX_USUAL_PERIODS).toBe(120);
        const { spec, diagnostics } = readProgress({ agg: "count", goal: { usual: MAX_USUAL_PERIODS } }, "Runs");
        expect(spec?.goal).toEqual({ usual: MAX_USUAL_PERIODS });
        expect(diagnostics).toEqual([]);
    });

    it("a map with any other key is no goal", () => {
        const { spec, diagnostics } = readProgress({ agg: "count", goal: { usal: 2 } }, "Runs");
        expect(spec).toBeNull();
        expect(diagnostics.map((d) => d.level)).toEqual(["error"]);
        expect(readProgress({ agg: "count", goal: { usual: 2, extra: 1 } }, "Runs").spec).toBeNull();
    });

    it("an unreadable card stays unreadable with a usual goal", () => {
        const { spec, diagnostics } = readProgress({ agg: "sum", goal: "usual" }, "Runs");
        expect(spec).toBeNull();
        expect(diagnostics.length).toBeGreaterThan(0);
    });
});

describe("the usual goal's tooltip in Russian (B-209)", () => {
    it("agrees with the number of periods", () => {
        setLocale("ru");
        expect(tPlural("progress.usualTitle", 1)).toBe("среднее за 1 прошлый период");
        expect(tPlural("progress.usualTitle", 3)).toBe("среднее за 3 прошлых периода");
        expect(tPlural("progress.usualTitle", 5)).toBe("среднее за 5 прошлых периодов");
        expect(tPlural("progress.usualTitle", 21)).toBe("среднее за 21 прошлый период");
    });
});
