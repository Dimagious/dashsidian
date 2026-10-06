/**
 * The `chart` block's semantics (ADR 0005): reading its config, and folding
 * the selected notes into calendar buckets, one value per series per bucket.
 * Pure module: no Obsidian, no DOM. Drawing lives in `blocks/chart.ts`,
 * coordinates in `core/chart-layout.ts`, the y scale in `core/chart-scale.ts`.
 */

import type { NoteRecord } from "./source";
import type { DayNote } from "./day-values";
import { readFields } from "./day-values";
import { numberAt, classifyField, type FieldStatus } from "./aggregate";
import { resolveNoteDate, readDateField, type DateFormats } from "./note-date";
import { bucketStart, eachBucket, dateKey, parseDateKey, type BucketSize } from "./calendar";
import { parsePeriod, periodWindow, type Period } from "./period";
import { assignLayerColors, toRgb, type Rgb } from "./palette";
import { readThreshold, formatDuration, type Threshold } from "./duration";
import { roundedValue, formatValue, MAX_PRECISION } from "./stat";
import type { ChartType } from "./chart-layout";
import { describeValue, isRecord, nearest, unknownKeys, type Diagnostic } from "../shared/parse";
import { t, tPlural } from "../i18n";

export type { BucketSize } from "./calendar";
export type { ChartType } from "./chart-layout";

/** Above this, split into two blocks: three lines already crowd a phone. */
export const MAX_SERIES = 4;
/** Above this, the window is clipped to the most recent buckets: 3650 day points is not a chart. */
export const MAX_BUCKETS = 400;

export const CHART_AGGS = ["sum", "avg", "min", "max", "count"] as const;
export type ChartAgg = (typeof CHART_AGGS)[number];
export const BUCKETS = ["day", "week", "month", "year"] as const;
export const CHART_TYPES = ["line", "bar"] as const;

function isChartAgg(v: unknown): v is ChartAgg {
    return typeof v === "string" && (CHART_AGGS as readonly string[]).includes(v);
}

function isBucket(v: unknown): v is BucketSize {
    return typeof v === "string" && (BUCKETS as readonly string[]).includes(v);
}

function isChartType(v: unknown): v is ChartType {
    return typeof v === "string" && (CHART_TYPES as readonly string[]).includes(v);
}

/**
 * The window a `bucket` gets when `range` is not written: rolling, not
 * calendar, so the picture is the same on any day of the year. 26 full
 * weeks, 12 full months, ten years (the longest `range` there is).
 */
export function defaultRange(bucket: BucketSize): Period {
    switch (bucket) {
        case "day":
            return { kind: "days", days: 30 };
        case "week":
            return { kind: "days", days: 182 };
        case "month":
            return { kind: "days", days: 365 };
        case "year":
            return { kind: "days", days: 3650 };
    }
}

export interface ChartSeries {
    /** the properties folded into this series; empty for `count`, which reads none */
    fields: string[];
    agg: ChartAgg;
    /** legend and tooltip name: the written `label`, the field name(s), or "notes" for `count` */
    label: string;
    color: Rgb;
}

export interface ChartSpec {
    series: ChartSeries[];
    /** true when written with a root `field` (or a bare `agg: count`), not `series` */
    single: boolean;
    bucket: BucketSize;
    range: Period;
    type: ChartType;
    unit?: string;
    precision?: number;
    goal?: Threshold;
    /** `goal` as written, for a diagnostic that quotes it */
    goalText?: string;
    link: boolean;
    title?: string;
    dateField?: string;
}

export interface ChartOutcome {
    /** null when an error leaves nothing to draw; the diagnostics say why */
    spec: ChartSpec | null;
    diagnostics: Diagnostic[];
}

/** An unknown `agg`, with the nearest guess when there is one close enough. */
function aggError(raw: unknown): string {
    const value = describeValue(raw);
    const available = CHART_AGGS.join(", ");
    const guess = typeof raw === "string" ? nearest(raw, CHART_AGGS) : null;
    return guess
        ? t("chart.aggInvalidGuess", { value, guess, available })
        : t("chart.aggInvalid", { value, available });
}

/** A series' label: a non-blank string as written; anything else falls back, a wrong shape with a warning. */
function readLabel(raw: unknown, fallback: string, warn: (message: string) => void): string {
    if (typeof raw === "string" && raw.trim() !== "") return raw;
    if (raw !== undefined && typeof raw !== "string") warn(t("chart.labelInvalid", { value: describeValue(raw) }));
    return fallback;
}

