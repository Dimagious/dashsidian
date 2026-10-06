import { describeValue, type Diagnostic } from "../shared/parse";
import { t, type MessageKey } from "../i18n";
import { readField } from "./field";

/**
 * Selecting the notes a block works on. Pure layer: it runs over a metadata
 * snapshot rather than over Obsidian itself — adapters/vault.ts takes that
 * snapshot.
 */

export interface NoteRecord {
    /** path from the vault root, with the extension */
    path: string;
    /** file name without the extension */
    name: string;
    /** parent folder, "" for the vault root */
    folder: string;
    /** tags from frontmatter and body, without the hash */
    tags: string[];
    frontmatter: Record<string, unknown>;
}

export interface SourceSpec {
    /** folder; includes nested ones */
    source?: string;
    /** tag, with or without the hash */
    tag?: string;
    /**
     * frontmatter conditions that must all hold: one string (conditions may
     * be joined with `and`) or a list of them, see readWhere
     */
    where?: string | readonly string[];
}

const OPS = [">=", "<=", "!=", "=", ">", "<"] as const;
type Op = (typeof OPS)[number] | "contains";

export interface WhereClause {
    field: string;
    op: Op;
    value: string | number | boolean;
}

/**
 * A quote opens only where a value can start: at the beginning, after
 * whitespace or after an operator. An apostrophe inside a word is text, or
 * `name = O'Brien and mood = don't` would read as one quoted span that hides
 * the `and` between them, and the user's second condition would vanish.
 */
const QUOTED = /(^|[\s=<>!])("[^"]*"|'[^']*')/g;

/** A quote left open where a value starts, after the balanced ones are masked. */
const OPEN_QUOTE = /(^|[\s=<>!])["']/;

/** Quoted text blanked out, same length, so indices still line up with the original. */
function maskQuotes(expr: string): string {
    return expr.replace(QUOTED, (_m, lead: string, quoted: string) => lead + " ".repeat(quoted.length));
}

/**
 * `and` / `or` between two conditions.
 *
 * Quoted text is blanked out first, so `status = "waiting and ready"` is a
 * value and not a conjunction. A single condition never holds one: `and` is
 * split off by readWhere before a condition reaches parseWhere, and `or` is
 * not supported at all.
 */
const CONJUNCTION = /\s(and|or)\s/i;

export function looksLikeConjunction(expr: string): boolean {
    return CONJUNCTION.test(maskQuotes(expr));
}

/**
 * An unquoted `or`, as a whole word. Reading it as "either" is not supported,
 * and reading it as part of a value is the silent wrong answer, so it is
 * refused outright: the user is told to quote it or to use `and`.
 */
const OR_WORD = /(^|\s)or(\s|$)/i;

function hasOr(expr: string): boolean {
    return OR_WORD.test(maskQuotes(expr));
}

/**
 * Splits a string on every unquoted, whole-word `and`, case-insensitive.
 * Parts come back trimmed; a dangling `and` leaves an empty part behind,
 * which the caller refuses rather than drops.
 */
export function splitAnd(expr: string): string[] {
    const masked = maskQuotes(expr);
    const and = /(^|\s)and(?=\s|$)/gi;
    const parts: string[] = [];
    let start = 0;
    let match: RegExpExecArray | null;
    while ((match = and.exec(masked)) !== null) {
        const at = match.index + (match[1] ?? "").length;
        parts.push(expr.slice(start, at).trim());
        start = at + "and".length;
    }
    parts.push(expr.slice(start).trim());
    return parts;
}

/**
 * Parses conditions like `year = 2026`, `rating >= 4`, `status != done`,
 * `tags contains books`. A deliberately tiny language: anything richer is
 * Dataview territory, and we are not going there.
 *
 * Returns null when parsing fails — the caller shows a warning and draws the
 * block unfiltered rather than blowing up.
 */
export function parseWhere(expr: string): WhereClause | null {
    const trimmed = expr.trim();
    if (!trimmed) return null;

    // Without this the operator scan below finds the first `=` and swallows the
    // rest as a string value: `year = 2026 and rating >= 5` became the question
    // "is year equal to the text '2026 and rating >= 5'", which is false for
    // every note. A confident zero, and not a word about why.
    if (looksLikeConjunction(trimmed)) return null;
    // `a = "unbalanced` would otherwise compare against the text with its
    // stray quote still on it and match nothing, without a word.
    if (OPEN_QUOTE.test(maskQuotes(trimmed))) return null;

    const containsMatch = /^(\S+)\s+contains\s+(.+)$/i.exec(trimmed);
    if (containsMatch?.[1] && containsMatch[2]) {
        return { field: containsMatch[1], op: "contains", value: unquote(containsMatch[2]) };
    }

    for (const op of OPS) {
        const at = trimmed.indexOf(op);
        if (at <= 0) continue;
        const field = trimmed.slice(0, at).trim();
        const raw = trimmed.slice(at + op.length).trim();
        if (!field || !raw) return null;
        return { field, op, value: coerce(unquote(raw)) };
    }
    return null;
}

function unquote(s: string): string {
    const t = s.trim();
    if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
        return t.slice(1, -1);
    }
    return t;
}

