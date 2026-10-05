import { isRecord, type Diagnostic } from "../shared/parse";
import { readSource, readWhere, type SourceSpec } from "./source";

/**
 * Selection written once at the block root and inherited by every card under
 * it (B-131). Pure layer: no Obsidian, no DOM.
 *
 * Which keys a root may share is not listed here: it is every key the schema
 * declares at both the root and the item level of a block, passed in by the
 * block, so the schema stays the one place keys are named.
 */

export interface BlockSelection {
    /**
     * The root's shared keys other than `where`, as written: a card's own
     * value replaces them key by key. `where` is not here because it does not
     * replace, it narrows further (see `inheritSelection`).
     */
    defaults: Record<string, unknown>;
    /** The root's `source`, `tag` and `where`, read once for the whole block. */
    source: SourceSpec;
    /** What could not be read at the root, reported once rather than per card. */
    diagnostics: Diagnostic[];
}

const NONE: BlockSelection = { defaults: {}, source: {}, diagnostics: [] };

/**
 * Reads the shared keys off a block root.
 *
 * Only the `items:` shape has a root distinct from its cards. A bare list has
 * no root at all, and a single card written as a bare map is its own root:
 * inheriting from it would apply its `where` twice and report a bad one twice.
 */
export function readBlockSelection(value: unknown, shared: readonly string[]): BlockSelection {
    if (!isRecord(value) || !Array.isArray(value.items)) return NONE;

    const defaults: Record<string, unknown> = {};
    for (const key of shared) {
        if (key === "where" || !Object.prototype.hasOwnProperty.call(value, key)) continue;
        defaults[key] = value[key];
    }
    const { spec, diagnostics } = readSource(value);
    return { defaults, source: spec, diagnostics };
}

/**
 * A card with the block root folded in.
 *
 * `item` is the card's config with every inherited key filled in where the
 * card is silent, for the readers that take a whole card (`period`,
 * `date_field`). `source` is the card's selection: its own `source` and
 * `tag` win over the root's, while `where` is the root's conditions and the
 * card's together, every one of which must hold. `diagnostics` covers the
 * card's own `where` only; the root's was reported by `readBlockSelection`.
 */
export function inheritSelection(
    card: Record<string, unknown>,
    block: BlockSelection,
): { item: Record<string, unknown>; source: SourceSpec; diagnostics: Diagnostic[] } {
    const item = { ...block.defaults, ...card };
    const { spec, diagnostics } = readSource(item);
    const where = combineWhere(block.source.where, spec.where);
    const source: SourceSpec = { ...spec };
    if (where === undefined) delete source.where;
    else source.where = where;
    return { item, source, diagnostics };
}

/**
 * Two readable `where` values as one list of conditions.
 *
 * Joined as a list of single conditions rather than as text: every condition
 * in a list must hold, so nothing written on one side can change how the
 * other side reads. Either side alone comes back exactly as it was.
 */
function combineWhere(
    root: SourceSpec["where"],
    own: SourceSpec["where"],
): SourceSpec["where"] {
    if (root === undefined) return own;
    if (own === undefined) return root;
    return [...conditionsOf(root), ...conditionsOf(own)];
}

function conditionsOf(where: string | readonly string[]): string[] {
    const reading = readWhere(where);
    return reading.kind === "ok" ? reading.conditions : [];
}
