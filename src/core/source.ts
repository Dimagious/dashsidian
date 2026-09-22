import type { Diagnostic } from "../shared/parse";
import { t } from "../i18n";

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
    /** a simple frontmatter condition, see parseWhere */
    where?: string;
}

const OPS = [">=", "<=", "!=", "=", ">", "<"] as const;
type Op = (typeof OPS)[number] | "contains";

export interface WhereClause {
    field: string;
    op: Op;
    value: string | number | boolean;
}

/**
 * `and` / `or` between two conditions.
 *
 * Quoted text is blanked out first, so `status = "waiting and ready"` is a
 * value and not a conjunction. An unquoted one is ambiguous, and reading it as
 * a conjunction is the safer half of the guess: the user is told to quote it,
 * rather than silently getting the wrong notes.
 */
const CONJUNCTION = /\s(and|or)\s/i;

export function looksLikeConjunction(expr: string): boolean {
    return CONJUNCTION.test(expr.replace(/"[^"]*"|'[^']*'/g, " "));
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

function matchesWhere(note: NoteRecord, clause: WhereClause): boolean {
    const actual = clause.field === "tags" ? note.tags : note.frontmatter[clause.field];
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
    const f = folder.replace(/^\/+|\/+$/g, "");
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
    const clause = spec.where ? parseWhere(spec.where) : null;
    const tag = spec.tag?.replace(/^#/, "").toLowerCase();

    return notes.filter((n) => {
        if (spec.source && !inFolder(n, spec.source)) return false;
        if (tag && !n.tags.some((t) => t.replace(/^#/, "").toLowerCase() === tag)) return false;
        if (clause && !matchesWhere(n, clause)) return false;
        return true;
    });
}

/**
 * The selection a block config asks for, and what could not be read in it.
 *
 * The three keys are read in one place because a `where` that fails to parse is
 * dropped, and a dropped filter changes the answer without changing the look of
 * it. Every block that takes a selection has to say so.
 */
export function readSource(item: Record<string, unknown>): {
    spec: SourceSpec;
    diagnostics: Diagnostic[];
} {
    const spec: SourceSpec = {};
    const diagnostics: Diagnostic[] = [];

    if (typeof item.source === "string") spec.source = item.source;
    if (typeof item.tag === "string") spec.tag = item.tag;

    if (typeof item.where === "string" && item.where.trim()) {
        const where = item.where.trim();
        if (parseWhere(where)) {
            spec.where = where;
        } else {
            diagnostics.push({
                level: "warning",
                message: looksLikeConjunction(where)
                    ? t("where.conjunction", { where })
                    : t("where.unreadable", { where }),
            });
        }
    }

    return { spec, diagnostics };
}
