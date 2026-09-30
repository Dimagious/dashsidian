import type { BlockContext } from "./context";
import {
    firstDayOfWeek, formatDayMedium, formatDayShort, formatDayShortYear, formatDayWithWeekday, monthNamesShort, monthYearShort,
} from "../adapters/datetime";
import { isMobile } from "../adapters/platform";
import { selectNotes, readSource, unmatchedSource } from "../core/source";
import { classifyValues, type ValueKind } from "../core/aggregate";
import {
    readChart, bucketize, chartFieldStatus, chartCaption, spanText, formatPoint, formatAxis, bucketTooltip,
    type Bucket, type ChartSpec, type ChartFieldStatus, type ValueFormat,
} from "../core/chart";
import { chartDomain, niceTicks } from "../core/chart-scale";
import { chartLayout, type ChartLayout } from "../core/chart-layout";
import { parseDateKey } from "../core/calendar";
import { rgba } from "../core/palette";
import { parseConfig, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, internalLink } from "../shared/render";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json, the same source the agent skill is built from. */
const KNOWN = Object.keys(schema.blocks.chart.root);
/** A `series` entry's own keys, kept apart from the root's so `title` stays the heading there (ADR 0004). */
const KNOWN_ITEM = Object.keys(schema.blocks.chart.item);
/** Keys from neighbouring blocks and what they are called here (`layers` is `series`), from the schema too. */
const HINTS: Readonly<Record<string, string>> = schema.blocks.chart.hints;

/** What the plot is drawn at before the first real measurement (jsdom, a pane not laid out yet). */
const FALLBACK_WIDTH = 600;
const FALLBACK_HEIGHT = 160;
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * One `ResizeObserver` per block element, so the next redraw can disconnect
 * it before making a new one: `clearBlock` empties the element but an
 * observer keeps watching a detached node forever unless told to stop. The
 * heatmap's own pattern.
 */
const observers = new WeakMap<HTMLElement, ResizeObserver>();

function disconnectObserver(el: HTMLElement): void {
    observers.get(el)?.disconnect();
    observers.delete(el);
}

export function renderChart(ctx: BlockContext, source: string, el: HTMLElement): void | (() => void) {
    clearBlock(el);
    disconnectObserver(el);

    // Both key sets, so a root `title` stays the heading instead of drifting
    // into `label` through the global synonym, and a series entry's `title`
    // still means its label (ADR 0004, ADR 0005).
    const { value, diagnostics } = parseConfig(source, { root: KNOWN, item: KNOWN_ITEM });
    const diags: Diagnostic[] = [...diagnostics];

    if (!isRecord(value)) {
        renderDiagnostics(el, "chart", diags.length ? diags : [{ level: "error", message: t("chart.expectFields") }]);
        return;
    }
    diags.push(...unknownKeys(value, KNOWN, HINTS));

    const { spec, diagnostics: specDiags } = readChart(value, KNOWN_ITEM);
    diags.push(...specDiags);
    if (!spec) {
        renderDiagnostics(el, "chart", diags);
        return;
    }

    const { spec: selection, diagnostics: sourceDiags } = readSource(value);
    diags.push(...sourceDiags);
    const missing = unmatchedSource(ctx.notes(), selection);
    if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });
    const notes = selectNotes(ctx.notes(), selection);

    const firstDay = firstDayOfWeek();
    const { buckets, anyDated, diagnostics: bucketDiags } = bucketize(notes, spec, ctx.today(), firstDay);

    if (notes.length && !anyDated) {
        diags.push({
            level: "warning",
            message: spec.dateField
                ? t("chart.noDatedNotesField", { field: spec.dateField })
                : t("chart.noDatedNotes"),
        });
    }

    // Judged over the whole selection, before the window narrows it: a field
    // that is fine but has nothing in the last 30 days is an empty window,
    // drawn as such, not a broken config (B-111's rule for cards).
    const statuses = new Map<string, ChartFieldStatus>();
    for (const series of spec.series) {
        for (const field of series.fields) {
            if (!statuses.has(field)) statuses.set(field, chartFieldStatus(notes, field, spec.dateField));
        }
    }
    const usable = spec.series.some((s) => s.agg === "count" || s.fields.some((f) => statuses.get(f) === "ok"));
    if (!usable) {
        // Per field, the B-112 triage: a typo, a text field and a field
        // that only lives on undated notes need three different fixes.
        let errors = 0;
        for (const [field, status] of statuses) {
            const message = status === "missing"
                ? t("chart.fieldMissing", { field })
                : status === "not-numeric"
                    ? t("chart.fieldNotNumeric", { field })
                    // Nothing dated at all has already been said once above.
                    : anyDated ? t("chart.noData", { field }) : undefined;
            if (message) {
                diags.push({ level: "error", message });
                errors++;
            }
        }
        if (errors) {
            renderDiagnostics(el, "chart", diags);
            return;
        }
    } else {
        // Something carries the chart; a field that never contributed next
        // to it is most likely a typo, not a deliberate no-op.
        for (const [field, status] of statuses) {
            if (status !== "ok") diags.push({ level: "warning", message: t("chart.fieldUnused", { field }) });
        }
    }

    // B-121: a series whose values are all durations reads as durations; the
    // shared y axis and the goal only once every series does. `count`
    // counts notes, never time.
    const kinds: ValueKind[] = spec.series.map((s) => {
        if (s.agg === "count") return "plain";
        const kind = classifyValues(notes, s.fields);
        if (kind.kind === "mixed") {
            diags.push({
                level: "warning",
                message: t("chart.durationMixed", {
                    field: s.fields.join(", "), durationNote: kind.durationNote ?? "", plainNote: kind.plainNote ?? "",
                }),
            });
        }
        return kind.kind;
    });
    const seriesDuration = kinds.map((k) => k === "duration");
    const axisDuration = seriesDuration.some(Boolean) && kinds.every((k) => k === "duration" || k === "none");
    if (spec.unit) {
        spec.series.forEach((s, i) => {
            if (seriesDuration[i]) {
                diags.push({ level: "warning", message: t("chart.durationUnitIgnored", { unit: spec.unit ?? "", field: s.fields.join(", ") }) });
            }
        });
    }
    if (spec.goal?.duration && !kinds.includes("duration") && kinds.some((k) => k !== "none")) {
        diags.push({ level: "warning", message: t("chart.goalDurationOnPlain", { value: spec.goalText ?? "" }) });
    }

    diags.push(...bucketDiags);
    renderDiagnostics(el, "chart", diags);

    return drawChart(el, spec, buckets, { seriesDuration, axisDuration });
}

