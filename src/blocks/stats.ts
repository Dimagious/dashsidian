import type { App } from "obsidian";
import { snapshot } from "../adapters/vault";
import { selectNotes } from "../core/source";
import { aggregate } from "../core/aggregate";
import { readStat, formatValue, type StatSpec } from "../core/stat";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { renderDiagnostics } from "../shared/render";
import schema from "./schema.json";

/** Ключи берутся из schema.json — того же источника, из которого собирается скилл. */
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
        diags.push({ level: "error", message: "Список карточек пуст. Ожидается `items:` или массив." });
        renderDiagnostics(el, "stats", diags);
        return;
    }
    // Корневые ключи проверяем только у формы с `items:` — иначе одиночная
    // карточка объектом получила бы предупреждения на собственные ключи.
    if (isRecord(value) && Array.isArray(value.items)) diags.push(...unknownKeys(value, KNOWN_ROOT));

    const columns = isRecord(value) && typeof value.columns === "number" ? value.columns : 3;

    // Снимок берётся один на блок, а не на карточку: обход хранилища не бесплатный.
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

    // Диагностика — до карточек: ошибку надо увидеть раньше, чем прочерк.
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
        if (card.unit && !isEmpty) valueEl.createSpan({ cls: "dashy-stat-unit", text: card.unit });

        if (card.label) box.createDiv({ cls: "dashy-stat-label", text: card.label });
        if (card.sub) box.createDiv({ cls: "dashy-stat-sub", text: card.sub });
    }
}

/** Отбор под карточку и сведение в текст. Пустой spec — карточка с прочерком. */
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
