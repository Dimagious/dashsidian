import { describe, it, expect } from "vitest";
import { readStat, formatValue } from "./stat";

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
