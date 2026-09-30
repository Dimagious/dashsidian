import { describe, it, expect } from "vitest";
import {
    readStat, formatValue, valueLengthClass, showsDuration, formatReading, durationDiagnostics,
} from "./stat";

describe("readStat — happy path", () => {
    it("with no agg it counts notes", () => {
        const { spec, diagnostics } = readStat({ label: "Notes", source: "01-Areas" }, "Notes");
        expect(spec).toEqual({ agg: "count" });
        expect(diagnostics).toEqual([]);
    });

    it("a field aggregate carries the field through", () => {
        const { spec, diagnostics } = readStat({ agg: "avg", field: "sleep_score" }, "Sleep");
        expect(spec).toEqual({ agg: "avg", field: "sleep_score" });
        expect(diagnostics).toEqual([]);
    });

    it("takes unit and precision", () => {
        const { spec } = readStat({ agg: "sum", field: "distance_km", unit: "km", precision: 2 }, "Running");
        expect(spec).toMatchObject({ unit: "km", precision: 2 });
    });

    it("streak needs no field", () => {
        const { spec, diagnostics } = readStat({ agg: "streak" }, "In a row");
        expect(spec).toEqual({ agg: "streak" });
        expect(diagnostics).toEqual([]);
    });

    it("streak with a field keeps it — the run counts days holding that number", () => {
        const { spec } = readStat({ agg: "streak", field: "sleep_score" }, "In a row");
        expect(spec).toEqual({ agg: "streak", field: "sleep_score" });
    });

    it("streak takes at_least, at_most and days alongside field", () => {
        const { spec, diagnostics } = readStat(
            { agg: "streak", field: "steps", at_least: 5000, at_most: 20000, days: "weekdays" }, "Active days");
        expect(spec).toEqual({
            agg: "streak", field: "steps", atLeast: 5000, atMost: 20000, days: "weekdays",
        });
        expect(diagnostics).toEqual([]);
    });

    it("days: all is accepted explicitly, same as leaving it unset", () => {
        const { spec } = readStat({ agg: "streak", field: "gym", days: "all" }, "Gym");
        expect(spec).toEqual({ agg: "streak", field: "gym", days: "all" });
    });

    it("streak takes skip_field alongside field", () => {
        const { spec, diagnostics } = readStat({ agg: "streak", field: "gym", skip_field: "vacation" }, "Gym");
        expect(spec).toEqual({ agg: "streak", field: "gym", skipField: "vacation" });
        expect(diagnostics).toEqual([]);
    });

    it("streak takes skip_field with no field at all", () => {
        const { spec } = readStat({ agg: "streak", skip_field: "vacation" }, "In a row");
        expect(spec).toEqual({ agg: "streak", skipField: "vacation" });
    });
});

describe("readStat — current_streak (B-118)", () => {
    it("needs no field, like count and streak", () => {
        const { spec, diagnostics } = readStat({ agg: "current_streak" }, "Days in a row");
        expect(spec).toEqual({ agg: "current_streak" });
        expect(diagnostics).toEqual([]);
    });

    it("takes field, at_least, at_most, days and skip_field without a warning", () => {
        const { spec, diagnostics } = readStat({
            agg: "current_streak", field: "steps", at_least: 5000, at_most: 20000,
            days: "weekdays", skip_field: "vacation",
        }, "Current streak");
        expect(spec).toEqual({
            agg: "current_streak", field: "steps", atLeast: 5000, atMost: 20000,
            days: "weekdays", skipField: "vacation",
        });
        expect(diagnostics).toEqual([]);
    });

    it("validates its streak keys the same way streak does", () => {
        const { spec, diagnostics } = readStat(
            { agg: "current_streak", field: "steps", at_least: "many", days: "weekends" }, "Current streak");
        expect(spec).toEqual({ agg: "current_streak", field: "steps" });
        expect(diagnostics.map((d) => d.message)).toEqual([
            '"Current streak": `at_least` expects a number or a duration like `7h 30m`, got "many". Ignored.',
            '"Current streak": `days` expects `all` or `weekdays`, got "weekends". Using `all`.',
        ]);
    });

    it("the streak-only keys on another aggregate still warn, naming both run aggregates", () => {
        const { spec, diagnostics } = readStat({ agg: "sum", field: "steps", at_least: 5000 }, "Steps");
        expect(spec).toEqual({ agg: "sum", field: "steps" });
        expect(diagnostics.map((d) => d.message)).toEqual([
            '"Steps": `at_least`, `at_most`, `days` and `skip_field` only apply to `agg: streak` and `agg: current_streak`, ignored.',
        ]);
    });

    it("a misspelt current-streak is guessed and the list of aggregates names it", () => {
        const { spec, diagnostics } = readStat({ agg: "current-streak" }, "Now");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("current_streak");
    });
});

