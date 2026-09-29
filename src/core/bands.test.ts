import { describe, it, expect } from "vitest";
import { readBands, bandFor, autoBands } from "./bands";

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
    it("below every threshold falls into the bottom band, not into nothing", () => {
        // The caller paints whatever comes back, and "nothing" used to mean
        // full strength: a 10 was painted exactly like a 95.
        expect(bandFor(bands, 10)?.label).toBe("60–79");
        expect(bandFor(bands, 10)?.alpha).toBeLessThan(bandFor(bands, 95)!.alpha);
    });

    it("the weakest colour belongs to the weakest value", () => {
        const alphas = [95, 85, 65, 10].map((v) => bandFor(bands, v)!.alpha);
        expect(alphas[0]).toBeGreaterThan(alphas[1]!);
        expect(alphas[1]).toBeGreaterThan(alphas[2]!);
        expect(alphas[3]).toBe(alphas[2]);
    });
});

// B-097, updated by B-116: `readBands` itself still never reads a min or a
// max — passed `undefined` it still hands back exactly one band covering
// everything, whatever a value's size or sign. What changed is who calls it
// that way: since B-116 the heatmap block only reaches for this flat band
// as `autoBands`' own fallback (see the "autoBands" suite below), once a
// grid's own values turn out not worth fitting a scale to at all (a
// checkbox field, or every painted value the same). A grid worth scaling no
// longer goes through `readBands(undefined)` at all.
describe("bandFor — no bands means one flat colour, not a scale fitted to the data", () => {
    const flat = readBands(undefined);

    it("the default is a single band at full alpha", () => {
        expect(flat).toHaveLength(1);
        expect(flat[0]?.alpha).toBe(1);
    });

    it("a deep negative, zero and a very large value all resolve to that same band", () => {
        for (const v of [-1000, 0, 1_000_000]) {
            expect(bandFor(flat, v)).toBe(flat[0]);
        }
    });
});