interface DrawOptions {
    /** per series: its tooltip values read as durations */
    seriesDuration: readonly boolean[];
    /** the y axis and the goal label read as durations */
    axisDuration: boolean;
}

/** An SVG element appended to `parent`, created in the parent's own document (popout windows). */
function svg<K extends keyof SVGElementTagNameMap>(
    parent: Element,
    tag: K,
    attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
    const node = parent.ownerDocument.createElementNS(SVG_NS, tag);
    for (const [name, v] of Object.entries(attrs)) node.setAttribute(name, String(v));
    parent.appendChild(node);
    return node;
}

/** The date a tooltip opens with: a day, "Week of Sun Sep 27, 2026", or a month and year. */
function bucketDate(bucket: Bucket, spec: ChartSpec): string {
    const start = parseDateKey(bucket.key);
    switch (spec.bucket) {
        case "day":
            return formatDayMedium(start);
        case "week":
            return t("chart.weekOf", { date: formatDayWithWeekday(start) });
        case "month":
            return monthYearShort(start);
    }
}

/**
 * An x label: a short day for `day` and `week`, a month name for `month`.
 * Once the window spans two years, the first label and the first label of
 * each new year carry the year (the heatmap's rule for its months, applied
 * to the labels actually shown, since a January may not be one of them).
 * `previous` is the bucket index of the label drawn before this one.
 */
function xLabel(buckets: readonly Bucket[], index: number, previous: number | undefined, spec: ChartSpec): string {
    const bucket = buckets[index];
    if (!bucket) return "";
    const start = parseDateKey(bucket.key);
    const year = bucket.key.slice(0, 4);
    const spansYears = buckets[0]?.key.slice(0, 4) !== buckets[buckets.length - 1]?.key.slice(0, 4);
    const withYear = spansYears && (previous === undefined || buckets[previous]?.key.slice(0, 4) !== year);
    if (spec.bucket !== "month") return withYear ? formatDayShortYear(start) : formatDayShort(start);
    return withYear ? monthYearShort(start) : (monthNamesShort()[start.getMonth()] ?? "");
}

/** The tap-to-read, tap-to-open state of one render on a phone (B-092, the heatmap's flow). */
interface TapState {
    selected: HTMLElement | null;
    selectedKey: string | null;
}

