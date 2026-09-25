/**
 * A fake vault for mount tests.
 *
 * Shaped after what adapters/ actually reads, not after the whole Obsidian API:
 * a block that starts reaching for something else should fail here loudly.
 */

import type { App } from "obsidian";
import type { BlockContext } from "../blocks/context";
import { VaultSnapshot } from "../adapters/vault";
import { effectiveToday } from "../core/today";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";

export interface FakeNote {
    /** path from the vault root, with the extension */
    path: string;
    frontmatter?: Record<string, unknown>;
    /** tags as the metadata cache reports them, without the hash */
    tags?: string[];
}

export interface FakeVault {
    notes?: FakeNote[];
    /** extra paths that exist but are not markdown notes to aggregate over */
    alsoExists?: string[];
    /** settings of the Periodic Notes community plugin, any shape */
    periodicNotes?: unknown;
    /** options of the core Daily notes plugin, any shape */
    dailyNotes?: unknown;
}

function toFile(note: FakeNote) {
    const slash = note.path.lastIndexOf("/");
    const folder = slash === -1 ? "" : note.path.slice(0, slash);
    const basename = note.path.slice(slash + 1).replace(/\.md$/, "");
    return { path: note.path, basename, parent: { path: folder }, note };
}

export function mockApp(vault: FakeVault = {}): App {
    const notes = vault.notes ?? [];
    const files = notes.map(toFile);
    const present = new Set([...files.map((f) => f.path), ...(vault.alsoExists ?? [])]);

    const app = {
        vault: {
            getMarkdownFiles: () => files,
            getAbstractFileByPath: (path: string) =>
                present.has(path) ? { path } : null,
        },
        metadataCache: {
            getFileCache: (file: { note?: FakeNote }) => ({
                frontmatter: file.note?.frontmatter ?? {},
                tags: (file.note?.tags ?? []).map((tag) => ({ tag })),
            }),
        },
    } as Record<string, unknown>;

    if (vault.periodicNotes !== undefined) {
        app.plugins = { plugins: { "periodic-notes": { settings: vault.periodicNotes } } };
    }
    if (vault.dailyNotes !== undefined) {
        app.internalPlugins = {
            plugins: { "daily-notes": { instance: { options: vault.dailyNotes } } },
        };
    }

    return app as unknown as App;
}

/**
 * What a block is handed to draw itself, over a fake vault.
 *
 * The snapshot is the real cached one, so a test that counts vault walks is
 * measuring the thing that ships.
 */
export function mockContext(
    vault: FakeVault = {},
    settings: DashySettings = DEFAULT_SETTINGS,
): BlockContext {
    const app = mockApp(vault);
    const snapshot = new VaultSnapshot(app);
    return {
        app,
        notes: () => snapshot.get(),
        settings,
        // Read at call time, like `notes`, so a test's `vi.setSystemTime`
        // (set after `mockContext` is built) is still what a block sees.
        today: () => effectiveToday(new Date(), settings.startDayHour),
    };
}

/**
 * The same, but counting how many times the vault was walked. The whole point
 * of the cache is that a page full of blocks walks it once.
 */
export function countingContext(vault: FakeVault = {}): {
    ctx: BlockContext;
    walks: () => number;
    invalidate: () => void;
} {
    const app = mockApp(vault);
    const real = app.vault.getMarkdownFiles.bind(app.vault);
    let walks = 0;
    app.vault.getMarkdownFiles = () => {
        walks += 1;
        return real();
    };

    const snapshot = new VaultSnapshot(app);
    return {
        ctx: {
            app,
            notes: () => snapshot.get(),
            settings: DEFAULT_SETTINGS,
            today: () => effectiveToday(new Date(), DEFAULT_SETTINGS.startDayHour),
        },
        walks: () => walks,
        invalidate: () => snapshot.invalidate(),
    };
}

/** `days` notes named as consecutive dates starting at `from`, with frontmatter. */
export function diary(
    folder: string,
    from: string,
    days: number,
    fields: (i: number) => Record<string, unknown>,
): FakeNote[] {
    const [y, m, d] = from.split("-").map(Number) as [number, number, number];
    return Array.from({ length: days }, (_, i) => {
        const date = new Date(y, m - 1, d + i);
        const key = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
        return { path: `${folder}/${key}.md`, frontmatter: fields(i) };
    });
}

/**
 * `days` notes ending today. Anything that measures a trailing window needs
 * dates near now, or the window is empty and the test proves nothing.
 */
export function recentDiary(
    folder: string,
    days: number,
    fields: (i: number) => Record<string, unknown>,
): FakeNote[] {
    const today = new Date();
    return Array.from({ length: days }, (_, i) => {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i));
        const key = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
        return { path: `${folder}/${key}.md`, frontmatter: fields(i) };
    });
}

/** Renders into a detached element, the way a code block processor receives one. */
export function host(): HTMLElement {
    return document.createElement("div");
}

/** Text of every match, trimmed — what a reader would actually see. */
export function texts(el: HTMLElement, selector: string): string[] {
    return Array.from(el.querySelectorAll(selector), (n) => (n.textContent ?? "").trim());
}

/** Every match as an element, for assertions on classes and attributes. */
export function nodes(el: HTMLElement, selector: string): HTMLElement[] {
    return Array.from(el.querySelectorAll<HTMLElement>(selector));
}

/** The diagnostics a block drew, by level. */
export function diagnostics(el: HTMLElement, level: "error" | "warning"): string[] {
    return texts(el, `.dashy-diag-${level}`);
}
