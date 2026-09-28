import { describe, it, expect } from "vitest";
import { isSpecialMark, specialDays } from "./special-days";
import type { NoteRecord } from "./source";

const day = (name: string, fm: Record<string, unknown>): NoteRecord => ({
    path: `Diary/${name}.md`, name, folder: "Diary", tags: [], frontmatter: fm,
});

describe("isSpecialMark", () => {
    it("a YAML boolean true marks the day", () => {
        expect(isSpecialMark(true)).toBe(true);
    });

    it("a YAML boolean false does not", () => {
        expect(isSpecialMark(false)).toBe(false);
    });

    it("a non-blank string marks the day", () => {
        expect(isSpecialMark("flu")).toBe(true);
    });

    it("an empty or whitespace-only string does not", () => {
        expect(isSpecialMark("")).toBe(false);
        expect(isSpecialMark("   ")).toBe(false);
    });

    it("a non-zero number marks the day", () => {
        expect(isSpecialMark(1)).toBe(true);
        expect(isSpecialMark(-1)).toBe(true);
    });

    it("a numeric zero does not, the same conservative reading as a checkbox false", () => {
        expect(isSpecialMark(0)).toBe(false);
    });

    it("null and undefined do not, the same as an absent property", () => {
        expect(isSpecialMark(null)).toBe(false);
        expect(isSpecialMark(undefined)).toBe(false);
    });

    it("a value of any other shape marks the day, conservatively", () => {
        expect(isSpecialMark(["a"])).toBe(true);
        expect(isSpecialMark({ a: 1 })).toBe(true);
    });
});

describe("specialDays", () => {
    it("collects the day of a note whose skip_field is truthy", () => {
        const notes = [day("2026-09-18", { vacation: true }), day("2026-09-19", { vacation: false })];
        expect(specialDays(notes, "vacation")).toEqual(new Set(["2026-09-18"]));
    });

    it("a text mark counts too", () => {
        const notes = [day("2026-09-18", { sick: "flu" })];
        expect(specialDays(notes, "sick")).toEqual(new Set(["2026-09-18"]));
    });

    it("a note missing the property contributes nothing", () => {
        const notes = [day("2026-09-18", { other: 1 })];
        expect(specialDays(notes, "vacation").size).toBe(0);
    });

    it("a dotted path reaches a nested property", () => {
        const notes = [day("2026-09-18", { leave: { vacation: true } })];
        expect(specialDays(notes, "leave.vacation")).toEqual(new Set(["2026-09-18"]));
    });

    it("two notes on the same day: either one marking it is enough", () => {
        const notes = [
            { path: "Personal/2026-09-18.md", name: "2026-09-18", folder: "Personal", tags: [], frontmatter: { vacation: false } },
            { path: "Work/2026-09-18 standup.md", name: "2026-09-18 standup", folder: "Work", tags: [], frontmatter: { vacation: true } },
        ];
        expect(specialDays(notes, "vacation")).toEqual(new Set(["2026-09-18"]));
    });

    it("respects date_field instead of the note name", () => {
        const notes = [{ path: "Books/x.md", name: "x", folder: "Books", tags: [], frontmatter: { finished: "2026-09-18", note_taking_day: true } }];
        expect(specialDays(notes, "note_taking_day", "finished")).toEqual(new Set(["2026-09-18"]));
    });

    it("a note with no resolvable date contributes nothing, even when marked", () => {
        const notes = [day("not-a-date", { vacation: true })];
        expect(specialDays(notes, "vacation").size).toBe(0);
    });
});
