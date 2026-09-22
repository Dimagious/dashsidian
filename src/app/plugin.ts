import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import { applyObsidianLocale } from "../adapters/locale";
import { renderCountdown } from "../blocks/countdown";
import { renderHeatmap } from "../blocks/heatmap";
import { renderProgress } from "../blocks/progress";
import { renderStats } from "../blocks/stats";
import { renderToday } from "../blocks/today";
import { renderTiles } from "../blocks/tiles";
import { DashySettingTab } from "../ui/settings";

export default class DashyPlugin extends Plugin {
    settings: DashySettings = { ...DEFAULT_SETTINGS };

    async onload(): Promise<void> {
        await this.loadSettings();

        // Once, before anything renders: Obsidian needs a restart to change
        // its own language, so there is nothing to react to later.
        applyObsidianLocale();

        this.registerMarkdownCodeBlockProcessor("tiles", (source, el) => {
            renderTiles(this.app, source, el);
        });
        this.registerMarkdownCodeBlockProcessor("stats", (source, el) => {
            renderStats(this.app, source, el);
        });
        this.registerMarkdownCodeBlockProcessor("progress", (source, el) => {
            renderProgress(this.app, source, el);
        });
        this.registerMarkdownCodeBlockProcessor("today", (source, el) => {
            renderToday(this.app, this.settings, source, el);
        });
        this.registerMarkdownCodeBlockProcessor("countdown", (source, el) => {
            renderCountdown(this.app, source, el);
        });
        this.registerMarkdownCodeBlockProcessor("heatmap", (source, el) => {
            renderHeatmap(this.app, source, el);
        });

        this.addSettingTab(new DashySettingTab(this.app, this));
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
