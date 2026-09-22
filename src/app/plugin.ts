import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import { renderHeatmap } from "../blocks/heatmap";
import { renderTiles } from "../blocks/tiles";
import { DashySettingTab } from "../ui/settings";

export default class DashyPlugin extends Plugin {
    settings: DashySettings = { ...DEFAULT_SETTINGS };

    async onload(): Promise<void> {
        await this.loadSettings();

        this.registerMarkdownCodeBlockProcessor("tiles", (source, el) => {
            renderTiles(this.app, source, el);
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
