import { describe, it, expect, vi, afterEach } from "vitest";

const notices = vi.hoisted(() => [] as string[]);
vi.mock("obsidian", async (importOriginal) => {
    const real = await importOriginal<typeof import("obsidian")>();
    return {
        ...real,
        Notice: class {
            constructor(message: string) {
                notices.push(message);
            }
        },
    };
});

import {
    BLOCK_CHECK_PATH,
    VAULT_PROFILE_PATH,
    checkBlocks,
    checkNote,
    readFindings,
    registerAgentTools,
    writeVaultProfile,
    type AgentToolsHost,
} from "./agent-tools";
import type { Draw } from "./block";
import { registerBlocks } from "./register";
import { buildContext } from "../blocks/context";
import { renderStats } from "../blocks/stats";
import { renderProgress } from "../blocks/progress";
import { renderCountdown } from "../blocks/countdown";
import { renderToday } from "../blocks/today";
import { renderTiles } from "../blocks/tiles";
import { renderHeatmap } from "../blocks/heatmap";
import { renderChart } from "../blocks/chart";
import { renderDiagnostics } from "../shared/render";
import { VaultSnapshot } from "../adapters/vault";
import { DEFAULT_SETTINGS } from "../types";
import { setLocale, t, FALLBACK_LOCALE } from "../i18n";
import { diary, host, mockApp, texts, type FakeVault } from "../test/vault";

afterEach(() => {
    notices.length = 0;
    setLocale(FALLBACK_LOCALE);
});

const BLOCKS: Record<string, Draw> = {
    tiles: renderTiles,
    stats: renderStats,
    progress: renderProgress,
    today: renderToday,
    countdown: renderCountdown,
    heatmap: renderHeatmap,
    chart: renderChart,
};

// Friday 30 October 2026, noon.
const TODAY = new Date(2026, 9, 30, 12, 0, 0);

const VAULT: FakeVault = {
    notes: [
        ...diary("Diary", "2026-10-01", 30, (i) => ({ steps: 10000 + i })),
        { path: "Templates/Weekly review.md" },
        { path: "Home.md" },
    ],
    templates: { folder: "Templates" },
};

const NOTE = "Home.md";

interface Fixture {
    host: AgentToolsHost;
    writes: [string, string][];
    mkdirs: string[];
    /** calls the waiting `whenIndexed` callbacks, as Obsidian does once it has read the vault */
    index: () => void;
}

/**
 * The plugin's own wiring over a fake vault: the fences as `registerBlocks`
 * hands them out, the context `buildContext` makes, the adapter the files go
 * through. `active` is the open note's text, null for no open note.
 */
function fixture(active: string | null, options: { chartsEnabled?: boolean; indexed?: boolean; failWrite?: boolean; path?: string } = {}): Fixture {
    const app = mockApp(VAULT);
    const writes: [string, string][] = [];
    const mkdirs: string[] = [];
    const vault = app.vault as unknown as Record<string, unknown>;
    vault.read = vi.fn(async () => active ?? "");
    vault.adapter = {
        exists: vi.fn(async () => false),
        mkdir: vi.fn(async (path: string) => {
            mkdirs.push(path);
        }),
        write: vi.fn(async (path: string, data: string) => {
            if (options.failWrite) throw new Error("read-only");
            writes.push([path, data]);
        }),
    };
    (app as unknown as Record<string, unknown>).workspace = {
        getActiveFile: () => (active === null ? null : { path: options.path ?? NOTE, extension: "md" }),
    };

    const fences = new Map<string, Draw>();
    const { yielded } = registerBlocks(BLOCKS, (name, draw) => fences.set(name, draw), (id) => options.chartsEnabled === true && id === "obsidian-charts");
    const snapshot = new VaultSnapshot(app);
    const waiting: (() => void)[] = [];
    return {
        host: {
            app,
            fences: () => fences,
            elsewhere: () => new Map(yielded.map((name) => [name, "obsidian-charts"])),
            context: (sourcePath) => buildContext({ app, notes: () => snapshot.get(), settings: DEFAULT_SETTINGS, now: () => TODAY, sourcePath }),
            whenIndexed: (done) => {
                if (options.indexed === false) waiting.push(done);
                else done();
            },
            versions: { plugin: "2.1.0", schema: "1.10.0" },
            reading: () => ({ templateFolders: ["Templates"] }),
            settings: (today) => ({
                pluginVersion: "2.1.0",
                schemaVersion: "1.10.0",
                today: `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`,
                startDayHour: 0,
                obsidianLanguage: "en",
                pluginLanguage: "en",
                firstDayOfWeek: 1,
                periodic: [],
                nameFormats: {},
                templateFolders: ["Templates"],
            }),
        },
        writes,
        mkdirs,
        index: () => {
            for (const done of waiting.splice(0)) done();
        },
    };
}

const GOOD = "```stats\nsource: Diary\nitems:\n  - { label: Steps, field: steps, agg: sum }\n```";
const BAD = "```stats\nsource: Diary\nitems:\n  - { label: Steps, feild: steps, agg: sum }\n```";

