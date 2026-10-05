import { MarkdownRenderChild } from "obsidian";
import type { BlockContext } from "../blocks/context";
import type { BlockRefresher } from "./refresh";

/**
 * A block draws itself and, if it holds onto anything that outlives a single
 * draw (heatmap's `ResizeObserver`, the `today` clock's timer), returns a
 * disposer for it. Most blocks return nothing: a `void`-returning function is
 * assignable here regardless, so `renderTiles` and friends need no change to
 * fit this type.
 */
export type Draw = (ctx: BlockContext, source: string, el: HTMLElement) => void | (() => void);

/**
 * One rendered block.
 *
 * Tying it to the section through `ctx.addChild` is what gives us an unload
 * hook: without it a block would keep listening after its note is closed, and
 * redrawing would walk elements that are no longer attached to anything.
 *
 * It calls the block's `Draw` itself, rather than a closure around it, so
 * whatever disposer the draw hands back cannot be dropped on the way here.
 */
export class DashyBlock extends MarkdownRenderChild {
    /** Whatever the last draw handed back to undo on unload (a heatmap's `ResizeObserver`s, a clock's timer, most blocks: nothing). */
    private dispose: (() => void) | undefined;

    constructor(
        el: HTMLElement,
        private readonly refresher: BlockRefresher,
        private readonly draw: Draw,
        private readonly context: () => BlockContext,
        private readonly source: string,
    ) {
        super(el);
    }

    override onload(): void {
        this.refresher.register(this.redraw);
        this.redraw();
    }

    override onunload(): void {
        this.refresher.unregister(this.redraw);
        // A redraw already disposes of its own predecessor (heatmap and
        // today do this themselves, before drawing); this is only for the
        // note closing or the block being deleted, after which no further
        // redraw would ever run this block's own cleanup.
        this.dispose?.();
        this.dispose = undefined;
    }

    private readonly redraw = (): void => {
        this.dispose = this.draw(this.context(), this.source, this.containerEl) ?? undefined;
    };
}
