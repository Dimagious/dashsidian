import type { Diagnostic } from "./parse";
import { t } from "../i18n";

/**
 * Obsidian can call a code block processor again on an element it has already
 * rendered — enabling the plugin while a note is open is enough to trigger it.
 * Blocks append rather than replace, so without clearing first the reader sees
 * every block twice. Found by rendering into a real Obsidian, not a DOM fake.
 */
export function clearBlock(el: HTMLElement): void {
    el.empty();
}

/**
 * Diagnostics are drawn inside the block itself. A silently empty block is the
 * worst outcome: the config author (often an agent) has no other feedback
 * channel.
 */
export function renderDiagnostics(el: HTMLElement, blockName: string, diagnostics: readonly Diagnostic[]): void {
    if (!diagnostics.length) return;
    const box = el.createDiv({ cls: "dashy-diagnostics" });
    for (const d of diagnostics) {
        const row = box.createDiv({ cls: `dashy-diag dashy-diag-${d.level}` });
        const where = d.line ? ` (${t("render.line", { line: d.line })})` : "";
        row.setText(`${d.level === "error" ? "⛔" : "⚠️"} ${blockName}${where}: ${d.message}`);
    }
}

/** A link into the vault: Obsidian intercepts clicks on .internal-link. */
export function internalLink(parent: HTMLElement, path: string, cls: string): HTMLAnchorElement {
    return parent.createEl("a", {
        cls: `${cls} internal-link`,
        href: path,
        attr: { "data-href": path },
    });
}
