import type { NoteRecord } from "../core/source";
import type { BlockContext } from "./context";
import { selectNotes, unmatchedSource } from "../core/source";
import { readBlockSelection, inheritSelection } from "../core/inherit";
import { aggregate, classifyField, classifyValues } from "../core/aggregate";
import { readDateField } from "../core/note-date";
import { formatReading, showsDuration, showsClock, durationDiagnostics } from "../core/stat";
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
/** Keys a card inherits from the block root: the ones the schema declares at both levels. */
const SHARED = KNOWN_ROOT.filter((key) => KNOWN_ITEM.includes(key));

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
    const { value, diagnostics } = parseConfig(source, { root: KNOWN_ROOT, item: KNOWN_ITEM, bareItem: true });
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

    const columns = isRecord(value) && typeof value.columns === "number" ? value.columns : 1;

    // One snapshot for the whole page, taken by the context.
    const notes = ctx.notes();
    // Taken once, so every bar on the page measures the same window.
    const today = ctx.today();
    const firstDay = firstDayOfWeek();
    const bars: Bar[] = [];

    // Same as stats: a root selection is read, and reported on, once.
    const block = readBlockSelection(value, SHARED);
    diags.push(...block.diagnostics);
    const rootMissing = unmatchedSource(notes, block.source);
    if (rootMissing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: rootMissing }) });

    for (const own of items) {
        diags.push(...unknownKeys(own, KNOWN_ITEM));
        const { item, source, diagnostics: sourceDiags } = inheritSelection(own, block);

        const label = typeof item.label === "string" ? item.label : "";
        const { spec, diagnostics: barDiags } = readProgress(item, label);
        diags.push(...barDiags);

        diags.push(...sourceDiags);
        const missing = own.source !== undefined ? unmatchedSource(notes, source) : null;
        if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });
        const selected = selectNotes(notes, source);

        // Same check as the stats card (B-111): a field with no usable value
        // anywhere in the selection is a dash-worthy warning, not a silent
        // zero — checked before `period` narrows it, so an otherwise-fine
        // field that is merely absent from this window stays the B-079
        // plain, unwarned zero/dash.
        if (spec?.field && selected.length) {
            const fieldStatus = classifyField(selected, spec.field);
            if (fieldStatus !== "ok") {
                const cardLabel = label ? `"${label}"` : t("stats.unlabeledCard");
                diags.push({
                    level: "warning",
                    message: fieldStatus === "missing"
                        ? t("stats.fieldMissing", { card: cardLabel, field: spec.field })
                        : t("stats.fieldNotNumeric", { card: cardLabel, field: spec.field }),
                });
            }
        }

        // Durations (B-121), judged over the whole selection like the check
        // above: the value and the goal share one format.
        const kinds = spec?.field ? classifyValues(selected, [spec.field]) : { kind: "none" as const };
        const duration = spec ? showsDuration(spec.agg, kinds.kind) : false;
        // B-145: race times written to the second read as `0:18:51`, the goal too.
        const clock = spec ? showsClock(spec.agg, kinds) : false;
        if (spec) diags.push(...durationDiagnostics(spec, kinds, label ? `"${label}"` : t("stats.unlabeledCard")));

        // Steers `period`'s window below and, inside `aggregate`, `streak`,
        // `current_streak` and `latest` too — whether or not `period` is even set.
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
        // one would only double up on the same mistake. Only a bar's own
        // `date_field` is judged, as in stats.
        if (dateField && spec && readDateField(own) && !dateFieldHasEffect(item.period !== undefined, spec.agg)) {
            const cardLabel = label ? `"${label}"` : t("stats.unlabeledCard");
            diags.push({ level: "warning", message: t("period.dateFieldUnused", { card: cardLabel }) });
        }

        bars.push(toBar(counted, spec, label, item, today, duration, clock, dateField));
    }

    // Diagnostics before the bars: an error must be seen before an empty track.
    renderDiagnostics(el, "progress", diags);

    const cols = Math.max(1, Math.min(4, columns));
    // `is-multi` lets a phone narrow a several-column layout to two, the way
    // the other grid blocks do, without touching the one-bar-per-row default.
    const wrap = el.createDiv({ cls: cols > 1 ? "dashy-progress is-multi" : "dashy-progress" });
    wrap.style.setProperty("--dashy-progress-columns", String(cols));
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
    today: Date,
    duration: boolean,
    clock: boolean,
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

    const current = aggregate(selected, {
        agg: spec.agg,
        field: spec.field,
        dateField,
        atLeast: spec.atLeast,
        atMost: spec.atMost,
        days: spec.days,
        skipField: spec.skipField,
        today,
    });

    bar.value = formatReading(current, spec.precision, duration, clock);
    bar.goal = formatReading(spec.goal, spec.precision, duration, clock);
    bar.percent = percentOf(current, spec.goal);
    bar.width = barWidth(bar.percent);
    // A duration already carries its units (`durationDiagnostics` warned).
    if (spec.unit && !duration) bar.unit = spec.unit;
    return bar;
}
