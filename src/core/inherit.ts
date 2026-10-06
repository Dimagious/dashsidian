import { describeValue, isRecord, type Diagnostic } from "../shared/parse";
import { t, type MessageKey } from "../i18n";
import { isNotText, readSelector, readSource, readWhere, type SourceSpec } from "./source";
import { parsePeriod } from "./period";
import { readDateField } from "./note-date";

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
     * value replaces them key by key. A `source` or `tag` that is not text
     * is left out, since it selects nothing. `where` is not here because it does not
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
        // A `source` or `tag` that is not text selects nothing and is
        // reported below, once; handed down, every card would repeat it (B-160).
        if ((key === "source" || key === "tag") && isNotText(value[key])) continue;
        defaults[key] = value[key];
    }
    const { spec, diagnostics } = readSource(value);
    for (const key of BLANKABLE) {
        if (isBlank(value[key])) diagnostics.push({ level: "warning", message: t(BLANK_AT_ROOT[key]) });
    }
    // Checked here, once, so a card that inherits it does not repeat it (B-153).
    if (shared.includes("period") && value.period !== undefined && parsePeriod(value.period) === null) {
        diagnostics.push({
            level: "warning",
            message: t("inherit.rootPeriodInvalid", { value: describeValue(value.period) }),
        });
    }
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
): {
    item: Record<string, unknown>;
    source: SourceSpec;
    diagnostics: Diagnostic[];
    /** The keys `item` took from the root because the card did not write them. */
    inherited: ReadonlySet<string>;
} {
    const item = { ...block.defaults, ...card };
    const { spec, diagnostics } = readSource(item);
    const where = combineWhere(block.source.where, spec.where);
    const source: SourceSpec = { ...spec };
    if (where === undefined) delete source.where;
    else source.where = where;
    const inherited = new Set(
        Object.keys(block.defaults).filter((key) => !Object.prototype.hasOwnProperty.call(card, key)),
    );
    return { item, source, diagnostics, inherited };
}

/** The keys whose blank value widens the selection instead of narrowing it. */
const BLANKABLE = ["source", "tag"] as const;
type Blankable = (typeof BLANKABLE)[number];

const BLANK_AT_ROOT: Record<Blankable, MessageKey> = {
    source: "inherit.blankSourceRoot",
    tag: "inherit.blankTagRoot",
};
const BLANK_OVER_ROOT: Record<Blankable, MessageKey> = {
    source: "inherit.blankSource",
    tag: "inherit.blankTag",
};
const BLANK_ALONE: Record<Blankable, MessageKey> = {
    source: "inherit.blankSourceNoRoot",
    tag: "inherit.blankTagNoRoot",
};

/**
 * `source:` or `tag:` written with no value (YAML null), as `""`, or as
 * nothing but whitespace like `"  "`.
 *
 * Either one filters nothing: a blank `source` reads the whole vault and a
 * blank `tag` drops the tag filter. On a card under a root selection it also
 * replaces the root's value, so the card silently reads more than the block
 * around it (B-154). Whitespace is blank by `readSelector`, the same reader
 * the selection itself goes through (B-156).
 */
function isBlank(value: unknown): boolean {
    return value === null || (typeof value === "string" && readSelector(value) === undefined);
}

/**
 * Warnings for a card that writes `source` or `tag` blank (B-154).
 *
 * The behaviour stays: the blank value still replaces the root's. The
 * warning names the card and the key, and says what removing the key would
 * do instead: inherit the root's value when the root has a usable one, and
 * otherwise nothing different, so it only confirms the whole vault or no tag
 * filter was meant. `cardLabel` is the card as the block names it.
 */
export function blankSelectionDiagnostics(
    card: Record<string, unknown>,
    block: BlockSelection,
    cardLabel: string,
): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const key of BLANKABLE) {
        if (!isBlank(card[key])) continue;
        const rootValue = block.defaults[key];
        const overridesRoot = rootValue !== undefined && !isBlank(rootValue);
        const message = overridesRoot ? BLANK_OVER_ROOT[key] : BLANK_ALONE[key];
        out.push({ level: "warning", message: t(message, { card: cardLabel }) });
    }
    return out;
}

/**
 * One warning for a root `date_field` that no note selected by the cards
 * that inherit it carries (B-153), naming those cards. Empty when no card
 * fell short. A card's own `date_field` keeps its per-card warning instead.
 */
export function undatedRootDiagnostics(block: BlockSelection, cards: readonly string[]): Diagnostic[] {
    const field = readDateField(block.defaults);
    if (!field || !cards.length) return [];
    return [{
        level: "warning",
        message: t("inherit.rootDateFieldUndated", { field, cards: cards.join(", ") }),
    }];
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
