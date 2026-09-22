import { describe, it, expect, afterEach } from "vitest";
import { CASES } from "./cases";
import { BLOCKS, fakeVault, previewContext, withDates } from "./fixture";
import { setLocale, AVAILABLE_LOCALES } from "../i18n";

/**
 * The stand is a developer tool, but a stale one is worse than none: it was
 * rebuilt from scratch every time it was wanted, because nothing held it to the
 * code it draws. This does.
 */

const ctx = previewContext(fakeVault());
afterEach(() => setLocale("en"));

const render = (index: number): HTMLElement => {
    const item = CASES[index]!;
    const el = document.createElement("div");
    BLOCKS[item.block]?.(ctx, withDates(item.source), el);
    return el;
};

describe("preview cases", () => {
    it("names only blocks that exist", () => {
        for (const item of CASES) {
            expect(BLOCKS[item.block], item.block).toBeTypeOf("function");
        }
    });

    it("covers every block the plugin registers", () => {
        const used = new Set(CASES.map((c) => c.block));
        expect([...Object.keys(BLOCKS)].filter((b) => !used.has(b))).toEqual([]);
    });

    it("every case draws something", () => {
        CASES.forEach((item, i) => {
            expect(render(i).children.length, item.title).toBeGreaterThan(0);
        });
    });

    it("draws in every language we ship", () => {
        for (const locale of AVAILABLE_LOCALES) {
            setLocale(locale);
            CASES.forEach((item, i) => {
                expect(render(i).children.length, `${locale} / ${item.title}`).toBeGreaterThan(0);
            });
        }
    });

    it("the stand shows the awkward states, not only the pretty ones", () => {
        const all = CASES.map((_, i) => render(i).innerHTML).join("");
        expect(all, "a broken config").toContain("dashy-diag-error");
        expect(all, "a warning").toContain("dashy-diag-warning");
        expect(all, "nothing to count").toContain("is-empty");
        expect(all, "a goal already met").toContain("is-complete");
        expect(all, "a note not created yet").toContain("is-missing");
    });

    it("the dated cases move with the calendar", () => {
        const countdown = CASES.find((c) => c.source.includes("TODAY"))!;
        expect(withDates(countdown.source)).not.toContain("TODAY");
        expect(withDates(countdown.source)).toContain(String(new Date().getFullYear()));
    });

    it("the fake vault has gaps, so a heatmap is not a solid wall", () => {
        const notes = fakeVault().filter((n) => n.folder === "Diary");
        expect(notes.length).toBeLessThan(120);
        expect(notes.length).toBeGreaterThan(100);
    });
});
