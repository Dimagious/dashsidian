import type { NoteRecord } from "../core/source";
import type { BlockContext } from "./context";
import { selectNotes } from "../core/source";
import { aggregate, series } from "../core/aggregate";
import { sparkBars } from "../core/sparkline";
import { readStat, formatValue, type StatSpec } from "../core/stat";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics } from "../shared/render";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN_ITEM = Object.keys(schema.blocks.stats.item);
const KNOWN_ROOT = Object.keys(schema.blocks.stats.root);

interface Card {
    label: string;
    text: string;
    icon?: string;
    unit?: string;
    sub?: string;
    /** bar heights in percent, empty when no trend was asked for */
    trend: number[];
}

export function renderStats(ctx: BlockContext, source: string, el: HTMLElement): void {
    clearBlock(el);
    const { value, diagnostics } = parseConfig(source, { root: KNOWN_ROOT, item: KNOWN_ITEM });
    const diags: Diagnostic[] = [...diagnostics];
    const items = asItems(value);

    if (!items.length) {
        // A parse failure already said what was wrong; adding "the list is
        // empty" on top of "the block is empty" is noise, and the two read as
        // two separate problems.
        if (value !== null) diags.push({ level: "error", message: t("stats.empty") });
        renderDiagnostics(el, "stats", diags);
        return;
    }
    // Root keys are only checked for the `items:` shape — otherwise a single
    // card written as an object would get warnings about its own keys.
    if (isRecord(value) && Array.isArray(value.items)) diags.push(...unknownKeys(value, KNOWN_ROOT));

    const columns = isRecord(value) && typeof value.columns === "number" ? value.columns : 3;

    // One snapshot for the whole page, taken by the context.
    const notes = ctx.notes();
    const cards: Card[] = [];

    for (const item of items) {
        diags.push(...unknownKeys(item, KNOWN_ITEM));

        const label = typeof item.label === "string" ? item.label : "";
        const { spec, diagnostics: statDiags } = readStat(item, label);
        diags.push(...statDiags);

        const selected = selectFor(notes, item);
        const card: Card = {
            label: label || spec?.field || "",
            text: cardValue(selected, spec),
            trend: spec?.trend && spec.field
                ? sparkBars(series(selected, spec.field, spec.trend))
                : [],
        };
        if (typeof item.icon === "string") card.icon = item.icon;
        if (spec?.unit) card.unit = spec.unit;
        if (typeof item.sub === "string") card.sub = item.sub;
        cards.push(card);
    }

    // Diagnostics before the cards: an error must be seen before a dash is.
    renderDiagnostics(el, "stats", diags);

    const grid = el.createDiv({ cls: "dashy-stats" });
    grid.style.setProperty("--dashy-stat-columns", String(Math.max(1, Math.min(6, columns))));

    for (const card of cards) {
        const box = grid.createDiv({ cls: "dashy-stat" });
        if (card.icon) box.createSpan({ cls: "dashy-stat-icon", text: card.icon });

        const isEmpty = card.text === "—";
        const valueEl = box.createDiv({
            cls: isEmpty ? "dashy-stat-value is-empty" : "dashy-stat-value",
            text: card.text,
        });
        if (card.unit && !isEmpty) {
            // A real space for the same reason as in progress: "14 500st" is
            // what a screen reader would otherwise say.
            valueEl.appendText(" ");
            valueEl.createSpan({ cls: "dashy-stat-unit", text: card.unit });
        }

        if (card.trend.length) {
            const spark = box.createDiv({ cls: "dashy-stat-trend" });
            for (const height of card.trend) {
                spark.createSpan({ cls: "dashy-stat-bar" }).style.height = `${height}%`;
            }
        }

        if (card.label) box.createDiv({ cls: "dashy-stat-label", text: card.label });
        if (card.sub) box.createDiv({ cls: "dashy-stat-sub", text: card.sub });
    }
}

/** The notes one card works over. Taken once: the value and the trend share it. */
function selectFor(notes: readonly NoteRecord[], item: Record<string, unknown>): NoteRecord[] {
    return selectNotes(notes, {
        source: typeof item.source === "string" ? item.source : undefined,
        tag: typeof item.tag === "string" ? item.tag : undefined,
        where: typeof item.where === "string" ? item.where : undefined,
    });
}

/** No spec — a card with a dash. */
function cardValue(selected: readonly NoteRecord[], spec: StatSpec | null): string {
    if (!spec) return "—";
    return formatValue(aggregate(selected, { agg: spec.agg, field: spec.field }), spec.precision);
}
