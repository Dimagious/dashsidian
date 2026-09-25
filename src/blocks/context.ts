import type { App } from "obsidian";
import type { NoteRecord } from "../core/source";
import { makeToday } from "../core/today";
import type { DashySettings } from "../types";

/**
 * What a block is given to draw itself.
 *
 * `notes` is a function rather than an array so that the vault is walked once
 * per render cycle and shared by every block on the page — a note with five
 * blocks used to walk the whole vault five times, twice over, since Obsidian
 * renders the same note in both the editor and the reading view.
 */
export interface BlockContext {
    app: App;
    notes: () => readonly NoteRecord[];
    settings: DashySettings;
    /**
     * Today, by the hour the "New day starts at" setting names — see
     * `core/today.ts`. The one source every block reads "today" from, so a
     * page with several blocks agrees with itself about where one day ends
     * and the next begins.
     */
    today: () => Date;
}

/**
 * Builds a `BlockContext`.
 *
 * `app/plugin.ts#context()` is registration wiring the coverage gate does
 * not reach — see the comment on `src/app/plugin.ts` in `vitest.config.ts`
 * — and calling this function is meant to be the only thing left for it to
 * do. Putting the actual "`today` reads `settings.startDayHour`, not a
 * hardcoded hour" decision here instead means that behaviour has somewhere
 * it can be pinned with a real test.
 */
export function buildContext(params: {
    app: App;
    notes: () => readonly NoteRecord[];
    settings: DashySettings;
    /** Defaults to the real clock; a test overrides it. */
    now?: () => Date;
}): BlockContext {
    return {
        app: params.app,
        notes: params.notes,
        settings: params.settings,
        today: makeToday(() => params.settings.startDayHour, params.now),
    };
}
