import { describe, it, expect } from "vitest";
import { readOrigin, valueOrigin, originLabel, ORIGIN_AGGS } from "./origin";
import { AGGS } from "./aggregate";
import type { NoteRecord } from "./source";
import type { DateFormats } from "./note-date";

const note = (path: string, fm: Record<string, unknown>): NoteRecord => {
    const slash = path.lastIndexOf("/");
    const file = path.slice(slash + 1).replace(/\.md$/, "");
    return { path, name: file, folder: slash === -1 ? "" : path.slice(0, slash), tags: [], frontmatter: fm };
};

const races = [
    note("Races/2025-05-04 Spring 10k.md", { time: 52 }),
    note("Races/2025-09-14 Autumn 10k.md", { time: 48 }),
    note("Races/2026-04-12 City 10k.md", { time: 50 }),
    note("Races/2026-06-01 Trail 10k.md", { time: 61 }),
];

const names = (n: NoteRecord | null): string | null => n?.name ?? null;

describe("readOrigin", () => {
    it("is nothing when the key is absent", () => {
        expect(readOrigin({}, "min", '"Best"')).toEqual({ diagnostics: [] });
    });

    it.each(ORIGIN_AGGS)("takes `note` and `date` with agg %s", (agg) => {
        expect(readOrigin({ origin: "note" }, agg, '"Best"')).toEqual({ origin: "note", diagnostics: [] });
        expect(readOrigin({ origin: "date" }, agg, '"Best"')).toEqual({ origin: "date", diagnostics: [] });
    });

    it.each(AGGS.filter((a) => !ORIGIN_AGGS.includes(a)))("warns with agg %s, naming it, and drops the key", (agg) => {
        expect(readOrigin({ origin: "note" }, agg, '"Total"')).toEqual({
            diagnostics: [{
                level: "warning",
                message: `"Total": \`origin\` works with \`agg: latest\`, \`min\` or \`max\` only, not \`${agg}\`. The card is drawn without it.`,
            }],
        });
    });

    it.each([["source", "source"], ["Note", "Note"], [true, "true"], [3, "3"]])(
        "an unknown value %j warns, naming it", (raw, shown) => {
            expect(readOrigin({ origin: raw }, "latest", '"Best"')).toEqual({
                diagnostics: [{ level: "warning", message: `"Best": \`origin\` expects \`note\` or \`date\`, got "${shown}". Ignored.` }],
            });
        },
    );
});

