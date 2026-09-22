import { describe, it, expect } from "vitest";
import { parseWhere, selectNotes, type NoteRecord } from "./source";

const note = (over: Partial<NoteRecord>): NoteRecord => ({
    path: "a.md", name: "a", folder: "", tags: [], frontmatter: {}, ...over,
});

const vault: NoteRecord[] = [
    note({ path: "01-Areas/Sport/run.md", name: "run", folder: "01-Areas/Sport", tags: ["спорт"], frontmatter: { year: 2026, rating: 5 } }),
    note({ path: "01-Areas/Learning/ts.md", name: "ts", folder: "01-Areas/Learning", tags: ["tech"], frontmatter: { year: 2025, rating: 3 } }),
    note({ path: "00-Inbox/idea.md", name: "idea", folder: "00-Inbox", tags: [], frontmatter: {} }),
];

describe("parseWhere", () => {
    it("разбирает сравнения", () => {
        expect(parseWhere("year = 2026")).toEqual({ field: "year", op: "=", value: 2026 });
        expect(parseWhere("rating >= 4")).toEqual({ field: "rating", op: ">=", value: 4 });
        expect(parseWhere("status != done")).toEqual({ field: "status", op: "!=", value: "done" });
    });

    it("разбирает contains", () => {
        expect(parseWhere("tags contains книги")).toEqual({ field: "tags", op: "contains", value: "книги" });
    });

    it("снимает кавычки", () => {
        expect(parseWhere('status = "в работе"')).toEqual({ field: "status", op: "=", value: "в работе" });
    });

    it("на мусоре возвращает null, а не бросает", () => {
        expect(parseWhere("")).toBeNull();
        expect(parseWhere("просто слова")).toBeNull();
        expect(parseWhere("= 5")).toBeNull();
    });
});

describe("selectNotes", () => {
    it("папка включает вложенные", () => {
        expect(selectNotes(vault, { source: "01-Areas" })).toHaveLength(2);
        expect(selectNotes(vault, { source: "01-Areas/Sport" })).toHaveLength(1);
    });

    it("папка не цепляет соседей по префиксу", () => {
        const notes = [note({ folder: "01-Areas" }), note({ folder: "01-AreasOld" })];
        expect(selectNotes(notes, { source: "01-Areas" })).toHaveLength(1);
    });

    it("фильтрует по тегу с решёткой и без", () => {
        expect(selectNotes(vault, { tag: "спорт" })).toHaveLength(1);
        expect(selectNotes(vault, { tag: "#спорт" })).toHaveLength(1);
    });

    it("применяет where", () => {
        expect(selectNotes(vault, { where: "year = 2026" })).toHaveLength(1);
        expect(selectNotes(vault, { where: "rating >= 3" })).toHaveLength(2);
    });

    it("нерабочий where не отсеивает всё молча — фильтр просто не применяется", () => {
        expect(selectNotes(vault, { where: "чепуха" })).toHaveLength(3);
    });

    it("условия складываются", () => {
        expect(selectNotes(vault, { source: "01-Areas", where: "rating >= 5" })).toHaveLength(1);
    });
});
