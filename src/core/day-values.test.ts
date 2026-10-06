import { describe, it, expect } from "vitest";
import {
    dayValues, readFields, readPerDay, unusedFields, isPerDay, PER_DAY, heatmapDurationDiagnostics,
    checkboxCount, paintedNotesPerDay,
} from "./day-values";
import type { NoteRecord } from "./source";

const note = (path: string, frontmatter: Record<string, unknown>): NoteRecord => {
    const slash = path.lastIndexOf("/");
    const name = slash === -1 ? path.replace(/\.md$/, "") : path.slice(slash + 1).replace(/\.md$/, "");
    return { path, name, folder: slash === -1 ? "" : path.slice(0, slash), tags: [], frontmatter };
};

describe("isPerDay", () => {
    it("accepts the three known values", () => {
        for (const v of PER_DAY) expect(isPerDay(v)).toBe(true);
    });
    it("rejects anything else", () => {
        expect(isPerDay("median")).toBe(false);
        expect(isPerDay(5)).toBe(false);
        expect(isPerDay(undefined)).toBe(false);
    });
});

describe("dayValues — single field, default sum (matches 1.3.0 exactly)", () => {
    it("one note, one field: the value is that note's number", () => {
        const notes = [note("Diary/2026-01-01.md", { sleep_score: 80 })];
        const marks = dayValues(notes, ["sleep_score"], "sum");
        expect(marks.get("2026-01-01")).toEqual({
            value: 80, path: "Diary/2026-01-01.md", isBool: false, painted: true,
            notes: [{ path: "Diary/2026-01-01.md", name: "2026-01-01" }],
        });
    });

    it("two notes on the same day sum", () => {
        const notes = [
            note("Diary/2026-01-10.md", { steps: 5000 }),
            note("Diary/2026-01-10 evening.md", { steps: 3000 }),
        ];
        const marks = dayValues(notes, ["steps"], "sum");
        expect(marks.get("2026-01-10")?.value).toBe(8000);
    });

    it("a day where the note has no field at all gets no entry", () => {
        const notes = [note("Diary/2026-01-01.md", { other: 1 })];
        const marks = dayValues(notes, ["steps"], "sum");
        expect(marks.size).toBe(0);
    });

    it("a note with no resolvable date is skipped, not folded into an unrelated day", () => {
        const notes = [
            note("Diary/Template.md", { steps: 999 }),
            note("Diary/2026-01-01.md", { steps: 100 }),
        ];
        const marks = dayValues(notes, ["steps"], "sum");
        expect(marks.size).toBe(1);
        expect(marks.get("2026-01-01")?.value).toBe(100);
    });
});

describe("dayValues — several fields in one note", () => {
    it("sum: mood_am + mood_pm collapse into one value", () => {
        const notes = [note("Diary/2026-01-01.md", { mood_am: 5, mood_pm: 7 })];
        const marks = dayValues(notes, ["mood_am", "mood_pm"], "sum");
        expect(marks.get("2026-01-01")?.value).toBe(12);
    });

    it("avg: 5 and 7 collapse to 6", () => {
        const notes = [note("Diary/2026-01-01.md", { mood_am: 5, mood_pm: 7 })];
        const marks = dayValues(notes, ["mood_am", "mood_pm"], "avg");
        expect(marks.get("2026-01-01")?.value).toBe(6);
    });

    it("max: keeps the higher of the two", () => {
        const notes = [note("Diary/2026-01-01.md", { mood_am: 5, mood_pm: 7 })];
        const marks = dayValues(notes, ["mood_am", "mood_pm"], "max");
        expect(marks.get("2026-01-01")?.value).toBe(7);
    });

    it("a field absent from a note contributes nothing, not a zero", () => {
        const notes = [note("Diary/2026-01-01.md", { mood_am: 5 })]; // no mood_pm at all
        const avg = dayValues(notes, ["mood_am", "mood_pm"], "avg");
        // Averaging over one contributor, not two: (5) / 1 = 5, not (5 + 0) / 2 = 2.5.
        expect(avg.get("2026-01-01")?.value).toBe(5);
    });
});

