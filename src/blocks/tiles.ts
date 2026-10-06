import type { BlockContext } from "./context";
import { selectNotes, readSelector, readSource, unmatchedSource } from "../core/source";
import { readDateField, readDateFormat, unmatchedDateFormat } from "../core/note-date";
import { readPeriod, filterByPeriod, dateFieldHasEffect, futureStart } from "../core/period";
import { classifyImage } from "../core/image";
import { tileTarget, type TileTarget } from "../core/folder-tile";
import { firstDayOfWeek } from "../adapters/datetime";
import { noteDateFormats, periodContext } from "../adapters/periodic";
import { resolveImage, pathKind, revealFolder } from "../adapters/vault";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, renderNotices, internalLink } from "../shared/render";
import { notStartedNotice } from "./window";
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
    /** where a click leads; absent for a tile without a `path` */
    target?: TileTarget;
    accent: boolean;
    icon?: string;
    sub?: string;
    badge?: TileBadge;
    /** a resolved URL, either a vault resource or an https one straight through */
    cover?: string;
}

export function renderTiles(ctx: BlockContext, source: string, el: HTMLElement): void {
    clearBlock(el);
    const { value, diagnostics } = parseConfig(source, { root: KNOWN_ROOT, item: KNOWN_ITEM, bareItem: true });
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
    // B-129: how `period: note`, `2026-W40` and `from`/`to` are read.
    const periodCtx = periodContext(ctx.app, ctx.sourcePath);
    // A badge whose window has not started yet draws nothing and says when it starts.
    const notices: string[] = [];

    // First pass: read every tile into a plain model and collect every
    // diagnostic, root and per-item alike, into one array. Nothing is drawn
    // here — `renderDiagnostics` needs the whole list up front to dedupe two
    // tiles pointing at the same missing folder into a single line, and the
    // diagnostics box has to sit above the grid, not stitched between tiles.
    const tiles: Tile[] = [];

    for (const item of items) {
        diags.push(...unknownKeys(item, KNOWN_ITEM));

        const label = typeof item.label === "string" ? item.label : "";
        // A `path` of only spaces is no path: kept, it linked to "  " and a
        // count badge on it counted the whole vault (B-160).
        const path = readSelector(item.path) ?? "";
        if (!label && !path) continue;

        const cardLabel = label ? `"${label}"` : t("stats.unlabeledCard");
        const isCountBadge = item.badge === "count" || item.badge === true;
        const hasSelectionKeys =
            item.tag !== undefined || item.where !== undefined ||
            item.period !== undefined || item.date_field !== undefined || item.date_format !== undefined;

        const tile: Tile = { label: label || path, accent: item.accent === true };
        // A folder is not a link target: linked as is, it reads as unresolved
        // and a click creates an empty note inside it (B-144).
        if (path) tile.target = tileTarget(path, (p) => pathKind(ctx.app, p));
        if (typeof item.icon === "string") tile.icon = item.icon;
        if (typeof item.sub === "string") tile.sub = item.sub;

        if (typeof item.image === "string") {
            const ref = classifyImage(item.image);
            if (ref.kind === "url") {
                tile.cover = ref.url;
            } else if (ref.kind === "vault") {
                const resolved = resolveImage(ctx.app, ref.path);
                if (resolved) {
                    tile.cover = resolved;
                } else {
                    diags.push({
                        level: "warning",
                        message: t("tiles.imageMissing", { card: cardLabel, path: ref.path }),
                    });
                }
            } else {
                diags.push({ level: "warning", message: t("tiles.imageUnsupported", { card: cardLabel, value: ref.value }) });
            }
        }

        if (isCountBadge) {
            const missing = unmatchedSource(notes, { source: path });
            if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });

            // `path` is the tile's own folder key; `tag` and `where` narrow it
            // further, read the same way `stats` reads its own selection. A tile
            // has no `source` key, so only `tag` and `where` are handed over.
            const { spec: selection, diagnostics: sourceDiags } = readSource({ tag: item.tag, where: item.where });
            selection.source = path;
            diags.push(...sourceDiags);
            const selected = selectNotes(notes, selection);

            const dateField = readDateField(item);
            // B-174: the tile's own day format for names and `date_field`
            // values, tried before the settings one, as on a `stats` card.
            const { format: dateFormat, diagnostics: formatDiags } = readDateFormat(item);
            diags.push(...formatDiags);
            const formats = noteDateFormats(ctx.app, dateFormat);
            const { spec: periodSpec, diagnostics: periodDiags, broken } = readPeriod(item, label, dateField, periodCtx);
            diags.push(...periodDiags);
            const startsOn = periodSpec ? futureStart(periodSpec.period, today) : null;
            if (startsOn !== null) notices.push(notStartedNotice(startsOn));

            // Only `period` reads a note's date here; there is no `streak`,
            // `latest` or `trend` on a tile for `date_field` or `date_format` to steer.
            if (dateField && !dateFieldHasEffect(item.period !== undefined)) {
                diags.push({ level: "warning", message: t("tiles.dateFieldUnused", { card: cardLabel }) });
            }
            if (dateFormat !== undefined && item.period === undefined) {
                diags.push({ level: "warning", message: t("tiles.dateFormatUnused", { card: cardLabel }) });
            }

            let counted = selected;
            if (periodSpec) {
                diags.push(...unmatchedDateFormat(selected, periodSpec.dateField, formats));
                const windowed = filterByPeriod(
                    selected, periodSpec.period, today, firstDay, periodSpec.dateField, formats,
                );
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

            // A window that cannot be built, or has not started, has no count to show.
            if (!broken && startsOn === null) {
                const count = counted.length;
                tile.badge = { text: String(count), empty: count === 0 };
            }
        } else {
            // `tag`, `where`, `period`, `date_field` and `date_format` only mean something
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
    renderNotices(el, notices);

    const grid = el.createDiv({ cls: "dashy-tiles" });
    grid.style.setProperty("--dashy-tile-columns", String(Math.max(1, Math.min(8, columns))));

    for (const tile of tiles) {
        let cls = tile.accent ? "dashy-tile dashy-tile-accent" : "dashy-tile";
        if (tile.cover) cls += " dashy-tile-has-cover";
        const tileEl = grid.createDiv({ cls });
        const link = !tile.target
            ? tileEl.createDiv({ cls: "dashy-tile-link" })
            : tile.target.kind === "folder"
                ? folderLink(ctx, tileEl, tile.target.path)
                : internalLink(tileEl, tile.target.path, "dashy-tile-link");

        if (tile.cover) {
            link.createEl("img", {
                cls: "dashy-tile-cover",
                attr: { src: tile.cover, alt: tile.label },
            });
        }

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

/**
 * A tile for a folder without a folder note. Not an `.internal-link` and
 * without an `href`: Obsidian would offer to create the folder path as a note
 * on any click, middle and modifier clicks included. A click shows the folder
 * in the file explorer instead, and does nothing when the explorer is off.
 */
function folderLink(ctx: BlockContext, parent: HTMLElement, path: string): HTMLAnchorElement {
    const link = parent.createEl("a", {
        cls: "dashy-tile-link dashy-tile-folder",
        attr: { role: "link", tabindex: "0" },
    });
    const reveal = (evt: Event): void => {
        evt.preventDefault();
        evt.stopPropagation();
        revealFolder(ctx.app, path);
    };
    link.addEventListener("click", reveal);
    // A middle click arrives as `auxclick`, not `click`.
    link.addEventListener("auxclick", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
    });
    link.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") reveal(evt);
    });
    return link;
}
