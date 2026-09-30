import { describe, it, expect } from "vitest";
import { aggregate, numberAt, isFalseMark, isBooleanMark, classifyField, series, isAgg, isStreakAgg } from "./aggregate";
import { filterByPeriod } from "./period";
import type { NoteRecord } from "./source";

const day = (name: string, fm: Record<string, unknown>): NoteRecord => ({
    path: `Diary/${name}.md`, name, folder: "Diary", tags: [], frontmatter: fm,
});

/** A note at an arbitrary path, for cross-folder "same day, two notes" cases. */
const noteAt = (path: string, name: string, fm: Record<string, unknown>): NoteRecord => {
    const slash = path.lastIndexOf("/");
    return { path, name, folder: slash === -1 ? "" : path.slice(0, slash), tags: [], frontmatter: fm };
};

const days = [
    day("2026-09-19", { sleep_score: 92 }),
    day("2026-09-20", { sleep_score: 69 }),
    day("2026-09-21", { sleep_score: 92 }),
    day("2026-09-23", { sleep_score: 80 }),
];

describe("numberAt", () => {
    it("takes a number", () => expect(numberAt(days[0]!, "sleep_score")).toBe(92));
    it("coerces a numeric string", () => expect(numberAt(day("x", { v: "42" }), "v")).toBe(42));
    it("a non-number is null", () => {
        expect(numberAt(day("x", { v: "nope" }), "v")).toBeNull();
        expect(numberAt(day("x", {}), "v")).toBeNull();
        expect(numberAt(day("x", { v: "" }), "v")).toBeNull();
    });

    // A ticked Obsidian checkbox property is a real YAML boolean. It is the
    // most requested habit-tracker shape, and before this it counted as
    // nothing at all.
    it("a YAML boolean true is 1", () => expect(numberAt(day("x", { v: true }), "v")).toBe(1));
    it("a YAML boolean false is 0", () => expect(numberAt(day("x", { v: false }), "v")).toBe(0));
    it("the strings \"true\"/\"false\" are not booleans and stay non-numeric", () => {
        expect(numberAt(day("x", { v: "true" }), "v")).toBeNull();
        expect(numberAt(day("x", { v: "false" }), "v")).toBeNull();
    });
    it("a numeric zero still reads as zero, same as always", () => {
        expect(numberAt(day("x", { v: 0 }), "v")).toBe(0);
    });
});

describe("isFalseMark", () => {
    it("true only for the YAML boolean false", () => {
        expect(isFalseMark(day("x", { v: false }), "v")).toBe(true);
    });
    it("false for true, for numeric 0, for a missing field and for the string \"false\"", () => {
        expect(isFalseMark(day("x", { v: true }), "v")).toBe(false);
        expect(isFalseMark(day("x", { v: 0 }), "v")).toBe(false);
        expect(isFalseMark(day("x", {}), "v")).toBe(false);
        expect(isFalseMark(day("x", { v: "false" }), "v")).toBe(false);
    });
});

describe("isBooleanMark", () => {
    it("true for both true and false", () => {
        expect(isBooleanMark(day("x", { v: true }), "v")).toBe(true);
        expect(isBooleanMark(day("x", { v: false }), "v")).toBe(true);
    });
    it("false for a number, a string and a missing field", () => {
        expect(isBooleanMark(day("x", { v: 1 }), "v")).toBe(false);
        expect(isBooleanMark(day("x", { v: "true" }), "v")).toBe(false);
        expect(isBooleanMark(day("x", {}), "v")).toBe(false);
    });
});

describe("classifyField", () => {
    it("ok once a single note has a usable value", () => {
        expect(classifyField(days, "sleep_score")).toBe("ok");
    });
    it("missing when no note carries the key at all", () => {
        expect(classifyField(days, "gym")).toBe("missing");
    });
    it("missing for an empty selection", () => {
        expect(classifyField([], "gym")).toBe("missing");
    });
    it("not-numeric when every note that has the key holds an unusable value", () => {
        const notes = [day("x", { running: "10 km" }), day("y", { running: "5 km" })];
        expect(classifyField(notes, "running")).toBe("not-numeric");
    });
    it("ok for a mix: one note text, another a real number", () => {
        const notes = [day("x", { running: "10 km" }), day("y", { running: 5 })];
        expect(classifyField(notes, "running")).toBe("ok");
    });
    it("ok for a field that is only ever the boolean false", () => {
        // A streak of zero over an all-false field is honest, not a missing
        // field: numberAt(false) is 0, not null.
        const notes = [day("x", { gym: false }), day("y", { gym: false })];
        expect(classifyField(notes, "gym")).toBe("ok");
    });
    it("does not fall for __proto__ or constructor as a field name", () => {
        // `field in note.frontmatter` would read true for these on any plain
        // object, prototype chain included, even though no note ever set
        // them; classifyField uses hasOwnProperty specifically to avoid that.
        const notes = [day("x", { sleep_score: 80 })];
        expect(classifyField(notes, "__proto__")).toBe("missing");
        expect(classifyField(notes, "constructor")).toBe("missing");
    });

    // F6: "not-numeric" covers every unusable shape the key can hold, not
    // only a plain string — the key is present (`hasOwnProperty` is true),
    // it just never turns into a number through `numberAt`.
    it("not-numeric for an explicit null", () => {
        expect(classifyField([day("x", { v: null })], "v")).toBe("not-numeric");
    });
    it("not-numeric for a list", () => {
        expect(classifyField([day("x", { v: ["a", "b"] })], "v")).toBe("not-numeric");
    });
    it("not-numeric for an empty string", () => {
        expect(classifyField([day("x", { v: "" })], "v")).toBe("not-numeric");
    });

    it("ok for a nested field once a single note has a usable value (B-100)", () => {
        expect(classifyField([day("x", { health: { sleep: 82 } })], "health.sleep")).toBe("ok");
    });
    it("missing for a nested field no note carries", () => {
        expect(classifyField([day("x", { health: { sleep: 82 } })], "health.steps")).toBe("missing");
        expect(classifyField([day("x", { health: 82 })], "health.sleep")).toBe("missing");
    });
    it("not-numeric when field asks for a whole map rather than a leaf value", () => {
        expect(classifyField([day("x", { health: { sleep: 82 } })], "health")).toBe("not-numeric");
    });
});

