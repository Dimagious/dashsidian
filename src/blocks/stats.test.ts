import { describe, it, expect } from "vitest";
import { renderStats } from "./stats";
import { mockApp, diary, host, texts, nodes, diagnostics } from "../test/vault";

// 10 days, sleep_score 70..79, steps 1000..1900, two of them tagged.
const app = mockApp({
    notes: [
        ...diary("Diary", "2026-01-01", 10, (i) => ({ sleep_score: 70 + i, steps: 1000 + i * 100 })),
        { path: "Books/one.md", frontmatter: { year: 2026, rating: 5 }, tags: ["read"] },
        { path: "Books/two.md", frontmatter: { year: 2025, rating: 3 }, tags: ["read"] },
    ],
});

const card = (config: string) => {
    const el = host();
    renderStats(app, config, el);
    return el;
};

describe("stats — the numbers are the real ones", () => {
    it("count counts the selection, not the vault", () => {
        expect(texts(card("items:\n  - { label: Days, source: Diary, agg: count }"), ".dashy-stat-value"))
            .toEqual(["10"]);
    });

    it("sum, avg, min, max, latest and streak each compute their own answer", () => {
        const el = card(`items:
  - { label: Sum, source: Diary, field: sleep_score, agg: sum }
  - { label: Avg, source: Diary, field: sleep_score, agg: avg }
  - { label: Min, source: Diary, field: sleep_score, agg: min }
  - { label: Max, source: Diary, field: sleep_score, agg: max }
  - { label: Latest, source: Diary, field: sleep_score, agg: latest }
  - { label: Streak, source: Diary, field: sleep_score, agg: streak }`);
        expect(texts(el, ".dashy-stat-value")).toEqual(["745", "74.5", "70", "79", "79", "10"]);
    });

    it("`where` narrows the selection before counting", () => {
        expect(texts(card('items:\n  - { label: This year, source: Books, where: "year = 2026", agg: count }'), ".dashy-stat-value"))
            .toEqual(["1"]);
    });

    it("a tag narrows it too", () => {
        expect(texts(card("items:\n  - { label: Read, tag: read, agg: count }"), ".dashy-stat-value"))
            .toEqual(["2"]);
    });

    it("precision is respected, and the default rounds to one decimal", () => {
        const el = card(`items:
  - { label: Exact, source: Diary, field: sleep_score, agg: avg, precision: 3 }
  - { label: Default, source: Diary, field: sleep_score, agg: avg }`);
        expect(texts(el, ".dashy-stat-value")).toEqual(["74.500", "74.5"]);
    });

    it("a long number is grouped for reading", () => {
        expect(texts(card("items:\n  - { label: Steps, source: Diary, field: steps, agg: sum }"), ".dashy-stat-value")[0])
            .toBe("14 500");
    });

    it("the unit rides with the number but stays a separate element", () => {
        const el = card("items:\n  - { label: Steps, source: Diary, field: steps, agg: sum, unit: st }");
        expect(texts(el, ".dashy-stat-unit")).toEqual(["st"]);
        // A real space, not only a CSS margin: "14 500st" is what a screen
        // reader would otherwise say.
        expect(nodes(el, ".dashy-stat-value")[0]?.textContent).toBe("14\u202F500 st");
    });

    it("label, icon and sub land where they were asked to", () => {
        const el = card("items:\n  - { label: Sleep, source: Diary, agg: count, icon: 🛌, sub: nightly }");
        expect(texts(el, ".dashy-stat-label")).toEqual(["Sleep"]);
        expect(texts(el, ".dashy-stat-icon")).toEqual(["🛌"]);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["nightly"]);
    });
});

describe("stats — nothing to count is not zero", () => {
    it("an empty selection shows a dash, marked as empty", () => {
        const el = card("items:\n  - { label: Nowhere, source: 99-Empty, field: steps, agg: sum }");
        const value = nodes(el, ".dashy-stat-value")[0];
        expect(value?.textContent).toBe("—");
        expect(value?.className).toContain("is-empty");
    });

    it("count over an empty selection is an honest zero, not a dash", () => {
        const el = card("items:\n  - { label: Nowhere, source: 99-Empty, agg: count }");
        expect(nodes(el, ".dashy-stat-value")[0]?.className).not.toContain("is-empty");
        expect(texts(el, ".dashy-stat-value")).toEqual(["0"]);
    });

    it("a unit is not printed next to a dash", () => {
        const el = card("items:\n  - { label: Nowhere, source: 99-Empty, field: steps, agg: sum, unit: st }");
        expect(nodes(el, ".dashy-stat-unit")).toHaveLength(0);
    });
});

describe("stats — edges", () => {
    it("a typo in the aggregate errors with a suggestion, and the card shows a dash", () => {
        const el = card("items:\n  - { label: Sleep, source: Diary, field: sleep_score, agg: avgg }");
        expect(diagnostics(el, "error")[0]).toContain("avg");
        expect(texts(el, ".dashy-stat-value")).toEqual(["—"]);
    });

    it("an aggregate that needs a field says which card is missing one", () => {
        const el = card("items:\n  - { label: Sleep, source: Diary, agg: avg }");
        expect(diagnostics(el, "error")[0]).toContain("Sleep");
        expect(diagnostics(el, "error")[0]).toContain("field");
    });

    it("one broken card does not take the others down", () => {
        const el = card(`items:
  - { label: Fine, source: Diary, agg: count }
  - { label: Broken, source: Diary, agg: avg }
  - { label: Also fine, source: Diary, field: steps, agg: max }`);
        expect(texts(el, ".dashy-stat-value")).toEqual(["10", "—", "1900"]);
    });

    it("a single card written as a bare object draws, and warns about nothing", () => {
        const el = card("{ label: Days, source: Diary, agg: count }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["10"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("diagnostics come before the cards, so the error is read first", () => {
        const el = card("items:\n  - { label: Broken, source: Diary, agg: avg }");
        const children = Array.from(el.children).map((c) => c.className);
        expect(children[0]).toBe("dashy-diagnostics");
    });

    it("an empty block says so once and draws no grid", () => {
        const el = card("   ");
        expect(diagnostics(el, "error")).toEqual(["⛔ stats: The block is empty."]);
        expect(nodes(el, ".dashy-stats")).toHaveLength(0);
    });

    it("a list with no items says which key was expected", () => {
        const el = card("columns: 3\nitems: []");
        expect(diagnostics(el, "error")[0]).toContain("items");
    });

    it("columns are clamped to what fits", () => {
        const el = card("columns: 99\nitems:\n  - { label: A, source: Diary, agg: count }");
        expect(nodes(el, ".dashy-stats")[0]?.style.getPropertyValue("--dashy-stat-columns")).toBe("6");
    });

    it("a bad precision warns but the number is still shown", () => {
        const el = card("items:\n  - { label: Avg, source: Diary, field: sleep_score, agg: avg, precision: 9 }");
        expect(diagnostics(el, "warning")[0]).toContain("precision");
        expect(texts(el, ".dashy-stat-value")).toEqual(["74.5"]);
    });
});
