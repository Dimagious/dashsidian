import { describe, it, expect } from "vitest";
import { isInTemplateFolder, showsTemplateHint } from "./template-note";
import { periodNames } from "./period-name";
import type { PeriodContext } from "./period";
import type { ParseDate } from "./note-date";

/** A fake parser that reads one week name, the way Obsidian's moment would read `GGGG-[W]WW`. */
const parse: ParseDate = (text, format) => (format === "GGGG-[W]WW" && text === "2026-W40" ? "2026-09-28" : null);
const names = periodNames({}, parse);

const context = (noteName: string, inTemplateFolder?: boolean): PeriodContext =>
    inTemplateFolder === undefined ? { names, noteName } : { names, noteName, inTemplateFolder };

describe("isInTemplateFolder (B-190)", () => {
    it("a note in the folder, or in one nested below it, is in it", () => {
        expect(isInTemplateFolder("Templates/Weekly review.md", ["Templates"])).toBe(true);
        expect(isInTemplateFolder("99-Meta/Templates/Weekly-Review.md", ["99-Meta/Templates"])).toBe(true);
        expect(isInTemplateFolder("Templates/Reviews/Weekly.md", ["Templates"])).toBe(true);
    });

    it("a folder written with leading, trailing or doubled slashes and spaces reads the same", () => {
        for (const folder of ["Templates/", "/Templates", " Templates/ ", "99-Meta//Templates/"]) {
            const path = folder.includes("99-Meta") ? "99-Meta/Templates/Weekly.md" : "Templates/Weekly.md";
            expect(isInTemplateFolder(path, [folder]), folder).toBe(true);
        }
    });

    it("a folder whose name starts like the setting is another folder", () => {
        expect(isInTemplateFolder("Templates-old/Weekly.md", ["Templates"])).toBe(false);
        expect(isInTemplateFolder("TemplatesArchive/Weekly.md", ["Templates"])).toBe(false);
        // The folder itself is no note in it, and a note named like it is not either.
        expect(isInTemplateFolder("Templates.md", ["Templates"])).toBe(false);
    });

    it("compares case as written, the way vault paths are", () => {
        expect(isInTemplateFolder("templates/Weekly.md", ["Templates"])).toBe(false);
        expect(isInTemplateFolder("Templates/Weekly.md", ["templates"])).toBe(false);
    });

    it("a blank setting or the vault root names no folder; no setting at all neither", () => {
        expect(isInTemplateFolder("Weekly.md", [""])).toBe(false);
        expect(isInTemplateFolder("Reviews/Weekly.md", ["  "])).toBe(false);
        expect(isInTemplateFolder("Reviews/Weekly.md", ["/"])).toBe(false);
        expect(isInTemplateFolder("Reviews/Weekly.md", [])).toBe(false);
    });

    it("any of several folders counts: the core Templates one and Templater's", () => {
        expect(isInTemplateFolder("Templater/Weekly.md", ["Templates", "Templater"])).toBe(true);
        expect(isInTemplateFolder("Reviews/2026-W40.md", ["Templates", "Templater"])).toBe(false);
    });
});

describe("showsTemplateHint (B-190)", () => {
    const root = { source: "Diary", period: "note", items: [{ label: "Gym", field: "gym", agg: "sum" }] };

    it("a template not named for a period, with `period: note` on the root, draws the hint", () => {
        expect(showsTemplateHint(root, "period", context("Weekly review", true))).toBe(true);
    });

    it("finds `note` on a card too, written in any case, and `range` for heatmap and chart", () => {
        const onCard = { source: "Diary", items: [{ label: "Gym", agg: "count", period: " Note " }] };
        expect(showsTemplateHint(onCard, "period", context("Weekly review", true))).toBe(true);
        // A single card written as a bare map is its own root.
        expect(showsTemplateHint({ label: "Gym", agg: "count", period: "note" }, "period", context("Weekly review", true))).toBe(true);
        expect(showsTemplateHint({ source: "Diary", field: "gym", range: "note" }, "range", context("Weekly review", true))).toBe(true);
    });

    it("outside a template folder the error stays: no hint", () => {
        expect(showsTemplateHint(root, "period", context("Weekly review", false))).toBe(false);
        expect(showsTemplateHint(root, "period", context("Weekly review"))).toBe(false);
    });

    it("a template named for a period, or a block without `note`, draws as usual", () => {
        expect(showsTemplateHint(root, "period", context("2026-W40", true))).toBe(false);
        const week = { source: "Diary", period: "week", items: [{ label: "Gym", agg: "count" }] };
        expect(showsTemplateHint(week, "period", context("Weekly review", true))).toBe(false);
        // `range` is not what stats reads, nor `period` what a heatmap reads.
        expect(showsTemplateHint(root, "range", context("Weekly review", true))).toBe(false);
        expect(showsTemplateHint(null, "period", context("Weekly review", true))).toBe(false);
    });
});
