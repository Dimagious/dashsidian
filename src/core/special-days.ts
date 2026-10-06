/**
 * Days a note marks as special: vacation, sick, any day that should not
 * count as an ordinary gap (B-095).
 *
 * `agg: streak` (core/aggregate.ts) treats a special day as transparent, the
 * same way `days: weekdays` already treats a weekend (B-101): it neither
 * breaks a run nor extends one, whatever it holds. `blocks/heatmap.ts` draws
 * it with a hatched overlay instead, on top of its painted colour when it
 * has one.
 *
 * Pure module: no Obsidian, no DOM.
 */

import type { NoteRecord } from "./source";
import { readField } from "./field";
import { resolveNoteDate, type DateFormats } from "./note-date";

/**
 * Whether a single note's `skip_field` value marks its day as special.
 *
 * `false`, `null`, an absent property, an empty or blank string and the
 * number `0` all read as "not marked" — the same conservative reading
 * `core/aggregate.ts`'s `isFalseMark`/`numberAt` give a `0`, so a vault that
 * also logs a numeric `vacation_days: 0` on an ordinary day is not read as
 * "every day is a vacation". Anything else — `true`, non-zero numbers, a
 * non-blank string like `sick: flu`, or a value of any other shape — marks
 * the day.
 */
export function isSpecialMark(raw: unknown): boolean {
    if (raw === undefined || raw === null || raw === false) return false;
    if (typeof raw === "number") return raw !== 0;
    if (typeof raw === "string") return raw.trim() !== "";
    return true;
}

/**
 * The set of calendar days any note in `notes` marks special, resolved the
 * same way every other reading in this plugin resolves a day
 * (`resolveNoteDate`: `dateField` when set, otherwise the note's own name).
 * A note with no resolvable date contributes nothing, the same as a note
 * `dayValues` cannot place on a day.
 */
export function specialDays(
    notes: readonly NoteRecord[],
    skipField: string,
    dateField?: string,
    formats?: DateFormats,
): Set<string> {
    const days = new Set<string>();
    for (const note of notes) {
        if (!isSpecialMark(readField(note.frontmatter, skipField))) continue;
        const day = resolveNoteDate(note, dateField, formats);
        if (day !== null) days.add(day);
    }
    return days;
}
