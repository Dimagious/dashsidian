import type { BlockContext } from "./context";
import { selectNotes, readSource, unmatchedSource } from "../core/source";
import { aggregate, series } from "../core/aggregate";
import { sparkBars } from "../core/sparkline";
import { readStat, formatValue } from "../core/stat";
import {
    readPeriod,
    readCompare,
    filterByPeriod,
    filterByWindow,
    previousPeriodWindow,
    formatDelta,
    deltaTone,
    compareCaption,
    type DeltaTone,
} from "../core/period";
import { firstDayOfWeek } from "../adapters/datetime";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics } from "../shared/render";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN_ITEM = Object.keys(schema.blocks.stats.item);
const KNOWN_ROOT = Object.keys(schema.blocks.stats.root);

interface Delta {
    /** decorative glyph, kept out of what a screen reader reads as meaningful */
    arrow: string;
    /** the sign-and-number part: it carries the meaning on its own */
    text: string;
    tone: DeltaTone;
    /** what the number compares with, e.g. "vs the same days last week: 1" */
    title: string;
}

interface Card {
    label: string;
    text: string;
    icon?: string;
    unit?: string;
    sub?: string;
    /** bar heights in percent, empty when no trend was asked for */
    trend: number[];
    /** unset when `compare` was not asked for, or either side had nothing to count */
    delta?: Delta;
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
    // Taken once, so every card on the page measures the same window.
    const today = new Date();
    const firstDay = firstDayOfWeek();
    const cards: Card[] = [];

    for (const item of items) {
        diags.push(...unknownKeys(item, KNOWN_ITEM));

        const label = typeof item.label === "string" ? item.label : "";
        const { spec, diagnostics: statDiags } = readStat(item, label);
        diags.push(...statDiags);

        const { spec: source, diagnostics: sourceDiags } = readSource(item);
        diags.push(...sourceDiags);
        const missing = unmatchedSource(notes, source);
        if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });
        const selected = selectNotes(notes, source);

        // `trend` keeps its own trailing window and reads `selected`
        // unfiltered — `period` narrows only what the number itself counts.
        const { spec: periodSpec, diagnostics: periodDiags } = readPeriod(item, label);
        diags.push(...periodDiags);
        let counted = selected;
        if (periodSpec) {
            const windowed = filterByPeriod(selected, periodSpec.period, today, firstDay, periodSpec.dateField);
            if (selected.length && !windowed.anyDated) {
                const cardLabel = label ? `"${label}"` : t("stats.unlabeledCard");
                diags.push({
                    level: "warning",
                    message: periodSpec.dateField
                        ? t("period.noDatedNotesField", { card: cardLabel, field: periodSpec.dateField })
                        : t("period.noDatedNotes", { card: cardLabel }),
                });
            }
            counted = windowed.notes;
        }

        const { spec: compareSpec, diagnostics: compareDiags } =
            readCompare(item, label, periodSpec !== null, spec?.agg);
        diags.push(...compareDiags);

        const current = spec ? aggregate(counted, { agg: spec.agg, field: spec.field }) : null;

        const card: Card = {
            label: label || spec?.field || "",
            text: formatValue(current, spec?.precision),
            trend: spec?.trend && spec.field
                ? sparkBars(series(selected, spec.field, spec.trend, today))
                : [],
        };
        if (typeof item.icon === "string") card.icon = item.icon;
        if (spec?.unit) card.unit = spec.unit;
        if (typeof item.sub === "string") card.sub = item.sub;

        // Compared to the same stretch of the previous period, on the same
        // selection and the same aggregate. `count` and `streak` never
        // return null even over an empty window, so "nothing to count" is
        // decided from the window itself (no notes at all) rather than from
        // the aggregate — a phantom delta against a made-up 0 is worse than
        // no delta. `current !== null` still covers a field aggregate whose
        // window has notes but none carrying the field.
        if (compareSpec && periodSpec && spec && counted.length && current !== null) {
            const previousBounds = previousPeriodWindow(periodSpec.period, today, firstDay);
            const previousFiltered = filterByWindow(selected, previousBounds, periodSpec.dateField);
            const previous = previousFiltered.notes.length
                ? aggregate(previousFiltered.notes, { agg: spec.agg, field: spec.field })
                : null;
            if (previous !== null) {
                const format = formatDelta(current, previous, spec.precision);
                card.delta = {
                    arrow: format.arrow,
                    text: format.text,
                    tone: deltaTone(format.direction, compareSpec.better),
                    title: compareCaption(periodSpec.period, formatValue(previous, spec.precision)),
                };
            }
        }

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

        if (card.delta) {
            const deltaEl = box.createDiv({
                cls: `dashy-stat-delta dashy-stat-delta-${card.delta.tone}`,
                title: card.delta.title,
            });
            // The arrow is decorative; the sign on the number already carries
            // the meaning, so a screen reader loses nothing by skipping it.
            deltaEl.createSpan({ cls: "dashy-stat-delta-arrow", attr: { "aria-hidden": "true" }, text: card.delta.arrow });
            deltaEl.appendText(` ${card.delta.text}`);
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