describe("readStat — streak threshold and weekdays diagnostics (B-101)", () => {
    it("at_least/at_most/days on a non-streak card warn and are ignored", () => {
        const { spec, diagnostics } = readStat(
            { agg: "sum", field: "steps", at_least: 5000, at_most: 20000, days: "weekdays" }, "Steps");
        expect(spec).toEqual({ agg: "sum", field: "steps" });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("at_least");
        expect(diagnostics[0]?.message).toContain("at_most");
        expect(diagnostics[0]?.message).toContain("days");
    });

    it("the same warning fires even with a single one of the three keys set", () => {
        const { diagnostics } = readStat({ agg: "count", days: "weekdays" }, "Notes");
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
    });

    it("skip_field on a non-streak card is covered by the same combined warning (B-095)", () => {
        const { spec, diagnostics } = readStat({ agg: "sum", field: "steps", skip_field: "vacation" }, "Steps");
        expect(spec).toEqual({ agg: "sum", field: "steps" });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("skip_field");
    });

    it("skip_field alone, with no other streak-only key, still triggers the warning", () => {
        const { diagnostics } = readStat({ agg: "count", skip_field: "vacation" }, "Notes");
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
    });

    it("no keys set on a non-streak card: no warning at all", () => {
        expect(readStat({ agg: "count" }, "Notes").diagnostics).toEqual([]);
    });

    it("a threshold on a streak with no field warns and is ignored", () => {
        const { spec, diagnostics } = readStat({ agg: "streak", at_least: 5000 }, "Streak");
        expect(spec).toEqual({ agg: "streak" });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("field");
    });

    it("one warning covers both at_least and at_most missing a field together", () => {
        const { diagnostics } = readStat({ agg: "streak", at_least: 1, at_most: 5 }, "Streak");
        expect(diagnostics).toHaveLength(1);
    });

    it("a non-number at_least warns naming the value and is dropped", () => {
        const { spec, diagnostics } = readStat({ agg: "streak", field: "steps", at_least: "many" }, "Streak");
        expect(spec).toEqual({ agg: "streak", field: "steps" });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("at_least");
        expect(diagnostics[0]?.message).toContain("many");
    });

    it("a non-number at_most warns naming the value and is dropped", () => {
        const { spec, diagnostics } = readStat({ agg: "streak", field: "cigs", at_most: true }, "Streak");
        expect(spec).toEqual({ agg: "streak", field: "cigs" });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.message).toContain("at_most");
    });

    it("at_least above at_most warns, and both still land in the spec for a computed 0", () => {
        const { spec, diagnostics } = readStat(
            { agg: "streak", field: "steps", at_least: 10, at_most: 5 }, "Streak");
        expect(spec).toEqual({ agg: "streak", field: "steps", atLeast: 10, atMost: 5 });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
    });

    it("an invalid days value warns naming the options and falls back to all", () => {
        const { spec, diagnostics } = readStat({ agg: "streak", field: "v", days: "weekends" }, "Streak");
        expect(spec).toEqual({ agg: "streak", field: "v" });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("all");
        expect(diagnostics[0]?.message).toContain("weekdays");
    });

    it("a non-string skip_field warns naming the value and is dropped", () => {
        const { spec, diagnostics } = readStat({ agg: "streak", field: "v", skip_field: 5 }, "Streak");
        expect(spec).toEqual({ agg: "streak", field: "v" });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
        expect(diagnostics[0]?.message).toContain("skip_field");
        expect(diagnostics[0]?.message).toContain("5");
    });

    it("a blank skip_field warns the same way as a non-string one", () => {
        const { spec, diagnostics } = readStat({ agg: "streak", field: "v", skip_field: "   " }, "Streak");
        expect(spec).toEqual({ agg: "streak", field: "v" });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
    });
});

