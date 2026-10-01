import { describe, expect, it } from "vitest";
import { registerBlocks } from "./register";

describe("registerBlocks", () => {
    it("registers every block and the dashy-chart alias", () => {
        const names: string[] = [];
        const taken = registerBlocks({ stats: 1, chart: 2 }, (name) => names.push(name));
        expect(names).toEqual(["stats", "chart", "dashy-chart"]);
        expect(taken).toEqual([]);
    });

    it("keeps going when another plugin already owns a language", () => {
        const owned = new Set(["chart"]);
        const names: string[] = [];
        const taken = registerBlocks({ chart: 1, tiles: 2 }, (name) => {
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
});
