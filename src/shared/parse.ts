/**
 * Parsing a block's YAML config.
 *
 * The author of a config is often not a human but a language model: it writes
 * the file and leaves, never seeing what got drawn. So the parser forgives —
 * it accepts key synonyms, does not choke on an extra field, and reports the
 * doubtful ones as warnings. We only fail hard where there is nothing to draw.
 */

import { parse as parseYaml } from "yaml";
import schema from "../blocks/schema.json";
import { t } from "../i18n";

export interface Diagnostic {
    level: "error" | "warning";
    message: string;
    /** 1-based line number inside the block, when it could be determined */
    line?: number;
}

export interface ParseOutcome<T> {
    value: T | null;
    diagnostics: Diagnostic[];
}

/**
 * Canonical key <- its synonyms, built from the schema.
 *
 * The schema already declares `aliases` next to every key, because the agent
 * reference is generated from it. A second hand-kept copy here is a second
 * place to forget: a key could gain a synonym in the documentation that the
 * parser had never heard of.
 *
 * Importing the schema from `shared/` is not a cycle — JSON imports nothing —
 * and the dependency is honest: this module parses block configs, and the
 * schema is what a block config is.
 */
export const KEY_ALIASES: Record<string, string> = buildAliases();

/**
 * Keys whose value may be a map of its own, by the schema's `map` type:
 * `period: { from: 2026-09-01, to: 2026-09-30 }` (B-129). That map's keys
 * belong to the value, not to the block, so no synonym is applied inside
 * it: `from` is otherwise a synonym of `source`.
 */
const MAP_KEYS: ReadonlySet<string> = buildMapKeys();

interface SchemaField {
    aliases?: readonly string[];
    type?: string;
}

/**
 * Every field of every block level. One cast, over data whose shape differs
 * per block: `today` has no item level, `heatmap` no columns. Typing each
 * block separately would describe the schema twice over, which is the
 * duplication this is removing.
 */
function schemaFields(): [string, SchemaField][] {
    const blocks = schema.blocks as unknown as Record<
        string,
        { root?: Record<string, SchemaField>; item?: Record<string, SchemaField> }
    >;
    const out: [string, SchemaField][] = [];
    for (const block of Object.values(blocks)) {
        for (const level of [block.root, block.item]) {
            if (level) out.push(...Object.entries(level));
        }
    }
    return out;
}

function buildAliases(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [canonical, field] of schemaFields()) {
        for (const alias of field.aliases ?? []) out[alias] = canonical;
    }
    return out;
}

function buildMapKeys(): Set<string> {
    return new Set(schemaFields().filter(([, field]) => field.type?.split("|").includes("map")).map(([key]) => key));
}

/**
 * A block's canonical keys — the ones that must not be renamed.
 *
 * Synonyms are global, block keys are not, and they overlap: `title` is a
 * synonym of `label` for a tile, but heatmap's own heading key. Without the
 * context, a heatmap heading silently drifted into `label` and was lost, while
 * the config author got a meaningless "unknown key label, did you mean title".
 */
export interface KeyContext {
    /** canonical keys of the block root */
    root?: readonly string[];
    /** canonical keys of a list item */
    item?: readonly string[];
    /**
     * The block reads a root map without an `items:` list as a single item
     * (`asItems`), so such a root is canonicalized against the item keys too:
     * `folder:` in a one-card `stats` block still means `source`.
     */
    bareItem?: boolean;
}

/**
 * Rewrites object keys to their canonical names, recursively.
 *
 * With a key set for the current level, a synonym is applied only when its
 * canonical key belongs to that set. Otherwise the key stays as written, so
 * the unknown-key warning names what the author wrote, not a key they never
 * saw: `folder:` in `today` is reported as `folder`, not as `source`.
 *
 * A level with no key set (no context at all, or `item` left out) behaves as
 * it used to, renaming anything found in the synonym table.
 */
export function canonicalize(input: unknown, context: KeyContext = {}): unknown {
    return walk(input, rootKeys(input, context), context);
}

function rootKeys(input: unknown, context: KeyContext): readonly string[] | undefined {
    if (!context.bareItem || !isRecord(input) || Array.isArray(input.items)) return context.root;
    if (context.root === undefined && context.item === undefined) return undefined;
    return [...(context.root ?? []), ...(context.item ?? [])];
}