describe("readStat — edges", () => {
    it("an empty or blank field counts as unset", () => {
        for (const field of ["", "   "]) {
            expect(readStat({ agg: "avg", field }, "X").spec).toBeNull();
            expect(readStat({ agg: "count", field }, "X").spec).toEqual({ agg: "count" });
        }
    });

    it("trims spaces around the field and the unit", () => {
        const { spec } = readStat({ agg: "max", field: "  steps  ", unit: " step " }, "Steps");
        expect(spec).toEqual({ agg: "max", field: "steps", unit: "step" });
    });

    it("a blank unit does not reach the spec", () => {
        expect(readStat({ agg: "count", unit: "  " }, "X").spec).toEqual({ agg: "count" });
    });

    it("precision 0 is a value, not \"unset\"", () => {
        expect(readStat({ agg: "avg", field: "x", precision: 0 }, "X").spec?.precision).toBe(0);
    });

    it("an unlabelled card still names itself in the message", () => {
        const { diagnostics } = readStat({ agg: "avg" }, "");
        expect(diagnostics[0]?.message).toContain("a card with no label");
    });
});

describe("readStat — config errors", () => {
    it("a number aggregate without a field is an error, not a silent zero", () => {
        for (const agg of ["sum", "avg", "min", "max", "latest"]) {
            const { spec, diagnostics } = readStat({ agg }, "Sleep");
            expect(spec).toBeNull();
            expect(diagnostics[0]?.level).toBe("error");
            expect(diagnostics[0]?.message).toContain("field");
        }
    });

    it("a typo in agg suggests the right one", () => {
        const { spec, diagnostics } = readStat({ agg: "avgg", field: "x" }, "Sleep");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("\"avg\"");
    });

    it("something that is not an aggregate at all lists the available ones", () => {
        const { spec, diagnostics } = readStat({ agg: "median", field: "x" }, "Sleep");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("count");
    });

    it("a non-string agg does not break parsing", () => {
        const { spec, diagnostics } = readStat({ agg: 42 }, "Sleep");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.level).toBe("error");
    });

    it("a bad precision warns, and the card is still drawn", () => {
        for (const precision of [-1, 7, 1.5, "two", null]) {
            const { spec, diagnostics } = readStat({ agg: "count", precision }, "X");
            expect(spec).toEqual({ agg: "count" });
            expect(diagnostics[0]?.level).toBe("warning");
        }
    });
});

describe("formatValue", () => {
    it("nothing to count is a dash, not a zero", () => {
        expect(formatValue(null)).toBe("—");
    });

    it("zero stays zero", () => {
        expect(formatValue(0)).toBe("0");
    });

    it("a whole number is printed as is", () => {
        expect(formatValue(212)).toBe("212");
    });

    it("a fraction is rounded to one decimal by default", () => {
        expect(formatValue(72.83333333333333)).toBe("72.8");
    });

    it("precision sets the decimals and pads with zeros", () => {
        expect(formatValue(72.8, 3)).toBe("72.800");
        expect(formatValue(72.83, 0)).toBe("73");
    });

    it("negative and tiny values never render as \"-0\"", () => {
        expect(formatValue(-0.02)).toBe("0");
        expect(formatValue(-4.26)).toBe("-4.3");
    });

    it("nor as \"-0.0\" when a precision is given", () => {
        // toFixed keeps the sign of a value that rounds to nothing, and
        // "-0.0" reads as a measurement rather than as zero.
        expect(formatValue(-0.04, 1)).toBe("0.0");
        expect(formatValue(-0.4, 1)).toBe("-0.4");
    });

    it("infinity and NaN are a dash", () => {
        expect(formatValue(Infinity)).toBe("—");
        expect(formatValue(NaN)).toBe("—");
    });
});

