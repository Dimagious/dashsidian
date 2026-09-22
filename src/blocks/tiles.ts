import type { App } from "obsidian";
import { snapshot } from "../adapters/vault";
import { selectNotes } from "../core/source";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { renderDiagnostics, internalLink } from "../shared/render";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN_ITEM = Object.keys(schema.blocks.tiles.item);
const KNOWN_ROOT = Object.keys(schema.blocks.tiles.root);

export function renderTiles(app: App, source: string, el: HTMLElement): void {
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
    if (isRecord(value) && !Array.isArray(value)) diags.push(...unknownKeys(value, KNOWN_ROOT));

    const columns = isRecord(value) && typeof value.columns === "number" ? value.columns : 4;
    const notes = snapshot(app);

    renderDiagnostics(el, "tiles", diags);

    const grid = el.createDiv({ cls: "dashy-tiles" });
    grid.style.setProperty("--dashy-tile-columns", String(Math.max(1, Math.min(8, columns))));

    for (const item of items) {
        for (const d of unknownKeys(item, KNOWN_ITEM)) renderDiagnostics(el, "tiles", [d]);

        const label = typeof item.label === "string" ? item.label : "";
        const path = typeof item.path === "string" ? item.path : "";
        if (!label && !path) continue;

        const tile = el.ownerDocument.createElement("div");
        tile.className = item.accent === true ? "dashy-tile dashy-tile-accent" : "dashy-tile";
        grid.appendChild(tile);

        const link = path ? internalLink(tile, path, "dashy-tile-link") : tile.createDiv({ cls: "dashy-tile-link" });

        if (typeof item.icon === "string") link.createSpan({ cls: "dashy-tile-icon", text: item.icon });

        const labelEl = link.createSpan({ cls: "dashy-tile-label", text: label || path });
        if (item.badge === "count" || item.badge === true) {
            const count = selectNotes(notes, { source: path }).length;
            labelEl.createSpan({
                cls: count > 0 ? "dashy-tile-badge" : "dashy-tile-badge is-empty",
                text: String(count),
            });
        } else if (typeof item.badge === "string" || typeof item.badge === "number") {
            labelEl.createSpan({ cls: "dashy-tile-badge", text: String(item.badge) });
        }

        if (typeof item.sub === "string") link.createSpan({ cls: "dashy-tile-sub", text: item.sub });
    }
}
