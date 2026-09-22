import { isRecord, describeValue } from "../shared/parse";
import { t } from "../i18n";

/** A colouring band: everything >= min gets its own alpha. */
export interface Band {
    min: number;
    alpha: number;
    label: string;
}

/** Default alphas, from the top band down. */
export const DEFAULT_ALPHAS = [1, 0.72, 0.46, 0.22];

function alphaFor(i: number): number {
    return DEFAULT_ALPHAS[Math.min(i, DEFAULT_ALPHAS.length - 1)] ?? 0.22;
}

/**
 * Parses `bands`. Two shapes:
 *   [90, 80, 60]                     — thresholds only, the rest is filled in
 *   [{ min, alpha, label }, …]       — the full form
 *
 * Bands always come back sorted by descending min so that lookup is a
 * first-match search. The top band is open above ("90+"), the others are
 * capped by the previous one ("80–89"). The bottom band is NOT open below in
 * its label: "60–79" is more honest than "60+", because values under 60 do
 * land in it but the label does not claim otherwise.
 */
export function readBands(raw: unknown): Band[] {
    if (!Array.isArray(raw) || raw.length === 0) {
        return [{ min: Number.NEGATIVE_INFINITY, alpha: 1, label: t("bands.hasData") }];
    }

    if (raw.every((v) => typeof v === "number")) {
        const nums = [...raw].sort((a, b) => b - a);
        return nums.map((min, i) => ({
            min,
            alpha: alphaFor(i),
            label: i === 0 ? `${min}+` : `${min}–${(nums[i - 1] ?? min) - 1}`,
        }));
    }

    return raw
        .filter(isRecord)
        .map((b, i) => ({
            min: typeof b.min === "number" ? b.min : Number.NEGATIVE_INFINITY,
            alpha: typeof b.alpha === "number" ? b.alpha : alphaFor(i),
            label: typeof b.label === "string" ? b.label : t("bands.from", { min: describeValue(b.min ?? "") }),
        }))
        .sort((a, b) => b.min - a.min);
}

/**
 * The band a value falls into. Bands must be in descending order.
 *
 * A value under every threshold falls into the bottom band rather than into
 * nothing. The caller paints whatever comes back, and "nothing" used to mean
 * full strength: with `bands: [90, 80, 70]`, a night of 65 was painted exactly
 * like a night of 95, while the legend said the darkest swatch meant 90+.
 */
export function bandFor(bands: readonly Band[], value: number): Band | undefined {
    return bands.find((b) => value >= b.min) ?? bands[bands.length - 1];
}
