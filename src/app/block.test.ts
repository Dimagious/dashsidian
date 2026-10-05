import { describe, it, expect, vi, afterEach } from "vitest";
import { DashyBlock, type Draw } from "./block";
import { BlockRefresher } from "./refresh";
import { renderToday } from "../blocks/today";
import { mockContext, host, texts, nodes } from "../test/vault";

afterEach(() => {
    vi.useRealTimers();
});

describe("DashyBlock", () => {
    it("draws on load with the context, the source and its own element", () => {
        const ctx = mockContext();
        const el = host();
        const draw = vi.fn<Draw>();
        const block = new DashyBlock(el, new BlockRefresher(), draw, () => ctx, "daily: true");
        block.load();
        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith(ctx, "daily: true", el);
    });

    it("the disposer the last draw handed back runs on unload, once", () => {
        // Regression: the plugin used to wrap the draw in a closure that
        // returned nothing, so no block's disposer ever reached unload.
        const disposers = [vi.fn(), vi.fn()];
        let drawn = 0;
        const draw: Draw = () => disposers[drawn++];
        const refresher = new BlockRefresher();
        const block = new DashyBlock(host(), refresher, draw, () => mockContext(), "");
        block.load();
        refresher.refresh();
        block.unload();
        block.unload();
        expect(disposers[0]).not.toHaveBeenCalled();
        expect(disposers[1]).toHaveBeenCalledTimes(1);
        expect(refresher.size).toBe(0);
    });

    it("a today clock keeps one timer across vault redraws and none after unload", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 5, 9, 5, 40));
        const ctx = mockContext();
        const el = host();
        const refresher = new BlockRefresher();
        const block = new DashyBlock(el, refresher, renderToday, () => ctx, "clock: true");
        block.load();
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(20_000); // onto the minute interval
        refresher.refresh();
        refresher.refresh();
        expect(vi.getTimerCount()).toBe(1);
        expect(nodes(el, ".dashy-today-clock")).toHaveLength(1);
        vi.advanceTimersByTime(60_000);
        expect(texts(el, ".dashy-today-clock")).toEqual(["9:07 AM"]);

        block.unload();
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(120_000);
        expect(texts(el, ".dashy-today-clock")).toEqual(["9:07 AM"]);
    });
});
