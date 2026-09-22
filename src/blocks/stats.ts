import type { App } from "obsidian";
import { snapshot } from "../adapters/vault";
import { selectNotes } from "../core/source";
import { aggregate } from "../core/aggregate";
import { readStat, formatValue, type StatSpec } from "../core/stat";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { renderDiagnostics } from "../shared/render";
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
}

export function renderStats(app: App, source: string, el: HTMLElement): void {
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

    // One snapshot per block, not per card: walking the vault is not free.
    const notes = snapshot(app);
    const cards: Card[] = [];

    for (const item of items) {
        diags.push(...unknownKeys(item, KNOWN_ITEM));

        const label = typeof item.label === "string" ? item.label : "";
        const { spec, diagnostics: statDiags } = readStat(item, label);
        diags.push(...statDiags);

        const card: Card = { label: label || spec?.field || "", text: cardText(notes, item, spec) };
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

        if (card.label) box.createDiv({ cls: "dashy-stat-label", text: card.label });
        if (card.sub) box.createDiv({ cls: "dashy-stat-sub", text: card.sub });
    }
}

/** Selection for one card, reduced to text. No spec — a card with a dash. */
function cardText(
    notes: ReturnType<typeof snapshot>,
    item: Record<string, unknown>,
    spec: StatSpec | null,
): string {
    if (!spec) return "—";
    const selected = selectNotes(notes, {
        source: typeof item.source === "string" ? item.source : undefined,
        tag: typeof item.tag === "string" ? item.tag : undefined,
        where: typeof item.where === "string" ? item.where : undefined,
    });
    return formatValue(aggregate(selected, { agg: spec.agg, field: spec.field }), spec.precision);
}