function drawChart(el: HTMLElement, spec: ChartSpec, buckets: readonly Bucket[], opts: DrawOptions): void | (() => void) {
    const caption = chartCaption(spec, buckets.length);
    const span = spanText(spec.bucket, buckets.length);
    const empty = buckets.every((b) => b.notes.length === 0);

    const axisFormat: ValueFormat = { duration: opts.axisDuration };
    if (spec.precision !== undefined) axisFormat.precision = spec.precision;
    const unit = opts.axisDuration ? undefined : spec.unit;

    const all = buckets.flatMap((b) => b.values);
    const domain = chartDomain(all, { zeroBased: spec.type === "bar", goal: spec.goal?.value });
    // A duration axis picks its own grain from the values (`niceTicks`); `precision` has no say there.
    const tickOptions = opts.axisDuration
        ? { duration: true }
        : { grain: spec.precision !== undefined ? 10 ** -spec.precision : 0.1 };
    const ticks = domain ? niceTicks(domain.min, domain.max, 3, tickOptions) : [];
    const tickLabels = ticks.map((v, i) => {
        const text = formatAxis(v, axisFormat);
        // The unit rides on the top label only: on every label it eats a
        // phone's width three times over.
        return unit && i === ticks.length - 1 ? t("chart.valueWithUnit", { value: text, unit }) : text;
    });
    const goalText = spec.goal
        ? t("chart.goalLabel", { value: formatPoint(spec.goal.value, unit ? { ...axisFormat, unit } : axisFormat) })
        : undefined;

    const wrap = el.createDiv({ cls: "dashy-chart" });
    wrap.createDiv({ cls: "dashy-chart-title", text: caption });
    const plot = wrap.createDiv({ cls: "dashy-chart-plot" });
    const graphic = svg(plot, "svg", {
        class: "dashy-chart-svg",
        role: "img",
        "aria-label": t("chart.summary", {
            kind: spec.type === "bar" ? t("chart.kindBar") : t("chart.kindLine"),
            series: spec.series.map((s) => s.label).join(", "),
            span,
        }),
    });
    const hitRow = plot.createDiv({ cls: "dashy-chart-hits" });
    if (empty) plot.createDiv({ cls: "dashy-chart-empty", text: t("chart.emptyRange", { span }) });

    const mobile = isMobile();
    const tap: TapState = { selected: null, selectedKey: null };
    let status: HTMLElement | undefined;

    const hits = buckets.map((bucket, b) => {
        const tooltip = bucketTooltip({
            date: bucketDate(bucket, spec),
            parts: spec.series.map((s, i) => {
                const v = bucket.values[i] ?? null;
                const format: ValueFormat = { duration: opts.seriesDuration[i] ?? false };
                if (spec.precision !== undefined) format.precision = spec.precision;
                if (spec.unit && !format.duration) format.unit = spec.unit;
                return { label: s.label, value: v === null ? null : formatPoint(v, format) };
            }),
            notes: bucket.notes,
            partial: bucket.partial,
        });
        const first = bucket.notes[0];
        const hit = spec.bucket === "day" && spec.link && first
            ? internalLink(hitRow, first.path, "dashy-chart-hit")
            : hitRow.createDiv({ cls: "dashy-chart-hit" });
        hit.setAttr("title", tooltip);
        hit.setAttr("aria-label", tooltip);
        hit.classList.toggle("is-partial", bucket.partial);
        if (mobile) {
            hit.addEventListener("click", (evt) => {
                // A second tap on the same bucket is left alone: on a `day`
                // bucket Obsidian's own `.internal-link` handling opens it.
                if (tap.selectedKey === bucket.key) return;
                evt.preventDefault();
                evt.stopPropagation();
                tap.selected?.classList.remove("is-selected");
                hit.classList.add("is-selected");
                tap.selected = hit;
                tap.selectedKey = bucket.key;
                status?.setText(tooltip);
            });
        }
        return { hit, b };
    });

    if (spec.series.length > 1 || goalText) {
        const legend = wrap.createDiv({ cls: "dashy-chart-legend" });
        if (spec.series.length > 1) {
            for (const s of spec.series) {
                const row = legend.createDiv({ cls: "dashy-chart-leg" });
                row.createDiv({ cls: "dashy-chart-swatch" }).style.backgroundColor = rgba(s.color, 1);
                row.createSpan({ text: s.label });
            }
        }
        if (goalText) {
            const row = legend.createDiv({ cls: "dashy-chart-leg" });
            row.createDiv({ cls: "dashy-chart-swatch is-goal" });
            row.createSpan({ text: goalText });
        }
    }

    if (mobile) {
        status = wrap.createDiv({ cls: "dashy-chart-status" });
        status.setAttr("aria-live", "polite");
    }

    const values = buckets.map((b) => b.values);
    const lastPartial = buckets[buckets.length - 1]?.partial ?? false;
    const labelChars = tickLabels.reduce((n, s) => Math.max(n, s.length), 0);
    let painted = "";

    // Aggregation happened once, above; a resize only lays out and rewrites
    // the SVG and the hit positions.
    const paint = (): void => {
        const width = plot.clientWidth || FALLBACK_WIDTH;
        const height = plot.clientHeight || FALLBACK_HEIGHT;
        const size = `${width}x${height}`;
        if (size === painted) return;
        painted = size;

        const input = { values, lastPartial, type: spec.type, ticks, width, height, labelChars };
        const layout = chartLayout(spec.goal ? { ...input, goal: spec.goal.value } : input);
        graphic.setAttribute("viewBox", `0 0 ${width} ${height}`);
        while (graphic.firstChild) graphic.removeChild(graphic.firstChild);
        paintSvg(graphic, layout, spec, buckets, tickLabels, goalText);
        for (const { hit, b } of hits) {
            const column = layout.columns[b];
            if (!column) continue;
            hit.style.left = `${column.left}px`;
            hit.style.width = `${column.width}px`;
            hit.style.top = `${layout.plot.top}px`;
            hit.style.height = `${layout.plot.height}px`;
        }
    };
    paint();

    // `activeWindow` is typed as a plain `Window`, without `ResizeObserver`,
    // though the object behind it has one; a popout needs its own.
    const win = activeWindow as unknown as typeof window;
    if (typeof win.ResizeObserver !== "function") return;
    const observer = new win.ResizeObserver(paint);
    observer.observe(plot);
    observers.set(el, observer);
    // Called by `DashyBlock.onunload` when the block leaves the note for
    // good; a redraw cleans up through `disconnectObserver` above.
    return () => disconnectObserver(el);
}

