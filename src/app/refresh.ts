/**
 * Keeping drawn blocks in step with the vault.
 *
 * A block draws from a snapshot taken once. On a cold start Obsidian lists the
 * files long before it has parsed their frontmatter, so that first snapshot is
 * half empty and the reader is shown wrong numbers — an average over two notes
 * where the vault holds ten — with nothing to tell them so. Blocks therefore
 * subscribe here and redraw when the data underneath them changes.
 *
 * No Obsidian imports: what to listen to is the plugin's business, this only
 * keeps the list and calls it.
 */
export class BlockRefresher {
    private readonly drawers = new Set<() => void>();

    /** Run before notifying anyone — the plugin drops the cached snapshot here. */
    constructor(private readonly beforeRefresh: () => void = () => undefined) {}

    /** A block starts listening when it is rendered into the document. */
    register(draw: () => void): void {
        this.drawers.add(draw);
    }

    /**
     * And stops when its section leaves the document. Without this the set
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
     */
    refresh(): void {
        this.beforeRefresh();
        for (const draw of [...this.drawers]) draw();
    }
}
