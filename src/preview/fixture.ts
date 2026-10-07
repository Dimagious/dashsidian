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
import { effectiveToday } from "../core/today";
import { DEFAULT_SETTINGS } from "../types";
import { renderTiles } from "../blocks/tiles";
import { renderStats } from "../blocks/stats";
import { renderProgress } from "../blocks/progress";
import { renderToday } from "../blocks/today";
import { renderCountdown } from "../blocks/countdown";
import { renderHeatmap } from "../blocks/heatmap";
import { renderChart } from "../blocks/chart";
import { formatDate } from "../adapters/datetime";

export type Draw = (ctx: BlockContext, source: string, el: HTMLElement) => void;

export const BLOCKS: Record<string, Draw> = {
    tiles: renderTiles,
    stats: renderStats,
    progress: renderProgress,
    today: renderToday,
    countdown: renderCountdown,
    heatmap: renderHeatmap,
    chart: renderChart,
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
    // Races, one note each, for `pick: next` (B-170): one behind, two ahead
    // in the wrong order by name, and one with no date yet.
    const inDays = (days: number): string =>
        dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
    const races: [string, string][] = [
        ["Spring half", inDays(-30)], ["Autumn 70.3", inDays(60)], ["City 10k", inDays(12)], ["Ultra", "TBD"],
    ];
    for (const [name, date] of races) {
        notes.push({ path: `Races/${name}.md`, name, folder: "Races", tags: [], frontmatter: { date } });
    }
    for (let back = 0; back < 120; back++) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
        // Skip a day here and there: a solid block of colour hides nothing.
        // One of those gaps (back === 3) gets a vacation-only note instead
        // of nothing at all, so a `skip_field` heatmap case has an
        // unpainted special day to hatch, visibly different from an
        // ordinary gap with no note at all.
        if (back % 11 === 3) {
            if (back === 3) {
                notes.push({
                    path: `Diary/${dayKey(date)}.md`,
                    name: dayKey(date),
                    folder: "Diary",
                    tags: [],
                    frontmatter: { vacation: true },
                });
            }
            continue;
        }
        const wave = Math.sin(back / 9);
        // A night's sleep as a watch export writes it (B-121): mostly
        // `7h 12min`, every fifth night the clock form `7:12`.
        const sleepMinutes = Math.round(420 + wave * 55);
        const hours = Math.floor(sleepMinutes / 60);
        const minutes = sleepMinutes % 60;
        const sleepDuration = back % 5 === 0
            ? `${hours}:${String(minutes).padStart(2, "0")}`
            : `${hours}h ${minutes}min`;
        notes.push({
            path: `Diary/${dayKey(date)}.md`,
            name: dayKey(date),
            folder: "Diary",
            tags: [],
            frontmatter: {
                sleep_score: Math.round(78 + wave * 14),
                steps: Math.round(9000 + wave * 4500),
                sleep_duration: sleepDuration,
                // A second day off (back === 8), painted like any other day,
                // so the same `skip_field` case also shows the hatch over a
                // cell that keeps its own colour.
                ...(back === 8 ? { vacation: true } : {}),
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
            // Folders are derived from note paths, so folder tiles show as such.
            getAbstractFileByPath: (path: string) =>
                notes.some((n) => n.path === path)
                    ? { path, extension: "md" }
                    : notes.some((n) => n.path.startsWith(`${path}/`))
                      ? { path, children: [] }
                      : null,
            // A fake, but stable: `tiles`' cover image resolves through it.
            getResourcePath: (file: { path: string }) => `app://local/${file.path}`,
        },
        metadataCache: {
            getFileCache: (file: { note?: NoteRecord }) => ({
                frontmatter: file.note?.frontmatter ?? {},
                tags: [],
            }),
            // No non-markdown attachment lives in this fake vault, so this
            // only ever resolves a note by its exact path.
            getFirstLinkpathDest: (linkpath: string) =>
                notes.some((n) => n.path === linkpath) ? { path: linkpath, extension: "md" } : null,
        },
    } as unknown as App;

    const settings = { ...DEFAULT_SETTINGS, dailyFolder: "Diary" };
    return {
        app,
        notes: () => notes,
        settings,
        today: () => effectiveToday(new Date(), settings.startDayHour),
    };
}

/**
 * Dates that have to move with the calendar, or the stand goes stale.
 * `LAST_WEEK` and `NEXT_WEEK` are ISO week names (B-129), `2026-W40`.
 */
export function withDates(source: string): string {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const week = (days: number): string =>
        formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days), "GGGG-[W]WW");
    return source
        .replace("TODAY", dayKey(today))
        .replace("TOMORROW", dayKey(tomorrow))
        .replace(/LAST_WEEK/g, week(-7))
        .replace(/NEXT_WEEK/g, week(7));
}
