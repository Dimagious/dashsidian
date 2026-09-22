import { describe, it, expect, vi } from "vitest";
import { BlockRefresher } from "./refresh";

describe("BlockRefresher", () => {
    it("redraws everything registered", () => {
        const refresher = new BlockRefresher();
        const a = vi.fn();
        const b = vi.fn();
        refresher.register(a);
        refresher.register(b);

        refresher.refresh();

        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it("drops the cached snapshot before redrawing, never after", () => {
        const order: string[] = [];
        const refresher = new BlockRefresher(() => order.push("invalidate"));
        refresher.register(() => order.push("draw"));

        refresher.refresh();

        expect(order).toEqual(["invalidate", "draw"]);
    });

    it("invalidates even with nothing on screen", () => {
        const invalidate = vi.fn();
        new BlockRefresher(invalidate).refresh();
        expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it("an unregistered block is not redrawn again", () => {
        const refresher = new BlockRefresher();
        const draw = vi.fn();
        refresher.register(draw);
        refresher.unregister(draw);

        refresher.refresh();

        expect(draw).not.toHaveBeenCalled();
        expect(refresher.size).toBe(0);
    });

    it("counts what is on screen", () => {
        const refresher = new BlockRefresher();
        const a = () => undefined;
        expect(refresher.size).toBe(0);
        refresher.register(a);
        expect(refresher.size).toBe(1);
        refresher.register(a);
        expect(refresher.size, "the same block registered twice is still one").toBe(1);
    });

    it("a block that unregisters itself mid-refresh does not cut the loop short", () => {
        const refresher = new BlockRefresher();
        const later = vi.fn();
        const selfRemoving = () => refresher.unregister(selfRemoving);
        refresher.register(selfRemoving);
        refresher.register(later);

        refresher.refresh();

        expect(later).toHaveBeenCalledTimes(1);
        expect(refresher.size).toBe(1);
    });

    it("a block that throws does not take the rest of the page with it", () => {
        const seen: unknown[] = [];
        const refresher = new BlockRefresher(() => undefined, (e) => seen.push(e));
        const after = vi.fn();
        refresher.register(() => {
            throw new Error("boom");
        });
        refresher.register(after);

        expect(() => refresher.refresh()).not.toThrow();
        expect(after, "the next block still drew").toHaveBeenCalledTimes(1);
        expect(seen).toHaveLength(1);
    });

    it("a failure is reported rather than swallowed", () => {
        const seen: unknown[] = [];
        const refresher = new BlockRefresher(() => undefined, (e) => seen.push(e));
        refresher.register(() => {
            throw new Error("boom");
        });
        refresher.refresh();
        expect((seen[0] as Error).message).toBe("boom");
    });

    it("a block that throws keeps redrawing on the next change", () => {
        let calls = 0;
        const refresher = new BlockRefresher(() => undefined, () => undefined);
        refresher.register(() => {
            calls += 1;
            throw new Error("boom");
        });
        refresher.refresh();
        refresher.refresh();
        expect(calls).toBe(2);
    });

    it("refreshing twice redraws twice — this is what a vault change does", () => {
        const refresher = new BlockRefresher();
        const draw = vi.fn();
        refresher.register(draw);
        refresher.refresh();
        refresher.refresh();
        expect(draw).toHaveBeenCalledTimes(2);
    });
});
