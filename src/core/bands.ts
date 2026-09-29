import { isRecord, describeValue } from "../shared/parse";
import { roundedValue } from "./stat";
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

/**
 * A band boundary in the same shape `readBands`' own thresholds-only form
 * uses: the top band open above ("90+"), the rest capped just under the
 * band above ("80–89"). `lo` and `aboveLo` are already rounded to `p`
 * decimals (`fitGeneralThresholds`/the narrow-integer-spread branch below
 * both do this before calling in), so the label is built by subtracting one
 * unit at that same precision — never by re-deriving it from a raw,
 * unrounded threshold, which is what let a label disagree with the actual
 * boundary a value is tested against (a threshold rounded for display to
 * "81.8" while `bandFor` still compared against the raw 81.75).
 *
 * Collapses to a bare number, no dash, when the upper bound would land on
 * or below the lower one: two of `autoBands`' own bands can end up sharing
 * a boundary this way once rounded for display (adjacent whole numbers in
 * the narrow-integer-spread branch, or two quarter-cuts a hair apart), and
 * a label like "2–2" says nothing "2" does not already say on its own.
 */
function boundaryLabel(lo: number, aboveLo: number | undefined, p: number): string {
    if (aboveLo === undefined) return `${lo}+`;
    const unit = 10 ** -p;
    const hi = roundedValue(aboveLo - unit, p);
    return hi <= lo ? `${lo}` : `${lo}–${hi}`;
}

/** `thresholds`, descending, turned into bands: `alphaFor` down from the top, `boundaryLabel` for each one against the threshold above it. */
function bandsFromThresholds(thresholds: readonly number[], precision: number): Band[] {
    return thresholds.map((threshold, i) => {
        const lo = roundedValue(threshold, precision);
        const above = thresholds[i - 1];
        return {
            min: threshold,
            alpha: alphaFor(i),
            label: boundaryLabel(lo, above === undefined ? undefined : roundedValue(above, precision), precision),
        };
    });
}

/** How many decimal places a number was written with — `12` is 0, `12.3` is 1, `12.30` would also read as 1 (JS drops the trailing zero before this ever sees it). */
function decimalPlaces(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const s = Math.abs(value).toString();
    const dot = s.indexOf(".");
    return dot === -1 ? 0 : s.length - dot - 1;
}

/** Bottom-capped at 2: a third decimal place would rarely be a deliberate reading and reads as noise on a legend. */
const MAX_PRECISION = 2;

/** Every cut strictly greater than the one above it, and strictly above `min` — a real, unambiguous descending run. */
function strictlyDescendingAboveMin(cuts: readonly number[], min: number): boolean {
    return cuts.every((c, i) => c > min && (i === 0 || cuts[i - 1]! > c));
}

/** Keeps only the cuts that are both above `min` and strictly below whatever was kept just before them, in order — the last-resort way to make a colliding set of cuts usable instead of throwing the whole scale away. */
function dedupeDescendingAboveMin(cuts: readonly number[], min: number): number[] {
    const kept: number[] = [];
    for (const c of cuts) {
        if (c <= min) continue;
        if (kept.length > 0 && c >= kept[kept.length - 1]!) continue;
        kept.push(c);
    }
    return kept;
}

/**
 * The general case's thresholds and the precision they were rounded at:
 * equal quarters of the data's own range, `min + (max - min) * k / 4` for
 * `k = 3, 2, 1`, plus `min` itself as the exact bottom threshold (never
 * rounded — rounding it could round the true minimum's own band boundary
 * past the minimum itself).
 *
 * The quarter-cuts, though, only mean anything once rounded to a precision
 * the reader would actually write: `p`, the most decimal places any painted
 * value in this grid was written with, capped at `MAX_PRECISION`. A span
 * narrower than the rounding grain collapses two cuts onto the same number
 * once rounded (a 0.3-wide spread quartered into steps of 0.075, rounded to
 * the data's own 1 decimal, repeats "80.3" twice) — tried again one decimal
 * finer first, and only once that still collides are the offending cuts
 * simply dropped, leaving fewer than 4 bands rather than a broken label.
 *
 * `null` only once dropping still leaves nothing usable at all (every cut
 * collided or fell at or below `min`) — the caller falls back to the usual
 * flat single band.
 */
function fitGeneralThresholds(min: number, max: number, values: readonly number[]): { thresholds: number[]; precision: number } | null {
    const span = max - min;
    const dataPrecision = Math.min(values.reduce((p, v) => Math.max(p, decimalPlaces(v)), 0), MAX_PRECISION);
    const attempts = dataPrecision < MAX_PRECISION ? [dataPrecision, dataPrecision + 1] : [dataPrecision];

    for (const p of attempts) {
        const cuts = [3, 2, 1].map((k) => roundedValue(min + (span * k) / 4, p));
        if (strictlyDescendingAboveMin(cuts, min)) return { thresholds: [...cuts, min], precision: p };
    }

    const p = MAX_PRECISION;
    const cuts = [3, 2, 1].map((k) => roundedValue(min + (span * k) / 4, p));
    const kept = dedupeDescendingAboveMin(cuts, min);
    return kept.length === 0 ? null : { thresholds: [...kept, min], precision: p };
}

/**
 * 4 bands fitted to a grid's own painted values (B-116), used only where
 * `bands:` was never written at all — an explicit `bands:` always wins
 * outright and never reaches this function. Alphas come from the same
 * `alphaFor` scheme an explicit 4-threshold `bands:` gets, so a fitted
 * scale and a hand-written one read as the same kind of thing.
 *
 * `null` means "draw the usual flat single band instead" — a caller that
 * gets it back paints exactly as it always did without `bands:`. That
 * happens whenever a scale would not actually say anything:
 *   - nothing painted in this grid at all;
 *   - every painted value the same (a single distinct value included) —
 *     nothing here divides by the data's own range, so there is no
 *     "spread" to fit a scale to;
 *   - the field is boolean-only (`allBool`, a ticked checkbox): a ticked
 *     day is always exactly 1, and shading "how ticked" would invent a
 *     distinction the data itself never makes.
 *
 * A narrow integer spread (every painted value a whole number, and the
 * highest is less than 4 above the lowest) skips `fitGeneralThresholds`
 * entirely: dividing `1..3` into quarters lands boundaries at 1.5 and 2.25,
 * which either miss every real value or duplicate a label once rounded for
 * display. Below that spread there are at most 4 distinct whole numbers to
 * begin with, so each one simply gets its own band instead — equivalent to
 * asking `fitGeneralThresholds` for a scale, but without the quarter-cut
 * detour a range this narrow gets no value from.
 */
export function autoBands(values: readonly number[], allBool: boolean): Band[] | null {
    if (allBool) return null;

    const finite = values.filter((v) => Number.isFinite(v));
    if (finite.length === 0) return null;

    const min = Math.min(...finite);
    const max = Math.max(...finite);
    if (min === max) return null;

    const span = max - min;
    const allIntegers = finite.every((v) => Number.isInteger(v));

    if (allIntegers && span < 4) {
        const thresholds = Array.from(new Set(finite)).sort((a, b) => b - a).slice(0, DEFAULT_ALPHAS.length);
        return bandsFromThresholds(thresholds, 0);
    }

    const fitted = fitGeneralThresholds(min, max, finite);
    return fitted ? bandsFromThresholds(fitted.thresholds, fitted.precision) : null;
}