const NBSP = " ";

describe("formatValue — digit groups", () => {
    it("a long number is split into groups of three", () => {
        expect(formatValue(1138758)).toBe(`1${NBSP}138${NBSP}758`);
    });

    it("a year and a four-digit counter stay unsplit", () => {
        expect(formatValue(2026)).toBe("2026");
        expect(formatValue(9999)).toBe("9999");
    });

    it("splitting starts at five digits", () => {
        expect(formatValue(10000)).toBe(`10${NBSP}000`);
    });

    it("the fractional part is not split", () => {
        expect(formatValue(1234567.89, 2)).toBe(`1${NBSP}234${NBSP}567.89`);
    });

    it("the minus sign stays with the number", () => {
        expect(formatValue(-1138758)).toBe(`-1${NBSP}138${NBSP}758`);
    });

    it("the separator is non-breaking — otherwise the number wraps", () => {
        expect(formatValue(1138758)).not.toContain(" ");
    });
});

describe("valueLengthClass", () => {
    it("a dash gets no class", () => {
        expect(valueLengthClass(formatValue(null))).toBe("");
    });

    it("one to six digits get no class, grouped or not", () => {
        expect(valueLengthClass(formatValue(7))).toBe("");
        expect(valueLengthClass(formatValue(9999))).toBe(""); // 4 digits, unsplit
        expect(valueLengthClass(formatValue(10000))).toBe(""); // 5 digits, "10 000"
        expect(valueLengthClass(formatValue(999999))).toBe(""); // 6 digits, "999 999"
    });

    it("seven or eight digits are long", () => {
        expect(valueLengthClass(formatValue(3307952))).toBe("is-long"); // "3 307 952"
        expect(valueLengthClass(formatValue(12345678))).toBe("is-long"); // "12 345 678"
    });

    it("nine digits or more are very long", () => {
        expect(valueLengthClass(formatValue(123456789))).toBe("is-very-long"); // "123 456 789"
        expect(valueLengthClass(formatValue(1234567890))).toBe("is-very-long");
    });
});

// B-121: durations on a card.
describe("readStat — duration thresholds", () => {
    it("at_least and at_most take a duration string, as minutes, and remember it was one", () => {
        const { spec, diagnostics } = readStat(
            { agg: "streak", field: "sleep", at_least: "7h", at_most: "9:30" }, "Sleep streak");
        expect(diagnostics).toEqual([]);
        expect(spec).toMatchObject({
            atLeast: 420,
            atMost: 570,
            durationThresholds: [{ key: "at_least", value: "7h" }, { key: "at_most", value: "9:30" }],
        });
    });

    it("a plain number stays plain and records nothing", () => {
        const { spec } = readStat({ agg: "streak", field: "sleep", at_least: 420 }, "Sleep streak");
        expect(spec?.atLeast).toBe(420);
        expect(spec?.durationThresholds).toBeUndefined();
    });

    it("text that is not a duration warns that a number or a duration is expected, and is dropped", () => {
        const { spec, diagnostics } = readStat({ agg: "streak", field: "sleep", at_least: "seven hours" }, "S");
        expect(spec?.atLeast).toBeUndefined();
        expect(diagnostics.map((d) => d.message)).toEqual(['"S": `at_least` expects a number or a duration like `7h 30m`, got "seven hours". Ignored.']);
    });

    it("two duration thresholds the wrong way round still warn as impossible", () => {
        const { diagnostics } = readStat({ agg: "streak", field: "sleep", at_least: "9h", at_most: "7h" }, "S");
        expect(diagnostics.map((d) => d.message)).toContain(
            '"S": `at_least` is above `at_most`, so no day can satisfy both. The streak is 0.');
    });
});