function walk(input: unknown, keep: readonly string[] | undefined, context: KeyContext): unknown {
    if (Array.isArray(input)) return input.map((v) => walk(v, context.item, context));
    if (input === null || typeof input !== "object") return input;

    const out: Record<string, unknown> = {};
    for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
        const key = canonicalKey(rawKey, keep);
        // past `items:` the list elements begin — they have their own key set;
        // a map-typed key's own map is taken as written (`MAP_KEYS`)
        const walked = MAP_KEYS.has(key) && isRecord(value) ? value : walk(value, key === "items" ? context.item : keep, context);
        // Defined, not assigned: `out["__proto__"] = …` would swap the object's
        // prototype, the key would vanish from the unknown-key check and its
        // fields would quietly read through as if they were the block's own.
        Object.defineProperty(out, key, { value: walked, enumerable: true, writable: true, configurable: true });
    }
    return out;
}

function canonicalKey(rawKey: string, known: readonly string[] | undefined): string {
    // Own entries only: `constructor` or `__proto__` would otherwise find
    // Object.prototype's members and turn a function into a key.
    const target = Object.prototype.hasOwnProperty.call(KEY_ALIASES, rawKey) ? KEY_ALIASES[rawKey] : undefined;
    if (known === undefined) return target ?? rawKey;
    if (target === undefined || known.includes(rawKey) || !known.includes(target)) return rawKey;
    return target;
}

/**
 * YAML to an object. A syntax error is not thrown upwards but returned as a
 * diagnostic carrying the line number.
 */
export function parseConfig(source: string, context: KeyContext = {}): ParseOutcome<unknown> {
    const text = source.trim();
    if (!text) {
        return { value: null, diagnostics: [{ level: "error", message: t("parse.emptyBlock") }] };
    }
    try {
        return { value: canonicalize(parseYaml(text), context), diagnostics: [] };
    } catch (e) {
        const err = e as { message?: string; linePos?: { line: number }[] };
        return {
            value: null,
            diagnostics: [{
                level: "error",
                message: t("parse.yamlError", { message: err.message ?? String(e) }),
                line: err.linePos?.[0]?.line,
            }],
        };
    }
}

/**
 * The list of items. Accepts both a bare array and an object with `items:` —
 * both shapes show up in what models write.
 */
export function asItems(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value) && Array.isArray(value.items)) return value.items.filter(isRecord);
    if (isRecord(value)) return [value];
    return [];
}

/**
 * A value as it should appear in a message about it.
 *
 * `String()` over an object gives "[object Object]", which tells the author
 * nothing about what they wrote. YAML happily produces a map where a string was
 * expected, so this is not a theoretical case.
 */
export function describeValue(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value);
    }
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    try {
        // A map or a list reads back as it was written. A symbol or a function
        // has no reading, and JSON.stringify returns nothing for them.
        return JSON.stringify(value) ?? "[unreadable]";
    } catch {
        return "[unreadable]";
    }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A warning about keys we do not know — with a suggestion.
 *
 * `hints` is a block's own table of keys that belong to a neighbouring
 * block and what the same idea is called here (`layers` is `series` in a
 * chart, ADR 0005). Consulted before the edit-distance guess: none of those
 * words is anywhere near the right key, so the guess alone leaves the author
 * guessing. Data from `schema.json`, never a list kept in a block.
 */
export function unknownKeys(
    obj: Record<string, unknown>,
    known: readonly string[],
    hints: Readonly<Record<string, string>> = {},
): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const key of Object.keys(obj)) {
        if (known.includes(key)) continue;
        const hint = Object.prototype.hasOwnProperty.call(hints, key) ? hints[key] : undefined;
        if (hint !== undefined) {
            out.push({ level: "warning", message: t("parse.unknownKeyHint", { key, hint }) });
            continue;
        }
        const guess = nearest(key, known);
        out.push({
            level: "warning",
            message: guess ? t("parse.unknownKeyGuess", { key, guess }) : t("parse.unknownKey", { key }),
        });
    }
    return out;
}

/** The nearest option by Levenshtein distance, when it is close enough. */
export function nearest(word: string, options: readonly string[]): string | null {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const o of options) {
        const d = distance(word, o);
        if (d < bestScore) {
            bestScore = d;
            best = o;
        }
    }
    return best !== null && bestScore <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

function distance(a: string, b: string): number {
    const prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let carry = prev[0] ?? 0;
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const temp = prev[j] ?? 0;
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            prev[j] = Math.min((prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + 1, carry + cost);
            carry = temp;
        }
    }
    return prev[b.length] ?? 0;
}
