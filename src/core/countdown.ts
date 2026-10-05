/**
 * How long until a date. Pure layer.
 */

import { daysBetween } from "./calendar";
import { newestFirst } from "./aggregate";
import { readField } from "./field";
import { isRealDate, resolveNoteDate } from "./note-date";
import { readSource, selectNotes, unmatchedSource, type NoteRecord } from "./source";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The values `repeat:` takes. One for now; a list so a second one is a one-word change. */
export const REPEATS = ["yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

export interface CountdownSpec {
    /** YYYY-MM-DD, as written in `date` or read from `field` */
    date: string;
    repeat?: Repeat;
    /** path of the note the date was read from, when it came from `field` */
    note?: string;
}

export interface CountdownOutcome {
    spec: CountdownSpec | null;
    diagnostics: Diagnostic[];
}

/**
 * Normalises whatever YAML produced into a YYYY-MM-DD key.
 *
 * A bare `2026-11-15` is a string under the YAML 1.2 core schema, but a Date
 * arrives too when a parser follows 1.1, so both are accepted. The date is
 * rebuilt from its local parts rather than through toISOString, which shifts
 * local midnight a day back east of UTC.
 */
export function readDateKey(raw: unknown): string | null {
    if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime())) return null;
        const m = String(raw.getMonth() + 1).padStart(2, "0");
        const d = String(raw.getDate()).padStart(2, "0");
        return `${raw.getFullYear()}-${m}-${d}`;
    }
    if (typeof raw !== "string") return null;

    const text = raw.trim();
    if (!DATE_PATTERN.test(text)) return null;

    // The pattern lets 2026-02-31 through; only a round trip catches it.
    const [y, m, d] = text.split("-").map(Number) as [number, number, number];
    const probe = new Date(y, m - 1, d);
    const sane = probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
    return sane ? text : null;
}

/**
 * A card's date: written in `date`, or read from a note's `field`.
 *
 * Exactly one of the two. Both, or neither, is an error on the card rather
 * than a guess at which one was meant. `notes` is asked for only when the card
 * reads a field, so a block of written dates never walks the vault.
 */
export function readCountdown(
    item: Record<string, unknown>,
    label: string,
    notes: () => readonly NoteRecord[],
): CountdownOutcome {
    const diagnostics: Diagnostic[] = [];
    const card = label ? `"${label}"` : t("stats.unlabeledCard");
    const hasDate = isSet(item.date);
    const hasField = isSet(item.field);

    if (hasDate && hasField) {
        diagnostics.push({ level: "error", message: t("countdown.dateAndField", { card }) });
        return { spec: null, diagnostics };
    }
    if (!hasDate && !hasField) {
        diagnostics.push({ level: "error", message: t("countdown.dateRequired", { card }) });
        return { spec: null, diagnostics };
    }

    let repeat: Repeat | undefined;
    if (item.repeat !== undefined && item.repeat !== null) {
        if (!isRepeat(item.repeat)) {
            diagnostics.push({
                level: "error",
                message: t("countdown.repeatInvalid", { card, value: describeValue(item.repeat) }),
            });
            return { spec: null, diagnostics };
        }
        repeat = item.repeat;
    }

    if (hasDate) {
        // `source`, `tag` and `where` pick the note a `field` is read from; next
        // to a written date they would be ignored, and silently is the wrong way.
        if (isSet(item.source) || isSet(item.tag) || isSet(item.where)) {
            diagnostics.push({ level: "warning", message: t("countdown.selectionUnused", { card }) });
        }
        const date = readDateKey(item.date);
        if (!date) {
            diagnostics.push({
                level: "error",
                message: t("countdown.dateInvalid", { card, date: describeValue(item.date) }),
            });
            return { spec: null, diagnostics };
        }
        return { spec: withRepeat({ date }, repeat), diagnostics };
    }

    if (typeof item.field !== "string" || !item.field.trim()) {
        diagnostics.push({
            level: "error",
            message: t("countdown.fieldInvalid", { card, value: describeValue(item.field) }),
        });
        return { spec: null, diagnostics };
    }
    const field = item.field.trim();
    const found = readFieldDate(notes(), item, field);
    diagnostics.push(...found.diagnostics);

    if (found.kind === "missing") {
        diagnostics.push({ level: "error", message: t("countdown.fieldMissing", { card, field }) });
        return { spec: null, diagnostics };
    }
    if (found.kind === "invalid") {
        diagnostics.push({
            level: "error",
            message: t("countdown.fieldNotDate", {
                card,
                field,
                note: found.note.name,
                value: describeValue(found.value),
            }),
        });
        return { spec: null, diagnostics };
    }
    return { spec: withRepeat({ date: found.date, note: found.note.path }, repeat), diagnostics };
}

