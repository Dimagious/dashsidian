import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { IndexGate, gateDraw, gateBlocks, READS_VAULT } from "./indexing";
import { DashyBlock, type Draw } from "./block";
import { BlockRefresher } from "./refresh";
import { renderStats } from "../blocks/stats";
import { renderToday } from "../blocks/today";
import { VaultSnapshot, notesPending, whenIndexed } from "../adapters/vault";
import { buildContext } from "../blocks/context";
import { DEFAULT_SETTINGS } from "../types";
import { mockApp, mockContext, diary, host, texts, diagnostics } from "../test/vault";

const WAITING = "Obsidian is still indexing the vault. The block will appear when it is done.";

/** A gate whose queue the test drains by hand. */
function manualGate(queued: number): {
    gate: IndexGate;
    drain: () => void;
    onOpen: ReturnType<typeof vi.fn>;
    redraw: ReturnType<typeof vi.fn>;
    watches: () => number;
} {
    let pending = queued;
    const callbacks: (() => void)[] = [];
    let watches = 0;
    const onOpen = vi.fn();
    const redraw = vi.fn();
    const gate = new IndexGate(
        () => pending > 0,
        (done) => {
            watches++;
            callbacks.push(done);
        },
        onOpen,
        redraw,
    );
    return {
        gate,
        drain: () => {
            pending = 0;
            for (const done of callbacks.splice(0)) done();
        },
        onOpen,
        redraw,
        watches: () => watches,
    };
}