/** Emits one layout into the SVG: gridlines and labels, the goal line, bars or lines, x labels. */
function paintSvg(
    graphic: SVGSVGElement,
    layout: ChartLayout,
    spec: ChartSpec,
    buckets: readonly Bucket[],
    tickLabels: readonly string[],
    goalText: string | undefined,
): void {
    const { plot } = layout;
    const right = plot.left + plot.width;
    const bottom = plot.top + plot.height;

    layout.ticks.forEach((tick, i) => {
        svg(graphic, "line", { class: "dashy-chart-grid", x1: plot.left, x2: right, y1: tick.y, y2: tick.y });
        svg(graphic, "text", { class: "dashy-chart-label", x: plot.left - 4, y: tick.y, "text-anchor": "end", "dominant-baseline": "middle" })
            .textContent = tickLabels[i] ?? "";
    });
    const axisY = spec.type === "bar" ? layout.zeroY : bottom;
    svg(graphic, "line", { class: "dashy-chart-axis", x1: plot.left, x2: right, y1: axisY, y2: axisY });

    for (const bar of layout.bars) {
        const color = spec.series[bar.series]?.color;
        if (!color) continue;
        svg(graphic, "rect", {
            class: bar.partial ? "dashy-chart-bar is-partial" : "dashy-chart-bar",
            x: bar.left, y: bar.top, width: bar.width, height: bar.height, fill: rgba(color, 1),
        });
    }
    for (const line of layout.lines) {
        const color = spec.series[line.series]?.color;
        if (!color) continue;
        svg(graphic, "polyline", { class: "dashy-chart-line", points: line.points, fill: "none", stroke: rgba(color, 1) });
    }
    for (const point of layout.points) {
        const color = spec.series[point.series]?.color;
        if (!color) continue;
        svg(graphic, "circle", {
            class: point.partial ? "dashy-chart-point is-partial" : "dashy-chart-point",
            cx: point.x, cy: point.y, r: 3, fill: rgba(color, 1), stroke: rgba(color, 1),
        });
    }

    if (layout.goalY !== undefined) {
        svg(graphic, "line", { class: "dashy-chart-goal", x1: plot.left, x2: right, y1: layout.goalY, y2: layout.goalY });
        if (goalText) {
            svg(graphic, "text", { class: "dashy-chart-goal-label", x: right, y: Math.round((layout.goalY - 4) * 100) / 100, "text-anchor": "end" })
                .textContent = goalText;
        }
    }

    const lastIndex = buckets.length - 1;
    let previous: number | undefined;
    for (const index of layout.xLabels) {
        const column = layout.columns[index];
        if (!column) continue;
        // The first label starts at its column and the last ends at its own,
        // so neither is cut off by the edge of the plot.
        const anchor = lastIndex === 0 ? "middle" : index === 0 ? "start" : index === lastIndex ? "end" : "middle";
        const x = anchor === "start" ? column.left : anchor === "end" ? column.left + column.width : column.left + column.width / 2;
        const tidyX = Math.round(x * 100) / 100;
        svg(graphic, "text", { class: "dashy-chart-label", x: tidyX, y: bottom + 14, "text-anchor": anchor })
            .textContent = xLabel(buckets, index, previous, spec);
        previous = index;
    }
}
