import type { Diagnostic } from "./parse";

/**
 * Диагностика рисуется в самом блоке. Молча пустой блок — худший исход:
 * у автора конфига (нередко это агент) нет другого канала обратной связи.
 */
export function renderDiagnostics(el: HTMLElement, blockName: string, diagnostics: readonly Diagnostic[]): void {
    if (!diagnostics.length) return;
    const box = el.createDiv({ cls: "dashy-diagnostics" });
    for (const d of diagnostics) {
        const row = box.createDiv({ cls: `dashy-diag dashy-diag-${d.level}` });
        const where = d.line ? ` (строка ${d.line})` : "";
        row.setText(`${d.level === "error" ? "⛔" : "⚠️"} ${blockName}${where}: ${d.message}`);
    }
}

/** Ссылка внутрь хранилища: Obsidian перехватывает клик по .internal-link. */
export function internalLink(parent: HTMLElement, path: string, cls: string): HTMLAnchorElement {
    return parent.createEl("a", {
        cls: `${cls} internal-link`,
        href: path,
        attr: { "data-href": path },
    });
}
