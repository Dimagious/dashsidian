/**
 * `group_by` on a `stats` card (B-213): one card that ranks the values of a
 * property, "Switch 12, PC 9, PS5 4", a summary of the selection rather than
 * a list of its notes. Pure layer: the block computes each group's number
 * with `aggregate` and draws the rows; reading the key, splitting the notes
 * into groups and ranking them live here.
 */

import { hasField, readField } from "./field";
import type { Agg } from "./aggregate";
import type { NoteRecord } from "./source";
import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

/** How many rows a `group_by` card shows when `limit` is not set. */
export const DEFAULT_GROUP_LIMIT = 10;

/**
 * Card keys a `group_by` card has no use for: a delta, a sparkline and the
 * note a single value came from all describe one number, and the card has
 * a row per value instead. Written, they warn once and are left out before
 * the rest of the card is read, so they raise none of their own warnings.
 */
export const GROUP_BY_IGNORED: readonly string[] = ["compare", "better", "trend", "origin"];

export interface GroupBySpec {
    /** the property whose values name the rows */
    field: string;
    /** the most rows drawn before "+ N more" */
    limit: number;
}

export interface GroupByOutcome {
    /** null: the card is an ordinary one, either without `group_by` or with one that does not read */
    spec: GroupBySpec | null;
    /** the card with `GROUP_BY_IGNORED` removed when `spec` is set, otherwise as written */
    item: Record<string, unknown>;
    diagnostics: Diagnostic[];
}

/** The property a card's `group_by` names, or "" when it names none. */
function groupField(item: Record<string, unknown>): string {
    return typeof item.group_by === "string" ? item.group_by.trim() : "";
}

/** Whether a card is drawn as a `group_by` card: its `group_by` names a property. */
export function hasGroupBy(item: Record<string, unknown>): boolean {
    return groupField(item) !== "";
}

/**
 * Reads `group_by` and `limit` off one card. `card` is the already quoted
 * label every other card message starts with. Never throws: a `group_by`
 * that is not a property name warns and the card is drawn as an ordinary
 * one; a `limit` that is not a whole number of 1 or more warns and the
 * default is used; `limit` without `group_by` warns and does nothing.
 */
export function readGroupBy(item: Record<string, unknown>, card: string): GroupByOutcome {
    const diagnostics: Diagnostic[] = [];
    const field = groupField(item);
    if (item.group_by !== undefined && !field) {
        diagnostics.push({ level: "warning", message: t("stats.groupByInvalid", { card, value: describeValue(item.group_by) }) });
    }
    if (!field) {
        if (item.limit !== undefined) {
            diagnostics.push({ level: "warning", message: t("stats.limitWithoutGroupBy", { card }) });
        }
        return { spec: null, item, diagnostics };
    }

    let limit = DEFAULT_GROUP_LIMIT;
    if (item.limit !== undefined) {
        const n = item.limit;
        if (typeof n === "number" && Number.isInteger(n) && n >= 1) {
            limit = n;
        } else {
            diagnostics.push({
                level: "warning",
                message: t("stats.limitInvalid", { card, value: describeValue(n), limit: DEFAULT_GROUP_LIMIT }),
            });
        }
    }

    const ignored = GROUP_BY_IGNORED.filter((key) => item[key] !== undefined);
    if (ignored.length) {
        diagnostics.push({
            level: "warning",
            message: t("stats.groupByIgnored", { card, keys: ignored.map((key) => `\`${key}\``).join(", ") }),
        });
    }
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
        if (!GROUP_BY_IGNORED.includes(key)) kept[key] = value;
    }
    return { spec: { field, limit }, item: kept, diagnostics };
}

/**
 * A `group_by` property no selected note has at all: every note would land
 * under "no value", which reads like data rather than like the typo it
 * almost always is. Judged over the selection before `period` narrows it,
 * as a card's `field` is.
 */
export function groupByMissing(notes: readonly NoteRecord[], field: string, card: string): Diagnostic[] {
    if (!notes.length || notes.some((n) => hasField(n.frontmatter, field))) return [];
    return [{ level: "warning", message: t("stats.groupByMissing", { card, field }) }];
}

// One link, nothing else: `[[PC]], [[Switch]]` in a text property is two
// links in one string and is shown as written, not as a mangled name.
const WIKILINK = /^\[\[([^[\]]*)\]\]$/;

/**
 * The text a single value is shown as. A link, `[[Games/Switch|my Switch]]`,
 * is the name of the note it points to, `Switch`: the alias and a heading
 * after `#` are dropped, and so is the folder, so `[[Switch]]`, `[[Games/Switch]]`
 * and a plain `Switch` are one group. Numbers and booleans are their text;
 * a date is the text it was written as. Blank text, a map and anything else
 * that is not a value give nothing.
 */
function valueText(value: unknown): string | null {
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
    if (typeof value === "boolean") return String(value);
    if (typeof value !== "string") return null;
    const text = value.trim();
    const link = WIKILINK.exec(text);
    if (link) {
        const target = (link[1] ?? "").split("|")[0]?.split("#")[0]?.trim() ?? "";
        const name = target.split("/").pop()?.replace(/\.md$/i, "").trim() ?? "";
        // `[[#Heading]]` points into the note itself and has no name to show.
        return name || text;
    }
    return text || null;
}

