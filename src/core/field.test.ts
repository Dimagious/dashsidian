import { describe, it, expect } from "vitest";
import { hasField, readField } from "./field";

describe("readField / hasField", () => {
    it("reads a plain top-level key, same as always", () => {
        const fm = { sleep_score: 82 };
        expect(readField(fm, "sleep_score")).toBe(82);
        expect(hasField(fm, "sleep_score")).toBe(true);
    });

    it("a literal dotted key wins over a nested path with the same name", () => {
        const fm = { "health.sleep": 5, health: { sleep: 99 } };
        expect(readField(fm, "health.sleep")).toBe(5);
        expect(hasField(fm, "health.sleep")).toBe(true);
    });

    it("walks a nested path when no literal key exists", () => {
        const fm = { health: { sleep: 82 } };
        expect(readField(fm, "health.sleep")).toBe(82);
        expect(hasField(fm, "health.sleep")).toBe(true);
    });

    it("walks three levels deep", () => {
        const fm = { a: { b: { c: 7 } } };
        expect(readField(fm, "a.b.c")).toBe(7);
        expect(hasField(fm, "a.b.c")).toBe(true);
    });

    it("a missing segment resolves to nothing", () => {
        const fm = { health: { sleep: 82 } };
        expect(readField(fm, "health.steps")).toBeUndefined();
        expect(hasField(fm, "health.steps")).toBe(false);
        expect(readField(fm, "mood.today")).toBeUndefined();
        expect(hasField(fm, "mood.today")).toBe(false);
    });

    it("a non-object midway resolves to nothing, not an error", () => {
        const fm = { health: 82 };
        expect(readField(fm, "health.sleep")).toBeUndefined();
        expect(hasField(fm, "health.sleep")).toBe(false);
    });

    it("arrays are not indexed", () => {
        const fm = { runs: [5, 10, 15] };
        expect(readField(fm, "runs.0")).toBeUndefined();
        expect(hasField(fm, "runs.0")).toBe(false);
    });

    it("prototype keys resolve to nothing at the top level", () => {
        const fm = { health: { sleep: 82 } };
        expect(readField(fm, "constructor")).toBeUndefined();
        expect(hasField(fm, "constructor")).toBe(false);
        expect(readField(fm, "toString")).toBeUndefined();
        expect(hasField(fm, "__proto__")).toBe(false);
    });

    it("prototype keys resolve to nothing partway down a nested path", () => {
        const fm = { health: { sleep: 82 } };
        expect(readField(fm, "health.constructor")).toBeUndefined();
        expect(hasField(fm, "health.constructor")).toBe(false);
        expect(hasField(fm, "health.__proto__")).toBe(false);
    });

    it("an empty segment resolves to nothing unless the literal key exists", () => {
        const fm = { health: { sleep: 82 } };
        expect(hasField(fm, "health..sleep")).toBe(false);
        expect(hasField(fm, ".health")).toBe(false);
        expect(hasField(fm, "health.")).toBe(false);

        const literal = { "health..sleep": 1 };
        expect(readField(literal, "health..sleep")).toBe(1);
        expect(hasField(literal, "health..sleep")).toBe(true);
    });

    it("a value that is itself an object is present, not missing", () => {
        const fm = { health: { sleep: 82, steps: 9000 } };
        expect(hasField(fm, "health")).toBe(true);
        expect(readField(fm, "health")).toEqual({ sleep: 82, steps: 9000 });
    });

    it("false and 0 at a nested path are returned as-is, not treated as missing", () => {
        const fm = { habits: { gym: false }, health: { steps: 0 } };
        expect(readField(fm, "habits.gym")).toBe(false);
        expect(hasField(fm, "habits.gym")).toBe(true);
        expect(readField(fm, "health.steps")).toBe(0);
        expect(hasField(fm, "health.steps")).toBe(true);
    });

    it("a field entirely absent from frontmatter resolves to nothing", () => {
        expect(hasField({}, "health.sleep")).toBe(false);
        expect(readField({}, "health.sleep")).toBeUndefined();
    });
});