describe("dayValues — several notes AND several fields at once", () => {
    it("every (note x field) pair that resolves feeds the same bag", () => {
        const notes = [
            note("Diary/2026-01-01.md", { mood_am: 5, mood_pm: 7 }),
            note("Diary/2026-01-01 evening.md", { mood_am: 9 }), // a second note the same day
        ];
        const avg = dayValues(notes, ["mood_am", "mood_pm"], "avg");
        // (5 + 7 + 9) / 3 = 7.
        expect(avg.get("2026-01-01")?.value).toBe(7);
        const sum = dayValues(notes, ["mood_am", "mood_pm"], "sum");
        expect(sum.get("2026-01-01")?.value).toBe(21);
        const max = dayValues(notes, ["mood_am", "mood_pm"], "max");
        expect(max.get("2026-01-01")?.value).toBe(9);
    });
});

describe("dayValues — painted and isBool", () => {
    it("a day where every contribution is false is painted: false", () => {
        const notes = [note("Diary/2026-01-01.md", { gym_am: false, gym_pm: false })];
        const marks = dayValues(notes, ["gym_am", "gym_pm"], "sum");
        expect(marks.get("2026-01-01")).toEqual({
            value: 0, path: "", isBool: true, painted: false,
            notes: [{ path: "Diary/2026-01-01.md", name: "2026-01-01" }],
        });
    });

    it("one false and one number on the same day is painted, value is their sum", () => {
        const notes = [
            note("Diary/2026-01-01.md", { gym: false }),
            note("Diary/2026-01-01 evening.md", { gym: 1 }),
        ];
        const marks = dayValues(notes, ["gym"], "sum");
        expect(marks.get("2026-01-01")).toEqual({
            value: 1, path: "Diary/2026-01-01 evening.md", isBool: false, painted: true,
            notes: [
                { path: "Diary/2026-01-01.md", name: "2026-01-01" },
                { path: "Diary/2026-01-01 evening.md", name: "2026-01-01 evening" },
            ],
        });
    });

    it("isBool is true only when every contributing pair, across every field, is a genuine boolean", () => {
        const allBool = dayValues(
            [note("Diary/2026-01-01.md", { gym_am: true, gym_pm: false })], ["gym_am", "gym_pm"], "sum",
        );
        expect(allBool.get("2026-01-01")?.isBool).toBe(true);

        const mixed = dayValues(
            [note("Diary/2026-01-01.md", { gym_am: true, steps: 500 })], ["gym_am", "steps"], "sum",
        );
        expect(mixed.get("2026-01-01")?.isBool).toBe(false);
    });
});

describe("dayValues — notes (B-092, for a cell's tooltip)", () => {
    it("one contributing note", () => {
        const notes = [note("Diary/2026-01-01.md", { steps: 100 })];
        expect(dayValues(notes, ["steps"], "sum").get("2026-01-01")?.notes).toEqual([
            { path: "Diary/2026-01-01.md", name: "2026-01-01" },
        ]);
    });

    it("several notes on the same day are all counted", () => {
        const notes = [
            note("Diary/2026-01-01.md", { steps: 100 }),
            note("Diary/2026-01-01 evening.md", { steps: 200 }),
            note("Diary/2026-01-01 third.md", { steps: 50 }),
        ];
        expect(dayValues(notes, ["steps"], "sum").get("2026-01-01")?.notes).toHaveLength(3);
    });

    it("the same note contributing through two fields is counted once, not twice", () => {
        const notes = [note("Diary/2026-01-01.md", { mood_am: 5, mood_pm: 7 })];
        const marks = dayValues(notes, ["mood_am", "mood_pm"], "sum");
        expect(marks.get("2026-01-01")?.notes).toEqual([{ path: "Diary/2026-01-01.md", name: "2026-01-01" }]);
    });

    it("a false-only contributor still counts as a note that holds this day's data", () => {
        const notes = [note("Diary/2026-01-01.md", { gym: false })];
        const marks = dayValues(notes, ["gym"], "sum");
        expect(marks.get("2026-01-01")?.painted).toBe(false);
        expect(marks.get("2026-01-01")?.notes).toEqual([{ path: "Diary/2026-01-01.md", name: "2026-01-01" }]);
    });

    it("one false and one true note both count, even though only one paints", () => {
        const notes = [
            note("Diary/2026-01-01.md", { gym: false }),
            note("Diary/2026-01-01 evening.md", { gym: 1 }),
        ];
        expect(dayValues(notes, ["gym"], "sum").get("2026-01-01")?.notes).toHaveLength(2);
    });
});

