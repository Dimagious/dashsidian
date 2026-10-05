/**
 * How a `stats` block lays its numbers out: a grid of cards, or one line of
 * text for a home page header (B-150). Pure layer.
 *
 * The inline line has no room for a sparkline or a caption under the label,
 * so it drops `trend` and `sub`. Dropping a setting the author wrote without
 * saying so is the one thing a block must never do, so each dropped key gets
 * one warning per block, naming the cards that set it.
 */

import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

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
    const withTrend = items.filter((item) => item.trend !== undefined).map(cardName);
    if (withTrend.length) {
        out.push({ level: "warning", message: t("stats.inlineTrendHidden", { cards: withTrend.join(", ") }) });
    }
    const withSub = items.filter((item) => item.sub !== undefined).map(cardName);
    if (withSub.length) {
        out.push({ level: "warning", message: t("stats.inlineSubHidden", { cards: withSub.join(", ") }) });
    }
    return out;
}