describe("aggregate", () => {
    it("count needs no field", () => expect(aggregate(days, { agg: "count" })).toBe(4));
    it("sum", () => expect(aggregate(days, { agg: "sum", field: "sleep_score" })).toBe(333));
    it("avg", () => expect(aggregate(days, { agg: "avg", field: "sleep_score" })).toBe(83.25));
    it("min/max", () => {
        expect(aggregate(days, { agg: "min", field: "sleep_score" })).toBe(69);
        expect(aggregate(days, { agg: "max", field: "sleep_score" })).toBe(92);
    });
    it("latest takes the freshest date", () => {
        expect(aggregate(days, { agg: "latest", field: "sleep_score" })).toBe(80);
    });

    it("latest ignores a note that is not named for a day", () => {
        // A Template.md in the diary folder sorts after every date, and its
        // placeholder number became the "latest" reading.
        const withTemplate = [...days, day("Template", { sleep_score: 999 })];
        expect(aggregate(withTemplate, { agg: "latest", field: "sleep_score" })).toBe(80);
    });

    it("streak counts a day once however many notes carry its name", () => {
        const twice = [...days, day("2026-09-20", { sleep_score: 70 })];
        expect(aggregate(twice, { agg: "streak", field: "sleep_score" })).toBe(3);
    });
    it("streak is the longest consecutive run", () => {
        expect(aggregate(days, { agg: "streak", field: "sleep_score" })).toBe(3);
    });
    it("sum without a field is null, not zero", () => {
        expect(aggregate(days, { agg: "sum" })).toBeNull();
    });
    it("an empty selection is null", () => {
        expect(aggregate([], { agg: "avg", field: "x" })).toBeNull();
    });

    describe("streak over a field no note has (B-111)", () => {
        it("a field nothing carries is a dash, not an honest zero", () => {
            // Before the fix: longestStreak([]) is 0, indistinguishable from
            // a real streak of zero over a typo'd field name.
            expect(aggregate(days, { agg: "streak", field: "gym" })).toBeNull();
        });
        it("a field that is only text is a dash too", () => {
            const notes = [day("2026-09-19", { running: "10 km" }), day("2026-09-20", { running: "5 km" })];
            expect(aggregate(notes, { agg: "streak", field: "running" })).toBeNull();
        });
        it("an empty selection with a field is a dash too, not a zero (F4)", () => {
            // `streak` with a `field:` is a field aggregate like `sum`/`avg`,
            // which already answer an empty selection with a dash. An empty
            // one used to be carved out as a special "stays 0" case; it no
            // longer is.
            expect(aggregate([], { agg: "streak", field: "gym" })).toBeNull();
        });
        it("streak with no field at all is unaffected: it counts every dated note", () => {
            expect(aggregate(days, { agg: "streak" })).toBe(3);
        });
        it("streak with no field over an empty selection is still an honest 0 (F4 pin)", () => {
            // Without a `field:`, `streak` counts every selected note's own
            // date — closer to `count` than to a field aggregate — and an
            // empty selection there is a plain, unwarned 0, unaffected by
            // the dash-over-empty-selection rule above.
            expect(aggregate([], { agg: "streak" })).toBe(0);
        });
        it("a field that exists with only false checkboxes stays an honest 0, no dash", () => {
            const notes = [
                day("2026-09-18", { gym: false }),
                day("2026-09-19", { gym: false }),
                day("2026-09-20", { gym: false }),
            ];
            expect(aggregate(notes, { agg: "streak", field: "gym" })).toBe(0);
        });
    });

    describe("boolean fields", () => {
        const gymDays = [
            day("2026-09-19", { gym: true }),
            day("2026-09-20", { gym: false }),
            day("2026-09-21", { gym: true }),
            day("2026-09-23", { gym: true }),
        ];

        it("sum counts the ticked days", () => {
            expect(aggregate(gymDays, { agg: "sum", field: "gym" })).toBe(3);
        });
        it("avg is the completion rate", () => {
            expect(aggregate(gymDays, { agg: "avg", field: "gym" })).toBe(0.75);
        });
        it("min/max over a mix of ticked and unticked days", () => {
            expect(aggregate(gymDays, { agg: "min", field: "gym" })).toBe(0);
            expect(aggregate(gymDays, { agg: "max", field: "gym" })).toBe(1);
        });
        it("latest takes the freshest boolean reading", () => {
            expect(aggregate(gymDays, { agg: "latest", field: "gym" })).toBe(1);
        });

        it("sum over a mix of numbers and booleans adds the 1/0 value in", () => {
            const mixed = [day("2026-09-19", { steps: 5000 }), day("2026-09-20", { steps: true })];
            expect(aggregate(mixed, { agg: "sum", field: "steps" })).toBe(5001);
        });

        it("streak breaks on a false day, exactly like a missing day", () => {
            // Ticked Fri/Sat/Mon with an unticked Sunday in between: the run is
            // Friday-Saturday (2), not Friday-through-Monday.
            const week = [
                day("2026-09-18", { gym: true }),
                day("2026-09-19", { gym: true }),
                day("2026-09-20", { gym: false }),
                day("2026-09-21", { gym: true }),
            ];
            expect(aggregate(week, { agg: "streak", field: "gym" })).toBe(2);
        });

        it("streak breaks the same way on a day the field never mentions", () => {
            const week = [
                day("2026-09-18", { gym: true }),
                day("2026-09-19", { gym: true }),
                day("2026-09-20", {}),
                day("2026-09-21", { gym: true }),
            ];
            expect(aggregate(week, { agg: "streak", field: "gym" })).toBe(2);
        });

        // Out of scope for this change, pinned so it cannot regress silently:
        // a literal numeric 0 is data, unlike a boolean `false`, and keeps
        // counting as a filled day.
        it("streak treats a numeric 0 as a filled day, unlike a boolean false", () => {
            const week = [
                day("2026-09-18", { steps: 100 }),
                day("2026-09-19", { steps: 0 }),
                day("2026-09-20", { steps: 50 }),
            ];
            expect(aggregate(week, { agg: "streak", field: "steps" })).toBe(3);
        });

        // B-097: pins the current record, not "days still going" — the README
        // FAQ and the schema doc both promise this, and there is no
        // current-streak aggregate to fall back to if it ever drifted.
        it("streak is the longest run on record, not the run still going", () => {
            const notes = [
                day("2026-03-01", { gym: true }),
                day("2026-03-02", { gym: true }),
                day("2026-03-03", { gym: true }),
                day("2026-03-04", { gym: true }),
                day("2026-03-05", { gym: true }),
                // a gap, then a single recent day: a "days still going" reading
                // would answer 1, not the 5-day record from March.
                day("2026-09-27", { gym: true }),
            ];
            expect(aggregate(notes, { agg: "streak", field: "gym" })).toBe(5);
        });

        // B-097: dates are plain YYYY-MM-DD keys, never elapsed wall-clock
        // time, so a clock change inside the run does not shorten or lengthen
        // it. 2026-03-29 is when much of Europe skips an hour forward.
        it("a run through a daylight-saving change counts by calendar day, unaffected by the clock skip", () => {
            const notes = [
                day("2026-03-27", { gym: true }),
                day("2026-03-28", { gym: true }),
                day("2026-03-29", { gym: true }),
                day("2026-03-30", { gym: true }),
            ];
            expect(aggregate(notes, { agg: "streak", field: "gym" })).toBe(4);
        });
    });

    describe("streak threshold: at_least / at_most (B-101)", () => {
        it("at_least: a day below the bound breaks the run, at or above it continues", () => {
            const notes = [
                day("2026-09-18", { steps: 4999 }), // below 5000, does not count
                day("2026-09-19", { steps: 5000 }), // exactly at the bound, counts
                day("2026-09-20", { steps: 6000 }), // above it, counts
            ];
            expect(aggregate(notes, { agg: "streak", field: "steps", atLeast: 5000 })).toBe(2);
        });

        it("at_most: cigarettes 0 through 5 count, 6 breaks the run", () => {
            const notes = [
                day("2026-09-18", { cigs: 0 }),
                day("2026-09-19", { cigs: 5 }),
                day("2026-09-20", { cigs: 6 }),
                day("2026-09-21", { cigs: 3 }),
            ];
            expect(aggregate(notes, { agg: "streak", field: "cigs", atMost: 5 })).toBe(2);
        });

        it("at_least and at_most together make a range", () => {
            const notes = [
                day("2026-09-18", { v: 3 }), // below the range
                day("2026-09-19", { v: 5 }), // in range
                day("2026-09-20", { v: 10 }), // in range
                day("2026-09-21", { v: 11 }), // above the range
            ];
            expect(aggregate(notes, { agg: "streak", field: "v", atLeast: 5, atMost: 10 })).toBe(2);
        });

        it("two notes on the same day are summed before the threshold is checked", () => {
            const notes = [
                noteAt("Morning/2026-09-18.md", "2026-09-18", { steps: 3000 }),
                noteAt("Evening/2026-09-18.md", "2026-09-18", { steps: 3000 }),
                day("2026-09-19", { steps: 6000 }),
            ];
            // Neither entry alone reaches 5000, but the day's sum (6000) does.
            expect(aggregate(notes, { agg: "streak", field: "steps", atLeast: 5000 })).toBe(2);
        });

        it("a false mark sums as 0 and can break an at_least threshold", () => {
            const notes = [
                day("2026-09-18", { gym: true }), // 1
                day("2026-09-19", { gym: false }), // 0, breaks at_least: 1
                day("2026-09-20", { gym: true }),
            ];
            expect(aggregate(notes, { agg: "streak", field: "gym", atLeast: 1 })).toBe(1);
        });

        it("a numeric zero satisfies an at_most threshold, unlike a missing day", () => {
            const notes = [day("2026-09-18", { cigs: 0 }), day("2026-09-19", { cigs: 0 })];
            expect(aggregate(notes, { agg: "streak", field: "cigs", atMost: 5 })).toBe(2);
        });

        it("a threshold nothing qualifies for is an honest 0, not a dash", () => {
            const notes = [day("2026-09-18", { steps: 100 }), day("2026-09-19", { steps: 200 })];
            expect(aggregate(notes, { agg: "streak", field: "steps", atLeast: 100000 })).toBe(0);
        });

        it("at_least above at_most leaves nothing that can qualify: an honest 0", () => {
            const notes = [day("2026-09-18", { steps: 5000 }), day("2026-09-19", { steps: 6000 })];
            expect(aggregate(notes, { agg: "streak", field: "steps", atLeast: 10, atMost: 5 })).toBe(0);
        });

        it("no threshold at all keeps the old field behaviour unchanged (B-097 pin)", () => {
            const notes = [
                day("2026-09-18", { steps: 100 }),
                day("2026-09-19", { steps: 0 }),
                day("2026-09-20", { steps: 50 }),
            ];
            expect(aggregate(notes, { agg: "streak", field: "steps" })).toBe(3);
        });

        it("resolves the day from date_field, not the note name, and still sums same-day notes", () => {
            // None of these names looks like a date at all; the day a note
            // belongs to comes entirely from the `finished` property.
            const notes = [
                noteAt("Log/a.md", "a", { finished: "2026-01-01", steps: 3000 }),
                noteAt("Log/b.md", "b", { finished: "2026-01-01", steps: 3000 }), // same day, sums to 6000
                noteAt("Log/c.md", "c", { finished: "2026-01-02", steps: 6000 }),
                noteAt("Log/d.md", "d", { finished: "2026-01-03", steps: 100 }), // breaks it
            ];
            expect(aggregate(notes, {
                agg: "streak", field: "steps", dateField: "finished", atLeast: 5000,
            })).toBe(2);
        });
    });

    describe("streak days: weekdays (B-101)", () => {
        it("a weekend gap between two logged weekdays does not break the run", () => {
            // 2026-09-18 is a Friday, 2026-09-21 the Monday after.
            const notes = [day("2026-09-18", { v: 1 }), day("2026-09-21", { v: 1 })];
            expect(aggregate(notes, { agg: "streak", field: "v", days: "weekdays" })).toBe(2);
        });

        it("a note on the weekend does not itself extend the run", () => {
            const notes = [
                day("2026-09-18", { v: 1 }), // Friday
                day("2026-09-19", { v: 1 }), // Saturday: has a value, still transparent
                day("2026-09-21", { v: 1 }), // Monday
            ];
            expect(aggregate(notes, { agg: "streak", field: "v", days: "weekdays" })).toBe(2);
        });

        it("a weekday gap still breaks the run", () => {
            const notes = [
                day("2026-09-18", { v: 1 }), // Friday
                day("2026-09-23", { v: 1 }), // Wednesday; Monday and Tuesday are missing, ordinary days
            ];
            expect(aggregate(notes, { agg: "streak", field: "v", days: "weekdays" })).toBe(1);
        });

        it("combines with a threshold: weekends are skipped, weekday values are checked", () => {
            const notes = [
                day("2026-09-18", { steps: 5000 }), // Friday, meets the threshold
                day("2026-09-19", { steps: 0 }), // Saturday, irrelevant either way
                day("2026-09-21", { steps: 6000 }), // Monday, meets the threshold
            ];
            expect(aggregate(notes, {
                agg: "streak", field: "steps", atLeast: 5000, days: "weekdays",
            })).toBe(2);
        });

        it("days: \"all\" behaves like no days at all: weekends are ordinary days", () => {
            const notes = [day("2026-09-18", { v: 1 }), day("2026-09-21", { v: 1 })];
            expect(aggregate(notes, { agg: "streak", field: "v", days: "all" })).toBe(1);
        });
    });

    describe("streak skip_field: special days (B-095)", () => {
        // 2026-09-14 is a Monday.
        it("a vacation week inside a run bridges it, and does not itself count", () => {
            const notes = [
                ...["14", "15", "16", "17", "18"].map((d) => day(`2026-09-${d}`, { v: 1 })), // Mon-Fri
                // A full week off, weekend included: none of these log `v`.
                ...["19", "20", "21", "22", "23", "24", "25"].map((d) => day(`2026-09-${d}`, { vacation: true })),
                day("2026-09-26", { v: 1 }), // back, the following Saturday
            ];
            expect(aggregate(notes, { agg: "streak", field: "v", skipField: "vacation" })).toBe(6);
        });

        it("a special day with a value of its own does not add to the run", () => {
            const notes = [
                day("2026-09-14", { v: 1 }),
                day("2026-09-15", { v: 1, vacation: true }), // has a value, but is special
                day("2026-09-16", { v: 1 }),
            ];
            // Without `skipField` this would be a run of 3 (see the plain
            // consecutive-day tests above); the special day is dropped from
            // the run itself, though the gap around it still bridges.
            expect(aggregate(notes, { agg: "streak", field: "v", skipField: "vacation" })).toBe(2);
        });

        it("a day with only `false`, blank, absent or zero does not mark it special", () => {
            const notes = [
                day("2026-09-14", { v: 1, vacation: false }),
                day("2026-09-15", { v: 1, vacation: "" }),
                day("2026-09-16", { v: 1 }),
                day("2026-09-17", { v: 1, vacation: 0 }),
            ];
            expect(aggregate(notes, { agg: "streak", field: "v", skipField: "vacation" })).toBe(4);
        });

        it("combines with days: weekdays by OR: transparent when either applies", () => {
            const notes = [
                ...["14", "15", "16", "17", "18"].map((d) => day(`2026-09-${d}`, { v: 1 })), // Mon-Fri
                day("2026-09-21", { vacation: true }), // the following Monday, a weekday off
                day("2026-09-22", { v: 1 }), // Tuesday, back
            ];
            // `days: weekdays` alone bridges the weekend (19th-20th) but not
            // the Monday off: that day is an ordinary weekday to it, so the
            // run breaks there, leaving the first week (5) as the longest.
            expect(aggregate(notes, { agg: "streak", field: "v", days: "weekdays" })).toBe(5);
            // With `skipField` added, the Monday off is transparent too, and
            // the run bridges all the way to Tuesday.
            expect(aggregate(notes, {
                agg: "streak", field: "v", days: "weekdays", skipField: "vacation",
            })).toBe(6);
        });

        it("combined with at_least: a special day failing the threshold does not break the run", () => {
            const notes = [
                day("2026-09-14", { steps: 5000 }),
                day("2026-09-15", { steps: 100, vacation: true }), // fails the threshold, but is special
                day("2026-09-16", { steps: 6000 }),
            ];
            // Without `skipField` the middle day fails the threshold and is
            // an ordinary gap, breaking the run.
            expect(aggregate(notes, { agg: "streak", field: "steps", atLeast: 5000 })).toBe(1);
            expect(aggregate(notes, {
                agg: "streak", field: "steps", atLeast: 5000, skipField: "vacation",
            })).toBe(2);
        });

        it("a skipField no note ever sets has no effect", () => {
            const notes = [day("2026-09-14", { v: 1 }), day("2026-09-15", { v: 1 })];
            expect(aggregate(notes, { agg: "streak", field: "v", skipField: "vacation" })).toBe(2);
        });

        it("a special day plus an ordinary empty day in the same gap still breaks the run", () => {
            const notes = [
                day("2026-09-14", { v: 1 }),
                day("2026-09-15", { vacation: true }), // special, bridges on its own
                // 2026-09-16 has no note at all: an ordinary gap day, not special.
                day("2026-09-17", { v: 1 }),
                day("2026-09-18", { v: 1 }),
            ];
            // Without the note on the 16th the gap would be bridged entirely
            // by the special day and the run would be 5; the ordinary day in
            // the middle of it is enough to break it regardless.
            expect(aggregate(notes, { agg: "streak", field: "v", skipField: "vacation" })).toBe(2);
        });
    });

    describe("dated note names beyond an exact YYYY-MM-DD (B-081)", () => {
        it("a suffixed name is a date, in a run of otherwise exact names", () => {
            const week = [
                day("2026-09-18", { v: 1 }),
                day("2026-09-19 Saturday", { v: 1 }),
                day("2026-09-20", { v: 1 }),
            ];
            expect(aggregate(week, { agg: "streak", field: "v" })).toBe(3);
        });

        it("a name with an invalid calendar date does not count, even shaped like a date", () => {
            const week = [
                day("2026-02-28", { v: 1 }),
                day("2026-02-30", { v: 1 }), // not a real date; 2026 is not a leap year
                day("2026-03-01", { v: 1 }),
            ];
            // 2026-02-30 is dropped entirely. What remains, Feb 28 and March
            // 1st, are themselves consecutive (February 2026 has 28 days),
            // so the run is 2 — never 3, which is what an unvalidated day
            // shape would let through.
            expect(aggregate(week, { agg: "streak", field: "v" })).toBe(2);
        });

        it("two notes for the same day, in different folders, count as one day for streak", () => {
            const week = [
                noteAt("Personal/2026-09-18.md", "2026-09-18", { v: 1 }),
                noteAt("Work/2026-09-18 standup.md", "2026-09-18 standup", { v: 1 }),
                day("2026-09-19", { v: 1 }),
            ];
            expect(aggregate(week, { agg: "streak", field: "v" })).toBe(2);
        });

        it("two notes for the same day in the same folder count as one day for streak", () => {
            const week = [
                day("2026-09-18", { v: 1 }),
                day("2026-09-18-standup", { v: 1 }),
                day("2026-09-19", { v: 1 }),
            ];
            expect(aggregate(week, { agg: "streak", field: "v" })).toBe(2);
        });

        it("a run crossing a month and a year boundary, mixing suffixed and exact names", () => {
            const week = [
                day("2025-12-30", { v: 1 }),
                day("2025-12-31 Wednesday", { v: 1 }),
                day("2026-01-01", { v: 1 }),
                day("2026-01-02 Friday", { v: 1 }),
            ];
            expect(aggregate(week, { agg: "streak", field: "v" })).toBe(4);
        });

        it("a false checkbox on one of two same-day notes does not break the run when the other is ticked", () => {
            const week = [
                day("2026-09-17", { gym: true }),
                noteAt("Personal/2026-09-18.md", "2026-09-18", { gym: false }),
                noteAt("Work/2026-09-18 standup.md", "2026-09-18 standup", { gym: true }),
                day("2026-09-19", { gym: true }),
            ];
            expect(aggregate(week, { agg: "streak", field: "gym" })).toBe(3);
        });
    });

    describe("streak with date_field", () => {
        // No `field` here: `streak` without one counts every selected note's
        // resolved date, the same as it always has — `field` and `dateField`
        // are different properties, and a streak over "days a book was
        // finished" has no number of its own to require.
        const books = [
            noteAt("Books/a.md", "a", { finished: "2026-01-01" }),
            noteAt("Books/b.md", "b", { finished: "2026-01-02" }),
            noteAt("Books/c.md", "c", { finished: "2026-01-04" }), // gap
        ];

        it("resolves the run from the property, ignoring the note name entirely", () => {
            expect(aggregate(books, { agg: "streak", dateField: "finished" })).toBe(2);
        });

        it("a note whose name looks dated but has no date_field value drops out", () => {
            const withDatedName = [...books, noteAt("Books/2026-01-03.md", "2026-01-03", {})];
            // "2026-01-03" is not named for the `finished` property, so it
            // has no date under `dateField` and cannot bridge the gap.
            expect(aggregate(withDatedName, { agg: "streak", dateField: "finished" })).toBe(2);
        });
    });

    describe("latest — ties and suffixed names", () => {
        it("a suffixed name newer than an exact one wins", () => {
            const notes = [
                day("2026-09-20", { v: 1 }),
                day("2026-09-21 Monday", { v: 2 }),
            ];
            expect(aggregate(notes, { agg: "latest", field: "v" })).toBe(2);
        });

        it("a tie on the same resolved date is broken by path, the same regardless of input order", () => {
            const a = noteAt("A-note.md", "2026-09-20 A", { v: 1 });
            const b = noteAt("B-note.md", "2026-09-20 B", { v: 2 });
            // Both resolve to 2026-09-20; "A-note.md" sorts first by path, so
            // its value wins whichever order the notes are handed in.
            expect(aggregate([a, b], { agg: "latest", field: "v" })).toBe(1);
            expect(aggregate([b, a], { agg: "latest", field: "v" })).toBe(1);
        });

        it("latest with date_field reads the property, not the name", () => {
            const notes = [
                noteAt("Books/a.md", "2026-09-20", { finished: "2026-01-01", rating: 3 }),
                noteAt("Books/b.md", "b", { finished: "2026-06-01", rating: 5 }),
            ];
            expect(aggregate(notes, { agg: "latest", field: "rating", dateField: "finished" })).toBe(5);
        });
    });

    describe("nested frontmatter paths (B-100)", () => {
        const healthDays = [
            day("2026-09-19", { health: { sleep: 92 } }),
            day("2026-09-20", { health: { sleep: 69 } }),
            day("2026-09-21", { health: { sleep: 92 } }),
            day("2026-09-23", { health: { sleep: 80 } }),
        ];

        it("sum over a nested field", () => {
            expect(aggregate(healthDays, { agg: "sum", field: "health.sleep" })).toBe(333);
        });
        it("avg over a nested field", () => {
            expect(aggregate(healthDays, { agg: "avg", field: "health.sleep" })).toBe(83.25);
        });
        it("streak over a nested field", () => {
            expect(aggregate(healthDays, { agg: "streak", field: "health.sleep" })).toBe(3);
        });
        it("latest over a nested field", () => {
            expect(aggregate(healthDays, { agg: "latest", field: "health.sleep" })).toBe(80);
        });

        it("a checkbox at a nested path counts 1/0", () => {
            const gymDays = [
                day("2026-09-19", { habits: { gym: true } }),
                day("2026-09-20", { habits: { gym: false } }),
                day("2026-09-21", { habits: { gym: true } }),
            ];
            expect(aggregate(gymDays, { agg: "sum", field: "habits.gym" })).toBe(2);
        });

        it("a nested false breaks a streak, the same as a top-level one", () => {
            const week = [
                day("2026-09-18", { habits: { gym: true } }),
                day("2026-09-19", { habits: { gym: true } }),
                day("2026-09-20", { habits: { gym: false } }),
                day("2026-09-21", { habits: { gym: true } }),
            ];
            expect(aggregate(week, { agg: "streak", field: "habits.gym" })).toBe(2);
        });

        it("a field missing at every note is a dash, path included in the report upstream", () => {
            expect(aggregate(healthDays, { agg: "sum", field: "health.steps" })).toBeNull();
        });
    });
});