describe("paintedNotesPerDay (B-133, a calendar day's dots)", () => {
    it("counts each note that painted a day once, however many of its fields did", () => {
        const counts = paintedNotesPerDay([
            note("Diary/2026-10-01.md", { gym: true, run: true }),
            note("Work/2026-10-01.md", { gym: true }),
            note("Diary/2026-10-02.md", { gym: 30 }),
        ], ["gym", "run"]);
        expect([...counts.entries()]).toEqual([["2026-10-01", 2], ["2026-10-02", 1]]);
    });

    it("a note whose only value is false paints nothing and is not counted; a 0 paints, as on the grid", () => {
        const counts = paintedNotesPerDay([
            note("A/2026-10-01.md", { gym: false }),
            note("B/2026-10-01.md", { gym: 0 }),
            note("A/2026-10-02.md", { gym: false }),
        ], ["gym"]);
        expect([...counts.entries()]).toEqual([["2026-10-01", 1]]);
    });

    it("skips a note without a date, text and an absent field; reads the date from date_field", () => {
        const counts = paintedNotesPerDay([
            note("Diary/no-date.md", { gym: true }),
            note("Diary/2026-10-01.md", { gym: "went" }),
            note("Diary/2026-10-02.md", {}),
            note("Log/entry.md", { gym: true, when: "2026-10-03" }),
        ], ["gym"], "when");
        expect([...counts.entries()]).toEqual([["2026-10-03", 1]]);
    });
});

describe("dayValues — link target determinism", () => {
    it("the first path by sort among painted contributors wins, regardless of note order", () => {
        const inOrder = [
            note("A-folder/2026-01-11.md", { steps: 100 }),
            note("B-folder/2026-01-11.md", { steps: 200 }),
        ];
        const reversed = [inOrder[1]!, inOrder[0]!];
        expect(dayValues(inOrder, ["steps"], "sum").get("2026-01-11")?.path).toBe("A-folder/2026-01-11.md");
        expect(dayValues(reversed, ["steps"], "sum").get("2026-01-11")?.path).toBe("A-folder/2026-01-11.md");
    });

    it("a field with no painted contributor at all leaves the path empty", () => {
        const notes = [note("Diary/2026-01-01.md", { gym: false })];
        expect(dayValues(notes, ["gym"], "sum").get("2026-01-01")?.path).toBe("");
    });
});

