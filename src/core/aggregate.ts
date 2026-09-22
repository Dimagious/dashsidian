/**
 * Reducing a selection to a single number. Pure layer.
 */

import type { NoteRecord } from "./source";
import { longestStreak } from "./calendar";

export const AGGS = ["count", "sum", "avg", "min", "max", "latest", "streak"] as const;
export type Agg = (typeof AGGS)[number];

export function isAgg(v: unknown): v is Agg {
    return typeof v === "string" && (AGGS as readonly string[]).includes(v);
}

/** A number from frontmatter; anything that is not a finite number becomes null. */
export function numberAt(note: NoteRecord, field: string): number | null {
    const raw = note.frontmatter[field];
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw === "string" && raw.trim() !== "") {
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }
    return null;
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
            .filter((n) => (spec.field ? numberAt(n, spec.field) !== null : true))
            .map((n) => n.name)
            .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name));
        return longestStreak(dates);
    }

    if (!spec.field) return null;

    if (spec.agg === "latest") {
        const sorted = [...notes].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
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

/** Day-by-day values for a sparkline: the last `days` date-named notes. */
export function series(notes: readonly NoteRecord[], field: string, days: number): number[] {
    return [...notes]
        .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n.name))
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .slice(-days)
        .map((n) => numberAt(n, field))
        .filter((v): v is number => v !== null);
}
