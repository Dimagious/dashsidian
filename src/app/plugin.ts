import { MarkdownRenderChild, Plugin, debounce, type Debouncer } from "obsidian";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import { applyLocale } from "../adapters/locale";
import { VaultSnapshot } from "../adapters/vault";
import type { BlockContext } from "../blocks/context";
import { renderCountdown } from "../blocks/countdown";
import { renderHeatmap } from "../blocks/heatmap";
import { renderProgress } from "../blocks/progress";
import { renderStats } from "../blocks/stats";
import { renderToday } from "../blocks/today";
import { renderTiles } from "../blocks/tiles";
import { BlockRefresher } from "./refresh";
import { t } from "../i18n";
import { InsertBlockModal } from "../ui/insert-block";
import { DashySettingTab } from "../ui/settings";

/**
 * A block draws itself and, if it holds onto anything that outlives a single
 * draw (heatmap's `ResizeObserver`), returns a disposer for it. Most blocks
 * return nothing: a `void`-returning function is assignable here regardless,
 * so `renderTiles` and friends need no change to fit this type.
 */
type Draw = (ctx: BlockContext, source: string, el: HTMLElement) => void | (() => void);

const BLOCKS: Record<string, Draw> = {
    tiles: renderTiles,
    stats: renderStats,
    progress: renderProgress,
    today: renderToday,
    countdown: renderCountdown,
    heatmap: renderHeatmap,
};

/** How long to wait for the vault to stop changing before redrawing. */
const REFRESH_DELAY_MS = 400;

export default class DashyPlugin extends Plugin {
    settings: DashySettings = { ...DEFAULT_SETTINGS };

    private snapshot!: VaultSnapshot;
    private refresher!: BlockRefresher;
    private scheduled: Debouncer<[], void> | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();

        // Before anything renders. Obsidian's own language needs a restart to
        // change, but ours does not: the settings tab re-applies it and every
        // block redraws.
        applyLocale(this.settings.language);

        this.snapshot = new VaultSnapshot(this.app);
        this.refresher = new BlockRefresher(
            () => this.snapshot.invalidate(),
            // A block that throws mid-redraw must not take the rest with it,
            // and must not vanish without a word either.
            (error) => console.error("[dashy] a block failed to redraw", error),
        );

        for (const [name, draw] of Object.entries(BLOCKS)) {
            this.registerMarkdownCodeBlockProcessor(name, (source, el, ctx) => {
                ctx.addChild(new DashyBlock(el, this.refresher, () => {
                    draw(this.context(), source, el);
                }));
            });
        }

        // The way in for someone who does not keep the YAML in their head.
        this.addCommand({
            id: "insert-block",
            name: t("insert.name"),
            editorCallback: (editor) => {
                new InsertBlockModal(this.app, editor, this.snapshot.get()).open();
            },
        });

        this.watchVault();
        this.addSettingTab(new DashySettingTab(this.app, this));
    }

    /**
     * Redraw whenever the data underneath the blocks moves.
     *
     * `resolved` is the one that matters most: it fires when the initial
     * metadata scan finishes, which on a cold start happens well after the
     * first render. Without it a dashboard opened right after Obsidian starts
     * keeps showing the numbers of a half-read vault until something else
     * forces a redraw.
     *
     * Debounced because indexing fires `changed` once per file, and a large
     * vault would otherwise redraw every block thousands of times.
     */
    private watchVault(): void {
        const schedule = debounce(() => this.refresher.refresh(), REFRESH_DELAY_MS, true);
        this.scheduled = schedule;

        this.registerEvent(this.app.metadataCache.on("resolved", schedule));
        this.registerEvent(this.app.metadataCache.on("changed", schedule));
        this.registerEvent(this.app.vault.on("create", schedule));
        this.registerEvent(this.app.vault.on("delete", schedule));
        this.registerEvent(this.app.vault.on("rename", schedule));
    }

    /** Built per draw so a block always reads the current settings. */
    private context(): BlockContext {
        return {
            app: this.app,
            notes: () => this.snapshot.get(),
            settings: this.settings,
        };
    }

    /**
     * `registerEvent` detaches the listeners, but a redraw already armed by the
     * debounce would still fire afterwards and walk blocks that are gone.
     */
    override onunload(): void {
        this.scheduled?.cancel();
    }

    async loadSettings(): Promise<void> {
        // loadData() is typed `any`; saying what we expect keeps the rest of
        // the plugin from inheriting it.
        const stored = (await this.loadData()) as Partial<DashySettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
    }

    async saveSettings(): Promise<void> {
        this.settings = { ...this.settings };
        await this.saveData(this.settings);
        this.refresher.refresh();
    }
}

/**
 * One rendered block.
 *
 * Tying it to the section through `ctx.addChild` is what gives us an unload
 * hook: without it a block would keep listening after its note is closed, and
 * redrawing would walk elements that are no longer attached to anything.
 */
class DashyBlock extends MarkdownRenderChild {
    /** Whatever the last draw handed back to undo on unload (a heatmap's `ResizeObserver`s, most blocks: nothing). */
    private dispose: (() => void) | undefined;

    constructor(
        el: HTMLElement,
        private readonly refresher: BlockRefresher,
        private readonly draw: () => void | (() => void),
    ) {
        super(el);
    }

    override onload(): void {
        this.refresher.register(this.redraw);
        this.redraw();
    }

    override onunload(): void {
        this.refresher.unregister(this.redraw);
        // A redraw already disposes of its own predecessor (heatmap does
        // this itself, before drawing); this is only for the note closing or
        // the block being deleted, after which no further redraw would ever
        // run this block's own cleanup.
        this.dispose?.();
        this.dispose = undefined;
    }

    private readonly redraw = (): void => {
        this.dispose = this.draw() ?? undefined;
    };
}