interface SeriesOutcome {
    series: ChartSeries[] | null;
    diagnostics: Diagnostic[];
}

/**
 * Reads `series:`, the heatmap `layers` shape plus `agg`. Every entry is
 * checked, not just the first bad one, so an agent fixing entry 3 is not
 * sent back for entry 1 afterwards. Colours are assigned only once every
 * entry parsed: `assignLayerColors` has to see every explicit colour first.
 */
function readSeries(raw: unknown, itemKeys: readonly string[], rootAgg: ChartAgg): SeriesOutcome {
    if (!Array.isArray(raw)) {
        return { series: null, diagnostics: [{ level: "error", message: t("chart.seriesInvalid", { value: describeValue(raw) }) }] };
    }
    if (raw.length === 0) return { series: null, diagnostics: [{ level: "error", message: t("chart.seriesEmpty") }] };
    if (raw.length > MAX_SERIES) {
        return { series: null, diagnostics: [{ level: "error", message: t("chart.seriesTooMany", { max: MAX_SERIES, count: raw.length }) }] };
    }

    const diagnostics: Diagnostic[] = [];
    const parsed: { fields: string[]; agg: ChartAgg; label: string; color: Rgb | undefined }[] = [];
    let ok = true;

    raw.forEach((entry: unknown, i: number) => {
        const position = i + 1;
        const at = (level: Diagnostic["level"], message: string): void => {
            diagnostics.push({ level, message: t("chart.seriesAt", { position, message }) });
        };
        if (!isRecord(entry)) {
            diagnostics.push({ level: "error", message: t("chart.seriesNotMap", { position, value: describeValue(entry) }) });
            ok = false;
            return;
        }
        for (const d of unknownKeys(entry, itemKeys)) at(d.level, d.message);

        let agg = rootAgg;
        if (entry.agg !== undefined) {
            if (!isChartAgg(entry.agg)) {
                at("error", aggError(entry.agg));
                ok = false;
                return;
            }
            agg = entry.agg;
        }

        let fields: string[] = [];
        if (agg === "count") {
            if (entry.field !== undefined) at("warning", t("chart.countIgnoresField"));
        } else {
            const read = readFields(entry);
            if (!read.fields) {
                at("error", read.diagnostics[0]?.message ?? t("chart.seriesFieldRequired"));
                ok = false;
                return;
            }
            fields = read.fields;
        }
        const fallback = agg === "count" ? t("chart.countLabel") : fields.join(", ");
        const label = readLabel(entry.label, fallback, (m) => at("warning", m));
        parsed.push({ fields, agg, label, color: entry.color !== undefined ? toRgb(entry.color) : undefined });
    });

    if (!ok) return { series: null, diagnostics };
    const colors = assignLayerColors(parsed.map((p) => p.color));
    return {
        series: parsed.map((p, i) => ({ fields: p.fields, agg: p.agg, label: p.label, color: colors[i] ?? toRgb(undefined) })),
        diagnostics,
    };
}

/**
 * Reads a chart block's root config into a spec. Never throws. Unknown root
 * keys are the block's own business (`unknownKeys` with the schema's
 * `hints`); a `series` entry's unknown keys are reported here, against
 * `itemKeys`, the same way `readLayers` does it for the heatmap.
 *
 * Errors (nothing sensible to draw): `field` and `series` together, a root
 * `field` list (it would read as two lines and draw one, ADR 0005 log 2),
 * no `field`/`series` unless `agg: count`, a broken `series`, an unknown
 * `agg`. Everything else that is malformed warns and falls back to its
 * default, so the chart is still drawn.
 */
