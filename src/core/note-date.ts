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
import { readField } from "./field";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

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
 * has to be `T` (an ISO datetime, `2026-03-02T10:30`), a plain space
 * (`2026-03-02 10:30`, what some date pickers write) or a hyphen right before
 * a clock time (`2026-03-02-10:30`); anything else, digit or not
 * (`2026-03-021`, `2026-03-02garbage`), fails the whole match. The time
 * itself is never validated further, only the date part is read.
 */
const DATE_FIELD_VALUE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*|-\d{1,2}:\d{2}.*)?$/;

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
 * Reads `text` against a moment format string, strictly, and returns the day
 * it names as `YYYY-MM-DD`, or null when the text does not fit the format
 * exactly or names no real day (`31.02.2026`). moment lives in
 * `adapters/datetime.ts#parseDateWithFormat`; this module only receives the
 * function, so it stays free of Obsidian and of moment.
 */
export type ParseDate = (text: string, format: string) => string | null;

/**
 * The formats a block reads dates in besides ISO (B-120), in the order they
 * are tried: the block's own `date_format` first, then the day format of the
 * Daily notes or Periodic Notes settings. Built by `dateFormats`.
 */
export interface DateFormats {
    /** the block's own `date_format`, as written, for `unmatchedDateFormat` to judge */
    readonly own?: string;
    /** tried against the start of a note's name; each is the last path segment of a format */
    readonly names: readonly string[];
    /** tried against a whole `date_field` string */
    readonly values: readonly string[];
    readonly parse: ParseDate;
}

/** The format ISO already covers; never tried a second time through moment. */
const ISO_FORMAT = "YYYY-MM-DD";

/**
 * True when a moment format names a whole day: a year, a month and a day of
 * the month, outside `[escaped]` text, or one of moment's locale day
 * formats (`LOCALE_DAY`). `DD.MM.YYYY`, `MMMM D, YYYY` and `LL` do;
 * `YYYY-MM` (a month), `gggg-[W]ww` (a week) and `dddd` (a weekday) do not,
 * and strict moment would otherwise read them as the 1st of something.
 */
export function isDayFormat(format: string): boolean {
    const tokens = format.replace(/\[[^\]]*\]/g, "");
    return (/Y/.test(tokens) && /M/.test(tokens) && /D/.test(tokens)) || LOCALE_DAY.test(tokens);
}

/**
 * moment's locale formats for a whole day, `L`, `l`, `LL` and `ll`
 * (`10/05/2026`, `October 5, 2026` in English), standing as a token of
 * their own rather than as part of `LLL`, which carries a time.
 */
const LOCALE_DAY = /(?:^|[^A-Za-z])(?:LL?|ll?)(?![A-Za-z])/;

/**
 * The part of a format a note's name is written in. A Daily notes format may
 * hold folders, `YYYY/MM/YYYY-MM-DD`, and the name is only the part after
 * the last slash.
 */
function nameFormat(format: string): string {
    return format.slice(format.lastIndexOf("/") + 1);
}

/**
 * The formats to try after ISO, or undefined when there are none, which
 * leaves every reading exactly as ISO alone. `own` is the block's
 * `date_format`, already checked by `readDateFormat`; `settings` is the day
 * format from the Daily notes or Periodic Notes settings, used for names and
 * values alike, and only its name part. A format that is ISO itself, or does
 * not name a whole day, is left out.
 */
export function dateFormats(own: string | undefined, settings: string | undefined, parse: ParseDate): DateFormats | undefined {
    const names: string[] = [];
    const values: string[] = [];
    const add = (list: string[], format: string): void => {
        if (format !== ISO_FORMAT && isDayFormat(format) && !list.includes(format)) list.push(format);
    };
    if (own) {
        add(names, nameFormat(own));
        add(values, own);
    }
    const fromSettings = settings?.trim();
    if (fromSettings) {
        add(names, nameFormat(fromSettings));
        add(values, nameFormat(fromSettings));
    }
    if (!own && !names.length && !values.length) return undefined;
    return own ? { own, names, values, parse } : { names, values, parse };
}

/**
 * How far into a name a date is looked for. A date written in any format
 * fits well inside it, and a long title past it is not worth parsing.
 */
const MAX_NAME_DATE = 48;

/** A format whose first token is a number: a name that does not start with a digit cannot fit it. */
const NUMERIC_START = /^(?:Y|D|M(?!MM))/;

/**
 * The day a name or a `date_field` value written in `format` starts with,
 * or null.
 *
 * Close to the ISO rule: the date opens the name and may be followed by
 * anything after a break. The whole name is tried first, then every prefix
 * that ends right before a character that is neither a letter nor a digit,
 * longest first: `05.10.2026 Monday` and `05.10.2026-14.30` both read as
 * `05.10.2026`, and the longest fit wins, so a format with a time in it
 * (`YYYYMMDD HHmm`) keeps its time rather than stopping at the day. A name
 * with no break after the date (`05.10.2026x`) does not fit, since a strict
 * parse of the whole name fails and no shorter prefix is tried there; ISO
 * is looser and only refuses a digit right after the day.
 */
