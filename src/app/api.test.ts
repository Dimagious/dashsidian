import { describe, it, expect, vi, afterEach } from "vitest";
import { API_VERSION, createApi, type ApiHost } from "./api";
import type { Draw } from "./block";
import { registerBlocks } from "./register";
import { buildContext } from "../blocks/context";
import { renderStats } from "../blocks/stats";
import { renderChart } from "../blocks/chart";
import { renderToday } from "../blocks/today";
import { VaultSnapshot } from "../adapters/vault";
import { DEFAULT_SETTINGS } from "../types";
import { setLocale, FALLBACK_LOCALE } from "../i18n";
import { diary, mockApp, type FakeVault } from "../test/vault";
import schema from "../blocks/schema.json";

afterEach(() => {
    setLocale(FALLBACK_LOCALE);
    vi.restoreAllMocks();
});

const BLOCKS: Record<string, Draw> = { stats: renderStats, chart: renderChart, today: renderToday };

// Friday 30 October 2026, noon.
const TODAY = new Date(2026, 9, 30, 12, 0, 0);

const VAULT: FakeVault = {
    notes: [...diary("Diary", "2026-10-01", 30, (i) => ({ steps: 10000 + i })), { path: "Home.md" }],
};

const GOOD = "```stats\nsource: Diary\nitems:\n  - { label: Steps, field: steps, agg: sum }\n```";
const BAD = "```stats\nsource: Diary\nitems:\n  - { label: Steps, feild: steps, agg: sum }\n```";

interface Fixture {
    host: ApiHost;
    /** calls the waiting `whenIndexed` callbacks, as Obsidian does once it has read the vault */
    index: () => void;
    /** how many blocks were drawn so far */
    draws: () => number;
}

/** The plugin's own wiring over a fake vault, as `agent-tools.test.ts` builds it. */
function fixture(options: { chartsEnabled?: boolean; indexed?: boolean; vault?: FakeVault } = {}): Fixture {
    const app = mockApp(options.vault ?? VAULT);
    let drawn = 0;
    const counted: Record<string, Draw> = {};
    for (const [name, draw] of Object.entries(BLOCKS)) {
        counted[name] = (context, source, el) => {
            drawn++;
            return draw(context, source, el);
        };
    }
    const fences = new Map<string, Draw>();
    const { yielded } = registerBlocks(counted, (name, draw) => fences.set(name, draw), (id) => options.chartsEnabled === true && id === "obsidian-charts");
    const snapshot = new VaultSnapshot(app);
    const waiting: (() => void)[] = [];
    return {
        host: {
            fences: () => fences,
            elsewhere: () => new Map(yielded.map((name) => [name, "obsidian-charts"])),
            context: (sourcePath) => buildContext({ app, notes: () => snapshot.get(), settings: DEFAULT_SETTINGS, now: () => TODAY, sourcePath }),
            whenIndexed: (done) => {
                if (options.indexed === false) waiting.push(done);
                else done();
            },
            versions: { plugin: "2.2.0", schema: schema.version },
            fresh: () => snapshot.invalidate(),
        },
        index: () => {
            for (const done of waiting.splice(0)) done();
        },
        draws: () => drawn,
    };
}

