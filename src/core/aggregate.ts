/**
 * Reducing a selection to a single number. Pure layer.
 */

import type { NoteRecord } from "./source";
import { longestStreak, dateKey } from "./calendar";
import { resolveNoteDate } from "./note-date";

export const AGGS = ["count", "sum", "avg", "min", "max", "latest", "streak"] as const;
export type Agg = (typeof AGGS)[number];

export function isAgg(v: unknown): v is Agg {
    return typeof v === "string" && (AGGS as readonly string[]).includes(v);
}

/**
 * A number from frontmatter; anything that is not a finite number becomes
 * null. A YAML boolean counts too — `true` as 1, `false` as 0 — so an
 * Obsidian checkbox property doubles as a habit-tracker field. Only a real
 * boolean qualifies: the strings `"true"`/`"false"` a user might type by hand
 * stay non-numeric, unchanged.
 */
export function numberAt(note: NoteRecord, field: string): number | null {
    const raw = note.frontmatter[field];
    if (typeof raw === "boolean") return raw ? 1 : 0;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw === "string" && raw.trim() !== "") {
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * True when the field's raw value is the YAML boolean `false` — a mark that
 * should not count as a filled day: it breaks a `streak` and stays unpainted
 * on a heatmap. Numeric `0` is not this: it keeps counting as data, so a
 * literal zero reading does not silently disappear from either.
 */
export function isFalseMark(note: NoteRecord, field: string): boolean {
    return note.frontmatter[field] === false;
}

/** True when the field holds a genuine YAML boolean rather than a number or a numeric string. */
export function isBooleanMark(note: NoteRecord, field: string): boolean {
    return typeof note.frontmatter[field] === "boolean";
}

export interface AggregateSpec {
    agg: Agg;
    /** required for everything but count and streak */
    field?: string;
    /** a date frontmatter property to resolve a note's date from, instead of its name */
    dateField?: string;
}

/**
 * `count` counts notes. `streak` counts the longest run of consecutive days
 * among notes that have the field filled in (or among all selected notes when
 * no field is given); a day is resolved the same way `core/period.ts` resolves
 * one (`dateField` when set, otherwise a name starting with `YYYY-MM-DD`), and
 * two or more notes landing on the same day count as that one day.
 * The rest aggregate the numbers held in the field.
 *
 * Returns null when there is nothing to count — the caller draws a dash.
 */
export function aggregate(notes: readonly NoteRecord[], spec: AggregateSpec): number | null {
    if (spec.agg === "count") return notes.length;

    if (spec.agg === "streak") {
        const dates = notes
            .filter((n) => (spec.field
                ? numberAt(n, spec.field) !== null && !isFalseMark(n, spec.field)
                : true))
            .map((n) => resolveNoteDate(n, spec.dateField))
            .filter((d): d is string => d !== null);
        return longestStreak(dates);
    }

    if (!spec.field) return null;

    if (spec.agg === "latest") {
        // Undated notes never compete for "latest" — without this, a
        // `Template.md` sitting in the diary folder sorted after every date
        // and its placeholder number became the reading. A tie on the same
        // resolved date (two notes for one day, `date_field` or a suffixed
        // name) breaks by path, ascending: whichever sorts first wins,
        // regardless of the order the vault happened to hand the notes in.
        const dated = notes
            .map((n) => ({ n, date: resolveNoteDate(n, spec.dateField) }))
            .filter((x): x is { n: NoteRecord; date: string } => x.date !== null)
            .sort((a, b) => {
                if (a.date !== b.date) return a.date < b.date ? 1 : -1;
                return a.n.path < b.n.path ? -1 : 1;
            });
        for (const { n } of dated) {
            const v = numberAt(n, spec.field);
            if (v !== null) return v;
        }
        return null;
    }

    const values: number[] = [];
    for (const n of notes) {
        const v = numberAt(n, spec.field);
        if (v !== null) values.push(v);
    }
    if (!values.length) return null;

    switch (spec.agg) {
        case "sum":
            return values.reduce((a, b) => a + b, 0);
        case "avg":
            return values.reduce((a, b) => a + b, 0) / values.length;
        case "min":
            return Math.min(...values);
        case "max":
            return Math.max(...values);
        default:
            return null;
    }
}

/**
 * Values for a sparkline: the last `days` days, ending today.
 *
 * A window of days, not of notes. Taking the last N notes instead let a diary
 * that stopped in 2024 draw a "last 30 days" shape out of 2024, and let a note
 * dated next year sit inside a trailing window. Days without a note are left
 * out rather than drawn as zero: a missing day is not a day of zero.
 */
export function series(
    notes: readonly NoteRecord[],
    field: string,
    days: number,
    today: Date,
    dateField?: string,
): number[] {
    // Not named `window`: it shadows the global, and both the scanner and a
    // reader take `window.has(...)` for a call on the browser object.
    const wanted = new Set(
        Array.from({ length: days }, (_, back) =>
            dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)),
        ),
    );

    // One bar per day, same as the heatmap: two notes landing on the same
    // day (`date_field`, or a suffixed name and an exact one) add up rather
    // than one silently overwriting the other.
    const sums = new Map<string, number>();
    for (const n of notes) {
        const day = resolveNoteDate(n, dateField);
        if (day === null || !wanted.has(day)) continue;
        const v = numberAt(n, field);
        if (v === null) continue;
        sums.set(day, (sums.get(day) ?? 0) + v);
    }

    return [...sums.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([, v]) => v);
}
