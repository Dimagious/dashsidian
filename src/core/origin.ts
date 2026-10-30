/**
 * `origin` on a `stats` card (B-149): which note a `latest`, `min` or `max`
 * reading was taken from, so a record can name its race and a lab value its
 * date without the author typing either into `sub`. Pure layer: the block
 * turns the answer into a link or a date in the reader's language.
 */

import type { NoteRecord } from "./source";
import type { Agg } from "./aggregate";
import { sumAt } from "./aggregate";
import { resolveNoteDate, type DateFormats } from "./note-date";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

export const ORIGINS = ["note", "date"] as const;
export type Origin = (typeof ORIGINS)[number];

/** The aggregates whose value comes from one note: the only ones `origin` can name. */
export const ORIGIN_AGGS: readonly Agg[] = ["latest", "min", "max"];

function isOrigin(v: unknown): v is Origin {
    return typeof v === "string" && (ORIGINS as readonly string[]).includes(v);
}

export interface OriginOutcome {
    /** unset when the key is absent, unreadable or not allowed with this `agg` */
    origin?: Origin;
    diagnostics: Diagnostic[];
}

/**
 * Reads a card's `origin`. A value other than `note` or `date`, or an
 * aggregate that sums or counts several notes into its number, is a warning
 * and the card draws without it: the number itself is still right.
 */
export function readOrigin(item: Record<string, unknown>, agg: Agg, card: string): OriginOutcome {
    const raw = item.origin;
    if (raw === undefined) return { diagnostics: [] };
    if (!isOrigin(raw)) {
        return {
            diagnostics: [{ level: "warning", message: t("stats.originInvalid", { card, value: describeValue(raw) }) }],
        };
    }
    if (!ORIGIN_AGGS.includes(agg)) {
        return { diagnostics: [{ level: "warning", message: t("stats.originWrongAgg", { card, agg }) }] };
    }
    return { origin: raw, diagnostics: [] };
}

export interface OriginSpec {
    agg: Agg;
    field: string | readonly string[];
    dateField?: string;
    formats?: DateFormats;
}

/**
 * The note a `latest`, `min` or `max` reading comes from; null for any other
 * aggregate or when no note holds a value.
 *
 * `latest` is the note `aggregate` reads: the newest dated one holding a
 * value, a tie on the date broken by path. For `min` and `max`, several notes
 * may share the extreme; the newest of them wins (decided 2026-10-05), so a
 * record equalled last week names last week's race. A note with no readable
 * date ranks below every dated one, and two on the same date (or two
 * undated) are ordered by path, so a redraw never changes the answer.
 * A field list (B-193) compares each note's own total, as `aggregate` does.
 */
export function valueOrigin(notes: readonly NoteRecord[], spec: OriginSpec): NoteRecord | null {
    if (!ORIGIN_AGGS.includes(spec.agg)) return null;
    const lower = spec.agg === "min";
    let best: { note: NoteRecord; value: number; date: string | null } | null = null;
    for (const note of notes) {
        const value = sumAt(note, spec.field);
        if (value === null) continue;
        const date = resolveNoteDate(note, spec.dateField, spec.formats);
        // `latest` skips undated notes, exactly like `newestFirst`.
        if (spec.agg === "latest" && date === null) continue;
        const candidate = { note, value, date };
        if (best === null) {
            best = candidate;
            continue;
        }
        if (spec.agg !== "latest" && value !== best.value) {
            if (lower ? value < best.value : value > best.value) best = candidate;
            continue;
        }
        if (isNewer(candidate, best)) best = candidate;
    }
    return best?.note ?? null;
}

/** Newer date first, a dated note before an undated one, then the path ascending. */
function isNewer(
    a: { note: NoteRecord; date: string | null },
    b: { note: NoteRecord; date: string | null },
): boolean {
    if (a.date !== b.date) {
        if (a.date === null) return false;
        if (b.date === null) return true;
        return a.date > b.date;
    }
    return a.note.path < b.note.path;
}

/** What a card says about where its value came from. */
export type OriginLabel =
    | { kind: "note"; path: string; name: string }
    | { kind: "date"; day: string }
    /** `origin: date` on a note with no readable date: nothing to show, a warning names it */
    | { kind: "undated"; name: string };

/**
 * The origin of a reading as the card draws it: the note to link to, or its
 * day as `YYYY-MM-DD`, read by the same `date_field`, `date_format` and name
 * rules as the rest of the card. Null when no note holds a value.
 */
export function originLabel(notes: readonly NoteRecord[], spec: OriginSpec, origin: Origin): OriginLabel | null {
    const note = valueOrigin(notes, spec);
    if (!note) return null;
    if (origin === "note") return { kind: "note", path: note.path, name: note.name };
    const day = resolveNoteDate(note, spec.dateField, spec.formats);
    return day === null ? { kind: "undated", name: note.name } : { kind: "date", day };
}
