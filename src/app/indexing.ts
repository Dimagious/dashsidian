import type { Draw } from "./block";
import { clearBlock, renderNotices } from "../shared/render";
import { t } from "../i18n";

/**
 * Holds blocks back while Obsidian is still parsing the vault (B-179).
 *
 * On a cold start Obsidian lists every note before it has read their
 * frontmatter. A block drawn then counts empty notes and says so with
 * confidence: "no note in the selection has `sleep_duration`" for a field
 * every note has. The redraw that follows indexing fixes the numbers, but a
 * reader, or an agent checking the config it wrote, has already acted on the
 * false warning. So until the queue is empty a block draws one quiet line
 * instead, and is redrawn when indexing is done.
 *
 * Once open the gate stays open: a note edited later is parsed in a moment,
 * and blanking every dashboard for that moment would be worse than the
 * redraw that already follows it.
 *
 * There is no timeout, on purpose: a block waits for as long as Obsidian is
 * parsing. If its metadata worker hangs, the waiting line stays up, and then
 * the line is true: the frontmatter really has not been read, and numbers
 * drawn from it would be the false ones.
 *
 * No Obsidian imports: the plugin passes in how to ask and how to wait.
 */
export class IndexGate {
    private open = false;
    private armed = false;

    /**
     * `pending` says whether notes are still queued to parse. `whenIndexed`
     * calls back once they are not. `onOpen` runs once, as the gate opens:
     * the plugin drops the snapshot there, which may have been taken mid-index.
     * `redraw` redraws every block on screen.
     */
    constructor(
        private readonly pending: () => boolean,
        private readonly whenIndexed: (done: () => void) => void,
        private readonly onOpen: () => void,
        private readonly redraw: () => void,
    ) {}

    /** Whether blocks may draw from the vault. Never false again once true. */
    isOpen(): boolean {
        if (!this.open && !this.pending()) {
            this.open = true;
            this.onOpen();
        }
        return this.open;
    }

    /**
     * A block is waiting: make sure something redraws it when indexing is
     * done. One watch at a time, however many blocks wait. Re-armed after it
     * fires, so a block still waiting then (a note queued in between) is not
     * left on the waiting line until some unrelated vault event.
     */
    wait(): void {
        if (this.armed) return;
        this.armed = true;
        this.whenIndexed(() => {
            this.armed = false;
            this.redraw();
        });
    }
}

/**
 * The blocks that read the vault snapshot and so must wait for it. `today`
 * is not one: it draws the date and links to periodic notes, which needs
 * only the file list Obsidian has before it parses anything, and it is the
 * entry point of a dashboard that should not blank for a whole cold index.
 */
export const READS_VAULT: ReadonlySet<string> = new Set(["tiles", "stats", "progress", "countdown", "heatmap", "chart"]);

/** Each block in `blocks` that reads the vault, behind the gate; the rest as they are. */
export function gateBlocks(blocks: Record<string, Draw>, gate: IndexGate): Record<string, Draw> {
    return Object.fromEntries(
        Object.entries(blocks).map(([name, draw]) => [name, READS_VAULT.has(name) ? gateDraw(draw, gate) : draw]),
    );
}

/** `draw` once the gate is open; until then a line that says what the block is waiting for. */
export function gateDraw(draw: Draw, gate: IndexGate): Draw {
    return (ctx, source, el) => {
        if (gate.isOpen()) return draw(ctx, source, el);
        clearBlock(el);
        renderNotices(el, [t("render.indexing")]);
        gate.wait();
        return undefined;
    };
}