/**
 * Every value a note holds in `field`, as shown: one for a single value, one
 * per item for a list (`genres: [rpg, indie]`). Empty when the property is
 * missing, blank or a list of blanks.
 */
export function groupValues(frontmatter: Record<string, unknown>, field: string): string[] {
    const raw = readField(frontmatter, field);
    const list: readonly unknown[] = Array.isArray(raw) ? raw : [raw];
    const out: string[] = [];
    for (const value of list) {
        const text = valueText(value);
        if (text !== null) out.push(text);
    }
    return out;
}

export interface NoteGroup {
    /** the spelling shown: the one most notes use, the first by code point on a tie */
    label: string;
    notes: NoteRecord[];
}

export interface NoteGroups {
    /** in no particular order: `rankGroups` orders them once their numbers are known */
    groups: NoteGroup[];
    /** the notes holding no value in the property */
    noValue: NoteRecord[];
    /** whether some note sits in more than one group, so the rows can add up to more than the notes */
    overlap: boolean;
}

/**
 * Splits `notes` by the values of `field`, in one pass. Values group without
 * regard to case, `RPG` with `rpg`; a note listing one value twice, in any
 * case, counts once in it. A note with a list of values counts in each.
 */
export function groupNotes(notes: readonly NoteRecord[], field: string): NoteGroups {
    const byKey = new Map<string, { notes: NoteRecord[]; spellings: Map<string, number> }>();
    const noValue: NoteRecord[] = [];
    let overlap = false;
    for (const note of notes) {
        const seen = new Set<string>();
        for (const text of groupValues(note.frontmatter, field)) {
            // NFC first: `café` typed composed and decomposed is one group.
            const key = text.normalize("NFC").toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            let group = byKey.get(key);
            if (!group) {
                group = { notes: [], spellings: new Map() };
                byKey.set(key, group);
            }
            group.notes.push(note);
            const spelling = text.normalize("NFC");
            group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
        }
        if (seen.size === 0) noValue.push(note);
        if (seen.size > 1) overlap = true;
    }
    const groups = Array.from(byKey.values(), (group) => ({ label: favourite(group.spellings), notes: group.notes }));
    return { groups, noValue, overlap };
}

/** The spelling most notes use; a tie goes to the first by code point, so a redraw never flips it. */
function favourite(spellings: ReadonlyMap<string, number>): string {
    let best = "";
    let bestCount = 0;
    for (const [text, count] of spellings) {
        if (count > bestCount || (count === bestCount && text < best)) {
            best = text;
            bestCount = count;
        }
    }
    return best;
}

/**
 * Which way a group card ranks: the largest number first, except for
 * `agg: min`, where the smallest is the best, a race time or a price.
 */
export function groupOrder(agg: Agg): "ascending" | "descending" {
    return agg === "min" ? "ascending" : "descending";
}

export interface GroupRow {
    label: string;
    /** null: the group's notes hold nothing to compute, drawn as a dash */
    value: number | null;
}

export interface RankedGroups {
    /** at most `limit` rows, best first */
    rows: GroupRow[];
    /** how many rows `limit` left out */
    more: number;
}

/**
 * Orders the groups by their number, `order` deciding which end is best,
 * then cuts to `limit`. A tie is broken by the value's name, in the
 * reader's alphabetical order with numbers compared as numbers. A group
 * with no number to show ranks after every one with a number.
 */
export function rankGroups(rows: readonly GroupRow[], order: "ascending" | "descending", limit: number): RankedGroups {
    const sign = order === "ascending" ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
        if (a.value === null || b.value === null) {
            if (a.value !== b.value) return a.value === null ? 1 : -1;
        } else if (a.value !== b.value) {
            return sign * (a.value - b.value);
        }
        return a.label.localeCompare(b.label, undefined, { numeric: true });
    });
    return { rows: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) };
}

export interface GroupSummary extends RankedGroups {
    /** the number over the notes holding no value; unset when every note holds one */
    noValue?: { value: number | null };
    /** whether some note counts in more than one row */
    overlap: boolean;
}

/**
 * The whole card in numbers: `notes` split by `spec.field`, each group's
 * number from `measure` (the card's own `agg` and `field`, the block's
 * `aggregate`), ranked the way `agg` reads best and cut to `spec.limit`.
 * The notes with no value get their number apart, never ranked or cut.
 */
export function summarizeGroups(
    notes: readonly NoteRecord[],
    spec: GroupBySpec,
    agg: Agg,
    measure: (notes: readonly NoteRecord[]) => number | null,
): GroupSummary {
    const { groups, noValue, overlap } = groupNotes(notes, spec.field);
    const rows = groups.map((group) => ({ label: group.label, value: measure(group.notes) }));
    const out: GroupSummary = { ...rankGroups(rows, groupOrder(agg), spec.limit), overlap };
    if (noValue.length) out.noValue = { value: measure(noValue) };
    return out;
}
