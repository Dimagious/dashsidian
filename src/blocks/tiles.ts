import type { BlockContext } from "./context";
import { selectNotes, readSource, unmatchedSource } from "../core/source";
import { readDateField } from "../core/note-date";
import { readPeriod, filterByPeriod, dateFieldHasEffect } from "../core/period";
import { firstDayOfWeek } from "../adapters/datetime";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, internalLink } from "../shared/render";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN_ITEM = Object.keys(schema.blocks.tiles.item);
const KNOWN_ROOT = Object.keys(schema.blocks.tiles.root);

interface TileBadge {
    text: string;
    /** an honest zero, styled differently from a real count */
    empty: boolean;
}

interface Tile {
    label: string;
    path: string;
    accent: boolean;
    icon?: string;
    sub?: string;
    badge?: TileBadge;
}

export function renderTiles(ctx: BlockContext, source: string, el: HTMLElement): void {
    clearBlock(el);
    const { value, diagnostics } = parseConfig(source, { root: KNOWN_ROOT, item: KNOWN_ITEM });
    const diags: Diagnostic[] = [...diagnostics];
    const items = asItems(value);

    if (!items.length) {
        // A parse failure already said what was wrong; adding "the list is
        // empty" on top of "the block is empty" is noise, and the two read as
        // two separate problems.
        if (value !== null) diags.push({ level: "error", message: t("tiles.empty") });
        renderDiagnostics(el, "tiles", diags);
        return;
    }
    // Root keys are only checked for the `items:` shape. A single tile written
    // as a bare object is a list of one, and checking its own keys against the
    // root set told the author that `label` and `path` were unknown.
    if (isRecord(value) && Array.isArray(value.items)) diags.push(...unknownKeys(value, KNOWN_ROOT));

    const columns = isRecord(value) && typeof value.columns === "number" ? value.columns : 4;
    const notes = ctx.notes();
    // One clock and one first-day-of-week reading for every tile on the
    // page, the same as `stats`: every `period` window on this dashboard
    // measures the same "today".
    const today = ctx.today();
    const firstDay = firstDayOfWeek();

    // First pass: read every tile into a plain model and collect every
    // diagnostic, root and per-item alike, into one array. Nothing is drawn
    // here — `renderDiagnostics` needs the whole list up front to dedupe two
    // tiles pointing at the same missing folder into a single line, and the
    // diagnostics box has to sit above the grid, not stitched between tiles.
    const tiles: Tile[] = [];

    for (const item of items) {
        diags.push(...unknownKeys(item, KNOWN_ITEM));

        const label = typeof item.label === "string" ? item.label : "";
        const path = typeof item.path === "string" ? item.path : "";
        if (!label && !path) continue;

        const cardLabel = label ? `"${label}"` : t("stats.unlabeledCard");
        const isCountBadge = item.badge === "count" || item.badge === true;
        const hasSelectionKeys =
            item.tag !== undefined || item.where !== undefined ||
            item.period !== undefined || item.date_field !== undefined;

        const tile: Tile = { label: label || path, path, accent: item.accent === true };
        if (typeof item.icon === "string") tile.icon = item.icon;
        if (typeof item.sub === "string") tile.sub = item.sub;

        if (isCountBadge) {
            const missing = unmatchedSource(notes, { source: path });
            if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });

            // `path` is the tile's own folder key; `tag` and `where` narrow it
            // further, read the same way `stats` reads its own selection.
            const { spec: selection, diagnostics: sourceDiags } = readSource(item);
            selection.source = path;
            diags.push(...sourceDiags);
            const selected = selectNotes(notes, selection);

            const dateField = readDateField(item);
            const { spec: periodSpec, diagnostics: periodDiags } = readPeriod(item, label, dateField);
            diags.push(...periodDiags);

            // Only `period` reads a note's date here; there is no `streak`,
            // `latest` or `trend` on a tile for `date_field` to steer.
            if (dateField && !dateFieldHasEffect(item.period !== undefined)) {
                diags.push({ level: "warning", message: t("tiles.dateFieldUnused", { card: cardLabel }) });
            }

            let counted = selected;
            if (periodSpec) {
                const windowed = filterByPeriod(selected, periodSpec.period, today, firstDay, periodSpec.dateField);
                if (selected.length && !windowed.anyDated) {
                    diags.push({
                        level: "warning",
                        message: periodSpec.dateField
                            ? t("period.noDatedNotesField", { card: cardLabel, field: periodSpec.dateField })
                            : t("period.noDatedNotes", { card: cardLabel }),
                    });
                }
                counted = windowed.notes;
            }

            const count = counted.length;
            tile.badge = { text: String(count), empty: count === 0 };
        } else {
            // `tag`, `where`, `period` and `date_field` only mean something
            // next to `badge: count`; a custom badge never counts anything.
            if (hasSelectionKeys) {
                diags.push({ level: "warning", message: t("tiles.selectionUnused", { card: cardLabel }) });
            }
            if (typeof item.badge === "string" || typeof item.badge === "number") {
                tile.badge = { text: String(item.badge), empty: false };
            }
        }

        tiles.push(tile);
    }

    // Diagnostics before the grid: an error or a warning must be seen before
    // the tiles are, the same order every other block draws in.
    renderDiagnostics(el, "tiles", diags);

    const grid = el.createDiv({ cls: "dashy-tiles" });
    grid.style.setProperty("--dashy-tile-columns", String(Math.max(1, Math.min(8, columns))));

    for (const tile of tiles) {
        const tileEl = grid.createDiv({ cls: tile.accent ? "dashy-tile dashy-tile-accent" : "dashy-tile" });
        const link = tile.path
            ? internalLink(tileEl, tile.path, "dashy-tile-link")
            : tileEl.createDiv({ cls: "dashy-tile-link" });

        if (tile.icon) link.createSpan({ cls: "dashy-tile-icon", text: tile.icon });

        const labelEl = link.createSpan({ cls: "dashy-tile-label", text: tile.label });
        if (tile.badge) {
            labelEl.createSpan({
                cls: tile.badge.empty ? "dashy-tile-badge is-empty" : "dashy-tile-badge",
                text: tile.badge.text,
            });
        }

        if (tile.sub) link.createSpan({ cls: "dashy-tile-sub", text: tile.sub });
    }
}
