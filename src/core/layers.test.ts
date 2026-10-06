import { describe, it, expect } from "vitest";
import { readLayers, readPick, combineLayers, type LayeredMark } from "./layers";
import { dayValues, type DayMark } from "./day-values";
import type { NoteRecord } from "./source";

const ITEM_KEYS = ["field", "color", "label"];

const note = (path: string, frontmatter: Record<string, unknown>): NoteRecord => {
    const slash = path.lastIndexOf("/");
    const name = slash === -1 ? path.replace(/\.md$/, "") : path.slice(slash + 1).replace(/\.md$/, "");
    return { path, name, folder: slash === -1 ? "" : path.slice(0, slash), tags: [], frontmatter };
};

/** A `DayMark` with everything but the fields under test filled in with a plausible default. */
const mark = (overrides: Partial<DayMark> = {}): DayMark => ({
    value: 1,
    path: "Diary/2026-01-01.md",
    isBool: false,
    painted: true,
    notes: [{ path: "Diary/2026-01-01.md", name: "2026-01-01" }],
    ...overrides,
});

describe("readLayers", () => {
    it("layers absent is silent, not an error", () => {
        const outcome = readLayers({}, ITEM_KEYS);
        expect(outcome.layers).toBeNull();
        expect(outcome.diagnostics).toEqual([]);
    });

    it("reads fields, an explicit colour and an explicit label", () => {
        const { layers, diagnostics } = readLayers(
            { layers: [{ field: "gym", color: "blue", label: "Gym" }] },
            ITEM_KEYS,
        );
        expect(diagnostics).toEqual([]);
        expect(layers).toEqual([
            { fields: ["gym"], fieldLabel: "gym", label: "Gym", color: [59, 130, 246] },
        ]);
    });

    it("a missing label falls back to the field name(s), joined the same way a caption would", () => {
        const { layers } = readLayers({ layers: [{ field: ["mood_am", "mood_pm"] }] }, ITEM_KEYS);
        expect(layers?.[0]?.label).toBe("mood_am, mood_pm");
        expect(layers?.[0]?.fieldLabel).toBe("mood_am, mood_pm");
    });

    it("a blank label also falls back to the field name(s), without a diagnostic", () => {
        const { layers, diagnostics } = readLayers({ layers: [{ field: "gym", label: "   " }] }, ITEM_KEYS);
        expect(layers?.[0]?.label).toBe("gym");
        expect(diagnostics).toEqual([]);
    });

    it("a non-string `label` (a number) warns naming the position and the value, and falls back", () => {
        const { layers, diagnostics } = readLayers({ layers: [{ field: "gym", label: 5 }] }, ITEM_KEYS);
        expect(layers?.[0]?.label).toBe("gym");
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({ level: "warning" });
        expect(diagnostics[0]?.message).toContain("Layer 1");
        expect(diagnostics[0]?.message).toContain("5");
    });

    it("a non-string `label` (a list) also warns and falls back, naming the value", () => {
        const { layers, diagnostics } = readLayers({ layers: [{ field: "gym", label: ["a", "b"] }] }, ITEM_KEYS);
        expect(layers?.[0]?.label).toBe("gym");
        expect(diagnostics.some((d) => d.level === "warning" && d.message.includes("a") && d.message.includes("b")))
            .toBe(true);
    });

    it("a dotted path in a layer's own field is accepted as is, resolved later by core/field.ts", () => {
        const { layers, diagnostics } = readLayers({ layers: [{ field: "health.sleep" }] }, ITEM_KEYS);
        expect(diagnostics).toEqual([]);
        expect(layers?.[0]?.fields).toEqual(["health.sleep"]);
    });

    it("a missing colour on every layer assigns the palette in order", () => {
        const { layers } = readLayers({ layers: [{ field: "gym" }, { field: "run" }] }, ITEM_KEYS);
        expect(layers?.map((l) => l.color)).toEqual([[59, 130, 246], [34, 197, 94]]);
    });

    it("an explicit colour on a later layer is still skipped by an earlier implicit one", () => {
        // Colours are assigned only once every entry has parsed cleanly, so
        // the second entry's explicit `blue` is known before the first
        // entry's implicit colour is chosen.
        const { layers } = readLayers(
            { layers: [{ field: "gym" }, { field: "run", color: "blue" }] },
            ITEM_KEYS,
        );
        expect(layers?.[0]?.color).toEqual([34, 197, 94]); // green: blue was already claimed
        expect(layers?.[1]?.color).toEqual([59, 130, 246]);
    });

    it("`layers` that is not a list is an error", () => {
        const { layers, diagnostics } = readLayers({ layers: "gym" }, ITEM_KEYS);
        expect(layers).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("error");
        expect(diagnostics[0]?.message).toContain("gym");
    });

    it("an empty `layers` list is an error", () => {
        const { layers, diagnostics } = readLayers({ layers: [] }, ITEM_KEYS);
        expect(layers).toBeNull();
        expect(diagnostics[0]?.message).toContain("empty");
    });

    it("an entry that is not a map errors naming its 1-based position", () => {
        const { layers, diagnostics } = readLayers({ layers: [{ field: "gym" }, 5] }, ITEM_KEYS);
        expect(layers).toBeNull();
        expect(diagnostics[0]?.message).toContain("Layer 2");
        expect(diagnostics[0]?.message).toContain("5");
    });

    it("an entry without `field` errors naming its position", () => {
        const { layers, diagnostics } = readLayers({ layers: [{ color: "blue" }] }, ITEM_KEYS);
        expect(layers).toBeNull();
        expect(diagnostics[0]?.message).toContain("Layer 1");
        expect(diagnostics[0]?.message).toContain("No `field` given");
    });

    it("an entry with an invalid `field` errors naming its position and the value", () => {
        const { layers, diagnostics } = readLayers({ layers: [{ field: 5 }] }, ITEM_KEYS);
        expect(layers).toBeNull();
        expect(diagnostics[0]?.message).toContain("Layer 1");
        expect(diagnostics[0]?.message).toContain("5");
    });

    it("an entry with an empty `field` list errors naming its position", () => {
        const { layers, diagnostics } = readLayers({ layers: [{ field: [] }] }, ITEM_KEYS);
        expect(layers).toBeNull();
        expect(diagnostics[0]?.message).toContain("Layer 1");
        expect(diagnostics[0]?.message).toContain("empty list");
    });

    it("every entry is checked, not just the first that fails", () => {
        const { diagnostics } = readLayers({ layers: [{ color: "blue" }, { field: 5 }] }, ITEM_KEYS);
        expect(diagnostics.some((d) => d.message.includes("Layer 1"))).toBe(true);
        expect(diagnostics.some((d) => d.message.includes("Layer 2"))).toBe(true);
    });

    it("an unknown key inside an entry warns, without failing the whole layer", () => {
        const { layers, diagnostics } = readLayers({ layers: [{ field: "gym", bogus: 1 }] }, ITEM_KEYS);
        expect(layers).not.toBeNull();
        expect(diagnostics.some((d) => d.level === "warning" && d.message.includes("bogus"))).toBe(true);
    });
});

