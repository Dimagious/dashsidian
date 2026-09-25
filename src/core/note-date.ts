/**
 * The one rule for turning a note into the day it belongs to.
 *
 * Every place that needs a note's date — `period`'s window, `streak`,
 * `latest`, `trend`/`series`, the heatmap — goes through `resolveNoteDate`
 * rather than testing a note's name against a regex of its own. That used to
 * drift: `heatmap.ts` kept its own exact-match pattern next to `aggregate.ts`'s
 * `DATE_NAME`, and neither recognised a diary named `2024-01-01 Monday`, the
 * single most common way daily notes break this kind of query on the forum.
 *
 * Pure module: no Obsidian, no DOM.
 */

import type { NoteRecord } from "./source";
import { dateKey } from "./calendar";

/**
 * A note name starts with `YYYY-MM-DD` and the character right after it,
 * if there is one, is anything but a digit. `2024-01-01`, `2024-01-01
 * Monday`, `2024-01-01_standup`, `2024-01-01 (sick)`, `2024-01-01-standup`
 * and `2024-01-01.draft` all match; `2024-01-011` (an eleventh digit right
 * after the day) and `2024-01-1` (the day not padded to two digits) do not,
 * and neither does a name that only contains a date somewhere past its
 * start, like `x 2024-01-01`.
 */
const NAME_DATE = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/;

/**
 * A `YYYY-MM-DD` string, alone or followed by a time — the shape `date_field`
 * reads a property as. The character right after the day, if there is one,
 * has to be `T` (an ISO datetime, `2026-03-02T10:30`) or a plain space
 * (`2026-03-02 10:30`, what some date pickers write); anything else, digit
 * or not (`2026-03-021`, `2026-03-02garbage`), fails the whole match. The
 * time itself is never validated further, only the date part is read.
 */
const DATE_FIELD_VALUE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

/**
 * True for a real calendar date — catches `2026-02-30` and `2025-02-29`,
 * which the digit shape alone lets through. `m` is 1-based (January is 1),
 * matching how the regexes above capture it.
 */
export function isRealDate(y: number, m: number, d: number): boolean {
    const at = new Date(y, m - 1, d);
    return at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d;
}

/**
 * The three `YYYY`, `MM`, `DD` captures of a match against `NAME_DATE` or
 * `DATE_FIELD_VALUE`. Both patterns capture all three groups unconditionally
 * whenever they match at all, so the `?? ""` here never actually fires — it
 * only satisfies `noUncheckedIndexedAccess` without a cast to a tuple type
 * the regex engine itself does not promise.
 */
function dateParts(match: RegExpExecArray): { y: string; m: string; d: string } {
    return { y: match[1] ?? "", m: match[2] ?? "", d: match[3] ?? "" };
}

/**
 * The day a note's own name encodes, or null when the name does not start
 * with a real calendar date. Only consulted when `date_field` is not set.
 */
export function dateFromName(name: string): string | null {
    const match = NAME_DATE.exec(name);
    if (!match) return null;
    const { y, m, d } = dateParts(match);
    return isRealDate(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : null;
}

/**
 * A note's date.
 *
 * Without `dateField` it is the note's own name, by the rule above. With
 * `dateField` the name is not consulted at all — the date comes from that
 * frontmatter property only. A datetime string (`2026-03-02T10:30`, what an
 * Obsidian datetime property writes) is read for its date part, by
 * `DATE_FIELD_VALUE` above; a `Date` instance (what a date property may
 * resolve to) is read by its local year/month/day, never `toISOString`,
 * which shifts local midnight back a day east of UTC. Anything else — a
 * number, free text, a missing property — has no date here, and a
 * `date_field` set on a note named for a day still has no date if the
 * property itself is missing: the name is never a fallback once `dateField`
 * is given.
 */
export function resolveNoteDate(note: NoteRecord, dateField?: string): string | null {
    if (!dateField) return dateFromName(note.name);

    const raw = note.frontmatter[dateField];
    if (raw instanceof Date) {
        return Number.isNaN(raw.getTime()) ? null : dateKey(raw);
    }
    if (typeof raw === "string") {
        const match = DATE_FIELD_VALUE.exec(raw);
        if (!match) return null;
        const { y, m, d } = dateParts(match);
        return isRealDate(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : null;
    }
    return null;
}

/**
 * Parses `date_field:` off a card, a bar or the heatmap block. Shared so the
 * key is read the same way everywhere it appears, rather than each caller
 * trimming it by hand.
 */
export function readDateField(item: Record<string, unknown>): string | undefined {
    const raw = item.date_field;
    return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}
