import { MarkdownRenderChild, Plugin, debounce } from "obsidian";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import { applyObsidianLocale } from "../adapters/locale";
import { VaultSnapshot } from "../adapters/vault";
import type { BlockContext } from "../blocks/context";
import { renderCountdown } from "../blocks/countdown";
import { renderHeatmap } from "../blocks/heatmap";
import { renderProgress } from "../blocks/progress";
import { renderStats } from "../blocks/stats";
import { renderToday } from "../blocks/today";
import { renderTiles } from "../blocks/tiles";
import { BlockRefresher } from "./refresh";
import { DashySettingTab } from "../ui/settings";

type Draw = (ctx: BlockContext, source: string, el: HTMLElement) => void;

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

    async onload(): Promise<void> {
        await this.loadSettings();

        // Once, before anything renders: Obsidian needs a restart to change
        // its own language, so there is nothing to react to later.
        applyObsidianLocale();

        this.snapshot = new VaultSnapshot(this.app);
        this.refresher = new BlockRefresher(() => this.snapshot.invalidate());

        for (const [name, draw] of Object.entries(BLOCKS)) {
            this.registerMarkdownCodeBlockProcessor(name, (source, el, ctx) => {
                ctx.addChild(new DashyBlock(el, this.refresher, () => {
                    draw(this.context(), source, el);
                }));
            });
        }

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

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
    constructor(
        el: HTMLElement,
        private readonly refresher: BlockRefresher,
        private readonly draw: () => void,
    ) {
        super(el);
    }

    override onload(): void {
        this.refresher.register(this.redraw);
        this.redraw();
    }

    override onunload(): void {
        this.refresher.unregister(this.redraw);
    }

    private readonly redraw = (): void => {
        this.draw();
    };
}