describe("combineLayers — which layer colours a day", () => {
    it("the first painted layer wins the cell", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 5, path: "a.md" })]]),
            new Map([["2026-01-01", mark({ value: 9, path: "b.md" })]]),
        ];
        const combined = combineLayers(perLayer, ["gym", "run"]);
        expect(combined.get("2026-01-01")).toMatchObject({ value: 5, path: "a.md", painted: true, layer: 0 });
    });

    it("a false-only first layer lets the second, painted one win instead", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 0, path: "a.md", painted: false })]]),
            new Map([["2026-01-01", mark({ value: 9, path: "b.md", painted: true })]]),
        ];
        const combined = combineLayers(perLayer, ["gym", "run"]);
        expect(combined.get("2026-01-01")).toMatchObject({ value: 9, path: "b.md", painted: true, layer: 1 });
    });

    it("false-only across every layer stays present but unpainted, like a single false mark", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 0, painted: false })]]),
            new Map([["2026-01-01", mark({ value: 0, painted: false })]]),
        ];
        const combined = combineLayers(perLayer, ["gym", "run"]);
        const day = combined.get("2026-01-01");
        expect(day?.painted).toBe(false);
        expect(day?.value).toBe(0);
        expect(day?.path).toBe("");
    });

    it("a day only the second layer has anything for is still in the map, coloured by that layer", () => {
        const perLayer = [
            new Map<string, DayMark>(),
            new Map([["2026-01-02", mark({ value: 3, path: "b.md" })]]),
        ];
        const combined = combineLayers(perLayer, ["gym", "run"]);
        expect(combined.get("2026-01-02")).toMatchObject({ value: 3, layer: 1 });
    });

    it("days come from every layer's own union, not just the first layer's", () => {
        const perLayer = [
            new Map([["2026-01-01", mark()]]),
            new Map([["2026-01-02", mark()]]),
        ];
        const combined = combineLayers(perLayer, ["gym", "run"]);
        expect([...combined.keys()].sort()).toEqual(["2026-01-01", "2026-01-02"]);
    });

    it("parts lists every layer with an entry that day, in list order, by its own label", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 1 })]]),
            new Map<string, DayMark>(), // nothing this day
            new Map([["2026-01-01", mark({ value: 7, painted: false })]]),
        ];
        const combined = combineLayers(perLayer, ["gym", "run", "sleep"]);
        const day = combined.get("2026-01-01") as LayeredMark;
        expect(day.parts).toEqual([{ label: "gym", value: 1, layer: 0 }, { label: "sleep", value: 7, layer: 2 }]);
    });

    it("notes: the union across layers, not just the winning one's own list", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({
                path: "a.md", notes: [{ path: "a.md", name: "a" }, { path: "b.md", name: "b" }],
            })]]),
            new Map([["2026-01-01", mark({ path: "b.md", notes: [{ path: "b.md", name: "b" }] })]]),
        ];
        const combined = combineLayers(perLayer, ["gym", "run"]);
        // "b.md" contributed to both layers; the union counts it once.
        expect(combined.get("2026-01-01")?.notes).toEqual([
            { path: "a.md", name: "a" },
            { path: "b.md", name: "b" },
        ]);
    });

    it("a false-only layer's note still joins the union", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({
                painted: false, notes: [{ path: "a.md", name: "a" }],
            })]]),
            new Map([["2026-01-01", mark({ path: "b.md", notes: [{ path: "b.md", name: "b" }] })]]),
        ];
        const combined = combineLayers(perLayer, ["gym", "run"]);
        expect(combined.get("2026-01-01")?.notes).toEqual([
            { path: "a.md", name: "a" },
            { path: "b.md", name: "b" },
        ]);
    });

    it("per_day applies to each layer's own dayValues before layers are combined", () => {
        const notes = [
            note("Diary/2026-01-01.md", { mood_am: 5, mood_pm: 7 }),
            note("Diary/2026-01-01 evening.md", { steps: 4000 }),
        ];
        const moodLayer = dayValues(notes, ["mood_am", "mood_pm"], "avg");
        const stepsLayer = dayValues(notes, ["steps"], "avg");
        const combined = combineLayers([moodLayer, stepsLayer], ["mood", "steps"]);
        // (5 + 7) / 2 = 6 for mood; steps has a single contributor either way.
        expect(combined.get("2026-01-01")).toMatchObject({ value: 6, layer: 0 });
        expect(combined.get("2026-01-01")?.parts).toEqual([
            { label: "mood", value: 6, layer: 0 },
            { label: "steps", value: 4000, layer: 1 },
        ]);
    });
});