function coerce(s: string): string | number | boolean {
    if (s === "true") return true;
    if (s === "false") return false;
    const n = Number(s);
    return s !== "" && Number.isFinite(n) ? n : s;
}

/**
 * What a `where` value reads as.
 *
 * `none` is an absent or blank one, nothing to filter by and nothing to say.
 * `error` drops the whole filter, and the message says so: applying only the
 * readable part of it would draw numbers narrowed by less than was asked for,
 * looking exactly like the right ones.
 */
export type WhereReading =
    | { kind: "none" }
    | { kind: "ok"; conditions: string[]; clauses: WhereClause[] }
    | { kind: "error"; message: string };

/**
 * Reads `where`: one string, conditions joined by `and`, or a YAML list of
 * them. Every condition must hold. A list item may itself hold `and`.
 *
 * A number or a boolean reads as its text, which is never a condition, so it
 * lands on the same "could not be read" warning as any other bad one.
 */
export function readWhere(where: unknown): WhereReading {
    if (where === undefined || where === null) return { kind: "none" };
    if (typeof where === "string" && !where.trim()) return { kind: "none" };

    let items: readonly unknown[];
    if (Array.isArray(where)) {
        if (where.length === 0) return { kind: "error", message: t("where.emptyList") };
        items = where;
    } else if (isScalar(where)) {
        items = [where];
    } else {
        return { kind: "error", message: t("where.unreadable", { where: describeValue(where) }) };
    }

    const texts: string[] = [];
    for (const item of items) {
        const text = isScalar(item) ? String(item).trim() : "";
        if (!text) {
            const value = typeof item === "string" ? `"${item}"` : describeValue(item);
            return { kind: "error", message: t("where.badItem", { value }) };
        }
        texts.push(text);
    }

    // `or` first: it drops the filter wherever it sits, and naming it beats
    // naming whichever condition happened to come before it.
    const withOr = texts.find(hasOr);
    if (withOr !== undefined) return { kind: "error", message: t("where.conjunction", { where: withOr }) };

    const split = texts.map((text) => ({ text, parts: splitAnd(text) }));
    const single = split.length === 1 && split[0]?.parts.length === 1;
    const conditions: string[] = [];
    const clauses: WhereClause[] = [];
    for (const { text, parts } of split) {
        if (parts.some((part) => !part)) {
            return { kind: "error", message: t("where.unreadable", { where: text }) };
        }
        for (const part of parts) {
            const clause = parseWhere(part);
            if (!clause) {
                return {
                    kind: "error",
                    message: single
                        ? t("where.unreadable", { where: part })
                        : t("where.badCondition", { condition: part }),
                };
            }
            conditions.push(part);
            clauses.push(clause);
        }
    }
    return { kind: "ok", conditions, clauses };
}