describe("IndexGate (B-179)", () => {
    it("is open at once when nothing is queued, and drops the snapshot exactly once", () => {
        const { gate, onOpen, watches } = manualGate(0);
        expect(gate.isOpen()).toBe(true);
        expect(gate.isOpen()).toBe(true);
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(watches()).toBe(0);
    });

    it("stays shut while notes are queued and opens once they are parsed", () => {
        const { gate, drain, onOpen } = manualGate(1258);
        expect(gate.isOpen()).toBe(false);
        expect(onOpen).not.toHaveBeenCalled();
        drain();
        expect(gate.isOpen()).toBe(true);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("once open it never shuts again, however busy Obsidian gets later", () => {
        let pending = 0;
        const gate = new IndexGate(() => pending > 0, () => undefined, () => undefined, () => undefined);
        expect(gate.isOpen()).toBe(true);
        pending = 3; // a note edited later is being parsed
        expect(gate.isOpen()).toBe(true);
    });

    it("arms one watch however many blocks wait, and redraws when it fires", () => {
        const { gate, drain, redraw, watches } = manualGate(5);
        gate.wait();
        gate.wait();
        gate.wait();
        expect(watches()).toBe(1);
        expect(redraw).not.toHaveBeenCalled();
        drain();
        expect(redraw).toHaveBeenCalledTimes(1);
    });

    it("re-arms after the watch fired, so a block still waiting is not stranded", () => {
        // A note queued between the watch firing and the redraw keeps the
        // gate shut; the waiting block must get a fresh watch, not none.
        const callbacks: (() => void)[] = [];
        const redraw = vi.fn();
        const gate = new IndexGate(() => true, (done) => callbacks.push(done), () => undefined, redraw);
        gate.wait();
        callbacks.shift()?.();
        expect(redraw).toHaveBeenCalledTimes(1);
        gate.wait();
        expect(callbacks).toHaveLength(1);
    });
});

describe("gateDraw (B-179)", () => {
    it("draws the block itself, with its own disposer, once the gate is open", () => {
        const dispose = vi.fn();
        const draw = vi.fn<Draw>(() => dispose);
        const { gate } = manualGate(0);
        const ctx = mockContext();
        const el = host();
        expect(gateDraw(draw, gate)(ctx, "src", el)).toBe(dispose);
        expect(draw).toHaveBeenCalledWith(ctx, "src", el);
    });

    it("draws only the waiting line while indexing, replacing what was there", () => {
        const draw = vi.fn<Draw>();
        const { gate, watches } = manualGate(10);
        const el = host();
        el.createDiv({ text: "left over from an earlier draw" });
        expect(gateDraw(draw, gate)(mockContext(), "src", el)).toBeUndefined();
        expect(draw).not.toHaveBeenCalled();
        expect(el.textContent).toBe(WAITING);
        expect(texts(el, ".dashy-notice")).toEqual([WAITING]);
        expect(watches()).toBe(1);
    });
});

/**
 * Obsidian on a cold start: every note listed, none parsed yet. Until a note
 * is parsed its cache has no frontmatter, which is what the report saw: a
 * stats card saying no note has `sleep_duration` in a vault full of it.
 */
function coldStart(): { app: App; finishIndexing: () => void } {
    const notes = diary("Diary", "2026-09-01", 4, (i) => ({ sleep_duration: 400 + i * 20 }));
    const app = mockApp({ notes });
    const real = app.metadataCache.getFileCache.bind(app.metadataCache);
    let parsed = false;
    const cleanCallbacks: (() => void)[] = [];
    const internals = {
        inProgressTaskCount: notes.length,
        onCleanCache: (callback: () => void) => {
            if (internals.inProgressTaskCount === 0) callback();
            else cleanCallbacks.push(callback);
        },
    };
    Object.assign(app.metadataCache, internals, {
        getFileCache: (file: Parameters<typeof real>[0]) => (parsed ? real(file) : { frontmatter: {} }),
    });
    return {
        app,
        finishIndexing: () => {
            parsed = true;
            Object.assign(app.metadataCache, { inProgressTaskCount: 0 });
            internals.inProgressTaskCount = 0;
            for (const done of cleanCallbacks.splice(0)) done();
        },
    };
}

const SLEEP = "items:\n  - { label: Sleep, source: Diary, field: sleep_duration, agg: avg }";

/** The plugin's own wiring, minus the parts that need a running Obsidian. */
function mount(app: App, name: string, draw: Draw, source: string, snapshot = new VaultSnapshot(app)): HTMLElement {
    const refresher = new BlockRefresher(() => snapshot.invalidate());
    const gate = new IndexGate(
        () => notesPending(app),
        (done) => whenIndexed(app, done),
        () => snapshot.invalidate(),
        () => refresher.refresh(),
    );
    const el = host();
    const context = () => buildContext({ app, notes: () => snapshot.get(), settings: DEFAULT_SETTINGS });
    const gated = gateBlocks({ [name]: draw }, gate)[name];
    if (!gated) throw new Error(`no block ${name}`);
    new DashyBlock(el, refresher, gated, context, source).load();
    return el;
}

describe("a block opened while Obsidian is still indexing (B-179)", () => {
    it("without the gate it warns about a field every note has", () => {
        // The failure the gate exists for, pinned so the fixture stays honest.
        const { app } = coldStart();
        const el = host();
        renderStats(buildContext({ app, notes: () => new VaultSnapshot(app).get(), settings: DEFAULT_SETTINGS }), SLEEP, el);
        expect(diagnostics(el, "warning").join(" ")).toContain("sleep_duration");
    });

    it("waits without a false warning, then draws the real number once indexing is done", () => {
        const { app, finishIndexing } = coldStart();
        const el = mount(app, "stats", renderStats, SLEEP);

        expect(texts(el, ".dashy-notice")).toEqual([WAITING]);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-stat-value")).toEqual([]);

        finishIndexing();

        expect(texts(el, ".dashy-notice")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
        // 400, 420, 440, 460 average to 430
        expect(texts(el, ".dashy-stat-value")).toEqual(["430"]);
    });

    it("draws straight away on a warm start, when nothing is queued", () => {
        const { app, finishIndexing } = coldStart();
        finishIndexing();
        const el = mount(app, "stats", renderStats, SLEEP);
        expect(texts(el, ".dashy-notice")).toEqual([]);
        expect(texts(el, ".dashy-stat-value")).toEqual(["430"]);
    });

    it("does not draw from a snapshot taken mid-index once the gate opens", () => {
        // The Insert block command reads the snapshot too; one taken while
        // indexing must not outlive it, even before any redraw drops it.
        const { app, finishIndexing } = coldStart();
        const snapshot = new VaultSnapshot(app);
        expect(snapshot.get()[0]?.frontmatter).toEqual({});
        finishIndexing();
        const el = mount(app, "stats", renderStats, SLEEP, snapshot);
        expect(texts(el, ".dashy-stat-value")).toEqual(["430"]);
    });

    it("today does not wait: it draws its date line while notes are still queued", () => {
        // Regression from review: the dashboard's entry point needs only the
        // file list, and blanking it for a whole cold index was worse than 1.6.0.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 6, 10, 0));
        try {
            const { app } = coldStart();
            expect(notesPending(app)).toBe(true);
            const el = mount(app, "today", renderToday, "daily: true");
            expect(texts(el, ".dashy-notice")).toEqual([]);
            expect(texts(el, ".dashy-today-date")).toEqual(["Tuesday, October 6, 2026"]);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("gateBlocks (B-179)", () => {
    it("gates exactly the blocks that read the vault and leaves today as it is", () => {
        const names = ["tiles", "stats", "progress", "today", "countdown", "heatmap", "chart"];
        const draws = Object.fromEntries(names.map((n) => [n, vi.fn<Draw>()]));
        const { gate } = manualGate(1);
        const gated = gateBlocks(draws, gate);
        expect(Object.keys(gated)).toEqual(names);
        expect(gated.today).toBe(draws.today);
        for (const name of names.filter((n) => n !== "today")) {
            expect(READS_VAULT.has(name), name).toBe(true);
            expect(gated[name], name).not.toBe(draws[name]);
            const el = host();
            gated[name]?.(mockContext(), "", el);
            expect(draws[name], name).not.toHaveBeenCalled();
            expect(texts(el, ".dashy-notice"), name).toEqual([WAITING]);
        }
    });
});
