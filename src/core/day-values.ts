/**
 * Collapsing whatever lands on one calendar day into a single heatmap value.
 *
 * Two things can pile onto the same day: two notes for it (a morning and an
 * evening entry, or the same habit logged in two different folders), and,
 * since B-094, two or more fields inside one note (`mood_am`, `mood_pm`).
 * Both are the same problem — a day is a bag of numbers, and `per_day` says
 * how to reduce that bag to one — so they are folded together here rather
 * than handled as two separate cases.
 *
 * Pure module: no Obsidian, no DOM.
 */

import type { NoteRecord } from "./source";
import { numberAt, isFalseMark, isBooleanMark, classifyField, type FieldValueKind } from "./aggregate";
import { durationThresholdIn, checkboxBands, type Band } from "./bands";
import { resolveNoteDate } from "./note-date";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

export const PER_DAY = ["sum", "avg", "max"] as const;
export type PerDay = (typeof PER_DAY)[number];

export function isPerDay(v: unknown): v is PerDay {
    return typeof v === "string" && (PER_DAY as readonly string[]).includes(v);
}

/** One note that contributed a value to a day, identified and named at once (B-092). */
export interface DayNote {
    path: string;
    /** file name without the extension, as `core/source.ts#NoteRecord.name` already carries it */
    name: string;
}

/** A day the field(s) resolved on. `painted` is false only for a boolean `false`. */
export interface DayMark {
    /** the collapsed value: sum, average or max of every contributing number, per `per_day` */
    value: number;
    /** the note a click on the cell opens; "" when nothing painted */
    path: string;
    /** whether every contributing (note, field) pair was a genuine YAML boolean */
    isBool: boolean;
    painted: boolean;
    /**
     * Every distinct note that contributed a value this day, across every
     * field in `fields` (B-092, for a cell's tooltip). A note counts once
     * here even if two of its fields both resolved, and even when its own
     * contribution was a boolean `false`: the tooltip's note count answers
     * "how many notes hold this day's data", not "how many painted it" —
     * `painted` already answers that separately.
     */
    notes: readonly DayNote[];
}

/** Accumulator for one day while its contributing (note, field) pairs are being folded together. */
interface DayGroup {
    values: number[];
    /** the painted contributor with the smallest path so far, or null when none yet is */
    paintedPath: string | null;
    /** whether every contributing pair has been a boolean mark so far */
    allBool: boolean;
    /** keyed by path so the same note contributing through two fields still counts once */
    notes: Map<string, DayNote>;
}

function collapse(values: readonly number[], perDay: PerDay): number {
    switch (perDay) {
        case "avg":
            return values.reduce((a, b) => a + b, 0) / values.length;
        case "max":
            return Math.max(...values);
        case "sum":
        default:
            return values.reduce((a, b) => a + b, 0);
    }
}

/**
 * One `DayMark` per day any of `fields` resolved on, across every note in
 * `notes`. Every (note × field) pair that resolves to a number through
 * `numberAt` contributes to that day's bag; `per_day` says how the bag
 * becomes one number. A field absent from a note contributes nothing — not
 * a zero — the same way a note without a resolvable date is skipped
 * entirely.
 *
 * A day is painted the moment any contributing pair is not a boolean
 * `false`: a `false`-only day still gets an entry here (`painted: false`),
 * so it keeps telling the block the field exists, it just does not get
 * coloured. `isBool` is true only when every contributing pair, across every
 * field and every note, was a genuine boolean.
 *
 * The cell links to one note deterministically: the first by path among the
 * notes that contributed a painted value, regardless of the order the
 * vault happened to hand the notes in, and regardless of which field on
 * that note was the one that painted it.
 */
export function dayValues(
    notes: readonly NoteRecord[],
    fields: readonly string[],
    perDay: PerDay,
    dateField?: string,
): Map<string, DayMark> {
    const groups = new Map<string, DayGroup>();
    for (const n of notes) {
        const day = resolveNoteDate(n, dateField);
        if (day === null) continue;
        for (const field of fields) {
            const v = numberAt(n, field);
            if (v === null) continue;
            const painted = !isFalseMark(n, field);
            const g: DayGroup = groups.get(day)
                ?? { values: [], paintedPath: null, allBool: true, notes: new Map<string, DayNote>() };
            g.values.push(v);
            g.allBool = g.allBool && isBooleanMark(n, field);
            if (painted && (g.paintedPath === null || n.path < g.paintedPath)) g.paintedPath = n.path;
            g.notes.set(n.path, { path: n.path, name: n.name });
            groups.set(day, g);
        }
    }

    const marks = new Map<string, DayMark>();
    for (const [day, g] of groups) {
        marks.set(day, {
            value: collapse(g.values, perDay),
            path: g.paintedPath ?? "",
            isBool: g.allBool,
            painted: g.paintedPath !== null,
            notes: Array.from(g.notes.values()),
        });
    }
    return marks;
}