describe("series — same-day notes sum into one bar (B-081)", () => {
    it("two notes for one day inside the window sum, not overwrite", () => {
        const today = new Date(2026, 8, 24);
        const notes = [
            day("2026-09-24", { steps: 3000 }),
            day("2026-09-24 evening", { steps: 1500 }),
        ];
        expect(series(notes, "steps", 1, today)).toEqual([4500]);
    });

    it("a suffixed name inside the trailing window is picked up", () => {
        const today = new Date(2026, 8, 24);
        const notes = [day("2026-09-24 Thursday", { v: 7 })];
        expect(series(notes, "v", 1, today)).toEqual([7]);
    });

    it("series with date_field groups by the property's date", () => {
        const today = new Date(2026, 8, 24);
        const notes = [
            noteAt("Books/a.md", "a", { finished: "2026-09-24", pages: 100 }),
            noteAt("Books/b.md", "b", { finished: "2026-09-24", pages: 50 }),
            noteAt("Books/c.md", "c", { finished: "2026-09-23", pages: 20 }),
        ];
        expect(series(notes, "pages", 2, today, "finished")).toEqual([20, 150]);
    });
});

const key = (back: number): string => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};
const recent = (back: number, fm: Record<string, unknown>): NoteRecord => day(key(back), fm);
const TODAY = new Date();