describe("valueOrigin", () => {
    it("min names the note holding the smallest value, max the largest", () => {
        expect(names(valueOrigin(races, { agg: "min", field: "time" }))).toBe("2025-09-14 Autumn 10k");
        expect(names(valueOrigin(races, { agg: "max", field: "time" }))).toBe("2026-06-01 Trail 10k");
    });

    it("latest names the newest dated note holding a value", () => {
        const notes = [...races, note("Races/2026-07-01 DNS.md", { time: null })];
        expect(names(valueOrigin(notes, { agg: "latest", field: "time" }))).toBe("2026-06-01 Trail 10k");
    });

    it("a tie on the extreme goes to the newest note, whatever the order handed in", () => {
        const tie = [
            note("Races/2026-03-01 Equal.md", { time: 48 }),
            ...races,
            note("Races/2024-01-01 Old equal.md", { time: 48 }),
        ];
        expect(names(valueOrigin(tie, { agg: "min", field: "time" }))).toBe("2026-03-01 Equal");
        expect(names(valueOrigin([...tie].reverse(), { agg: "min", field: "time" }))).toBe("2026-03-01 Equal");
    });

    it("in a tie a dated note beats an undated one, and two undated ones go by path", () => {
        const tie = [note("Races/zeta.md", { time: 40 }), note("Races/2025-01-01 Run.md", { time: 40 })];
        expect(names(valueOrigin(tie, { agg: "min", field: "time" }))).toBe("2025-01-01 Run");
        expect(names(valueOrigin([...tie].reverse(), { agg: "min", field: "time" }))).toBe("2025-01-01 Run");
        const undated = [note("Races/beta.md", { time: 40 }), note("Races/alpha.md", { time: 40 })];
        expect(names(valueOrigin(undated, { agg: "max", field: "time" }))).toBe("alpha");
    });

    it("an undated note still holds a min record; latest never picks it", () => {
        const notes = [note("Races/Undated best.md", { time: 30 }), ...races];
        expect(names(valueOrigin(notes, { agg: "min", field: "time" }))).toBe("Undated best");
        expect(names(valueOrigin(notes, { agg: "latest", field: "time" }))).toBe("2026-06-01 Trail 10k");
    });

    it("a field list compares each note's own total (B-193)", () => {
        const notes = [
            note("Tri/2026-05-01 A.md", { swim: 30, bike: 70 }),
            note("Tri/2026-06-01 B.md", { swim: 50, bike: 40 }),
            note("Tri/2026-07-01 C.md", { bike: 95 }),
        ];
        expect(names(valueOrigin(notes, { agg: "min", field: ["swim", "bike"] }))).toBe("2026-06-01 B");
        expect(names(valueOrigin(notes, { agg: "max", field: ["swim", "bike"] }))).toBe("2026-05-01 A");
    });

    it("is null when no note holds a value, and for an aggregate over several notes", () => {
        expect(valueOrigin([], { agg: "min", field: "time" })).toBeNull();
        expect(valueOrigin([note("Races/x.md", { other: 1 })], { agg: "max", field: "time" })).toBeNull();
        expect(valueOrigin(races, { agg: "sum", field: "time" })).toBeNull();
    });

    it("dates come from `date_field` when one is named", () => {
        const notes = [
            note("Labs/ferritin a.md", { ferritin: 40, taken: "2026-02-01" }),
            note("Labs/ferritin b.md", { ferritin: 40, taken: "2026-08-01" }),
        ];
        expect(names(valueOrigin(notes, { agg: "max", field: "ferritin", dateField: "taken" }))).toBe("ferritin b");
        expect(names(valueOrigin(notes, { agg: "latest", field: "ferritin", dateField: "taken" }))).toBe("ferritin b");
    });
});

describe("originLabel", () => {
    it("`note` gives the note's path and name", () => {
        expect(originLabel(races, { agg: "min", field: "time" }, "note")).toEqual({
            kind: "note", path: "Races/2025-09-14 Autumn 10k.md", name: "2025-09-14 Autumn 10k",
        });
    });

    it("`date` gives the note's day as a key", () => {
        expect(originLabel(races, { agg: "max", field: "time" }, "date")).toEqual({ kind: "date", day: "2026-06-01" });
    });

    it("`date` reads the day in a `date_format` through the injected parser", () => {
        const parse = (text: string, format: string): string | null =>
            format === "DD.MM.YYYY" && /^\d\d\.\d\d\.\d{4}$/.test(text)
                ? `${text.slice(6)}-${text.slice(3, 5)}-${text.slice(0, 2)}`
                : null;
        const formats: DateFormats = { names: ["DD.MM.YYYY"], values: ["DD.MM.YYYY"], parse };
        const notes = [note("Labs/05.10.2026.md", { hb: 140 }), note("Labs/01.03.2026.md", { hb: 130 })];
        expect(originLabel(notes, { agg: "latest", field: "hb", formats }, "date")).toEqual({ kind: "date", day: "2026-10-05" });
    });

    it("`date` on a note with no readable date says which note", () => {
        const notes = [note("Races/Undated best.md", { time: 30 }), ...races];
        expect(originLabel(notes, { agg: "min", field: "time" }, "date")).toEqual({ kind: "undated", name: "Undated best" });
    });

    it("is null when there is no value to describe", () => {
        expect(originLabel([], { agg: "latest", field: "time" }, "note")).toBeNull();
    });
});