/** What the block itself draws for `source`, the rows a user reads. */
function drawn(source: string, sourcePath = NOTE): string[] {
    const el = host();
    const f = fixture(null);
    renderStats(f.host.context(sourcePath), source.replace(/^```stats\n|\n```$/g, ""), el);
    return texts(el, ".dashy-diag");
}

describe("checkNote: the blocks' own checks, read back (B-168)", () => {
    it("a good block is ok; a bad one reports the very message the block draws, at its line", () => {
        const f = fixture(null);
        const [good, bad] = checkNote(f.host, NOTE, `# Home\n\n${GOOD}\n\n${BAD}\n`);
        expect(good).toEqual({ line: 3, lang: "stats", status: "checked", findings: [] });
        expect(bad?.line).toBe(9);
        expect(bad?.findings.length).toBeGreaterThan(0);
        const rows = drawn(BAD);
        expect(rows).toHaveLength(bad?.findings.length ?? -1);
        for (const [i, finding] of (bad?.findings ?? []).entries()) {
            expect(rows[i]).toContain(finding.message);
        }
        expect(bad?.findings.map((x) => x.message).join("\n")).toContain("feild");
    });

    it("an unknown `dashy-` fence is reported, a fence of another language is not", () => {
        const f = fixture(null);
        const blocks = checkNote(f.host, NOTE, "```dashy-stats\nitems: []\n```\n```js\nlet x = 1;\n```");
        expect(blocks).toEqual([{ line: 1, lang: "dashy-stats", status: "unknown", findings: [] }]);
    });

    it("`chart` is left to Obsidian Charts when it is on; `dashy-chart` is still checked", () => {
        const f = fixture(null, { chartsEnabled: true });
        const blocks = checkNote(f.host, NOTE, "```chart\ntype: bar\n```\n```dashy-chart\nsource: Diary\nseries:\n  - { field: steps }\n```");
        expect(blocks.map((b) => [b.lang, b.status, b.owner])).toEqual([["chart", "elsewhere", "obsidian-charts"], ["dashy-chart", "checked", undefined]]);
    });

    it("a block in a template reports the template hint the user sees there (B-190)", () => {
        const f = fixture(null);
        const [block] = checkNote(f.host, "Templates/Weekly review.md", "```stats\nsource: Diary\nperiod: note\nitems:\n  - { field: steps, agg: sum }\n```");
        expect(block?.findings).toContainEqual({ level: "notice", message: t("period.templateNote") });
    });

    it("the messages are in the language the blocks speak", () => {
        setLocale("ru");
        const f = fixture(null);
        const [block] = checkNote(f.host, NOTE, BAD);
        const rows = drawn(BAD);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0]).toContain(block?.findings[0]?.message ?? "missing");
        expect(block?.findings[0]?.message).toMatch(/[а-я]/);
    });

    it("a block that throws is reported as an error rather than ending the check", () => {
        const f = fixture(null);
        const broken: Draw = () => {
            throw new Error("boom");
        };
        const blocks = checkNote({ ...f.host, fences: () => new Map([["stats", broken]]) }, NOTE, GOOD);
        expect(blocks[0]?.findings).toEqual([{ level: "error", message: "The block failed to draw: boom" }]);
    });

    it("a block's disposer is called, so a heatmap or a clock leaves nothing running", () => {
        const f = fixture(null);
        const stop = vi.fn();
        const draw: Draw = () => stop;
        checkNote({ ...f.host, fences: () => new Map([["today", draw]]) }, NOTE, "```today\n```");
        expect(stop).toHaveBeenCalledOnce();
    });
});

describe("readFindings (B-168)", () => {
    it("reads each diagnostic's level, message and line from what `renderDiagnostics` drew, and the notices", () => {
        const el = host();
        renderDiagnostics(el, "stats", [
            { level: "error", message: "First", line: 4 },
            { level: "warning", message: "Second" },
        ]);
        el.createDiv({ cls: "dashy-notice", text: " Quiet " });
        expect(readFindings(el)).toEqual([
            { level: "error", message: "First", line: 4 },
            { level: "warning", message: "Second" },
            { level: "notice", message: "Quiet" },
        ]);
    });
});