// B-116: `isBool` feeds the "boolean-only stays flat" rule an auto-fitted
// colour scale follows (`core/bands.ts#autoBands`) — the same flag a plain
// `DayMark` already carried, now threaded onto the winning layer's own
// `LayeredMark` too.
describe("combineLayers — isBool", () => {
    it("takes the winning layer's own isBool, not any other layer's", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 0, path: "a.md", painted: false, isBool: true })]]),
            new Map([["2026-01-01", mark({ value: 9, path: "b.md", painted: true, isBool: false })]]),
        ];
        const combined = combineLayers(perLayer, ["gym", "steps"]);
        // gym (false-only) never wins; steps does, and its own isBool
        // (a real number, not a checkbox) is what the mark carries.
        expect(combined.get("2026-01-01")?.isBool).toBe(false);
    });

    it("a boolean layer's isBool carries through once it wins the cell", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 1, path: "a.md", painted: true, isBool: true })]]),
        ];
        const combined = combineLayers(perLayer, ["gym"]);
        expect(combined.get("2026-01-01")?.isBool).toBe(true);
    });

    it("nothing painted this day still gets a determinate isBool, never undefined", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 0, painted: false, isBool: false })]]),
        ];
        const combined = combineLayers(perLayer, ["steps"]);
        expect(typeof combined.get("2026-01-01")?.isBool).toBe("boolean");
    });
});

describe("readPick", () => {
    it("absent is silent and defaults to first", () => {
        expect(readPick({})).toEqual({ pick: "first", diagnostics: [] });
    });

    it("reads first and max as written", () => {
        expect(readPick({ pick: "first" })).toEqual({ pick: "first", diagnostics: [] });
        expect(readPick({ pick: "max" })).toEqual({ pick: "max", diagnostics: [] });
    });

    it("an unknown string warns naming it and falls back to first", () => {
        const { pick, diagnostics } = readPick({ pick: "biggest" });
        expect(pick).toBe("first");
        expect(diagnostics).toEqual([
            { level: "warning", message: "`pick` expects first or max, got \"biggest\". Using first." },
        ]);
    });

    it("a value of the wrong shape (a number, a differently cased word) also warns and falls back", () => {
        expect(readPick({ pick: 1 }).pick).toBe("first");
        expect(readPick({ pick: 1 }).diagnostics).toHaveLength(1);
        expect(readPick({ pick: "Max" }).pick).toBe("first");
        expect(readPick({ pick: "Max" }).diagnostics[0]?.message).toContain("\"Max\"");
    });
});

