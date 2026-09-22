import type { App, TFile } from "obsidian";
import type { NoteRecord } from "../core/source";

/**
 * Снимок метаданных хранилища. Единственное место, где блоки касаются
 * Obsidian напрямую, — дальше работает чистый core/.
 *
 * Читаем metadataCache, а не Dataview: плагину не нужна зависимость,
 * которой может не оказаться у пользователя.
 */
export function snapshot(app: App): NoteRecord[] {
    return app.vault.getMarkdownFiles().map((file) => toRecord(app, file));
}

/** Есть ли такая заметка. Нужно блокам, которые рисуют ссылку на ещё не созданное. */
export function noteExists(app: App, path: string): boolean {
    return app.vault.getAbstractFileByPath(path) !== null;
}

export function toRecord(app: App, file: TFile): NoteRecord {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;

    const tags = new Set<string>();
    for (const t of cache?.tags ?? []) tags.add(t.tag.replace(/^#/, ""));
    const fmTags = frontmatter.tags ?? frontmatter.tag;
    if (Array.isArray(fmTags)) {
        for (const t of fmTags) tags.add(String(t).replace(/^#/, ""));
    } else if (typeof fmTags === "string") {
        for (const t of fmTags.split(/[,\s]+/)) if (t) tags.add(t.replace(/^#/, ""));
    }

    const parent = file.parent?.path ?? "";
    return {
        path: file.path,
        name: file.basename,
        folder: parent === "/" ? "" : parent,
        tags: [...tags],
        frontmatter,
    };
}