export function readChart(value: Record<string, unknown>, itemKeys: readonly string[]): ChartOutcome {
    const diagnostics: Diagnostic[] = [];
    const warn = (message: string): void => {
        diagnostics.push({ level: "warning", message });
    };
    const hasSeries = value.series !== undefined;
    const hasField = value.field !== undefined;

    if (hasSeries && hasField) {
        return { spec: null, diagnostics: [{ level: "error", message: t("chart.seriesAndField") }] };
    }
    if (Array.isArray(value.field)) {
        return { spec: null, diagnostics: [{ level: "error", message: t("chart.fieldListAtRoot") }] };
    }

    let ok = true;
    let rootAgg: ChartAgg = "sum";
    if (value.agg !== undefined) {
        if (isChartAgg(value.agg)) {
            rootAgg = value.agg;
        } else {
            diagnostics.push({ level: "error", message: aggError(value.agg) });
            ok = false;
        }
    }

    let series: ChartSeries[] | null = null;
    if (hasSeries) {
        if (value.color !== undefined) warn(t("chart.colorIgnored"));
        if (value.label !== undefined) warn(t("chart.labelIgnored"));
        const read = readSeries(value.series, itemKeys, rootAgg);
        diagnostics.push(...read.diagnostics);
        series = read.series;
    } else if (rootAgg === "count") {
        if (hasField) warn(t("chart.countIgnoresField"));
        series = [{ fields: [], agg: "count", label: readLabel(value.label, t("chart.countLabel"), warn), color: toRgb(value.color) }];
    } else if (!hasField) {
        diagnostics.push({ level: "error", message: t("chart.fieldRequired") });
    } else if (typeof value.field !== "string" || value.field.trim() === "") {
        diagnostics.push({ level: "error", message: t("chart.fieldInvalid", { value: describeValue(value.field) }) });
    } else {
        const field = value.field.trim();
        series = [{ fields: [field], agg: rootAgg, label: readLabel(value.label, field, warn), color: toRgb(value.color) }];
    }

    let bucket: BucketSize = "day";
    if (value.bucket !== undefined) {
        if (isBucket(value.bucket)) bucket = value.bucket;
        else warn(t("chart.bucketInvalid", { value: describeValue(value.bucket) }));
    }

    let range = defaultRange(bucket);
    if (value.range !== undefined) {
        const period = parsePeriod(value.range);
        if (period) range = period;
        else warn(t("chart.rangeInvalid", { value: describeValue(value.range) }));
    }

    let type: ChartType = "line";
    if (value.type !== undefined) {
        if (isChartType(value.type)) type = value.type;
        else warn(t("chart.typeInvalid", { value: describeValue(value.type) }));
    }

    if (!ok || !series) return { spec: null, diagnostics };

    const spec: ChartSpec = { series, single: !hasSeries, bucket, range, type, link: value.link !== false };

    if (typeof value.unit === "string") {
        if (value.unit.trim()) spec.unit = value.unit.trim();
    } else if (value.unit !== undefined) {
        warn(t("chart.unitInvalid", { value: describeValue(value.unit) }));
    }

    if (value.precision !== undefined) {
        const p = value.precision;
        if (typeof p === "number" && Number.isInteger(p) && p >= 0 && p <= MAX_PRECISION) {
            spec.precision = p;
        } else {
            warn(t("chart.badPrecision", { max: MAX_PRECISION, value: describeValue(p) }));
        }
    }

    if (value.goal !== undefined) {
        const goal = readThreshold(value.goal);
        if (goal) {
            spec.goal = goal;
            spec.goalText = describeValue(value.goal);
        } else {
            warn(t("chart.goalInvalid", { value: describeValue(value.goal) }));
        }
    }

    if (typeof value.title === "string" && value.title.trim()) spec.title = value.title;
    const dateField = readDateField(value);
    if (dateField) spec.dateField = dateField;

    return { spec, diagnostics };
}

/** How usable a series field is across the whole selection, before any window narrows it. */
export type ChartFieldStatus = FieldStatus | "undated";

/**
 * `classifyField`'s triage (B-112) plus one case of its own: a field that
 * holds numbers, but only on notes without a resolvable date, can never
 * land in a bucket.
 */
export function chartFieldStatus(
    notes: readonly NoteRecord[],
    field: string,
    dateField?: string,
    formats?: DateFormats,
): ChartFieldStatus {
    const status = classifyField(notes, field);
    if (status !== "ok") return status;
    const dated = notes.some((n) => numberAt(n, field) !== null && resolveNoteDate(n, dateField, formats) !== null);
    return dated ? "ok" : "undated";
}

export interface Bucket {
    /** the bucket's first day, `YYYY-MM-DD`; a month's is its 1st, a year's 1 January */
    key: string;
    /** its last day, `YYYY-MM-DD`, which may lie after today for the partial last bucket */
    end: string;
    /** true for the last bucket when today is not its last day; a `day` bucket never is */
    partial: boolean;
    /** one per series, in `spec.series` order; null is "no data", never a zero */
    values: (number | null)[];
    /** every note that contributed to any series here, by path, ascending */
    notes: DayNote[];
}