describe("combineLayers — pick: max (B-136)", () => {
    it("the layer with the larger value wins the cell, its value and its link", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 30, path: "a.md" })]]),
            new Map([["2026-01-01", mark({ value: 90, path: "b.md" })]]),
        ];
        const combined = combineLayers(perLayer, ["run", "bike"], "max");
        expect(combined.get("2026-01-01")).toMatchObject({ value: 90, path: "b.md", painted: true, layer: 1 });
        // The tooltip parts are unchanged: every layer, in list order.
        expect(combined.get("2026-01-01")?.parts).toEqual([
            { label: "run", value: 30, layer: 0 },
            { label: "bike", value: 90, layer: 1 },
        ]);
    });

    it("the same marks under the default still go to the first layer", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 30, path: "a.md" })]]),
            new Map([["2026-01-01", mark({ value: 90, path: "b.md" })]]),
        ];
        expect(combineLayers(perLayer, ["run", "bike"]).get("2026-01-01")?.layer).toBe(0);
        expect(combineLayers(perLayer, ["run", "bike"], "first").get("2026-01-01")?.layer).toBe(0);
    });

    it("a tie goes to the first layer in list order", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 45, path: "a.md" })]]),
            new Map([["2026-01-01", mark({ value: 45, path: "b.md" })]]),
            new Map([["2026-01-01", mark({ value: 45, path: "c.md" })]]),
        ];
        const combined = combineLayers(perLayer, ["run", "bike", "swim"], "max");
        expect(combined.get("2026-01-01")).toMatchObject({ value: 45, path: "a.md", layer: 0 });
    });

    it("the largest of three wins even when it sits in the middle", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 10, path: "a.md" })]]),
            new Map([["2026-01-01", mark({ value: 70, path: "b.md" })]]),
            new Map([["2026-01-01", mark({ value: 40, path: "c.md" })]]),
        ];
        const combined = combineLayers(perLayer, ["run", "bike", "swim"], "max");
        expect(combined.get("2026-01-01")).toMatchObject({ value: 70, layer: 1 });
    });

    it("a day only one layer has stays that layer's, whatever its value", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 5, path: "a.md" })]]),
            new Map([["2026-01-02", mark({ value: -3, path: "b.md" })]]),
        ];
        const combined = combineLayers(perLayer, ["run", "bike"], "max");
        expect(combined.get("2026-01-01")).toMatchObject({ value: 5, layer: 0 });
        expect(combined.get("2026-01-02")).toMatchObject({ value: -3, layer: 1, painted: true });
    });

    it("an unpainted (false-only) layer never competes, even when it would compare larger", () => {
        const perLayer = [
            new Map([["2026-01-01", mark({ value: 0, path: "a.md" })]]),
            // A false mark with a stray larger value must still not win.
            new Map([["2026-01-01", mark({ value: 5, path: "", painted: false })]]),
        ];
        const combined = combineLayers(perLayer, ["run", "gym"], "max");
        expect(combined.get("2026-01-01")).toMatchObject({ value: 0, path: "a.md", layer: 0, painted: true });
    });

    it("a ticked checkbox counts as 1: it loses to more minutes and wins over less than 1", () => {
        const notes = [
            note("Diary/2026-01-01.md", { gym: true, run: 40 }),
            note("Diary/2026-01-02.md", { gym: true, run: 0.5 }),
        ];
        const gymLayer = dayValues(notes, ["gym"], "sum");
        const runLayer = dayValues(notes, ["run"], "sum");
        const combined = combineLayers([gymLayer, runLayer], ["gym", "run"], "max");
        expect(combined.get("2026-01-01")).toMatchObject({ value: 40, layer: 1, isBool: false });
        expect(combined.get("2026-01-02")).toMatchObject({ value: 1, layer: 0, isBool: true });
    });

    it("compares each layer after its own per_day, not its raw values", () => {
        const notes = [
            note("Diary/2026-01-01.md", { run: 30 }),
            note("Diary/2026-01-01 evening.md", { run: 30, bike: 50 }),
        ];
        // sum: run 60 beats bike 50; max: run 30 loses to bike 50.
        const sum = combineLayers(
            [dayValues(notes, ["run"], "sum"), dayValues(notes, ["bike"], "sum")], ["run", "bike"], "max",
        );
        expect(sum.get("2026-01-01")).toMatchObject({ value: 60, layer: 0 });
        const max = combineLayers(
            [dayValues(notes, ["run"], "max"), dayValues(notes, ["bike"], "max")], ["run", "bike"], "max",
        );
        expect(max.get("2026-01-01")).toMatchObject({ value: 50, layer: 1 });
    });
});
