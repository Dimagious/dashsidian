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

    const a = String(actual).toLowerCase();
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

/** A folder includes its children: "01-Areas" covers "01-Areas/Sport/x.md". */
function inFolder(note: NoteRecord, folder: string): boolean {
    const f = folder.replace(/^\/+|\/+$/g, "");
    if (!f) return true;
    return note.folder === f || note.folder.startsWith(`${f}/`);
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
