import type { App, TAbstractFile, TFile } from "obsidian";
import type { NoteRecord } from "../core/source";
import type { PathKind } from "../core/folder-tile";
import { isRecord } from "../shared/parse";

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

/**
 * The private part of `MetadataCache` that says whether Obsidian is still
 * parsing notes: absent from the public types. `inProgressTaskCount` is the
 * number of notes queued to parse; on a cold start (a vault opened for the
 * first time, a cleared cache) that is every note, and their frontmatter is
 * empty until each is read. `onCleanCache` calls back once nothing is queued
 * and the links are resolved, or at once when that is already so.
 */
interface IndexingCache {
    inProgressTaskCount: number;
    onCleanCache: (callback: () => void) => void;
}

function isIndexingCache(value: unknown): value is IndexingCache {
    return isRecord(value) && typeof value.inProgressTaskCount === "number" && typeof value.onCleanCache === "function";
}

/**
 * Whether Obsidian still has notes queued to parse (B-179). False when its
 * internals are not the expected shape, so the blocks draw as they always did.
 */
export function notesPending(app: App): boolean {
    const cache: unknown = app.metadataCache;
    return isIndexingCache(cache) && cache.inProgressTaskCount > 0;
}

/** Calls `callback` once Obsidian has parsed every queued note; at once when it cannot tell. */
export function whenIndexed(app: App, callback: () => void): void {
    const cache: unknown = app.metadataCache;
    if (isIndexingCache(cache)) cache.onCleanCache(callback);
    else callback();
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
 * What sits at an exact vault path: a file, a folder, or nothing. Lets
 * `core/folder-tile.ts` tell a folder tile from a note tile.
 */
export function pathKind(app: App, path: string): PathKind {
    const found = app.vault.getAbstractFileByPath(path);
    if (!found) return null;
    return isTFile(found) ? "file" : "folder";
}

/** The private part of App: absent from the public types, but stable for years. */
interface InternalPluginHost {
    internalPlugins?: { plugins?: Record<string, unknown> };
}

interface FileExplorer {
    revealInFolder: (file: TAbstractFile) => void;
}

function isFileExplorer(value: unknown): value is FileExplorer {
    return isRecord(value) && typeof value.revealInFolder === "function";
}

/**
 * Shows a folder in the core file explorer, the way its own "Reveal file in
 * navigation" does (B-144). Does nothing when the explorer is switched off,
 * missing, or the folder is gone: a tile click must never create a file and
 * never throw. Returns whether the folder was revealed.
 */
export function revealFolder(app: App, path: string): boolean {
    const folder = app.vault.getAbstractFileByPath(path);
    if (!folder || isTFile(folder)) return false;
    const plugin = (app as unknown as InternalPluginHost).internalPlugins?.plugins?.["file-explorer"];
    if (!isRecord(plugin) || plugin.enabled !== true || !isFileExplorer(plugin.instance)) return false;
    try {
        plugin.instance.revealInFolder(folder);
        return true;
    } catch (error) {
        console.error(`[dashy] could not reveal the folder "${path}" in the file explorer`, error);
        return false;
    }
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
