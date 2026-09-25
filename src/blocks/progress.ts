import type { NoteRecord } from "../core/source";
import type { BlockContext } from "./context";
import { selectNotes, readSource, unmatchedSource } from "../core/source";
import { aggregate } from "../core/aggregate";
import { readDateField } from "../core/note-date";
import { formatValue } from "../core/stat";
import { readProgress, percentOf, barWidth, type ProgressSpec } from "../core/progress";
import { readPeriod, filterByPeriod, dateFieldHasEffect } from "../core/period";
import { firstDayOfWeek } from "../adapters/datetime";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics } from "../shared/render";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN_ITEM = Object.keys(schema.blocks.progress.item);
const KNOWN_ROOT = Object.keys(schema.blocks.progress.root);

interface Bar {
    label: string;
    value: string;
    goal: string;
    unit?: string;
    percent: number | null;
    width: number;
    /** the config could not be read — the empty track must not read as a zero */
    broken: boolean;
    icon?: string;
    sub?: string;
}

export function renderProgress(ctx: BlockContext, source: string, el: HTMLElement): void {
    clearBlock(el);
    const { value, diagnostics } = parseConfig(source, { root: KNOWN_ROOT, item: KNOWN_ITEM });
    const diags: Diagnostic[] = [...diagnostics];
    const items = asItems(value);

    if (!items.length) {
        // A parse failure already said what was wrong; adding "the list is
        // empty" on top of "the block is empty" is noise, and the two read as
        // two separate problems.
        if (value !== null) diags.push({ level: "error", message: t("progress.empty") });
        renderDiagnostics(el, "progress", diags);
        return;
    }
    if (isRecord(value) && Array.isArray(value.items)) diags.push(...unknownKeys(value, KNOWN_ROOT));

    // One snapshot for the whole page, taken by the context.
    const notes = ctx.notes();
    // Taken once, so every bar on the page measures the same window.
    const today = new Date();
    const firstDay = firstDayOfWeek();
    const bars: Bar[] = [];

    for (const item of items) {
        diags.push(...unknownKeys(item, KNOWN_ITEM));

        const label = typeof item.label === "string" ? item.label : "";
        const { spec, diagnostics: barDiags } = readProgress(item, label);
        diags.push(...barDiags);

        const { spec: source, diagnostics: sourceDiags } = readSource(item);
        diags.push(...sourceDiags);
        const missing = unmatchedSource(notes, source);
        if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });
        const selected = selectNotes(notes, source);

        // Steers `period`'s window below and, inside `aggregate`, `streak`
        // and `latest` too — whether or not `period` is even set.
        const dateField = readDateField(item);

        const { spec: periodSpec, diagnostics: periodDiags } = readPeriod(item, label, dateField);
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

        // `progress` has no `trend`, so only `period` and the date-reading
        // aggregates make `date_field` do anything. Judged by whether
        // `period` was written at all, not whether it parsed — an
        // unreadable `period` already has its own diagnostic above, and this
        // one would only double up on the same mistake.
        if (dateField && spec && !dateFieldHasEffect(item.period !== undefined, spec.agg)) {
            const cardLabel = label ? `"${label}"` : t("stats.unlabeledCard");
            diags.push({ level: "warning", message: t("period.dateFieldUnused", { card: cardLabel }) });
        }

        bars.push(toBar(counted, spec, label, item, dateField));
    }

    // Diagnostics before the bars: an error must be seen before an empty track.
    renderDiagnostics(el, "progress", diags);

    const wrap = el.createDiv({ cls: "dashy-progress" });
    for (const bar of bars) {
        const complete = bar.percent !== null && bar.percent >= 100;
        const state = bar.broken ? " is-broken" : complete ? " is-complete" : "";
        const row = wrap.createDiv({ cls: `dashy-progress-row${state}` });

        const head = row.createDiv({ cls: "dashy-progress-head" });
        if (bar.icon) head.createSpan({ cls: "dashy-progress-icon", text: bar.icon });
        head.createSpan({ cls: "dashy-progress-label", text: bar.label });

        const value = head.createSpan({ cls: "dashy-progress-value" });
        value.createSpan({ text: `${bar.value} / ${bar.goal}${bar.unit ? ` ${bar.unit}` : ""}` });
        if (bar.percent !== null) {
            // A real space, not just the CSS margin: otherwise the text reads
            // "100 km55%" when copied or spoken, and runs together outright if
            // the stylesheet ever fails to load.
            value.appendText(" ");
            value.createSpan({ cls: "dashy-progress-percent", text: `${bar.percent}%` });
        }

        const track = row.createDiv({ cls: "dashy-progress-track" });
        track.createDiv({ cls: "dashy-progress-fill" }).style.width = `${bar.width}%`;

        if (bar.sub) row.createDiv({ cls: "dashy-progress-sub", text: bar.sub });
    }
}

function toBar(
    selected: readonly NoteRecord[],
    spec: ProgressSpec | null,
    label: string,
    item: Record<string, unknown>,
    dateField?: string,
): Bar {
    const bar: Bar = {
        label: label || spec?.field || "",
        value: "—",
        goal: "—",
        percent: null,
        width: 0,
        broken: spec === null,
    };
    if (typeof item.icon === "string") bar.icon = item.icon;
    if (typeof item.sub === "string") bar.sub = item.sub;
    if (!spec) return bar;

    const current = aggregate(selected, { agg: spec.agg, field: spec.field, dateField });

    bar.value = formatValue(current, spec.precision);
    bar.goal = formatValue(spec.goal, spec.precision);
    bar.percent = percentOf(current, spec.goal);
    bar.width = barWidth(bar.percent);
    if (spec.unit) bar.unit = spec.unit;
    return bar;
}