// B-116: `autoBands` is what actually decides, per grid, whether a scale is
// worth fitting at all — `readBands(undefined)`'s own flat band above is
// only ever reached once this returns null.
describe("autoBands — a scale fitted to the grid's own values", () => {
    it("a normal spread divides into 4 equal quarters, top band open above", () => {
        expect(autoBands([10, 50, 90], false)).toEqual([
            { min: 70, alpha: 1, label: "70+" },
            { min: 50, alpha: 0.72, label: "50–69" },
            { min: 30, alpha: 0.46, label: "30–49" },
            { min: 10, alpha: 0.22, label: "10–29" },
        ]);
    });

    it("negative values fit the same way, labels sign and all", () => {
        expect(autoBands([-10, -5, 0, 5], false).map((b) => b.label)).toEqual([
            "1+", "-3–0", "-6–-4", "-10–-7",
        ]);
    });

    it("a huge range still divides cleanly, no overflow or precision loss", () => {
        expect(autoBands([0, 1_000_000], false).map((b) => b.label)).toEqual([
            "750000+", "500000–749999", "250000–499999", "0–249999",
        ]);
    });

    it("floats get one decimal, the same rounding a stat card's own value would", () => {
        expect(autoBands([12.3, 45.6, 78.9], false).map((b) => b.label)).toEqual([
            "62.3+", "45.6–62.2", "29–45.5", "12.3–28.9",
        ]);
    });

    // A month's worth of `sleep_score`, 60 through 89: the exact fixture
    // `heatmap.test.ts` draws a legend from. Thresholds are rounded to
    // whole numbers (the data's own precision) BEFORE they become labels,
    // so "82+" is the actual boundary `bandFor` tests against, not a
    // display-only rounding of some other number underneath it.
    it("a month of whole-number sleep scores (60..89) rounds thresholds before labelling them", () => {
        const scores = Array.from({ length: 30 }, (_, i) => 60 + i);
        expect(autoBands(scores, false)).toEqual([
            { min: 82, alpha: 1, label: "82+" },
            { min: 75, alpha: 0.72, label: "75–81" },
            { min: 67, alpha: 0.46, label: "67–74" },
            { min: 60, alpha: 0.22, label: "60–66" },
        ]);
    });

    describe("a span narrower than the data's own rounding grain (B-116 checker round 1)", () => {
        // A 0.3-wide spread quartered into 0.075 steps collides once rounded
        // to the data's own 1 decimal (80.3 would repeat); the precision
        // bumps to 2 decimals and every cut becomes distinct again.
        it("weight to one decimal (80.1, 80.2, 80.4) bumps to 2 decimals rather than repeat a label", () => {
            const bands = autoBands([80.1, 80.2, 80.4], false);
            expect(bands?.map((b) => b.label)).toEqual([
                "80.33+", "80.25–80.32", "80.17–80.24", "80.1–80.16",
            ]);
            const labels = bands?.map((b) => b.label) ?? [];
            expect(new Set(labels).size).toBe(labels.length);
            for (let i = 1; i < (bands?.length ?? 0); i++) {
                expect(bands![i - 1]!.min).toBeGreaterThan(bands![i]!.min);
            }
        });

        it("a rate to one decimal (0.3, 0.6) bumps the same way", () => {
            expect(autoBands([0.3, 0.6], false)?.map((b) => b.label)).toEqual([
                "0.52+", "0.45–0.51", "0.38–0.44", "0.3–0.37",
            ]);
        });

        // 0.05 already carries 2 decimals, the cap: there is no third
        // decimal to bump to, so a collision here would have to fall back
        // to dropping cuts instead — it does not, every quarter-cut still
        // lands on a distinct hundredth.
        it("a span already at the 2-decimal cap (0, 0.05) still produces distinct, non-inverted labels", () => {
            const bands = autoBands([0, 0.05], false);
            expect(bands?.map((b) => b.label)).toEqual(["0.04+", "0.03", "0.01–0.02", "0"]);
            for (let i = 1; i < (bands?.length ?? 0); i++) {
                expect(bands![i - 1]!.min).toBeGreaterThan(bands![i]!.min);
            }
        });
    });

    it("a value sitting exactly on a rounded threshold lands in the band its own label describes", () => {
        // 80.2 is exactly the second threshold, post-rounding (80.17 is
        // this fitted scale's actual boundary, not the label's "80.25").
        const bands = autoBands([80.1, 80.2, 80.4], false)!;
        expect(bandFor(bands, 80.1)?.label).toBe("80.1–80.16");
        expect(bandFor(bands, 80.2)?.label).toBe("80.17–80.24");
        expect(bandFor(bands, 80.4)?.label).toBe("80.33+");
    });

    it("a span so narrow even 2 decimals collide drops the colliding cuts instead of erroring", () => {
        // 1.01 and 1.02 quarter into steps of 0.0025: every cut but the
        // very top rounds either onto another cut or onto `min` itself at 2
        // decimals, the cap. The scale still comes back usable, just with
        // fewer bands (2, not 4) rather than a broken or duplicated label.
        const bands = autoBands([1.01, 1.02], false);
        expect(bands).toEqual([
            { min: 1.02, alpha: 1, label: "1.02+" },
            { min: 1.01, alpha: 0.72, label: "1.01" },
        ]);
    });

    it("a span so narrow even the dedupe fallback keeps nothing stays flat, not a broken scale", () => {
        // 1.001 and 1.002 differ by a thousandth, well under the 2-decimal
        // cap: every quarter-cut rounds onto another cut or onto `min`
        // itself, and once dropping those leaves nothing left to build a
        // band from, the whole grid falls back to flat rather than a scale
        // with zero real bands in it.
        expect(autoBands([1.001, 1.002], false)).toBeNull();
    });

    it("every painted value equal stays flat: there is no range to fit a scale to", () => {
        expect(autoBands([7, 7, 7], false)).toBeNull();
    });

    it("a single value stays flat the same way", () => {
        expect(autoBands([42], false)).toBeNull();
    });

    it("no values at all stays flat, not an empty scale", () => {
        expect(autoBands([], false)).toBeNull();
    });

    it("a boolean-only field stays flat whatever its values are", () => {
        // A ticked checkbox is always exactly 1: nothing here needs the
        // values at all once `allBool` is true, `bandFor`'s own bottom-band
        // fallback already treats an empty array the same as "no bands".
        expect(autoBands([1, 1, 1], true)).toBeNull();
        expect(autoBands([1, 2, 3], true)).toBeNull();
    });

    it("a NaN among the values is dropped, not propagated into a NaN band", () => {
        const withNaN = autoBands([NaN, 1, 2, 3, NaN], false);
        const withoutNaN = autoBands([1, 2, 3], false);
        expect(withNaN).toEqual(withoutNaN);
        for (const b of withNaN ?? []) {
            expect(Number.isNaN(b.min)).toBe(false);
        }
    });

    describe("a narrow integer spread — one band per distinct value instead of fractional cuts", () => {
        it("1..3: three distinct values, at most 4 bands, no fraction in a label", () => {
            expect(autoBands([1, 2, 3], false)).toEqual([
                { min: 3, alpha: 1, label: "3+" },
                { min: 2, alpha: 0.72, label: "2" },
                { min: 1, alpha: 0.46, label: "1" },
            ]);
        });

        it("1..2: only two distinct values present, only two bands", () => {
            expect(autoBands([1, 2, 1, 2], false)).toEqual([
                { min: 2, alpha: 1, label: "2+" },
                { min: 1, alpha: 0.72, label: "1" },
            ]);
        });

        it("0..4: a span of exactly 4 falls outside the narrow-spread rule, and the general quarter cut still lands on the same whole numbers", () => {
            expect(autoBands([0, 1, 2, 3, 4], false)).toEqual([
                { min: 3, alpha: 1, label: "3+" },
                { min: 2, alpha: 0.72, label: "2" },
                { min: 1, alpha: 0.46, label: "1" },
                { min: 0, alpha: 0.22, label: "0" },
            ]);
        });

        it("negative whole numbers narrow-spread the same way", () => {
            expect(autoBands([-2, -1, 0], false).map((b) => b.label)).toEqual(["0+", "-1", "-2"]);
        });

        it("adjacent labels never overlap: two distinct values two apart still read as a range, not a false match", () => {
            // 4 and 6 are both whole numbers two apart (span 2, under the
            // narrow-spread cutoff): the band for 4 has to stop before 6
            // starts, not repeat 6 or swallow it.
            const bands = autoBands([4, 6], false);
            expect(bands).toEqual([
                { min: 6, alpha: 1, label: "6+" },
                { min: 4, alpha: 0.72, label: "4–5" },
            ]);
        });
    });
});
