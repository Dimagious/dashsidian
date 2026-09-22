import type { App } from "obsidian";
import type { NoteRecord } from "../core/source";
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
}
