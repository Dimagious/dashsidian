import type { App, TFile } from "obsidian";
import type { NoteRecord } from "../core/source";

/**
 * A snapshot of the vault metadata. The only place where blocks touch Obsidian
 * directly — everything past it is the pure core/.
 *
 * We read metadataCache rather than Dataview: the plugin should not depend on
 * something the user may not have installed.
 */
export function snapshot(app: App): NoteRecord[] {
    return app.vault.getMarkdownFiles().map((file) => toRecord(app, file));
}

/** Whether such a note exists. Needed by blocks that link to what is not there yet. */
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
