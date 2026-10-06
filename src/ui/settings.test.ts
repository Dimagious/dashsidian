import { describe, it, expect, vi, afterEach } from "vitest";
import type { App } from "obsidian";
import { DashySettingTab } from "./settings";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import type DashyPlugin from "../app/plugin";
import {
    SKILL_DIR,
    SKILL_PATH,
    SKILL_MARKDOWN,
    SKILL_VERSION,
    REFERENCE_PATH,
    REFERENCE_MARKDOWN,
    COMBINED_MARKDOWN,
} from "../skill/skill-content";

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

/**
 * The skill install (B-164) writes two files through the vault adapter:
 * reference.md, then SKILL.md, which links to it. Driven through a fake
 * adapter that records the folder and the files, the only part of the app
 * the install touches.
 */
function fakeAdapter(existing: Record<string, string> = {}, failOn?: string) {
    const files = new Map(Object.entries(existing));
    const folders = new Set<string>();
    for (const path of files.keys()) folders.add(path.slice(0, path.lastIndexOf("/")));
    const writes: string[] = [];
    return {
        files,
        folders,
        writes,
        exists: vi.fn(async (path: string) => files.has(path) || folders.has(path)),
        mkdir: vi.fn(async (path: string) => {
            folders.add(path);
        }),
        write: vi.fn(async (path: string, data: string) => {
            if (path === failOn) throw new Error("disk full");
            writes.push(path);
            files.set(path, data);
        }),
    };
}

function tabWith(adapter: ReturnType<typeof fakeAdapter>, plugin: DashyPlugin): DashySettingTab {
    return new DashySettingTab({ vault: { adapter } } as unknown as App, plugin);
}

describe("DashySettingTab: installing the skill (B-164)", () => {
    it("a fresh vault gets the folder, reference.md and SKILL.md, and the version is recorded", async () => {
        const adapter = fakeAdapter();
        const plugin = fakePlugin({ ...DEFAULT_SETTINGS });
        await tabWith(adapter, plugin)["installSkill"]();

        expect(adapter.mkdir).toHaveBeenCalledWith(SKILL_DIR);
        // The reference first: SKILL.md never points at a file not written yet.
        expect(adapter.writes).toEqual([REFERENCE_PATH, SKILL_PATH]);
        expect(adapter.files.get(SKILL_PATH)).toBe(SKILL_MARKDOWN);
        expect(adapter.files.get(REFERENCE_PATH)).toBe(REFERENCE_MARKDOWN);
        expect(plugin.settings.installedSkillVersion).toBe(SKILL_VERSION);
        expect(plugin.saveSettings).toHaveBeenCalledOnce();
    });

    it("a single-file install from before the split is updated in place and gains reference.md", async () => {
        const adapter = fakeAdapter({ [SKILL_PATH]: "---\nname: dashy\nversion: 1.7.0\n---\n# old" });
        const plugin = fakePlugin({ ...DEFAULT_SETTINGS, installedSkillVersion: "1.7.0" });
        await tabWith(adapter, plugin)["installSkill"]();

        expect(adapter.mkdir).not.toHaveBeenCalled();
        expect(adapter.files.get(SKILL_PATH)).toBe(SKILL_MARKDOWN);
        expect(adapter.files.get(REFERENCE_PATH)).toBe(REFERENCE_MARKDOWN);
        expect(plugin.settings.installedSkillVersion).toBe(SKILL_VERSION);
    });

    it("installing twice writes the same two files again, nothing else", async () => {
        const adapter = fakeAdapter();
        const plugin = fakePlugin({ ...DEFAULT_SETTINGS });
        const tab = tabWith(adapter, plugin);
        await tab["installSkill"]();
        await tab["installSkill"]();
        expect([...adapter.files.keys()].sort()).toEqual([SKILL_PATH, REFERENCE_PATH].sort());
        expect(adapter.mkdir).toHaveBeenCalledOnce();
    });

    it("a failed write records no version, so the row keeps offering the install", async () => {
        const adapter = fakeAdapter({}, SKILL_PATH);
        const plugin = fakePlugin({ ...DEFAULT_SETTINGS });
        await tabWith(adapter, plugin)["installSkill"]();
        expect(plugin.settings.installedSkillVersion).toBeNull();
        expect(plugin.saveSettings).not.toHaveBeenCalled();
        expect(adapter.files.has(SKILL_PATH)).toBe(false);
    });
});

describe("DashySettingTab: Copy markdown (B-164)", () => {
    afterEach(() => {
        Reflect.deleteProperty(navigator, "clipboard");
    });

    it("copies the process and the reference as one text, the one AGENTS.md carries", async () => {
        const writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        const tab = new DashySettingTab({} as App, fakePlugin({ ...DEFAULT_SETTINGS }));
        await tab["copySkill"]();
        expect(writeText).toHaveBeenCalledWith(COMBINED_MARKDOWN);
    });
});
