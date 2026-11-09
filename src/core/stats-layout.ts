/**
 * How a `stats` block lays its numbers out: a grid of cards, or one line of
 * text for a home page header (B-150). Pure layer.
 *
 * The inline line has no room for a sparkline or a caption under the label,
 * so it drops `trend`, `sub` and `origin`, and a `group_by` card whole (B-213).
 * Dropping a setting the author wrote without saying so is the one thing a
 * block must never do, so each dropped key gets one warning per block,
 * naming the cards that set it.
 */

import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";
import { hasGroupBy } from "./group-by";

export type StatsLayout = "cards" | "inline";

const LAYOUTS: readonly StatsLayout[] = ["cards", "inline"];

function isStatsLayout(value: unknown): value is StatsLayout {
    return typeof value === "string" && (LAYOUTS as readonly string[]).includes(value);
}

export interface StatsLayoutOutcome {
    layout: StatsLayout;
    diagnostics: Diagnostic[];
}

/**
 * Reads `layout` off the block's root map, or `null` when the block was
 * written as a bare list or a single card and has no root keys at all.
 * Unset means `cards`, the look every block had before B-150. An
 * unrecognised value warns, naming the options, and falls back to `cards`.
 */
export function readStatsLayout(root: Record<string, unknown> | null): StatsLayoutOutcome {
    const raw = root?.layout;
    if (raw === undefined) return { layout: "cards", diagnostics: [] };
    if (isStatsLayout(raw)) return { layout: raw, diagnostics: [] };
    return {
        layout: "cards",
        diagnostics: [{ level: "warning", message: t("stats.layoutInvalid", { value: describeValue(raw) }) }],
    };
}

/** A card as every other stats message names it: its label in quotes, or a stand-in. */
function cardName(item: Record<string, unknown>): string {
    return typeof item.label === "string" && item.label ? `"${item.label}"` : t("stats.unlabeledCard");
}

/**
 * What `layout: inline` cannot show, said once per block rather than once
 * per card: a line of five numbers with `sub` on each would otherwise carry
 * five copies of the same sentence. `columns` has no grid to size, so it is
 * reported too. Empty for `layout: cards`.
 */
export function inlineLayoutDiagnostics(
    layout: StatsLayout,
    root: Record<string, unknown> | null,
    items: readonly Record<string, unknown>[],
): Diagnostic[] {
    if (layout !== "inline") return [];
    const out: Diagnostic[] = [];
    if (root?.columns !== undefined) {
        out.push({ level: "warning", message: t("stats.inlineColumnsIgnored") });
    }
    // B-213: a ranked list is no item of a line. Its own keys are not
    // listed again below: the whole card is what goes missing.
    const grouped = items.filter(hasGroupBy);
    if (grouped.length) {
        out.push({ level: "warning", message: t("stats.inlineGroupByHidden", { cards: grouped.map(cardName).join(", ") }) });
    }
    const plain = items.filter((item) => !hasGroupBy(item));
    const withTrend = plain.filter((item) => item.trend !== undefined).map(cardName);
    if (withTrend.length) {
        out.push({ level: "warning", message: t("stats.inlineTrendHidden", { cards: withTrend.join(", ") }) });
    }
    const withSub = plain.filter((item) => item.sub !== undefined).map(cardName);
    if (withSub.length) {
        out.push({ level: "warning", message: t("stats.inlineSubHidden", { cards: withSub.join(", ") }) });
    }
    // B-149: the note or date a value came from is a caption too.
    const withOrigin = plain.filter((item) => item.origin !== undefined).map(cardName);
    if (withOrigin.length) {
        out.push({ level: "warning", message: t("stats.inlineOriginHidden", { cards: withOrigin.join(", ") }) });
    }
    return out;
}
