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
import { numberAt, isFalseMark, isBooleanMark, classifyField } from "./aggregate";
import { resolveNoteDate } from "./note-date";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

export const PER_DAY = ["sum", "avg", "max"] as const;
export type PerDay = (typeof PER_DAY)[number];

export function isPerDay(v: unknown): v is PerDay {
    return typeof v === "string" && (PER_DAY as readonly string[]).includes(v);
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
}

/** Accumulator for one day while its contributing (note, field) pairs are being folded together. */
interface DayGroup {
    values: number[];
    /** the painted contributor with the smallest path so far, or null when none yet is */
    paintedPath: string | null;
    /** whether every contributing pair has been a boolean mark so far */
    allBool: boolean;
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
            const g = groups.get(day) ?? { values: [], paintedPath: null, allBool: true };
            g.values.push(v);
            g.allBool = g.allBool && isBooleanMark(n, field);
            if (painted && (g.paintedPath === null || n.path < g.paintedPath)) g.paintedPath = n.path;
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
        });
    }
    return marks;
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
