import type { App, TAbstractFile, TFile } from "obsidian";
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

/**
 * The snapshot, kept until something in the vault changes.
 *
 * Taking it is not free — every markdown file, every metadata lookup — and
 * every block on the page needs the same one. Held here rather than in a module
 * variable so that tests cannot leak one vault's snapshot into another's.
 */
export class VaultSnapshot {
    private cached: NoteRecord[] | null = null;

    constructor(private readonly app: App) {}

    get(): readonly NoteRecord[] {
        return (this.cached ??= snapshot(this.app));
    }

    /** Called when the vault or its metadata changed; the next get() rebuilds. */
    invalidate(): void {
        this.cached = null;
    }
}

/** Whether such a note exists. Needed by blocks that link to what is not there yet. */
export function noteExists(app: App, path: string): boolean {
    return app.vault.getAbstractFileByPath(path) !== null;
}

/** `TFolder` is the only other thing either lookup below can hand back. */
function isTFile(file: TAbstractFile): file is TFile {
    return "extension" in file;
}

/**
 * Resolves a `tiles` cover image's vault path (`core/image.ts` has already
 * told a plain path from a wikilink's target and stripped its brackets) to a
 * URL an `<img>` can load. `getFirstLinkpathDest` resolves the way Obsidian's
 * own links do, a bare filename included even when it lives in a
 * sub-folder; `getAbstractFileByPath` is the fallback for an exact path that
 * lookup does not cover. `null` means neither found a file, or what they
 * found is a folder, not an image.
 */
export function resolveImage(app: App, path: string): string | null {
    const file = app.metadataCache.getFirstLinkpathDest(path, "") ?? app.vault.getAbstractFileByPath(path);
    if (!file || !isTFile(file)) return null;
    return app.vault.getResourcePath(file);
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