describe("series", () => {
    it("takes the days inside the window, oldest first", () => {
        const notes = [recent(2, { v: 1 }), recent(1, { v: 2 }), recent(0, { v: 3 })];
        expect(series(notes, "v", 3, TODAY)).toEqual([1, 2, 3]);
    });

    it("a window is days, not notes: older ones stay out", () => {
        // Taking the last N notes let a diary that stopped in 2024 draw a
        // "last 30 days" shape out of 2024.
        const notes = [day("2024-05-01", { v: 99 }), recent(1, { v: 2 }), recent(0, { v: 3 })];
        expect(series(notes, "v", 3, TODAY)).toEqual([2, 3]);
    });

    it("a note dated in the future is not in a trailing window", () => {
        const notes = [recent(0, { v: 1 }), recent(-5, { v: 99 })];
        expect(series(notes, "v", 7, TODAY)).toEqual([1]);
    });

    it("a day just outside the window is excluded", () => {
        expect(series([recent(3, { v: 9 })], "v", 3, TODAY)).toEqual([]);
        expect(series([recent(2, { v: 9 })], "v", 3, TODAY)).toEqual([9]);
    });

    it("a gap is left out rather than drawn as a zero", () => {
        const notes = [recent(2, { v: 1 }), recent(0, { v: 3 })];
        expect(series(notes, "v", 3, TODAY)).toEqual([1, 3]);
    });

    it("a day whose note lacks the field is left out too", () => {
        const notes = [recent(1, { other: 1 }), recent(0, { v: 3 })];
        expect(series(notes, "v", 2, TODAY)).toEqual([3]);
    });

    it("notes not named for a day are never in the window", () => {
        expect(series([day("Template", { v: 99 })], "v", 30, TODAY)).toEqual([]);
    });

    it("a boolean checkbox draws as a 1/0 bar, not a gap", () => {
        const notes = [recent(1, { gym: true }), recent(0, { gym: false })];
        expect(series(notes, "gym", 2, TODAY)).toEqual([1, 0]);
    });
});

