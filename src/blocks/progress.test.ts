import { describe, it, expect } from "vitest";
import { renderProgress } from "./progress";
import { mockApp, diary, host, texts, nodes, diagnostics } from "../test/vault";

const app = mockApp({
    notes: diary("Diary", "2026-01-01", 10, (i) => ({ km: i + 1 })),
});

const bars = (config: string) => {
    const el = host();
    renderProgress(app, config, el);
    return el;
};

describe("progress — the bar says what the number says", () => {
    it("percent and width agree while below the goal", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40 }");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["25%"]);
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("25%");
    });

    it("the value reads as current over goal", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40 }");
        expect(texts(el, ".dashy-progress-value")[0]).toContain("10 / 40");
    });

    it("a unit follows both numbers, once", () => {
        const el = bars("items:\n  - { label: Run, source: Diary, field: km, agg: sum, goal: 100, unit: km }");
        expect(texts(el, ".dashy-progress-value")[0]).toBe("55 / 100 km 55%");
    });

    it("`target` is accepted as a synonym of goal", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, target: 40 }");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["25%"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("icon and sub are drawn when given", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40, icon: 📔, sub: this year }");
        expect(texts(el, ".dashy-progress-icon")).toEqual(["📔"]);
        expect(texts(el, ".dashy-progress-sub")).toEqual(["this year"]);
    });
});

describe("progress — past the goal", () => {
    it("the percent keeps climbing past 100", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 4 }");
        expect(texts(el, ".dashy-progress-percent")).toEqual(["250%"]);
    });

    it("but the bar itself stops at full", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 4 }");
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("100%");
    });

    it("a met goal is marked, since width can no longer say it", () => {
        const el = bars(`items:
  - { label: Under, source: Diary, agg: count, goal: 40 }
  - { label: Exactly, source: Diary, agg: count, goal: 10 }
  - { label: Over, source: Diary, agg: count, goal: 4 }`);
        const rows = nodes(el, ".dashy-progress-row").map((r) => r.className);
        expect(rows[0]).not.toContain("is-complete");
        expect(rows[1]).toContain("is-complete");
        expect(rows[2]).toContain("is-complete");
    });
});

describe("progress — edges", () => {
    it("a missing goal errors and the row is marked broken, not zero", () => {
        const el = bars("items:\n  - { label: No goal, source: Diary, agg: count }");
        expect(diagnostics(el, "error")[0]).toContain("goal");
        const row = nodes(el, ".dashy-progress-row")[0];
        expect(row?.className).toContain("is-broken");
        expect(row?.className).not.toContain("is-complete");
    });

    it("a broken row shows dashes on both sides, not a zero", () => {
        const el = bars("items:\n  - { label: No goal, source: Diary, agg: count }");
        expect(texts(el, ".dashy-progress-value")[0]).toBe("— / —");
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("0%");
    });

    it("a goal of zero is refused rather than dividing by it", () => {
        const el = bars("items:\n  - { label: Zero, source: Diary, agg: count, goal: 0 }");
        expect(diagnostics(el, "error")[0]).toContain("0");
        expect(texts(el, ".dashy-progress-percent")).toHaveLength(0);
    });

    it("nothing counted leaves the bar empty but the goal visible", () => {
        const el = bars("items:\n  - { label: Nowhere, source: 99-Empty, field: km, agg: sum, goal: 100 }");
        expect(texts(el, ".dashy-progress-value")[0]).toBe("— / 100");
        expect(nodes(el, ".dashy-progress-fill")[0]?.style.width).toBe("0%");
    });

    it("one broken row does not take the others down", () => {
        const el = bars(`items:
  - { label: Fine, source: Diary, agg: count, goal: 40 }
  - { label: Broken, source: Diary, agg: count }
  - { label: Also fine, source: Diary, agg: count, goal: 20 }`);
        expect(texts(el, ".dashy-progress-percent")).toEqual(["25%", "50%"]);
        expect(nodes(el, ".dashy-progress-row")).toHaveLength(3);
    });

    it("an empty block says so once", () => {
        const el = bars("   ");
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(nodes(el, ".dashy-progress-row")).toHaveLength(0);
    });

    it("an unknown key warns and the bar is still drawn", () => {
        const el = bars("items:\n  - { label: Days, source: Diary, agg: count, goal: 40, colour2: red }");
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(nodes(el, ".dashy-progress-row")).toHaveLength(1);
    });
});