describe("showsDuration", () => {
    it("only a duration field, and only for an aggregate that keeps its unit", () => {
        for (const agg of ["sum", "avg", "min", "max", "latest"] as const) expect(showsDuration(agg, "duration")).toBe(true);
        expect(showsDuration("count", "duration")).toBe(false);
        expect(showsDuration("streak", "duration")).toBe(false);
        expect(showsDuration("avg", "mixed")).toBe(false);
        expect(showsDuration("avg", "plain")).toBe(false);
        expect(showsDuration("avg", "none")).toBe(false);
    });
});

describe("formatReading", () => {
    it("a duration ignores precision; a plain number keeps it", () => {
        expect(formatReading(358.4, 2, true)).toBe("5h 58m");
        expect(formatReading(358.4, 2, false)).toBe("358.40");
        expect(formatReading(null, 2, true)).toBe("—");
    });
});

describe("durationDiagnostics", () => {
    const card = '"Sleep"';

    it("a mixed field names the field and one note of each kind", () => {
        const out = durationDiagnostics({ agg: "avg", field: "sleep" },
            { kind: "mixed", durationNote: "Diary/a.md", plainNote: "Diary/b.md" }, card);
        expect(out).toEqual([{
            level: "warning",
            message: '"Sleep": "sleep" mixes durations ("Diary/a.md") and plain numbers ("Diary/b.md"). '
                + "All of them are counted as minutes and shown as a plain number.",
        }]);
    });

    it("a mixed field on a count, or a streak with no threshold, says nothing: the count is the same", () => {
        const mixed = { kind: "mixed" as const, durationNote: "Diary/a.md", plainNote: "Diary/b.md" };
        expect(durationDiagnostics({ agg: "count", field: "sleep" }, mixed, card)).toEqual([]);
        expect(durationDiagnostics({ agg: "streak", field: "sleep" }, mixed, card)).toEqual([]);
        // With a threshold the mix decides which days qualify, so it still warns.
        expect(durationDiagnostics({ agg: "streak", field: "sleep", atLeast: 420 }, mixed, card)).toHaveLength(1);
    });

    it("a unit on a duration card is ignored with a warning; on a count card it is not", () => {
        const spec = { agg: "avg" as const, field: "sleep", unit: "hrs" };
        expect(durationDiagnostics(spec, { kind: "duration" }, card).map((d) => d.message)).toEqual([
            '"Sleep": `unit: hrs` is ignored. "sleep" holds durations, which already carry their own units.',
        ]);
        expect(durationDiagnostics({ ...spec, agg: "count" }, { kind: "duration" }, card)).toEqual([]);
    });

    it("a duration threshold against plain numbers warns, still applied as minutes", () => {
        const spec = { agg: "streak" as const, field: "steps", durationThresholds: [{ key: "at_least", value: "7h" }] };
        expect(durationDiagnostics(spec, { kind: "plain" }, card).map((d) => d.message)).toEqual([
            '"Sleep": `at_least: 7h` is a duration, but "steps" holds plain numbers. It is applied as minutes.',
        ]);
        // Against durations, or a field with nothing usable yet, there is nothing to say.
        expect(durationDiagnostics(spec, { kind: "duration" }, card)).toEqual([]);
        expect(durationDiagnostics(spec, { kind: "none" }, card)).toEqual([]);
    });

    it("a duration goal on count or streak warns that it counts, not measures time", () => {
        const goal = [{ key: "goal", value: "8h" }];
        expect(durationDiagnostics({ agg: "streak", field: "sleep", durationThresholds: goal }, { kind: "duration" }, card)
            .map((d) => d.message)).toEqual([
            '"Sleep": `goal: 8h` is a duration, but `agg: streak` counts days or notes, not time. It is applied as minutes.',
        ]);
        expect(durationDiagnostics({ agg: "count", durationThresholds: goal }, { kind: "none" }, card)).toHaveLength(1);
        expect(durationDiagnostics({ agg: "sum", field: "sleep", durationThresholds: goal }, { kind: "duration" }, card))
            .toEqual([]);
    });
});