describe("checkBlocks: the command (B-168)", () => {
    it("writes the report to .dashy/block-check.md and nothing else, and says what it found", async () => {
        const f = fixture(`${GOOD}\n${BAD}`);
        const counts = await checkBlocks(f.host);
        expect(counts).toEqual({ blocks: 2, errors: 1, warnings: 1 });
        expect(f.mkdirs).toEqual([".dashy"]);
        expect(f.writes.map(([path]) => path)).toEqual([BLOCK_CHECK_PATH]);
        const report = f.writes[0]?.[1] ?? "";
        expect(report).toContain("- Note: Home.md");
        expect(report).toContain("- Checked: 2026-10-30");
        expect(report).toContain("- Plugin version: 2.1.0\n- Schema version: 1.10.0\n- Diagnostics language: en");
        expect(report).toContain("## Block 1: `stats` at line 1\n\nok");
        expect(report).toContain("feild");
        expect(report).toContain("Summary: 2 blocks, 1 error, 1 warning.");
        expect(notices).toEqual(["Checked 2 blocks: 1 error, 1 warning. Report in .dashy/block-check.md"]);
    });

    it("a note with no Dashy blocks still gets a report that says so", async () => {
        const f = fixture("# Just text\n```js\n1\n```");
        expect(await checkBlocks(f.host)).toEqual({ blocks: 0, errors: 0, warnings: 0 });
        expect(f.writes[0]?.[1]).toContain("No Dashy blocks in this note.");
        expect(notices).toEqual(["No Dashy blocks in this note. Report in .dashy/block-check.md"]);
    });

    it("with no note open nothing is written", async () => {
        const f = fixture(null);
        expect(await checkBlocks(f.host)).toBeNull();
        expect(f.writes).toEqual([]);
        expect(f.mkdirs).toEqual([]);
        expect(notices).toEqual(["Open a note to check its blocks."]);
    });

    it("waits for Obsidian to finish reading the vault before it checks", async () => {
        const f = fixture(GOOD, { indexed: false });
        const run = checkBlocks(f.host);
        await Promise.resolve();
        expect(f.writes).toEqual([]);
        f.index();
        await run;
        expect(f.writes.map(([path]) => path)).toEqual([BLOCK_CHECK_PATH]);
    });

    it("a failed write is reported as a write and logged, not swallowed", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const f = fixture(GOOD, { failWrite: true });
        expect(await checkBlocks(f.host)).toBeNull();
        expect(notices).toEqual(["Could not write .dashy/block-check.md: read-only"]);
        expect(log).toHaveBeenCalledWith("[dashy] could not write \".dashy/block-check.md\"", expect.any(Error));
        log.mockRestore();
    });

    it("a note that cannot be read is reported as that, logged, and nothing is written", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const f = fixture(GOOD);
        (f.host.app.vault as unknown as { read: () => Promise<string> }).read = () => Promise.reject(new Error("gone"));
        expect(await checkBlocks(f.host)).toBeNull();
        expect(notices).toEqual(["Could not check the blocks of Home.md: gone"]);
        expect(f.writes).toEqual([]);
        expect(log).toHaveBeenCalledWith("[dashy] could not check the blocks of \"Home.md\"", expect.any(Error));
        log.mockRestore();
    });
});

describe("writeVaultProfile: the command (B-168)", () => {
    it("writes .dashy/vault-profile.md and nothing else", async () => {
        const f = fixture(null);
        expect(await writeVaultProfile(f.host)).toBe(true);
        expect(f.writes.map(([path]) => path)).toEqual([VAULT_PROFILE_PATH]);
        const text = f.writes[0]?.[1] ?? "";
        expect(text).toContain("# Dashy vault profile");
        expect(text).toContain("| Diary | 30 | 30 YYYY-MM-DD |");
        expect(text).toContain("| steps | number | 30 | 0 | `10000` | Diary (30) |");
        expect(text).toContain("| Templates (templates) | 1 |");
        expect(notices).toEqual(["Vault profile written to .dashy/vault-profile.md"]);
    });

    it("a failed write is reported and returns false", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const f = fixture(null, { failWrite: true });
        expect(await writeVaultProfile(f.host)).toBe(false);
        expect(notices).toEqual(["Could not write .dashy/vault-profile.md: read-only"]);
        expect(log).toHaveBeenCalledOnce();
        log.mockRestore();
    });

    it("a vault that cannot be read is reported as that, logged, and nothing is written", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const f = fixture(null);
        const broken: AgentToolsHost = { ...f.host, reading: () => { throw new Error("settings moved"); } };
        expect(await writeVaultProfile(broken)).toBe(false);
        expect(notices).toEqual(["Could not read the vault for the profile: settings moved"]);
        expect(f.writes).toEqual([]);
        expect(log).toHaveBeenCalledWith("[dashy] could not read the vault for the vault profile", expect.any(Error));
        log.mockRestore();
    });
});

describe("registerAgentTools (B-168)", () => {
    it("adds the two commands and writes nothing until one is run", async () => {
        const f = fixture(GOOD);
        const commands: { id: string; name: string; callback: () => void }[] = [];
        registerAgentTools({ addCommand: (c) => commands.push(c) }, f.host);
        expect(commands.map((c) => [c.id, c.name])).toEqual([
            ["check-blocks", "Check blocks in this note"],
            ["vault-profile", "Write vault profile"],
        ]);
        expect(f.writes).toEqual([]);
        expect(f.mkdirs).toEqual([]);

        commands[1]?.callback();
        await vi.waitFor(() => expect(f.writes.map(([path]) => path)).toEqual([VAULT_PROFILE_PATH]));
        commands[0]?.callback();
        await vi.waitFor(() => expect(f.writes.map(([path]) => path)).toEqual([VAULT_PROFILE_PATH, BLOCK_CHECK_PATH]));
    });
});