describe("readFields", () => {
    it("a plain string becomes a one-element list", () => {
        expect(readFields({ field: "sleep_score" })).toEqual({ fields: ["sleep_score"], diagnostics: [] });
    });

    it("a list of strings is accepted as is, dotted paths included", () => {
        expect(readFields({ field: ["mood_am", "health.sleep"] }))
            .toEqual({ fields: ["mood_am", "health.sleep"], diagnostics: [] });
    });

    it("field absent is silent, not an error of its own", () => {
        expect(readFields({})).toEqual({ fields: null, diagnostics: [] });
    });

    it("an empty list is an error", () => {
        const { fields, diagnostics } = readFields({ field: [] });
        expect(fields).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("error");
        expect(diagnostics[0]?.message).toContain("empty list");
    });

    it("a non-string entry is an error naming it", () => {
        const { fields, diagnostics } = readFields({ field: ["mood_am", 5] });
        expect(fields).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("error");
        expect(diagnostics[0]?.message).toContain("5");
    });

    it("a blank string entry is an error too", () => {
        const { fields } = readFields({ field: ["mood_am", "   "] });
        expect(fields).toBeNull();
    });

    it.each([
        ["a number", 5],
        ["a boolean", true],
        ["a map", { a: 1 }],
    ])("field of the wrong shape (%s) is its own error naming the value, not \"no field given\"", (_label, raw) => {
        const { fields, diagnostics } = readFields({ field: raw });
        expect(fields).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("error");
        expect(diagnostics[0]?.message).not.toContain("No `field` given");
    });

    it("a duplicate entry is dropped silently, keeping the first occurrence's position", () => {
        const { fields, diagnostics } = readFields({ field: ["steps", "mood_am", "steps"] });
        expect(fields).toEqual(["steps", "mood_am"]);
        expect(diagnostics).toEqual([]);
    });
});

describe("readPerDay", () => {
    it("defaults to sum when absent", () => {
        expect(readPerDay({})).toEqual({ perDay: "sum", diagnostics: [] });
    });

    it("accepts avg and max with no diagnostic", () => {
        expect(readPerDay({ per_day: "avg" })).toEqual({ perDay: "avg", diagnostics: [] });
        expect(readPerDay({ per_day: "max" })).toEqual({ perDay: "max", diagnostics: [] });
    });

    it("an invalid value warns naming the valid options, and falls back to sum", () => {
        const { perDay, diagnostics } = readPerDay({ per_day: "median" });
        expect(perDay).toBe("sum");
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("median");
        expect(diagnostics[0]?.message).toContain("sum");
        expect(diagnostics[0]?.message).toContain("avg");
        expect(diagnostics[0]?.message).toContain("max");
    });
});

describe("unusedFields", () => {
    it("names a field that never resolved anywhere in the selection", () => {
        const notes = [note("Diary/2026-01-01.md", { mood_am: 5 })];
        expect(unusedFields(notes, ["mood_am", "mood_pn"])).toEqual(["mood_pn"]);
    });

    it("an empty result once every field resolves somewhere", () => {
        const notes = [
            note("Diary/2026-01-01.md", { mood_am: 5 }),
            note("Diary/2026-01-02.md", { mood_pm: 7 }),
        ];
        expect(unusedFields(notes, ["mood_am", "mood_pm"])).toEqual([]);
    });

    it("a field holding only text counts as unused too", () => {
        const notes = [note("Diary/2026-01-01.md", { mood_am: 5, note: "hi" })];
        expect(unusedFields(notes, ["mood_am", "note"])).toEqual(["note"]);
    });
});

// B-121
describe("dayValues — durations", () => {
    it("a day's duration strings collapse in minutes like any number", () => {
        const notes = [
            note("Diary/2026-01-01.md", { nap: "20m" }),
            note("Diary/2026-01-01 evening.md", { nap: "0:25" }),
        ];
        expect(dayValues(notes, ["nap"], "sum").get("2026-01-01")?.value).toBe(45);
    });
});

describe("heatmapDurationDiagnostics", () => {
    it("a mixed field names one note of each kind", () => {
        expect(heatmapDurationDiagnostics(
            { kind: "mixed", durationNote: "Diary/a.md", plainNote: "Diary/b.md" }, "sleep", undefined,
        ).map((d) => d.message)).toEqual([
            '"sleep" mixes durations ("Diary/a.md") and plain numbers ("Diary/b.md"). '
            + "All of them are counted as minutes and shown as plain numbers.",
        ]);
    });

    it("a duration `bands` threshold on plain numbers warns, naming the threshold as written", () => {
        expect(heatmapDurationDiagnostics({ kind: "plain" }, "steps", [{ min: "7h" }, 1000]).map((d) => d.message))
            .toEqual(['`bands` threshold "7h" is a duration, but "steps" holds plain numbers. It is applied as minutes.']);
    });

    it("nothing to say: durations with duration bands, plain numbers with plain bands", () => {
        expect(heatmapDurationDiagnostics({ kind: "duration" }, "sleep", ["8h", 420])).toEqual([]);
        expect(heatmapDurationDiagnostics({ kind: "plain" }, "steps", [10000, 5000])).toEqual([]);
        expect(heatmapDurationDiagnostics({ kind: "plain" }, "steps", undefined)).toEqual([]);
    });
});