function dateAtStart(text: string, format: string, parse: ParseDate): string | null {
    if (NUMERIC_START.test(format) && !/^\d/.test(text)) return null;
    const whole = parse(text, format);
    if (whole !== null) return whole;
    for (let end = Math.min(text.length, MAX_NAME_DATE + 1) - 1; end > 0; end--) {
        if (/[\p{L}\p{N}]/u.test(text.charAt(end))) continue;
        const day = parse(text.slice(0, end), format);
        if (day !== null) return day;
    }
    return null;
}

/** The first format in `formats` that reads `text`, by `read`. */
function firstFit(formats: readonly string[], read: (format: string) => string | null): string | null {
    for (const format of formats) {
        const day = read(format);
        if (day !== null) return day;
    }
    return null;
}

/** A `date_field` string read as ISO, by `DATE_FIELD_VALUE`, or null. */
function isoValueDate(raw: string): string | null {
    const match = DATE_FIELD_VALUE.exec(raw);
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
 * is given. `dateField` may itself be a dotted path into a nested object
 * (`meta.date`); see core/field.ts for the resolution rule.
 *
 * `formats` (B-120) adds the formats that are not ISO. ISO is always tried
 * first, and only when it fails: a name is tried against `formats.names` in
 * order, a `date_field` string against `formats.values`, both by the same
 * rule (`dateAtStart`): `05.10.2026 14:30` reads as its day under
 * `DD.MM.YYYY`. Without `formats` nothing but ISO is read, so an
 * ambiguous order like `05-10-2026` is a date only once a format says which
 * part is the day.
 */
export function resolveNoteDate(note: NoteRecord, dateField?: string, formats?: DateFormats): string | null {
    if (!dateField) {
        const iso = dateFromName(note.name);
        if (iso !== null || !formats) return iso;
        return firstFit(formats.names, (format) => dateAtStart(note.name, format, formats.parse));
    }

    const raw = readField(note.frontmatter, dateField);
    if (raw instanceof Date) {
        return Number.isNaN(raw.getTime()) ? null : dateKey(raw);
    }
    if (typeof raw === "string") {
        const iso = isoValueDate(raw);
        if (iso !== null || !formats) return iso;
        const text = raw.trim();
        return firstFit(formats.values, (format) => dateAtStart(text, format, formats.parse));
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

/**
 * Parses `date_format:` off a block root or a card (B-120): a moment format
 * string for dates that are not ISO, such as `DD.MM.YYYY`. A value that is
 * not text, or a format with no year, month and day in it, warns and is not
 * used, so the block reads dates as if the key were absent.
 */
export function readDateFormat(item: Record<string, unknown>): { format?: string; diagnostics: Diagnostic[] } {
    const raw = item.date_format;
    if (raw === undefined) return { diagnostics: [] };
    if (typeof raw !== "string" || !raw.trim()) {
        return {
            diagnostics: [{ level: "warning", message: t("dateFormat.invalid", { value: describeValue(raw) }) }],
        };
    }
    const format = raw.trim();
    if (!isDayFormat(format)) {
        return { diagnostics: [{ level: "warning", message: t("dateFormat.notADay", { format }) }] };
    }
    return { format, diagnostics: [] };
}

/**
 * A warning for a `date_format` that not one note in `notes` is written in
 * (B-120), naming the format and one name or `date_field` value that does
 * not fit it, the first by path, so the warning never changes between two
 * redraws. A note ISO already reads counts as fitting, so a redundant
 * `date_format` over ISO notes stays quiet, and so does a Date an Obsidian
 * date property becomes. Empty when some note fits, when there is nothing to
 * judge (no notes, or `date_field` holds no text on any of them), or when the
 * block has no `date_format` of its own: the settings format is not the
 * reader's to fix here.
 */
export function unmatchedDateFormat(
    notes: readonly NoteRecord[],
    dateField: string | undefined,
    formats: DateFormats | undefined,
): Diagnostic[] {
    const format = formats?.own;
    if (!format) return [];
    const parse = formats.parse;
    const name = nameFormat(format);
    let example: { path: string; text: string } | undefined;
    for (const note of notes) {
        let fits: boolean;
        let text: string;
        if (dateField) {
            const raw = readField(note.frontmatter, dateField);
            // A date property Obsidian already hands over as a Date is read without any format.
            if (raw instanceof Date) return [];
            if (typeof raw !== "string" || !raw.trim()) continue;
            text = raw.trim();
            fits = isoValueDate(raw) !== null || dateAtStart(text, format, parse) !== null;
        } else {
            text = note.name;
            fits = dateFromName(text) !== null || (isDayFormat(name) && dateAtStart(text, name, parse) !== null);
        }
        if (fits) return [];
        if (!example || note.path < example.path) example = { path: note.path, text };
    }
    return example
        ? [{ level: "warning", message: t("dateFormat.unmatched", { format, example: example.text }) }]
        : [];
}