export interface BucketOutcome {
    buckets: Bucket[];
    /** whether any selected note resolved to a date at all, window or not */
    anyDated: boolean;
    diagnostics: Diagnostic[];
}

/** The last day of the bucket starting at `key`. */
function bucketEnd(key: string, bucket: BucketSize): string {
    if (bucket === "day") return key;
    const start = parseDateKey(key);
    if (bucket === "year") return dateKey(new Date(start.getFullYear(), 11, 31));
    return bucket === "week"
        ? dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6))
        : dateKey(new Date(start.getFullYear(), start.getMonth() + 1, 0));
}

function collapse(values: readonly number[], agg: Exclude<ChartAgg, "count">): number | null {
    if (!values.length) return null;
    switch (agg) {
        case "sum":
            return values.reduce((a, b) => a + b, 0);
        case "avg":
            return values.reduce((a, b) => a + b, 0) / values.length;
        case "min":
            return values.reduce((a, b) => Math.min(a, b));
        case "max":
            return values.reduce((a, b) => Math.max(a, b));
    }
}

/**
 * Folds the selected notes into the chart's buckets, one pass over the
 * notes. The window is `range` ending `today`, its start moved back to the
 * start of the bucket it falls in, so only the last bucket can be partial.
 * A bucket's value is `agg` over the bag of every value any of the series'
 * fields resolved to on any note dated in it: two notes on one day count
 * twice, the same numbers a `stats` card over that week shows. An empty bag
 * is null (a gap); `count` counts dated notes and is 0 over an empty bucket.
 * Notes dated after `today` are outside the window and never drawn.
 */
export function bucketize(
    notes: readonly NoteRecord[],
    spec: ChartSpec,
    today: Date,
    firstDay: number,
    formats?: DateFormats,
): BucketOutcome {
    const diagnostics: Diagnostic[] = [];
    const bounds = periodWindow(spec.range, today, firstDay);
    let keys = eachBucket(bucketStart(bounds.start, spec.bucket, firstDay), bounds.end, spec.bucket);
    if (keys.length > MAX_BUCKETS) {
        keys = keys.slice(-MAX_BUCKETS);
        // The next coarser bucket: `bucket: week` itself over ten years of
        // weeks is still too many. A month or a year never gets here, since
        // `range` stops at 3650 days, about 121 months.
        const next = spec.bucket === "day" ? "week" : "month";
        diagnostics.push({ level: "warning", message: t("chart.tooManyBuckets", { max: MAX_BUCKETS, next }) });
    }
    if (keys.length < 2) diagnostics.push({ level: "warning", message: t("chart.rangeShorterThanBucket") });

    const index = new Map(keys.map((k, i) => [k, i]));
    const first = keys[0] ?? bounds.end;
    const bags = keys.map(() => spec.series.map((): number[] => []));
    const counts = keys.map(() => spec.series.map(() => 0));
    const contributors = keys.map(() => new Map<string, DayNote>());
    let anyDated = false;

    for (const note of notes) {
        const day = resolveNoteDate(note, spec.dateField, formats);
        if (day === null) continue;
        anyDated = true;
        if (day < first || day > bounds.end) continue;
        const b = index.get(bucketStart(day, spec.bucket, firstDay));
        if (b === undefined) continue;
        let contributed = false;
        spec.series.forEach((series, s) => {
            if (series.agg === "count") {
                const row = counts[b];
                if (row) row[s] = (row[s] ?? 0) + 1;
                contributed = true;
                return;
            }
            for (const field of series.fields) {
                const v = numberAt(note, field);
                if (v === null) continue;
                bags[b]?.[s]?.push(v);
                contributed = true;
            }
        });
        if (contributed) contributors[b]?.set(note.path, { path: note.path, name: note.name });
    }

    const last = keys.length - 1;
    const buckets = keys.map((key, b): Bucket => {
        const end = bucketEnd(key, spec.bucket);
        return {
            key,
            end,
            partial: b === last && spec.bucket !== "day" && end > bounds.end,
            values: spec.series.map((series, s) => (series.agg === "count"
                ? counts[b]?.[s] ?? 0
                : collapse(bags[b]?.[s] ?? [], series.agg))),
            notes: [...(contributors[b]?.values() ?? [])].sort((x, y) => (x.path < y.path ? -1 : 1)),
        };
    });
    return { buckets, anyDated, diagnostics };
}