/**
 * How many distinct notes painted each day (B-133, a calendar day's dots):
 * a note counts once it holds at least one of `fields` with a value other
 * than a boolean `false`, the same rule `dayValues` paints a cell by. A note
 * whose only contribution is `false` is not counted, unlike `DayMark.notes`,
 * which lists it. A day with no painting note is absent.
 */
export function paintedNotesPerDay(
    notes: readonly NoteRecord[],
    fields: readonly string[],
    dateField?: string,
): Map<string, number> {
    const counts = new Map<string, number>();
    for (const n of notes) {
        const day = resolveNoteDate(n, dateField);
        if (day === null) continue;
        const painted = fields.some((field) => numberAt(n, field) !== null && !isFalseMark(n, field));
        if (painted) counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
}

/** A `field` list of checkboxes counted per day (B-138), ready to draw. */
export interface CheckboxCount {
    /** the marks to draw: `dayValues`' own with `per_day: sum`, each day's share of ticked boxes with `per_day: avg` */
    marks: Map<string, DayMark>;
    bands: Band[];
}

export interface CheckboxCountOutcome {
    /** null keeps every checkbox day one flat colour, as a single checkbox field always was */
    count: CheckboxCount | null;
    diagnostics: Diagnostic[];
}

/**
 * Whether a `field` list is drawn as a count of ticked checkboxes (B-138),
 * and the scale it is drawn on: a day's value is how many boxes were ticked
 * (`per_day: sum`, the default) or the share of the listed boxes ticked
 * (`per_day: avg`), shaded against every listed box ticked
 * (`checkboxBands`). A field absent from a note counts as an unticked box
 * either way: with `avg`, a note holding only `gym: true` out of
 * `[gym, read]` is one of two, not one of one. With several notes on one
 * day, the share is over every listed box of every one of them.
 *
 * `count` is null, and checkbox days keep one flat colour, for:
 *   - a single field, where a ticked day is simply "done";
 *   - `per_day: max`, where any ticked box makes the day 1 anyway;
 *   - a selection without a single checkbox in the listed fields;
 *   - any listed field holding a number or a duration in any dated note:
 *     a list mixing checkboxes with numbers keeps its own scale, fitted to
 *     the numbers. Where a checkbox turns up too, that is said in a warning
 *     naming the field and the note (first by path), since the reader most
 *     likely meant every field as a checkbox.
 *
 * `marks` is `dayValues(notes, fields, perDay, dateField)` as already
 * computed by the caller; reused as is for `sum`.
 */
export function checkboxCount(
    notes: readonly NoteRecord[],
    fields: readonly string[],
    perDay: PerDay,
    marks: ReadonlyMap<string, DayMark>,
    dateField?: string,
): CheckboxCountOutcome {
    if (fields.length < 2 || perDay === "max") return { count: null, diagnostics: [] };

    let checkbox = false;
    let numeric: { field: string; note: string } | null = null;
    for (const n of notes) {
        if (resolveNoteDate(n, dateField) === null) continue;
        for (const field of fields) {
            if (numberAt(n, field) === null) continue;
            if (isBooleanMark(n, field)) {
                checkbox = true;
            } else if (numeric === null || n.path < numeric.note) {
                numeric = { field, note: n.path };
            }
        }
    }
    if (numeric !== null) {
        const diagnostics: Diagnostic[] = checkbox
            ? [{ level: "warning", message: t("heatmap.checkboxListNumber", numeric) }]
            : [];
        return { count: null, diagnostics };
    }
    if (!checkbox) return { count: null, diagnostics: [] };

    const bands = checkboxBands(fields.length, perDay === "avg");
    if (!bands) return { count: null, diagnostics: [] };
    if (perDay === "sum") return { count: { marks: new Map(marks), bands }, diagnostics: [] };

    const shares = new Map<string, DayMark>();
    for (const [day, mark] of dayValues(notes, fields, "sum", dateField)) {
        shares.set(day, { ...mark, value: mark.value / (fields.length * mark.notes.length) });
    }
    return { count: { marks: shares, bands }, diagnostics: [] };
}

export interface FieldsOutcome {
    /** null when `field` was not usable at all — the caller reports its own "no field" error */
    fields: string[] | null;
    diagnostics: Diagnostic[];
}

/**
 * Reads `field` off a heatmap config: a single property name, as before, or
 * a list of them (`field: [mood_am, mood_pm]`), each one a plain string
 * (dotted paths included, resolved later by `core/field.ts`).
 *
 * An empty list or a list with a non-string entry is reported here and
 * comes back as `fields: null`, distinct from `field` being absent
 * altogether (which this function is silent about — that is the caller's
 * own "no field given" error, unchanged from before B-094). Something
 * present but of neither shape (a number, a boolean, a map) is its own
 * error, naming what was actually written — the reader did supply
 * something, "no field given" would misdescribe the mistake.
 *
 * A repeated entry (`field: [steps, steps]`) is deduplicated, silently and
 * keeping the first occurrence's position: it is never useful for one
 * property to count twice into a sum, and it is far more likely a config
 * written or edited by hand than a deliberate request to double-weight a
 * field, so this is not worth a warning either.
 */
export function readFields(value: Record<string, unknown>): FieldsOutcome {
    const raw = value.field;
    if (raw === undefined) return { fields: null, diagnostics: [] };
    if (typeof raw === "string") return { fields: [raw], diagnostics: [] };

    if (Array.isArray(raw)) {
        if (raw.length === 0) {
            return { fields: null, diagnostics: [{ level: "error", message: t("heatmap.fieldListEmpty") }] };
        }
        const fields: string[] = [];
        for (const entry of raw) {
            if (typeof entry !== "string" || entry.trim() === "") {
                return {
                    fields: null,
                    diagnostics: [{ level: "error", message: t("heatmap.fieldListInvalid", { value: describeValue(entry) }) }],
                };
            }
            if (!fields.includes(entry)) fields.push(entry);
        }
        return { fields, diagnostics: [] };
    }

    return {
        fields: null,
        diagnostics: [{ level: "error", message: t("heatmap.fieldInvalid", { value: describeValue(raw) }) }],
    };
}

export interface PerDayOutcome {
    perDay: PerDay;
    diagnostics: Diagnostic[];
}

/**
 * Reads `per_day` off a heatmap config. Defaults to `sum`, which is the
 * only behaviour 1.3.0 ever had: a config with a single `field` and no
 * `per_day` collapses exactly the way it always did. An unrecognised value
 * warns, naming the options, and falls back to `sum` rather than dropping
 * the day's data.
 */
export function readPerDay(value: Record<string, unknown>): PerDayOutcome {
    const raw = value.per_day;
    if (raw === undefined) return { perDay: "sum", diagnostics: [] };
    if (isPerDay(raw)) return { perDay: raw, diagnostics: [] };
    return {
        perDay: "sum",
        diagnostics: [{ level: "warning", message: t("heatmap.perDayInvalid", { value: describeValue(raw) }) }],
    };
}

/**
 * Which of `fields` never contributed a usable value anywhere in the
 * selection — a typo in one entry of a `field` list, caught even though the
 * other entries carry the day. Only meaningful once `dayValues` already
 * produced at least one mark; a field list where nothing resolves at all is
 * reported per field, as an error, by the caller instead.
 */
export function unusedFields(notes: readonly NoteRecord[], fields: readonly string[]): string[] {
    return fields.filter((f) => classifyField(notes, f) !== "ok");
}

/**
 * What a heatmap says about durations (B-121), once its field(s) are known
 * to carry data: a field mixing durations and plain numbers, naming one note
 * of each, and a `bands` threshold written as a duration against a field of
 * plain numbers. Both are still drawn, as minutes; neither stays silent.
 * `field` is the display form, several names joined with ", ".
 */
export function heatmapDurationDiagnostics(kind: FieldValueKind, field: string, bands: unknown): Diagnostic[] {
    const out: Diagnostic[] = [];
    if (kind.kind === "mixed") {
        out.push({
            level: "warning",
            message: t("heatmap.durationMixed", {
                field, durationNote: kind.durationNote ?? "", plainNote: kind.plainNote ?? "",
            }),
        });
    }
    const written = durationThresholdIn(bands);
    if (written !== undefined && kind.kind === "plain") {
        out.push({ level: "warning", message: t("heatmap.durationThresholdOnPlain", { value: written, field }) });
    }
    return out;
}