function isScalar(value: unknown): value is string | number | boolean {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function matchesWhere(note: NoteRecord, clause: WhereClause): boolean {
    // `tags` stays special: it reads the note's resolved tag list rather than a
    // frontmatter property. Any other field name may be a dotted path into a
    // nested object (`health.sleep > 70`); see core/field.ts.
    const actual = clause.field === "tags" ? note.tags : readField(note.frontmatter, clause.field);
    if (actual === undefined || actual === null) return false;

    if (clause.op === "contains") {
        const needle = String(clause.value).replace(/^#/, "").toLowerCase();
        const haystack = Array.isArray(actual) ? actual : [actual];
        return haystack.some((v) => String(v).replace(/^#/, "").toLowerCase().includes(needle));
    }

    if (typeof clause.value === "number") {
        const n = typeof actual === "number" ? actual : Number(actual);
        if (!Number.isFinite(n)) return false;
        switch (clause.op) {
            case "=": return n === clause.value;
            case "!=": return n !== clause.value;
            case ">": return n > clause.value;
            case "<": return n < clause.value;
            case ">=": return n >= clause.value;
            case "<=": return n <= clause.value;
        }
    }

    const a = comparable(actual).toLowerCase();
    const b = String(clause.value).toLowerCase();
    switch (clause.op) {
        case "=": return a === b;
        case "!=": return a !== b;
        case ">": return a > b;
        case "<": return a < b;
        case ">=": return a >= b;
        case "<=": return a <= b;
        default: return false;
    }
}

/**
 * A frontmatter value as a string, for comparing against a written one.
 *
 * A list joins, which is how `tags = books` has always matched a one-item list.
 * A map compares as empty: it cannot equal a scalar, and "[object Object]"
 * equalling the literal text "[object Object]" is not a match anyone wants.
 */
function comparable(value: unknown): string {
    if (Array.isArray(value)) return value.map((v) => String(v)).join(",");
    if (value !== null && typeof value === "object") return "";
    return String(value);
}

/** A folder includes its children: "01-Areas" covers "01-Areas/Sport/x.md". */
function inFolder(note: NoteRecord, folder: string): boolean {
    const f = normalize(folder);
    if (!f) return true;
    return note.folder === f || note.folder.startsWith(`${f}/`);
}

/**
 * A `source` that matches nothing in the vault.
 *
 * Silence here is indistinguishable from an honest zero, and the first block a
 * newcomer inserts points at a folder from the author's vault. A zero that
 * means "you named a folder that is not here" has to say so.
 */
export function unmatchedSource(
    notes: readonly NoteRecord[],
    spec: SourceSpec,
): string | null {
    const folder = normalize(spec.source ?? "");
    if (!folder) return null;
    return notes.some((n) => inFolder(n, folder)) ? null : folder;
}

function normalize(folder: string): string {
    return folder.trim().replace(/^\/+|\/+$/g, "");
}

export function selectNotes(notes: readonly NoteRecord[], spec: SourceSpec): NoteRecord[] {
    // A `where` that does not read is skipped, not applied as "nothing
    // matches": readSource has already warned about it.
    const reading = readWhere(spec.where);
    const clauses = reading.kind === "ok" ? reading.clauses : [];
    const tag = spec.tag?.replace(/^#/, "").toLowerCase();

    return notes.filter((n) => {
        if (spec.source && !inFolder(n, spec.source)) return false;
        if (tag && !n.tags.some((t) => t.replace(/^#/, "").toLowerCase() === tag)) return false;
        if (!clauses.every((clause) => matchesWhere(n, clause))) return false;
        return true;
    });
}

/**
 * A `source` or `tag` as written, trimmed, or `undefined` when it selects
 * nothing: not text, empty, or only whitespace (B-156).
 *
 * The one place a blank `source` or `tag` is decided (countdown's `isSet`
 * makes the same call for its own keys). Read through here, `"  "` is the
 * same as `""` for the selection, the missing-folder check and the blank-key
 * warnings alike; before, it filtered on the spaces and matched no note
 * without a word.
 */
export function readSelector(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const text = value.trim();
    return text || undefined;
}

/**
 * The selection a block config asks for, and what could not be read in it.
 *
 * The three keys are read in one place because a `where` that fails to parse is
 * dropped whole, even when only one of its conditions is bad, and a dropped filter changes the answer without changing the look of
 * it. Every block that takes a selection has to say so.
 */
export function readSource(item: Record<string, unknown>): {
    spec: SourceSpec;
    diagnostics: Diagnostic[];
} {
    const spec: SourceSpec = {};
    const diagnostics: Diagnostic[] = [];

    const source = readSelector(item.source);
    if (source !== undefined) spec.source = source;
    const tag = readSelector(item.tag);
    if (tag !== undefined) spec.tag = tag;
    diagnostics.push(...notTextDiagnostics(item));

    const where = readWhere(item.where);
    if (where.kind === "ok") {
        spec.where = typeof item.where === "string" ? item.where.trim() : where.conditions;
    } else if (where.kind === "error") {
        diagnostics.push({ level: "warning", message: where.message });
    }

    return { spec, diagnostics };
}

/**
 * `source` or `tag` written as something other than text.
 *
 * YAML reads `source: 2024` as a number and `source: [A, B]` as a list. Either
 * one was dropped without a word, so the block read the whole vault and
 * looked right doing it (B-160). The selection still drops it, but now says
 * so, as an error: a number most likely names a folder or a tag that has to
 * be quoted, so that is the fix offered for one.
 *
 * `null`, an empty `source:`, is not this: it is the blank case, warned about
 * where a block root is read (B-154).
 */
export function isNotText(value: unknown): boolean {
    return value !== undefined && value !== null && typeof value !== "string";
}

const NOT_TEXT: Record<"source" | "tag", { number: MessageKey; other: MessageKey }> = {
    source: { number: "where.sourceNumber", other: "where.sourceNotText" },
    tag: { number: "where.tagNumber", other: "where.tagNotText" },
};

function notTextDiagnostics(item: Record<string, unknown>): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const key of ["source", "tag"] as const) {
        const value = item[key];
        if (!isNotText(value)) continue;
        const keys = NOT_TEXT[key];
        const message = typeof value === "number" ? keys.number : keys.other;
        out.push({ level: "error", message: t(message, { value: describeValue(value) }) });
    }
    return out;
}