/** "last 30 days", "last 26 weeks", "last 12 months", "last 11 years": the bucket noun through `tPlural` (CLAUDE.md rule 13). */
export function spanText(bucket: BucketSize, count: number): string {
    switch (bucket) {
        case "day":
            return tPlural("chart.days", count);
        case "week":
            return tPlural("chart.weeks", count);
        case "month":
            return tPlural("chart.months", count);
        case "year":
            return tPlural("chart.years", count);
    }
}

function perText(bucket: BucketSize): string {
    switch (bucket) {
        case "day":
            return t("chart.perDay");
        case "week":
            return t("chart.perWeek");
        case "month":
            return t("chart.perMonth");
        case "year":
            return t("chart.perYear");
    }
}

function aggText(agg: ChartAgg): string {
    switch (agg) {
        case "sum":
            return t("chart.aggSum");
        case "avg":
            return t("chart.aggAvg");
        case "min":
            return t("chart.aggMin");
        case "max":
            return t("chart.aggMax");
        case "count":
            return t("chart.aggCount");
    }
}

/**
 * The heading: `title` when written, otherwise "{label}: {agg} per {bucket},
 * last {n} {buckets}". Several series join their labels; series with
 * different aggregates drop the aggregate word rather than name only one.
 */
export function chartCaption(spec: ChartSpec, bucketCount: number): string {
    if (spec.title !== undefined) return spec.title;
    const label = spec.series.map((s) => s.label).join(", ");
    const per = perText(spec.bucket);
    const span = spanText(spec.bucket, bucketCount);
    const aggs = new Set(spec.series.map((s) => s.agg));
    const first = spec.series[0];
    return aggs.size === 1 && first
        ? t("chart.caption", { label, agg: aggText(first.agg), per, span })
        : t("chart.captionMixed", { label, per, span });
}

export interface ValueFormat {
    duration: boolean;
    /** with `duration`: read as a clock, `2:16:32` (B-145); `formatPoint` only, an axis keeps `2h 15m` */
    clock?: boolean;
    precision?: number;
    /** appended after a plain number; never after a duration, which carries its own units */
    unit?: string;
}

/**
 * A value for a tooltip or the status line: a duration as `7h 30m` (or
 * `2:16:32` with `clock`), a plain number through `roundedValue` (no digit
 * grouping: its narrow no-break space has no place in a `title`), then the
 * unit.
 */
export function formatPoint(value: number, format: ValueFormat): string {
    if (format.duration) return formatDuration(value, format.clock);
    const number = String(roundedValue(value, format.precision));
    return format.unit ? t("chart.valueWithUnit", { value: number, unit: format.unit }) : number;
}

/** A y axis label: grouped like a card's number, no unit (only the top label carries it), or a duration. */
export function formatAxis(value: number, format: ValueFormat): string {
    return format.duration ? formatDuration(value) : formatValue(value, format.precision);
}

export interface TooltipInput {
    /** the bucket's date as a reader reads it, already formatted */
    date: string;
    /** one per series; `value` already formatted, null for no data */
    parts: readonly { label: string; value: string | null }[];
    notes: readonly DayNote[];
    partial: boolean;
}

/**
 * A bucket's tooltip, also what a tap writes into the status line on a
 * phone: "{date}: {series} {value}", every series with a value for several,
 * "no data" when none has one; then the contributing note (its name, or how
 * many), then "so far" on a partial bucket.
 */
export function bucketTooltip(input: TooltipInput): string {
    const present = input.parts.filter((p): p is { label: string; value: string } => p.value !== null);
    const only = input.parts.length === 1 ? present[0] : undefined;
    let text = !present.length
        ? t("chart.pointNoData", { date: input.date })
        : only
            ? t("chart.point", { date: input.date, series: only.label, value: only.value })
            : t("chart.pointParts", {
                date: input.date,
                parts: present.map((p) => t("chart.pointPart", { label: p.label, value: p.value })).join(", "),
            });
    const note = input.notes.length === 1
        ? input.notes[0]?.name
        : input.notes.length > 1 ? tPlural("chart.notesCount", input.notes.length) : undefined;
    if (note) text = t("chart.pointWithNote", { point: text, note });
    return input.partial ? t("chart.soFar", { point: text }) : text;
}
