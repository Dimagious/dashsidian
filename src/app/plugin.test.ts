import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Plugin } from "obsidian-test-mocks/obsidian";
import type { Editor, MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import DashyPlugin from "./plugin";
import { InsertBlockModal } from "../ui/insert-block";
import { DashySettingTab } from "../ui/settings";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import manifest from "../../manifest.json";

// `onload` is the one place that wires Dashy to Obsidian: which commands exist, which fences are claimed, what is
// listened to and what is torn down. These tests run the real plugin on the obsidian-test-mocks app and read what
// it registered. The blocks, the modal and the agent tools have tests of their own.

/** 2026-11-12, mid-morning local time, so the day arithmetic below is the same in every time zone. */
const NOW = new Date(2026, 10, 12, 10, 0, 0);
const HOUR = 3600e3;
/** The delay of the refresh after a vault change (REFRESH_DELAY_MS in plugin.ts). */
const REFRESH_DELAY_MS = 400;

const FENCES = ["chart", "countdown", "dashy-chart", "heatmap", "progress", "stats", "tiles", "today"];
const COMMANDS = ["check-blocks", "insert-block", "install-agents", "install-skill", "vault-profile"];

interface Booted {
    app: App;
    plugin: DashyPlugin;
    /** the mock side of the plugin: what it registered */
    mock: Plugin;
}

interface BootOptions {
    files?: Record<string, string>;
    /** what data.json holds */
    data?: unknown;
    /** ids of other community plugins that are installed and enabled */
    enabled?: string[];
    /** runs after the plugin is made and before `onload` */
    beforeLoad?: (plugin: DashyPlugin) => void;
}

/**
 * A real DashyPlugin on a mock app, loaded the way Obsidian loads it (`load()` runs `onload`, and `unload()` runs
 * `onunload` only for a loaded plugin). The mocks throw on an app property they do not model, and Dashy reads x
 */
async function boot(options: BootOptions = {}): Promise<Booted> {
    const app = App.createConfigured__({ files: options.files ?? {} });
    const enabled = options.enabled ?? [];
    Object.assign(app, {
        plugins: { enabledPlugins: new Set(enabled), manifests: Object.fromEntries(enabled.map((id) => [id, { id }])) },
    });
    Object.assign(app, { internalPlugins: undefined });
    Object.assign(app.metadataCache, { inProgressTaskCount: 0, onCleanCache: (done: () => void) => done() });
    const plugin = new DashyPlugin(app.asOriginalType__(), manifest);
    const mock = Plugin.fromOriginalType2__(plugin);
    if (options.data !== undefined) mock.data__ = options.data;
    options.beforeLoad?.(plugin);
    plugin.load();
    // onload is async (it waits for loadData); let it finish.
    await vi.advanceTimersByTimeAsync(0);
    return { app, plugin, mock };
}

/** Draws the fence `name` into a fresh element, the way Obsidian does for a code block in a note. */
function render(mock: Plugin, name: string, source: string, sourcePath = "Note.md"): { el: HTMLElement; unload: () => void } {
    const processor = mock.markdownCodeBlockProcessors__.get(name);
    if (!processor) throw new Error(`no processor for ${name}`);
    const el = document.createElement("div");
    let child: MarkdownRenderChild | undefined;
    const ctx = {
        sourcePath,
        addChild: (c: MarkdownRenderChild) => {
            child = c;
            c.load();
            return c;
        },
    } as unknown as MarkdownPostProcessorContext;
    void processor(source, el, ctx);
    return { el, unload: () => child?.unload() };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("onload", () => {
    it("registers the commands, one processor per fence, the settings tab and the public API", async () => {
        const { plugin, mock } = await boot();
        expect([...mock.commands__.keys()].sort()).toEqual(COMMANDS);
        expect([...mock.markdownCodeBlockProcessors__.keys()].sort()).toEqual(FENCES);
        expect(mock.settingTabs__).toHaveLength(1);
        expect(mock.settingTabs__[0]).toBeInstanceOf(DashySettingTab);
        expect(plugin.api.version).toBe(manifest.version);
        expect(plugin.api.fences().sort()).toEqual(FENCES);
    });

    it("starts from the defaults on a fresh install", async () => {
        const { plugin } = await boot();
        expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it("keeps what was saved and fills in what was not", async () => {
        const { plugin } = await boot({ data: { dailyFolder: "Journal", startDayHour: 4, installedSkillVersion: "1.0" } });
        expect(plugin.settings).toEqual({ ...DEFAULT_SETTINGS, dailyFolder: "Journal", startDayHour: 4, installedSkillVersion: "1.0" });
    });

    it("falls back to midnight for a corrupt day start, and to the defaults for a data.json that is not an object", async () => {
        expect((await boot({ data: { startDayHour: "late", dailyFolder: "Journal" } })).plugin.settings)
            .toEqual({ ...DEFAULT_SETTINGS, dailyFolder: "Journal" });
        expect((await boot({ data: ["not", "settings"] })).plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it("leaves `chart` to Obsidian Charts when it is enabled, and keeps `dashy-chart`", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { mock } = await boot({ enabled: ["obsidian-charts"] });
        const fences = [...mock.markdownCodeBlockProcessors__.keys()];
        expect(fences).not.toContain("chart");
        expect(fences).toContain("dashy-chart");
        // Yielding on purpose is the expected setup, not a warning.
        expect(warn).not.toHaveBeenCalled();
    });

    it("loses only the fence another plugin already holds, and says which", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { mock } = await boot({
            beforeLoad: (plugin) => {
                const register = plugin.registerMarkdownCodeBlockProcessor.bind(plugin);
                vi.spyOn(plugin, "registerMarkdownCodeBlockProcessor").mockImplementation((name, handler, sortOrder) => {
                    if (name === "heatmap") throw new Error("Code block processor already exists");
                    return register(name, handler, sortOrder);
                });
            },
        });
        expect([...mock.markdownCodeBlockProcessors__.keys()].sort()).toEqual(FENCES.filter((name) => name !== "heatmap"));
        // The rest of onload still ran.
        expect([...mock.commands__.keys()].sort()).toEqual(COMMANDS);
        expect(mock.settingTabs__).toHaveLength(1);
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0]?.[0]).toContain("heatmap");
    });
});

describe("commands", () => {
    it("Insert block opens the picker on the editor it was called with", async () => {
        const { mock } = await boot();
        const open = vi.spyOn(InsertBlockModal.prototype, "open").mockImplementation(() => undefined);
        const editor = {} as Editor;
        mock.commands__.get("insert-block")?.editorCallback?.(editor, {} as never);
        expect(open).toHaveBeenCalledOnce();
        expect(open.mock.contexts[0]).toBeInstanceOf(InsertBlockModal);
    });

    it("Install skill writes the agent skill and remembers its version in the settings", async () => {
        const { app, plugin, mock } = await boot();
        mock.commands__.get("install-skill")?.callback?.();
        await vi.advanceTimersByTimeAsync(0);
        expect(plugin.settings.installedSkillVersion).not.toBeNull();
        expect(await app.vault.adapter.exists(".claude/skills/dashy/SKILL.md")).toBe(true);
        expect((mock.data__ as DashySettings).installedSkillVersion).toBe(plugin.settings.installedSkillVersion);
    });

    it("Install agents writes the agent files and remembers their version in the settings", async () => {
        const { plugin, mock } = await boot();
        mock.commands__.get("install-agents")?.callback?.();
        await vi.advanceTimersByTimeAsync(0);
        expect(plugin.settings.installedAgentsVersion).not.toBeNull();
        expect((mock.data__ as DashySettings).installedAgentsVersion).toBe(plugin.settings.installedAgentsVersion);
    });

    it("Check blocks reports the blocks of the open note, and names the plugin that draws `chart` when Obsidian Charts is on", async () => {
        const note = "```stats\nitems:\n  - { label: Days, source: Diary, agg: count }\n```\n\n```chart\nfield: steps\n```\n";
        const { app, mock } = await boot({ files: { "Note.md": note, "Diary/2026-11-01.md": "---\nsteps: 9000\n---\n" }, enabled: ["obsidian-charts"] });
        const file = app.vault.getFileByPath("Note.md");
        if (!file) throw new Error("fixture note missing");
        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(file);
        app.workspace.setActiveLeaf(leaf, { focus: true });

        mock.commands__.get("check-blocks")?.callback?.();
        await vi.advanceTimersByTimeAsync(0);

        const report = await app.vault.adapter.read(".dashy/block-check.md");
        expect(report).toContain("Note.md");
        expect(report).toContain("stats");
        expect(report).toContain("obsidian-charts");
    });

    it("Check blocks says so when no note is open, and writes nothing", async () => {
        const { app, mock } = await boot();
        mock.commands__.get("check-blocks")?.callback?.();
        await vi.advanceTimersByTimeAsync(0);
        expect(await app.vault.adapter.exists(".dashy/block-check.md")).toBe(false);
    });

    it("Vault profile writes what the vault holds to .dashy/", async () => {
        const { app, mock } = await boot({ files: { "Diary/2026-11-01.md": "---\nsteps: 9000\n---\n" } });
        mock.commands__.get("vault-profile")?.callback?.();
        await vi.advanceTimersByTimeAsync(0);
        expect(await app.vault.adapter.exists(".dashy/vault-profile.md")).toBe(true);
    });
});

describe("while Obsidian is still indexing", () => {
    it("a block waits with a quiet line, then draws once the metadata cache is clean", async () => {
        let indexed: (() => void) | undefined;
        const { app, mock } = await boot({ files: { "Diary/2026-11-01.md": "---\nsteps: 9000\n---\n" } });
        Object.assign(app.metadataCache, { inProgressTaskCount: 1, onCleanCache: (done: () => void) => { indexed = done; } });

        const { el } = render(mock, "stats", "items:\n  - { label: Days, source: Diary, agg: count }");
        expect(el.textContent).toContain("still indexing");
        expect(el.querySelector(".dashy-stat-value")).toBeNull();

        Object.assign(app.metadataCache, { inProgressTaskCount: 0 });
        indexed?.();
        expect(el.querySelector(".dashy-stat-value")?.textContent).toBe("1");
    });
});

describe("settings", () => {
    it("saveSettings persists the settings as a copy and redraws the blocks", async () => {
        const { app, plugin, mock } = await boot({ files: { "Diary/2026-11-01.md": "---\nsteps: 9000\n---\n" } });
        const { el } = render(mock, "stats", "items:\n  - { label: Days, source: Diary, agg: count }");
        expect(el.querySelector(".dashy-stat-value")?.textContent).toBe("1");
        await app.vault.create("Diary/2026-11-02.md", "---\nsteps: 8000\n---\n");

        const before = plugin.settings;
        plugin.settings.dailyFolder = "Journal";
        await plugin.saveSettings();

        expect(mock.data__).toEqual({ ...DEFAULT_SETTINGS, dailyFolder: "Journal" });
        // A new object, so a later edit of the live settings cannot rewrite what was saved.
        expect(plugin.settings).not.toBe(before);
        // The redraw dropped the cached snapshot: the note created after the first draw is counted.
        expect(el.querySelector(".dashy-stat-value")?.textContent).toBe("2");
    });

    it("moves the day-rollover redraw to the new hour", async () => {
        // 02:00 now. The day starts at 00:00, so the next boundary is tomorrow, 22 hours away.
        vi.setSystemTime(new Date(2026, 10, 12, 2, 0, 0));
        const { app, plugin, mock } = await boot({ files: { "Diary/2026-11-01.md": "---\nsteps: 9000\n---\n" } });
        render(mock, "stats", "items:\n  - { label: Days, source: Diary, agg: count }");
        const reads = vi.spyOn(app.vault, "getMarkdownFiles");

        plugin.settings.startDayHour = 4;
        await plugin.saveSettings();
        reads.mockClear();

        // The boundary is now 04:00 today, two hours away. A minute short of it nothing redraws.
        await vi.advanceTimersByTimeAsync(2 * HOUR - 60e3);
        expect(reads).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(60e3);
        expect(reads).toHaveBeenCalledOnce();
    });
});

describe("watching the vault", () => {
    const diary = (date: string, steps: number): string => `---\nsteps: ${steps}\n---\n# ${date}\n`;
    const COUNT = "items:\n  - { label: Days, source: Diary, agg: count }";
    const value = (el: HTMLElement): string | null | undefined => el.querySelector(".dashy-stat-value")?.textContent;

    it("redraws a block after a note is created, once the vault has been quiet", async () => {
        const { app, mock } = await boot({ files: { "Diary/2026-11-01.md": diary("2026-11-01", 9000) } });
        const { el } = render(mock, "stats", COUNT);
        expect(value(el)).toBe("1");

        await app.vault.create("Diary/2026-11-02.md", diary("2026-11-02", 8000));
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS - 1);
        expect(value(el)).toBe("1");
        await vi.advanceTimersByTimeAsync(1);
        expect(value(el)).toBe("2");
    });

    it("redraws after a note is deleted and after one is renamed out of the folder", async () => {
        const { app, mock } = await boot({
            files: { "Diary/2026-11-01.md": diary("2026-11-01", 9000), "Diary/2026-11-02.md": diary("2026-11-02", 8000) },
        });
        const { el } = render(mock, "stats", COUNT);
        expect(value(el)).toBe("2");

        const file = app.vault.getFileByPath("Diary/2026-11-02.md");
        if (!file) throw new Error("fixture note missing");
        // The mock re-parents a moved file only into a folder that exists.
        await app.vault.createFolder("Elsewhere");
        await app.vault.rename(file, "Elsewhere/2026-11-02.md");
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        expect(value(el)).toBe("1");

        const left = app.vault.getFileByPath("Diary/2026-11-01.md");
        if (!left) throw new Error("fixture note missing");
        await app.vault.delete(left);
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        expect(value(el)).toBe("0");
    });

    it("folds a burst of changes into one redraw", async () => {
        const { app, mock } = await boot({ files: { "Diary/2026-11-01.md": diary("2026-11-01", 9000) } });
        render(mock, "stats", COUNT);
        const reads = vi.spyOn(app.vault, "getMarkdownFiles");

        for (let day = 2; day <= 6; day++) await app.vault.create(`Diary/2026-11-0${day}.md`, diary(`2026-11-0${day}`, 1000));
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        expect(reads).toHaveBeenCalledOnce();
    });
});

describe("onunload", () => {
    it("drops a redraw the debounce had already armed", async () => {
        const { app, plugin, mock } = await boot({ files: { "Diary/2026-11-01.md": "---\nsteps: 9000\n---\n" } });
        render(mock, "stats", "items:\n  - { label: Days, source: Diary, agg: count }");
        await app.vault.create("Diary/2026-11-02.md", "---\nsteps: 8000\n---\n");
        const reads = vi.spyOn(app.vault, "getMarkdownFiles");

        plugin.unload();
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        expect(reads).not.toHaveBeenCalled();
    });

    it("stops the day-rollover timer", async () => {
        const { plugin } = await boot();
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        plugin.unload();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("stops listening to the vault", async () => {
        const { app, plugin, mock } = await boot({ files: { "Diary/2026-11-01.md": "---\nsteps: 9000\n---\n" } });
        const { el } = render(mock, "stats", "items:\n  - { label: Days, source: Diary, agg: count }");
        plugin.unload();
        await app.vault.create("Diary/2026-11-02.md", "---\nsteps: 8000\n---\n");
        await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
        expect(vi.getTimerCount()).toBe(0);
        expect(el.querySelector(".dashy-stat-value")?.textContent).toBe("1");
    });

    it("cuts the API off, so a reference another plugin kept holds nothing", async () => {
        const { plugin } = await boot();
        const { api } = plugin;
        expect(api.fences()).not.toEqual([]);
        plugin.unload();
        expect(api.fences()).toEqual([]);
        await expect(api.check("", "Note.md")).rejects.toThrow(/unloaded/);
    });
});