// B-138: several checkbox fields count the ticked boxes per day.
describe("checkboxCount", () => {
    const habits = [
        note("Diary/2026-01-01.md", { gym: true, read: false }),
        note("Diary/2026-01-02.md", { gym: true, read: true }),
        // `read` absent: the same as an unticked box
        note("Diary/2026-01-03.md", { gym: true }),
    ];
    const fields = ["gym", "read"];
    const run = (notes: NoteRecord[], perDay: "sum" | "avg" | "max", list: string[] = fields) =>
        checkboxCount(notes, list, perDay, dayValues(notes, list, perDay));

    it("two checkbox fields: the day value is the ticked count, scaled against both ticked", () => {
        const { count, diagnostics } = run(habits, "sum");
        expect([...count!.marks.values()].map((m) => m.value)).toEqual([1, 2, 1]);
        expect(count?.bands.map((b) => b.label)).toEqual(["2", "1"]);
        expect(diagnostics).toEqual([]);
    });

    it("the top is the number of fields even when no day reached it", () => {
        const notes = [note("Diary/2026-01-01.md", { gym: true, read: false, yoga: false })];
        expect(run(notes, "sum", ["gym", "read", "yoga"]).count?.bands[0]?.min).toBe(3);
    });

    it("per_day avg: the share of the listed boxes, an absent field counted as unticked", () => {
        const { count } = run(habits, "avg");
        expect([...count!.marks.values()].map((m) => m.value)).toEqual([0.5, 1, 0.5]);
        expect(count?.bands.map((b) => b.label)).toEqual(["1", "0.5"]);
    });

    it("per_day avg over two notes on one day: the share of every listed box of both", () => {
        const notes = [
            note("Diary/2026-01-01.md", { gym: true }),
            note("Diary/2026-01-01 evening.md", { read: true, gym: false }),
        ];
        expect(run(notes, "avg").count?.marks.get("2026-01-01")?.value).toBe(0.5);
    });

    it("a single checkbox field stays flat", () => {
        expect(run(habits, "sum", ["gym"])).toEqual({ count: null, diagnostics: [] });
    });

    it("per_day max stays flat: any ticked box already makes the day 1", () => {
        expect(run(habits, "max")).toEqual({ count: null, diagnostics: [] });
    });

    it("a number beside checkboxes keeps the list on its own scale, and says where", () => {
        const notes = [
            ...habits,
            note("Diary/2026-01-05.md", { read: 30 }),
            note("Diary/2026-01-04.md", { read: 20 }),
        ];
        expect(run(notes, "sum")).toEqual({
            count: null,
            diagnostics: [{
                level: "warning",
                message: '"read" holds a number in "Diary/2026-01-04.md", so the checkboxes in this list are not counted per day: a day with only ticks paints at full colour.',
            }],
        });
    });

    it("a list of numbers only has no checkboxes to count, and nothing to warn about", () => {
        const notes = [note("Diary/2026-01-01.md", { steps: 100, km: 2 })];
        expect(run(notes, "sum", ["steps", "km"])).toEqual({ count: null, diagnostics: [] });
    });

    it("an undated note neither counts nor warns", () => {
        const notes = [...habits, note("Diary/not-a-date.md", { read: 30 })];
        const { count, diagnostics } = run(notes, "sum");
        expect(count?.bands.map((b) => b.label)).toEqual(["2", "1"]);
        expect(diagnostics).toEqual([]);
    });

    it("no note at all has no scale", () => {
        expect(run([], "sum")).toEqual({ count: null, diagnostics: [] });
    });
});
