import { describe, it, expect } from "vitest";
import { readBands, bandFor } from "./bands";

describe("readBands — short form", () => {
    it("the top band is open above, the rest are capped by the previous one", () => {
        expect(readBands([90, 80, 60]).map((b) => b.label)).toEqual(["90+", "80–89", "60–79"]);
    });

    it("never produces an inverted range like 12000–11999", () => {
        for (const b of readBands([12000, 8000, 5000])) {
            const m = /^(\d+)–(\d+)$/.exec(b.label);
            if (m) expect(Number(m[1])).toBeLessThan(Number(m[2]));
        }
    });

    it("sorts thresholds descending whatever the input order", () => {
        expect(readBands([60, 90, 80]).map((b) => b.min)).toEqual([90, 80, 60]);
    });

    it("alpha decreases from the top band down", () => {
        const alphas = readBands([90, 80, 60]).map((b) => b.alpha);
        expect(alphas[0]).toBeGreaterThan(alphas[1]!);
        expect(alphas[1]).toBeGreaterThan(alphas[2]!);
    });

    it("more bands than alphas — the last one repeats instead of going undefined", () => {
        for (const b of readBands([100, 90, 80, 70, 60, 50])) {
            expect(typeof b.alpha).toBe("number");
        }
    });

    it("a single band", () => {
        expect(readBands([50]).map((b) => b.label)).toEqual(["50+"]);
    });
});

describe("readBands — full form", () => {
    it("takes labels as given and sorts descending", () => {
        const bands = readBands([
            { min: 60, alpha: 0.4, label: "fair" },
            { min: 90, alpha: 1, label: "great" },
        ]);
        expect(bands.map((b) => b.label)).toEqual(["great", "fair"]);
    });

    it("fills in missing fields instead of failing", () => {
        const [b] = readBands([{ min: 10 }]);
        expect(b?.alpha).toBe(1);
        expect(b?.label).toContain("10");
    });
});

describe("readBands — degenerate input", () => {
    it("empty and rubbish give one band covering everything", () => {
        for (const input of [undefined, [], "a string", 42]) {
            const bands = readBands(input);
            expect(bands).toHaveLength(1);
            expect(bands[0]?.min).toBe(Number.NEGATIVE_INFINITY);
        }
    });
});

describe("bandFor", () => {
    const bands = readBands([90, 80, 60]);
    it("takes the first match", () => {
        expect(bandFor(bands, 95)?.label).toBe("90+");
        expect(bandFor(bands, 85)?.label).toBe("80–89");
        expect(bandFor(bands, 60)?.label).toBe("60–79");
    });
    it("below every threshold — nothing", () => {
        expect(bandFor(bands, 10)).toBeUndefined();
    });
});
