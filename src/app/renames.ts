/**
 * Where a note that has been renamed since its blocks were drawn lives now.
 *
 * A code block processor is handed the note's path once, when the block is
 * first drawn, and Obsidian keeps the block alive across a rename. `period:
 * note` reads its window from that path (B-129), so a block in `2026-W4` that
 * the author renames to `2026-W40` would otherwise keep reading the old name
 * until the note is reopened.
 *
 * No Obsidian imports: the plugin reports each rename and each new note,
 * this keeps the trail.
 */
export class RenameTrail {
    /**
     * A path a note was drawn at -> the path it has now. Kept one step deep:
     * a rename rewrites every entry that pointed at the old path, so the map
     * holds at most one entry per path a note ever left.
     */
    private readonly moves = new Map<string, string>();

    renamed(oldPath: string, newPath: string): void {
        if (oldPath === newPath) return;
        for (const [from, to] of this.moves) {
            if (to === oldPath) this.moves.set(from, newPath);
        }
        this.moves.set(oldPath, newPath);
        // The new path is current again, even if a note once moved away from it.
        this.moves.delete(newPath);
    }

    /**
     * A note created at `path`, a fresh `2026-W40` from a template after the
     * old one was renamed away: its blocks are its own, not the renamed note's.
     */
    created(path: string): void {
        this.moves.delete(path);
    }

    /** The path a note first seen at `path` has now. */
    current(path: string): string {
        return this.moves.get(path) ?? path;
    }
}
