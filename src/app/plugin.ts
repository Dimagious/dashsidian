import { Plugin, debounce, type Debouncer } from "obsidian";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import { applyLocale } from "../adapters/locale";
import { VaultSnapshot } from "../adapters/vault";
import { mergeSettings } from "../core/settings";
import { createDayRollover, type DayRollover } from "../core/day-rollover";
import { buildContext, type BlockContext } from "../blocks/context";
import { renderCountdown } from "../blocks/countdown";
import { renderHeatmap } from "../blocks/heatmap";
import { renderChart } from "../blocks/chart";
import { renderProgress } from "../blocks/progress";
import { renderStats } from "../blocks/stats";
import { renderToday } from "../blocks/today";
import { renderTiles } from "../blocks/tiles";
import { BlockRefresher } from "./refresh";
import { DashyBlock, type Draw } from "./block";
import { fenceName, registerBlocks } from "./register";
import { isPluginEnabled } from "../adapters/plugins";
import { t } from "../i18n";
import { InsertBlockModal } from "../ui/insert-block";
import { DashySettingTab } from "../ui/settings";

const BLOCKS: Record<string, Draw> = {
    tiles: renderTiles,
    stats: renderStats,
    progress: renderProgress,
    today: renderToday,
    countdown: renderCountdown,
    heatmap: renderHeatmap,
    chart: renderChart,
};

/** How long to wait for the vault to stop changing before redrawing. */
const REFRESH_DELAY_MS = 400;

export default class DashyPlugin extends Plugin {
    settings: DashySettings = { ...DEFAULT_SETTINGS };

    private snapshot!: VaultSnapshot;
    private refresher!: BlockRefresher;
    private scheduled: Debouncer<[], void> | null = null;
    private dayRollover!: DayRollover;

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

        // With Obsidian Charts enabled, `chart` is left to it on purpose (B-137):
        // that is the expected setup, not something to warn about.
        const { taken, yielded } = registerBlocks(BLOCKS, (name, draw) => {
            this.registerMarkdownCodeBlockProcessor(name, (source, el, ctx) => {
                ctx.addChild(new DashyBlock(el, this.refresher, draw, () => this.context(), source));
            });
        }, (id) => isPluginEnabled(this.app, id));
        if (taken.length > 0) {
            console.warn(`[dashy] another plugin already handles these code blocks: ${taken.join(", ")}. Use dashy-chart for a Dashy chart.`);
        }

        // The way in for someone who does not keep the YAML in their head.
        this.addCommand({
            id: "insert-block",
            name: t("insert.name"),
            editorCallback: (editor) => {
                new InsertBlockModal(this.app, editor, this.snapshot.get(), (name) => fenceName(name, yielded)).open();
            },
        });

        this.watchVault();
        // Redraws once the effective day rolls over, even with no vault
        // activity to trigger `watchVault`'s listeners: a dashboard left
        // open past the boundary would otherwise keep showing yesterday's
        // `today` block and yesterday's `period` windows until some
        // unrelated vault event happened to fire. See `core/day-rollover.ts`.
        this.dayRollover = createDayRollover({
            startHour: this.settings.startDayHour,
            now: () => new Date(),
            setTimeout: (fn, delay) => window.setTimeout(fn, delay),
            clearTimeout: (handle) => window.clearTimeout(handle),
            onRollover: () => this.refresher.refresh(),
        });
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
        return buildContext({ app: this.app, notes: () => this.snapshot.get(), settings: this.settings });
    }

    /**
     * `registerEvent` detaches the listeners, but a redraw already armed by the
     * debounce would still fire afterwards and walk blocks that are gone.
     */
    override onunload(): void {
        this.scheduled?.cancel();
        this.dayRollover.cancel();
    }

    async loadSettings(): Promise<void> {
        // loadData() is typed `any`; mergeSettings says what we expect and
        // fills in every default, which keeps the rest of the plugin from
        // inheriting the `any`.
        this.settings = mergeSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        this.settings = { ...this.settings };
        await this.saveData(this.settings);
        // The hour may have just changed, which moves where the next
        // boundary is; the timer armed for the old hour would otherwise fire
        // at the wrong moment.
        this.dayRollover.rearm(this.settings.startDayHour);
        this.refresher.refresh();
    }
}
