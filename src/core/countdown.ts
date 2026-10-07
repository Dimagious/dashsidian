/**
 * How long until a date. Pure layer.
 */

import { daysBetween } from "./calendar";
import { newestFirst } from "./aggregate";
import { readField } from "./field";
import { isRealDate, resolveNoteDate, unmatchedDateFormat, type DateFormats } from "./note-date";
import { readSource, selectNotes, unmatchedSource, type NoteRecord } from "./source";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t, tPlural } from "../i18n";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The values `repeat:` takes. One for now; a list so a second one is a one-word change. */
export const REPEATS = ["yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

/**
 * The values `pick:` takes: which of the notes in a `field` card's selection
 * the date is read from. `latest`, the default, is the newest note by the
 * date in its name; `next` is the note whose date comes round soonest.
 */
export const PICKS = ["latest", "next"] as const;
export type CountdownPick = (typeof PICKS)[number];

export interface CountdownSpec {
    /** YYYY-MM-DD, as written in `date` or read from `field` */
    date: string;
    repeat?: Repeat;
    /** path of the note the date was read from, when it came from `field` */
    note?: string;
    /**
     * that note's name, set by `pick: next` only: there the note changes as
     * dates pass, so the card names the one it is counting to
     */
    noteName?: string;
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
 *
 * `today` (YYYY-MM-DD) is needed by `pick: next` alone, to tell the dates
 * still ahead from those gone by; a caller that reads such a card without it
 * is a bug, and it throws rather than counting from a wrong day.
 */
export function readCountdown(
    item: Record<string, unknown>,
    label: string,
    notes: () => readonly NoteRecord[],
    formats?: DateFormats,
    today?: string,
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

    let pick: CountdownPick = "latest";
    if (item.pick !== undefined && item.pick !== null) {
        if (!isPick(item.pick)) {
            diagnostics.push({
                level: "error",
                message: t("countdown.pickInvalid", { card, value: describeValue(item.pick) }),
            });
            return { spec: null, diagnostics };
        }
        pick = item.pick;
    }

    if (hasDate) {
        // `source`, `tag` and `where` pick the note a `field` is read from; next
        // to a written date they would be ignored, and silently is the wrong way.
        if (isSet(item.source) || isSet(item.tag) || isSet(item.where)) {
            diagnostics.push({ level: "warning", message: t("countdown.selectionUnused", { card }) });
        }
        // `pick` likewise chooses among notes, and a written date has none.
        if (item.pick !== undefined && item.pick !== null) {
            diagnostics.push({ level: "warning", message: t("countdown.pickUnused", { card }) });
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
    let found: FieldDate & { diagnostics: Diagnostic[] };
    if (pick === "next") {
        if (today === undefined) throw new Error("countdown: `pick: next` needs `today`");
        found = readNextFieldDate(notes(), item, field, formats, today, repeat);
    } else {
        found = readFieldDate(notes(), item, field, formats);
    }
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
    if (found.skipped) {
        diagnostics.push({
            level: "warning",
            message: tPlural("countdown.pickSkipped", found.skipped.count, {
                card,
                field,
                note: found.skipped.note.name,
                value: describeValue(found.skipped.value),
            }),
        });
    }
    if (found.kind === "past") {
        diagnostics.push({
            level: "error",
            message: t("countdown.nothingAhead", { card, field, date: found.date, note: found.note.name }),
        });
        return { spec: null, diagnostics };
    }
    const spec: CountdownSpec = { date: found.date, note: found.note.path };
    if (pick === "next") spec.noteName = found.note.name;
    return { spec: withRepeat(spec, repeat), diagnostics };
}

/** Present and not blank: an empty `date:` is a key with nothing in it, not a date. */
function isSet(value: unknown): boolean {
    return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
}

function isRepeat(value: unknown): value is Repeat {
    return typeof value === "string" && (REPEATS as readonly string[]).includes(value);
}

function isPick(value: unknown): value is CountdownPick {
    return typeof value === "string" && (PICKS as readonly string[]).includes(value);
}

function withRepeat(spec: CountdownSpec, repeat: Repeat | undefined): CountdownSpec {
    return repeat ? { ...spec, repeat } : spec;
}

/** A note whose `field` held something other than a date, and how many such were passed over. */
interface Skipped {
    count: number;
    note: NoteRecord;
    value: unknown;
}

type FieldDate =
    | { kind: "ok"; date: string; note: NoteRecord; skipped?: Skipped }
    | { kind: "invalid"; value: unknown; note: NoteRecord }
    /** `pick: next` found dates, all of them gone by; the latest of them */
    | { kind: "past"; date: string; note: NoteRecord; skipped?: Skipped }
    | { kind: "missing" };

/** The notes a `field` card selects, with what the selection had to say about itself. */
function selectForField(
    all: readonly NoteRecord[],
    item: Record<string, unknown>,
    field: string,
    formats: DateFormats | undefined,
): { selected: NoteRecord[]; diagnostics: Diagnostic[] } {
    const { spec: source, diagnostics } = readSource(item);
    const missing = unmatchedSource(all, source);
    if (missing) diagnostics.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });

    const selected = selectNotes(all, source);
    diagnostics.push(...unmatchedDateFormat(selected, field, formats));
    return { selected, diagnostics };
}

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
    formats: DateFormats | undefined,
): FieldDate & { diagnostics: Diagnostic[] } {
    const { selected, diagnostics } = selectForField(all, item, field, formats);
    const dated = newestFirst(selected, undefined, formats);
    const datedSet = new Set(dated);
    const undated = selected
        .filter((n) => !datedSet.has(n))
        .sort((a, b) => (a.path < b.path ? -1 : 1));

    for (const note of [...dated, ...undated]) {
        const value = readField(note.frontmatter, field);
        if (!isSet(value)) continue;
        // The same reading `date_field` gives a property: `2026-03-02`, with or
        // without a time after it, or the Date an Obsidian date property becomes.
        const date = resolveNoteDate(note, field, formats);
        return date
            ? { kind: "ok", date, note, diagnostics }
            : { kind: "invalid", value, note, diagnostics };
    }
    return { kind: "missing", diagnostics };
}

/**
 * `pick: next`: the note in the selection whose date comes round soonest,
 * today included.
 *
 * Every selected note with the field filled in takes part, dated name or
 * not, and the order of the names does not matter. Each date goes through
 * `countdownTarget` first, so with `repeat: yearly` a folder of people counts
 * to the next birthday among them. A tie goes to the first note by path.
 *
 * A value that is not a date is skipped here, unlike with `latest`: one
 * stray note in a folder of races must not take the card down. The first
 * skipped note and the count are reported, also when nothing is ahead. When there are dates and none is
 * still ahead, the card says so and names the latest, rather than counting
 * up from it: "the next race" was 40 days ago is not an answer.
 */
function readNextFieldDate(
    all: readonly NoteRecord[],
    item: Record<string, unknown>,
    field: string,
    formats: DateFormats | undefined,
    today: string,
    repeat: Repeat | undefined,
): FieldDate & { diagnostics: Diagnostic[] } {
    const { selected, diagnostics } = selectForField(all, item, field, formats);
    const byPath = [...selected].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    let next: { target: string; date: string; note: NoteRecord } | undefined;
    let latest: { date: string; note: NoteRecord } | undefined;
    let skipped: Skipped | undefined;

    for (const note of byPath) {
        const value = readField(note.frontmatter, field);
        if (!isSet(value)) continue;
        const date = resolveNoteDate(note, field, formats);
        if (!date) {
            if (skipped) skipped.count += 1;
            else skipped = { count: 1, note, value };
            continue;
        }
        const target = countdownTarget(withRepeat({ date }, repeat), today).date;
        if (target >= today && (!next || target < next.target)) next = { target, date, note };
        if (!latest || date > latest.date) latest = { date, note };
    }

    if (!latest) {
        // Filled in everywhere with something that is not a date: the same
        // error `latest` gives, since there is no date to skip to.
        return skipped
            ? { kind: "invalid", value: skipped.value, note: skipped.note, diagnostics }
            : { kind: "missing", diagnostics };
    }
    const found: FieldDate = next
        ? { kind: "ok", date: next.date, note: next.note }
        : { kind: "past", date: latest.date, note: latest.note };
    return skipped ? { ...found, skipped, diagnostics } : { ...found, diagnostics };
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