describe("the public API: versions (B-208)", () => {
    it("names the API version, the plugin version and the schema version it was given", () => {
        const { api } = createApi(fixture().host);
        expect(api.apiVersion).toBe(1);
        expect(api.apiVersion).toBe(API_VERSION);
        expect(Number.isInteger(api.apiVersion)).toBe(true);
        expect(api.version).toBe("2.2.0");
        expect(api.schemaVersion).toBe(schema.version);
        expect(api.schemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });
});

describe("the public API: fences (B-208)", () => {
    it("lists every name Dashy draws, `chart` and `dashy-chart` among them, when no other plugin takes `chart`", () => {
        const { api } = createApi(fixture().host);
        expect(api.fences().sort()).toEqual(["chart", "dashy-chart", "stats", "today"]);
    });

    it("leaves `chart` out when Obsidian Charts draws it; `dashy-chart` stays", () => {
        const { api } = createApi(fixture({ chartsEnabled: true }).host);
        expect(api.fences().sort()).toEqual(["dashy-chart", "stats", "today"]);
    });

    it("hands out a copy: a consumer changing it changes nothing of Dashy's", () => {
        const { api } = createApi(fixture().host);
        api.fences().push("dashy-mine");
        expect(api.fences()).not.toContain("dashy-mine");
    });
});

describe("the public API: check (B-208)", () => {
    it("a valid block has no findings; a broken one reports the message and line the user sees", async () => {
        const { api } = createApi(fixture().host);
        const [good, bad] = await api.check(`# Home\n\n${GOOD}\n\n${BAD}\n`, "Home.md");
        expect(good).toEqual({ line: 3, lang: "stats", status: "checked", findings: [] });
        expect(bad?.line).toBe(9);
        expect(bad?.status).toBe("checked");
        expect(bad?.findings).toEqual([
            { level: "warning", message: 'Unknown key "feild". Did you mean "field"?' },
            { level: "error", message: '"Steps": the "sum" aggregate needs a number. Add `field:` with a frontmatter property.' },
        ]);
    });

    it("ignores code blocks of other languages and reports an unknown `dashy-` name", async () => {
        const { api } = createApi(fixture().host);
        const blocks = await api.check("```js\nlet x = 1;\n```\n```dashy-stats\nitems: []\n```\n", "Home.md");
        expect(blocks).toEqual([{ line: 4, lang: "dashy-stats", status: "unknown", findings: [] }]);
    });

    it("reads a note changed after the previous check: the cached snapshot is dropped", async () => {
        const notes = diary("Log", "2026-10-01", 3, () => ({}));
        const vault: FakeVault = { notes };
        const { api } = createApi(fixture({ vault }).host);
        const block = "```stats\nsource: Log\nitems:\n  - { label: Weight, field: weight, agg: latest }\n```";
        const before = await api.check(block, "Home.md");
        expect(before[0]?.findings.length).toBeGreaterThan(0);
        // What a consumer does between two checks: writes a property.
        const note = notes[2];
        if (note) note.frontmatter = { weight: 80 };
        const after = await api.check(block, "Home.md");
        expect(after[0]?.findings).toEqual([]);
    });

    it("a note with no Dashy blocks gives an empty list", async () => {
        const { api } = createApi(fixture().host);
        expect(await api.check("# Just text\n", "Home.md")).toEqual([]);
    });

    it("`chart` with Obsidian Charts on is reported as theirs and not drawn", async () => {
        const f = fixture({ chartsEnabled: true });
        const { api } = createApi(f.host);
        const blocks = await api.check("```chart\ntype: bar\n```\n", "Home.md");
        expect(blocks).toEqual([{ line: 1, lang: "chart", status: "elsewhere", owner: "obsidian-charts", findings: [] }]);
        expect(f.draws()).toBe(0);
    });

    it("waits for Obsidian to finish indexing before it draws anything", async () => {
        const f = fixture({ indexed: false });
        const { api } = createApi(f.host);
        let settled = false;
        const run = api.check(GOOD, "Home.md").then((blocks) => {
            settled = true;
            return blocks;
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(f.draws()).toBe(0);
        expect(settled).toBe(false);
        f.index();
        expect(await run).toEqual([{ line: 1, lang: "stats", status: "checked", findings: [] }]);
        expect(f.draws()).toBe(1);
    });

    it("a finding the block puts at a line carries that line, 1-based inside the block", async () => {
        const { api } = createApi(fixture().host);
        const [block] = await api.check("Intro\n```stats\nsource: Diary\nitems: [\n```", "Home.md");
        expect(block?.line).toBe(2);
        expect(block?.findings).toHaveLength(1);
        expect(block?.findings[0]?.level).toBe("error");
        expect(block?.findings[0]?.line).toBe(2);
    });

    it("reads `period: note` from `sourcePath`, the note the text lives or will live in", async () => {
        const { api } = createApi(fixture().host);
        const text = "```stats\nsource: Diary\nperiod: note\nitems:\n  - { label: Steps, field: steps, agg: sum }\n```";
        const [named] = await api.check(text, "Reviews/2026-10.md");
        const [unnamed] = await api.check(text, "Home.md");
        expect(named?.findings).toEqual([]);
        expect(unnamed?.findings.map((f) => f.level)).toContain("error");
        expect(unnamed?.findings.map((f) => f.message).join("\n")).toContain("Home");
    });

    it("the messages are in the language Dashy speaks", async () => {
        setLocale("ru");
        const { api } = createApi(fixture().host);
        const [block] = await api.check(BAD, "Home.md");
        expect(block?.findings[0]?.message).toMatch(/[а-я]/);
    });

    it("a block that throws is a finding, not a rejection", async () => {
        const f = fixture();
        const broken: Draw = () => {
            throw new Error("boom");
        };
        const { api } = createApi({ ...f.host, fences: () => new Map([["stats", broken]]) });
        expect(await api.check(GOOD, "Home.md")).toEqual([
            { line: 1, lang: "stats", status: "checked", findings: [{ level: "error", message: "The block failed to draw: boom" }] },
        ]);
    });
});

describe("the public API: when the check itself fails (B-208)", () => {
    it("rejects with an Error naming the note and logs it with the [dashy] prefix", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const f = fixture();
        const { api } = createApi({
            ...f.host,
            fences: () => {
                throw new Error("no fences");
            },
        });
        const failure: unknown = await api.check(GOOD, "Notes/Run.md").catch((e: unknown) => e);
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toBe('Dashy could not check the blocks of "Notes/Run.md": no fences');
        expect(((failure as Error).cause as Error).message).toBe("no fences");
        expect(log).toHaveBeenCalledWith('[dashy] api.check could not check the blocks of "Notes/Run.md"', expect.any(Error));
    });

    it("rejects a call without two strings with a TypeError rather than throwing deep inside", async () => {
        const { api } = createApi(fixture().host);
        const check = api.check as (text: unknown, sourcePath: unknown) => Promise<unknown>;
        await expect(check(undefined, "Home.md")).rejects.toThrow(TypeError);
        await expect(check(GOOD, 42)).rejects.toThrow("Dashy api.check(text, sourcePath) takes two strings");
    });

    it("after unload, fences are empty and check rejects without drawing", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const f = fixture();
        const { api, close } = createApi(f.host);
        close();
        expect(api.fences()).toEqual([]);
        expect(api.apiVersion).toBe(1);
        await expect(api.check(GOOD, "Home.md")).rejects.toThrow("Dashy was unloaded");
        expect(f.draws()).toBe(0);
    });

    it("unloaded while it waited for indexing: rejects instead of drawing with what is gone", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const f = fixture({ indexed: false });
        const { api, close } = createApi(f.host);
        const run = api.check(GOOD, "Home.md");
        close();
        f.index();
        await expect(run).rejects.toThrow("Dashy was unloaded");
        expect(f.draws()).toBe(0);
    });
});
