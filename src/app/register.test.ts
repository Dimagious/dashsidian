import { describe, expect, it } from "vitest";
import { fenceName, registerBlocks } from "./register";

describe("registerBlocks", () => {
    it("registers every block and the dashy-chart alias", () => {
        const names: string[] = [];
        const result = registerBlocks({ stats: 1, chart: 2 }, (name) => names.push(name));
        expect(names).toEqual(["stats", "chart", "dashy-chart"]);
        expect(result).toEqual({ taken: [], yielded: [] });
    });

    it("keeps going when another plugin already owns a language", () => {
        const owned = new Set(["chart"]);
        const names: string[] = [];
        const { taken } = registerBlocks({ chart: 1, tiles: 2 }, (name) => {
            if (owned.has(name)) throw new Error(`Code block postprocessor for language ${name} is already registered`);
            names.push(name);
        });
        expect(taken).toEqual(["chart"]);
        expect(names).toEqual(["dashy-chart", "tiles"]);
    });

    it("passes the block itself to the register callback", () => {
        const seen: Array<[string, number]> = [];
        registerBlocks({ chart: 7 }, (name, block) => seen.push([name, block]));
        expect(seen).toEqual([["chart", 7], ["dashy-chart", 7]]);
    });

    it("leaves plain chart to Obsidian Charts when it is enabled, keeping dashy-chart", () => {
        const names: string[] = [];
        const asked: string[] = [];
        const result = registerBlocks({ stats: 1, chart: 2 }, (name) => names.push(name), (id) => {
            asked.push(id);
            return id === "obsidian-charts";
        });
        expect(names).toEqual(["stats", "dashy-chart"]);
        expect(result).toEqual({ taken: [], yielded: ["chart"] });
        expect(asked).toEqual(["obsidian-charts"]);
    });

    it("takes plain chart when some other plugin is enabled", () => {
        const names: string[] = [];
        const result = registerBlocks({ chart: 1 }, (name) => names.push(name), (id) => id === "dataview");
        expect(names).toEqual(["chart", "dashy-chart"]);
        expect(result.yielded).toEqual([]);
    });

    it("still reports dashy-chart as taken if someone else holds it too", () => {
        const { taken, yielded } = registerBlocks({ chart: 1 }, (name) => {
            if (name === "dashy-chart") throw new Error("already registered");
        }, () => true);
        expect(yielded).toEqual(["chart"]);
        expect(taken).toEqual(["dashy-chart"]);
    });
});

describe("fenceName", () => {
    it("writes dashy-chart once chart was left to another plugin", () => {
        expect(fenceName("chart", ["chart"])).toBe("dashy-chart");
    });

    it("keeps the own name when nothing was yielded", () => {
        expect(fenceName("chart", [])).toBe("chart");
        expect(fenceName("stats", ["chart"])).toBe("stats");
    });

    it("falls back to the own name for a yielded block without an alias", () => {
        expect(fenceName("stats", ["stats"])).toBe("stats");
    });
});