describe("isAgg", () => {
    it("recognises its own", () => {
        expect(isAgg("avg")).toBe(true);
        expect(isAgg("current_streak")).toBe(true);
        expect(isAgg("median")).toBe(false);
    });
});

describe("isStreakAgg", () => {
    it("is true for the two run aggregates only", () => {
        expect(isStreakAgg("streak")).toBe(true);
        expect(isStreakAgg("current_streak")).toBe(true);
        expect(isStreakAgg("count")).toBe(false);
        expect(isStreakAgg("sum")).toBe(false);
    });
});

describe("aggregate: current_streak (B-118)", () => {
    // A Tuesday. 2026-09-21 is the Monday before it, 2026-09-19/20 the weekend.
    const TODAY = new Date(2026, 8, 22);
    const ticked = (...names: string[]): NoteRecord[] => names.map((n) => day(n, { v: 1 }));
    const current = (notes: readonly NoteRecord[], extra: Partial<Parameters<typeof aggregate>[1]> = {}) =>
        aggregate(notes, { agg: "current_streak", field: "v", today: TODAY, ...extra });

    it("counts the run that includes today", () => {
        expect(current(ticked("2026-09-20", "2026-09-21", "2026-09-22"))).toBe(3);
    });

    it("is the run going on now, not the longest one on record", () => {
        const notes = ticked("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-21", "2026-09-22");
        expect(current(notes)).toBe(2);
        expect(aggregate(notes, { agg: "streak", field: "v" })).toBe(4);
    });

    it("today not filled yet counts the run from yesterday", () => {
        expect(current(ticked("2026-09-19", "2026-09-20", "2026-09-21"))).toBe(3);
    });

    it("a gap on yesterday is 0 while today is empty, and 1 once today is filled", () => {
        expect(current(ticked("2026-09-19", "2026-09-20"))).toBe(0);
        expect(current(ticked("2026-09-19", "2026-09-20", "2026-09-22"))).toBe(1);
    });

    it("today below `at_least` is still grace: the run up to yesterday stands", () => {
        const notes = [
            day("2026-09-20", { steps: 6000 }),
            day("2026-09-21", { steps: 7000 }),
            day("2026-09-22", { steps: 100 }),
        ];
        expect(current(notes, { field: "steps", atLeast: 5000 })).toBe(2);
    });

    it("a threshold day is the sum of its notes, so two halves make a day", () => {
        const notes = [
            day("2026-09-20", { steps: 6000 }),
            noteAt("Diary/2026-09-21 morning.md", "2026-09-21 morning", { steps: 3000 }),
            noteAt("Diary/2026-09-21 evening.md", "2026-09-21 evening", { steps: 3000 }),
            day("2026-09-22", { steps: 5000 }),
        ];
        expect(current(notes, { field: "steps", atLeast: 5000 })).toBe(3);
        // One half alone is not enough, and yesterday breaks the run.
        expect(current(notes.filter((n) => n.name !== "2026-09-21 evening"), { field: "steps", atLeast: 5000 }))
            .toBe(1);
    });

    it("`at_most` above today's value counts today, below it leaves today to grace", () => {
        const notes = [day("2026-09-21", { cigs: 2 }), day("2026-09-22", { cigs: 9 })];
        expect(current(notes, { field: "cigs", atMost: 5 })).toBe(1);
        expect(current(notes, { field: "cigs", atMost: 10 })).toBe(2);
    });

    it("days: weekdays keeps a run ending Friday alive on an unfilled Monday", () => {
        const monday = new Date(2026, 8, 21);
        const notes = ticked("2026-09-16", "2026-09-17", "2026-09-18");
        expect(current(notes, { days: "weekdays", today: monday })).toBe(3);
        expect(current([...notes, ...ticked("2026-09-21")], { days: "weekdays", today: monday })).toBe(4);
        // Without it the weekend is two missing days.
        expect(current(notes, { today: monday })).toBe(0);
    });

    it("a skip_field day inside the run bridges it without counting", () => {
        const notes = [
            ...ticked("2026-09-17", "2026-09-19", "2026-09-20", "2026-09-21"),
            day("2026-09-18", { vacation: true }),
        ];
        expect(current(notes, { skipField: "vacation" })).toBe(4);
        expect(current(notes)).toBe(3);
    });

    it("a skip_field day on yesterday keeps the run alive while today is empty", () => {
        const notes = [...ticked("2026-09-19", "2026-09-20"), day("2026-09-21", { vacation: true })];
        expect(current(notes, { skipField: "vacation" })).toBe(2);
        expect(current(notes)).toBe(0);
    });

    it("several notes on one day are one day", () => {
        const notes = [
            noteAt("Personal/2026-09-21.md", "2026-09-21", { v: 1 }),
            noteAt("Work/2026-09-21.md", "2026-09-21", { v: 1 }),
            day("2026-09-22", { v: 1 }),
        ];
        expect(current(notes)).toBe(2);
    });

    it("a note dated after today is ignored", () => {
        expect(current(ticked("2026-09-21", "2026-09-22", "2026-09-23"))).toBe(2);
        expect(current(ticked("2026-09-23", "2026-09-24"))).toBe(0);
    });

    it("an unticked checkbox breaks the run like a missing day", () => {
        const notes = [day("2026-09-20", { v: true }), day("2026-09-21", { v: false })];
        expect(current(notes)).toBe(0);
        expect(current([...notes, day("2026-09-22", { v: true })])).toBe(1);
    });

    it("a field no note carries, or only as text, is a dash, not 0", () => {
        expect(current(ticked("2026-09-21", "2026-09-22"), { field: "nope" })).toBeNull();
        expect(current([day("2026-09-22", { v: "ten km" })])).toBeNull();
        expect(current([])).toBeNull();
    });

    it("with no field every selected note counts, and nothing selected is an honest 0", () => {
        const notes = [day("2026-09-21", {}), day("2026-09-22", {})];
        expect(aggregate(notes, { agg: "current_streak", today: TODAY })).toBe(2);
        expect(aggregate([], { agg: "current_streak", today: TODAY })).toBe(0);
    });

    it("date_field decides the day, as it does for streak", () => {
        const notes = [
            noteAt("Books/a.md", "a", { finished: "2026-09-21" }),
            noteAt("Books/b.md", "b", { finished: "2026-09-22T10:30" }),
        ];
        expect(aggregate(notes, { agg: "current_streak", dateField: "finished", today: TODAY })).toBe(2);
    });

    it("`period: month` caps the run at the first of the month", () => {
        const notes = ticked("2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02");
        const today = new Date(2026, 9, 2);
        expect(current(notes, { today })).toBe(5);
        const month = filterByPeriod(notes, { kind: "month" }, today, 1).notes;
        expect(current(month, { today })).toBe(2);
    });

    it("without a today to measure against it throws: a missing today is a caller bug", () => {
        expect(() => aggregate(ticked("2026-09-22"), { agg: "current_streak", field: "v" })).toThrow(/needs `today`/);
    });
});
