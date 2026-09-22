/**
 * The vault and the wiring the stand draws over.
 *
 * Separate from the page so the cases can also be rendered headlessly: the
 * stand used to be rebuilt from scratch every time it was needed because it
 * lived in a scratch directory with nothing holding it to the code.
 */

import type { App } from "obsidian";
import type { NoteRecord } from "../core/source";
import type { BlockContext } from "../blocks/context";
import { DEFAULT_SETTINGS } from "../types";
import { renderTiles } from "../blocks/tiles";
import { renderStats } from "../blocks/stats";
import { renderProgress } from "../blocks/progress";
import { renderToday } from "../blocks/today";
import { renderCountdown } from "../blocks/countdown";
import { renderHeatmap } from "../blocks/heatmap";

export type Draw = (ctx: BlockContext, source: string, el: HTMLElement) => void;

export const BLOCKS: Record<string, Draw> = {
    tiles: renderTiles,
    stats: renderStats,
    progress: renderProgress,
    today: renderToday,
    countdown: renderCountdown,
    heatmap: renderHeatmap,
};

export const dayKey = (d: Date): string =>
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

/** A year of plausible diary notes, ending today, so the heatmap has a shape. */
export function fakeVault(): NoteRecord[] {
    const notes: NoteRecord[] = [
        { path: "Inbox/one.md", name: "one", folder: "Inbox", tags: [], frontmatter: {} },
        { path: "Inbox/two.md", name: "two", folder: "Inbox", tags: [], frontmatter: {} },
    ];
    const today = new Date();
    for (let back = 0; back < 120; back++) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
        // Skip a day here and there: a solid block of colour hides nothing.
        if (back % 11 === 3) continue;
        const wave = Math.sin(back / 9);
        notes.push({
            path: `Diary/${dayKey(date)}.md`,
            name: dayKey(date),
            folder: "Diary",
            tags: [],
            frontmatter: {
                sleep_score: Math.round(78 + wave * 14),
                steps: Math.round(9000 + wave * 4500),
            },
        });
    }
    return notes;
}

export function previewContext(notes: readonly NoteRecord[]): BlockContext {
    const app = {
        vault: {
            getMarkdownFiles: () =>
                notes.map((n) => ({ path: n.path, basename: n.name, parent: { path: n.folder }, note: n })),
            getAbstractFileByPath: (path: string) =>
                notes.some((n) => n.path === path) ? { path } : null,
        },
        metadataCache: {
            getFileCache: (file: { note?: NoteRecord }) => ({
                frontmatter: file.note?.frontmatter ?? {},
                tags: [],
            }),
        },
    } as unknown as App;

    return {
        app,
        notes: () => notes,
        settings: { ...DEFAULT_SETTINGS, dailyFolder: "Diary" },
    };
}

/** Dates that have to move with the calendar, or the stand goes stale. */
export function withDates(source: string): string {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return source.replace("TODAY", dayKey(today)).replace("TOMORROW", dayKey(tomorrow));
}
