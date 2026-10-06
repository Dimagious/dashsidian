/**
 * Keeping drawn blocks in step with the vault.
 *
 * A block draws from a snapshot taken once, so it subscribes here and redraws
 * when the data underneath it changes: a note added, edited, renamed or
 * deleted. The half-read vault of a cold start, where Obsidian lists the files
 * long before it has parsed their frontmatter, is held back by `IndexGate`
 * (`indexing.ts`, B-179); the redraw that follows indexing still comes
 * through here.
 *
 * No Obsidian imports: what to listen to is the plugin's business, this only
 * keeps the list and calls it.
 */
export class BlockRefresher {
    private readonly drawers = new Set<() => void>();

    /**
     * `beforeRefresh` runs before notifying anyone — the plugin drops the
     * cached snapshot there. `onError` sees anything a block throws while
     * redrawing, so a failure is reported rather than swallowed.
     */
    constructor(
        private readonly beforeRefresh: () => void = () => undefined,
        private readonly onError: (error: unknown) => void = () => undefined,
    ) {}

    /** A block starts listening when it is rendered into the document. */
    register(draw: () => void): void {
        this.drawers.add(draw);
    }

    /**
     * And stops when its section is taken off the page. Without this the set
     * grows for every note ever opened, and redrawing walks detached elements.
     */
    unregister(draw: () => void): void {
        this.drawers.delete(draw);
    }

    /** How many blocks are currently on screen. For tests and for sanity. */
    get size(): number {
        return this.drawers.size;
    }

    /**
     * A copy of the set is iterated: a block that unregisters itself while
     * redrawing would otherwise break the loop for the ones after it.
     *
     * And each one is isolated. Obsidian isolates the first render of a block,
     * but this loop is ours: a single throw here would abort it, and every
     * block after the failing one would keep showing stale numbers on every
     * later vault change, with nothing on screen to say so.
     */
    refresh(): void {
        this.beforeRefresh();
        for (const draw of [...this.drawers]) {
            try {
                draw();
            } catch (e) {
                this.onError(e);
            }
        }
    }
}
