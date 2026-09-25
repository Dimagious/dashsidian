import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { DashySettingTab } from "./settings";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import type DashyPlugin from "../app/plugin";

/**
 * `getSettingDefinitions()` is drawn through Obsidian's own `Setting`
 * builder and is covered end to end instead (see `vitest.config.ts`'s
 * exclusion of `src/ui/**`). `getControlValue`/`setControlValue` are plain
 * methods, though, and are exactly where the setting's own contract lives:
 * the dropdown only ever hands back a string, and the "New day starts at"
 * setting is a number, so this is the one place that conversion — and its
 * normalisation of a value the dropdown itself would never produce — can be
 * pinned with a test.
 */
function fakePlugin(settings: DashySettings): DashyPlugin {
    return {
        settings,
        saveSettings: vi.fn(async () => undefined),
    } as unknown as DashyPlugin;
}

describe("DashySettingTab — the New day starts at control", () => {
    it("getControlValue reads the setting back as the dropdown's own string", () => {
        const plugin = fakePlugin({ ...DEFAULT_SETTINGS, startDayHour: 4 });
        const tab = new DashySettingTab({} as App, plugin);
        expect(tab.getControlValue("startDayHour")).toBe("4");
    });

    it("setControlValue stores a valid hour and saves", async () => {
        const plugin = fakePlugin({ ...DEFAULT_SETTINGS });
        const tab = new DashySettingTab({} as App, plugin);
        await tab.setControlValue("startDayHour", "4");
        expect(plugin.settings.startDayHour).toBe(4);
        expect(plugin.saveSettings).toHaveBeenCalledOnce();
    });

    it("a value the dropdown itself would never send is still normalised, not stored as-is", async () => {
        const plugin = fakePlugin({ ...DEFAULT_SETTINGS, startDayHour: 2 });
        const tab = new DashySettingTab({} as App, plugin);
        await tab.setControlValue("startDayHour", "9");
        expect(plugin.settings.startDayHour).toBe(0);
    });

    it("a non-numeric value is normalised to 0 as well", async () => {
        const plugin = fakePlugin({ ...DEFAULT_SETTINGS, startDayHour: 2 });
        const tab = new DashySettingTab({} as App, plugin);
        await tab.setControlValue("startDayHour", "banana");
        expect(plugin.settings.startDayHour).toBe(0);
    });
});
