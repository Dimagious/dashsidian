/**
 * Reducing a selection to a single number. Pure layer.
 */

import type { NoteRecord } from "./source";
import { longestStreak, dateKey } from "./calendar";

/**
 * A note whose name is the day it belongs to. Exported so `core/period.ts`
 * tests the same rule instead of a second copy of the regex drifting apart
 * from this one.
 */
export const DATE_NAME = /^\d{4}-\d{2}-\d{2}$/;

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
}

/**
 * `count` counts notes. `streak` counts the longest run of consecutive days
 * among notes that have the field filled in (or among all selected notes when
 * no field is given); those notes must be named as YYYY-MM-DD dates.
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
            .map((n) => n.name)
            .filter((name) => DATE_NAME.test(name));
        return longestStreak(dates);
    }

    if (!spec.field) return null;

    if (spec.agg === "latest") {
        // Date-named only, as the schema promises. Without the filter a
        // `Template.md` sitting in the diary folder sorts after every date and
        // its placeholder number became the "latest" reading.
        const sorted = [...notes]
            .filter((n) => DATE_NAME.test(n.name))
            .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
        for (const n of sorted) {
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
): number[] {
    // Not named `window`: it shadows the global, and both the scanner and a
    // reader take `window.has(...)` for a call on the browser object.
    const wanted = new Set(
        Array.from({ length: days }, (_, back) =>
            dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)),
        ),
    );

    return [...notes]
        .filter((n) => wanted.has(n.name))
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((n) => numberAt(n, field))
        .filter((v): v is number => v !== null);
}