/** Present and not blank: an empty `date:` is a key with nothing in it, not a date. */
function isSet(value: unknown): boolean {
    return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
}

function isRepeat(value: unknown): value is Repeat {
    return typeof value === "string" && (REPEATS as readonly string[]).includes(value);
}

function withRepeat(spec: CountdownSpec, repeat: Repeat | undefined): CountdownSpec {
    return repeat ? { ...spec, repeat } : spec;
}

type FieldDate =
    | { kind: "ok"; date: string; note: NoteRecord }
    | { kind: "invalid"; value: unknown; note: NoteRecord }
    | { kind: "missing" };

/**
 * The date a card's `field` holds, from the newest note in its selection that
 * has the field filled in.
 *
 * `source`, `tag` and `where` select exactly as on a `stats` card, and the
 * order is `agg: latest`'s: dated notes newest first, by the date in the name.
 * A note without a date in its name, the usual home of a birthday or a
 * certificate, comes after every dated one, by path, rather than not at all:
 * otherwise a property kept in an ordinary note could never be read.
 *
 * Only the first note with the field filled in is read. A value there that is
 * not a date is reported, not skipped for an older one: an older date would
 * look right and be wrong.
 */
function readFieldDate(
    all: readonly NoteRecord[],
    item: Record<string, unknown>,
    field: string,
): FieldDate & { diagnostics: Diagnostic[] } {
    const { spec: source, diagnostics } = readSource(item);
    const missing = unmatchedSource(all, source);
    if (missing) diagnostics.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });

    const selected = selectNotes(all, source);
    const dated = newestFirst(selected);
    const datedSet = new Set(dated);
    const undated = selected
        .filter((n) => !datedSet.has(n))
        .sort((a, b) => (a.path < b.path ? -1 : 1));

    for (const note of [...dated, ...undated]) {
        const value = readField(note.frontmatter, field);
        if (!isSet(value)) continue;
        // The same reading `date_field` gives a property: `2026-03-02`, with or
        // without a time after it, or the Date an Obsidian date property becomes.
        const date = resolveNoteDate(note, field);
        return date
            ? { kind: "ok", date, note, diagnostics }
            : { kind: "invalid", value, note, diagnostics };
    }
    return { kind: "missing", diagnostics };
}

/**
 * Where a card counts to, and the anniversary that falls on it.
 *
 * Without `repeat` that is the date itself, and `years` is 0. With
 * `repeat: yearly` it is the next time the month and day come round, today
 * included; 29 February falls on the 28th in a year without one. `years` is
 * how many years that occurrence lands after the original date. A date still
 * ahead has not had an anniversary yet, so it is its own target, with 0.
 */
export function countdownTarget(spec: CountdownSpec, today: string): { date: string; years: number } {
    if (spec.repeat !== "yearly" || spec.date >= today) return { date: spec.date, years: 0 };

    const [y, m, d] = spec.date.split("-").map(Number) as [number, number, number];
    const thisYear = Number(today.slice(0, 4));
    let year = thisYear;
    let target = occurrence(year, m, d);
    if (target < today) {
        year = thisYear + 1;
        target = occurrence(year, m, d);
    }
    return { date: target, years: year - y };
}

/** Month and day in `year`, as a key; 29 February becomes the 28th where there is none. */
function occurrence(year: number, month: number, day: number): string {
    const fits = isRealDate(year, month, day);
    const mm = String(month).padStart(2, "0");
    const dd = String(fits ? day : day - 1).padStart(2, "0");
    return `${String(year).padStart(4, "0")}-${mm}-${dd}`;
}

/**
 * Whole days from today to the date: positive ahead, negative behind, zero
 * today. Both sides are day keys, so daylight saving cannot shift the answer.
 */
export function daysUntil(date: string, today: string): number {
    return daysBetween(today, date);
}
