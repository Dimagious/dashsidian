import { describe, it, expect } from "vitest";
import { parseConfig, canonicalize, asItems, unknownKeys, nearest, isRecord, describeValue, KEY_ALIASES } from "./parse";
import schema from "../blocks/schema.json";

describe("canonicalize — block context", () => {
    it("a block's own key does not drift into a synonym", () => {
        // `title` is a synonym of `label` for a tile, but heatmap's own key.
        expect(canonicalize({ title: "My sleep" }, { root: ["title"] }))
            .toEqual({ title: "My sleep" });
    });

    it("the same key outside the canonical list is still a synonym", () => {
        expect(canonicalize({ title: "Tile" }, { root: ["columns", "items"], item: ["label"], bareItem: true }))
            .toEqual({ label: "Tile" });
    });

    it("the root and the list items are protected by different sets", () => {
        const out = canonicalize(
            { title: "Heading", items: [{ title: "Tile" }] },
            { root: ["title", "items"], item: ["label"] },
        );
        expect(out).toEqual({ title: "Heading", items: [{ label: "Tile" }] });
    });

    it("a bare array is read as list items", () => {
        expect(canonicalize([{ title: "A" }], { root: ["title"], item: ["label"] }))
            .toEqual([{ label: "A" }]);
    });

    it("nested objects that are not items keep the root protection", () => {
        expect(canonicalize({ title: "X", bands: [{ label: "top" }] }, { root: ["title", "bands"] }))
            .toEqual({ title: "X", bands: [{ label: "top" }] });
    });

    it("parseConfig passes the context through", () => {
        expect(parseConfig("title: My sleep\nfield: x", { root: ["title", "field"] }).value)
            .toEqual({ title: "My sleep", field: "x" });
    });
});

describe("canonicalize — a synonym needs its target in scope (B-125)", () => {
    const TODAY = Object.keys(schema.blocks.today.root);
    const STATS = { root: Object.keys(schema.blocks.stats.root), item: Object.keys(schema.blocks.stats.item) };
    const HEATMAP = { root: Object.keys(schema.blocks.heatmap.root), item: Object.keys(schema.blocks.heatmap.item) };

    it("a synonym whose target the block does not have stays as written", () => {
        expect(canonicalize({ folder: "Diary", daily: true }, { root: TODAY }))
            .toEqual({ folder: "Diary", daily: true });
    });

    it("the warning then names the key the author wrote", () => {
        const value = canonicalize({ folder: "Diary" }, { root: TODAY });
        const d = unknownKeys(value as Record<string, unknown>, TODAY);
        expect(d.map((x) => x.message)).toEqual(['Unknown key "folder", ignored.']);
    });

    it("target stays target in a block without goal", () => {
        const out = canonicalize({ items: [{ label: "A", target: 5 }] }, { ...STATS, bareItem: true });
        expect(out).toEqual({ items: [{ label: "A", target: 5 }] });
    });

    it("a synonym still applies where its target exists", () => {
        const out = canonicalize({ items: [{ folder: "Diary", title: "Sleep", aggregate: "avg" }] }, STATS);
        expect(out).toEqual({ items: [{ source: "Diary", label: "Sleep", agg: "avg" }] });
    });

    it("a root-level synonym applies at the root when the root has the target", () => {
        expect(canonicalize({ folder: "Diary", colour: "green", title: "Sleep" }, HEATMAP))
            .toEqual({ source: "Diary", color: "green", title: "Sleep" });
    });

    it("a root-level item synonym does not leak into a block root that lacks it", () => {
        // `name` means `label`, which heatmap has only on a layer.
        expect(canonicalize({ name: "Sleep" }, HEATMAP)).toEqual({ name: "Sleep" });
    });

    it("a bare single item is canonicalized against the item set", () => {
        expect(canonicalize({ folder: "Diary", title: "Sleep" }, { ...STATS, bareItem: true }))
            .toEqual({ source: "Diary", label: "Sleep" });
    });

    it("with an items list, the root is not a bare item and keeps its own set", () => {
        expect(canonicalize({ title: "X", items: [] }, { ...STATS, bareItem: true }))
            .toEqual({ title: "X", items: [] });
    });

    it("bareItem without any key set is still the legacy rename", () => {
        expect(canonicalize({ folder: "Diary" }, { bareItem: true })).toEqual({ source: "Diary" });
    });

    it("heatmap bands entries and layers take the item set, so their synonyms keep working", () => {
        const out = canonicalize(
            { bands: [{ min: 80, title: "Good" }], layers: [{ prop: "gym", colour: "red", name: "Gym" }] },
            HEATMAP,
        );
        expect(out).toEqual({
            bands: [{ min: 80, label: "Good" }],
            layers: [{ field: "gym", color: "red", label: "Gym" }],
        });
    });

    it("a nested map inherits its parent's set", () => {
        expect(canonicalize({ daily: { folder: "Diary" } }, { root: TODAY }))
            .toEqual({ daily: { folder: "Diary" } });
        expect(canonicalize({ items: [{ sub: { title: "x" } }] }, STATS))
            .toEqual({ items: [{ sub: { label: "x" } }] });
    });

    it("a level whose set is left out renames as before", () => {
        // `today` passes only `root`, so a list inside it has no item set.
        expect(canonicalize({ daily: [{ folder: "Diary" }] }, { root: TODAY }))
            .toEqual({ daily: [{ source: "Diary" }] });
    });

    it("an explicitly empty set renames nothing", () => {
        expect(canonicalize({ folder: "Diary" }, { root: [] })).toEqual({ folder: "Diary" });
    });

    it("with no context at all, every synonym is renamed as before, nested ones too", () => {
        expect(canonicalize({ folder: "A", target: 3, items: [{ name: "B", prop: "x" }], sub: { colour: "red" } }))
            .toEqual({ source: "A", goal: 3, items: [{ label: "B", field: "x" }], sub: { color: "red" } });
    });
});

describe("canonicalize", () => {
    it("rewrites synonyms to canonical keys", () => {
        expect(canonicalize({ folder: "X", title: "Y", emoji: "📥" }))
            .toEqual({ source: "X", label: "Y", icon: "📥" });
    });
    it("recurses into arrays", () => {
        expect(canonicalize([{ from: "A" }, { name: "B" }]))
            .toEqual([{ source: "A" }, { label: "B" }]);
    });
    it("leaves scalars alone", () => {
        expect(canonicalize(42)).toBe(42);
        expect(canonicalize(null)).toBeNull();
    });
});

describe("parseConfig", () => {
    it("parses valid YAML", () => {
        const r = parseConfig("source: Diary\nfield: sleep_score");
        expect(r.value).toEqual({ source: "Diary", field: "sleep_score" });
        expect(r.diagnostics).toHaveLength(0);
    });
    it("an empty block is an error, not a crash", () => {
        expect(parseConfig("   ").diagnostics[0]?.level).toBe("error");
    });
    it("broken YAML returns a diagnostic instead of throwing", () => {
        const r = parseConfig("items:\n  - { label: X\n");
        expect(r.value).toBeNull();
        expect(r.diagnostics[0]?.level).toBe("error");
    });
});

describe("asItems", () => {
    it("accepts a bare array", () => {
        expect(asItems([{ label: "A" }])).toHaveLength(1);
    });
    it("accepts an object with items", () => {
        expect(asItems({ columns: 4, items: [{ label: "A" }, { label: "B" }] })).toHaveLength(2);
    });
    it("treats a single object as a list of one", () => {
        expect(asItems({ label: "A" })).toHaveLength(1);
    });
    it("rubbish is an empty list", () => {
        expect(asItems("a string")).toHaveLength(0);
    });
});

describe("unknownKeys", () => {
    it("says nothing about known keys", () => {
        expect(unknownKeys({ label: "A", icon: "x" }, ["label", "icon"])).toHaveLength(0);
    });
    it("suggests a similar key", () => {
        const d = unknownKeys({ lable: "A" }, ["label", "icon"]);
        expect(d[0]?.level).toBe("warning");
        expect(d[0]?.message).toContain("label");
    });
    it("invents no suggestion for a completely foreign key", () => {
        const d = unknownKeys({ somethingEntirelyElse: 1 }, ["label"]);
        expect(d[0]?.message).toContain("ignored");
    });
});

describe("unknownKeys with a block's hints (ADR 0005)", () => {
    const hints = { layers: "series", period: "range" };

    it("a key from a neighbouring block names what it is called here", () => {
        expect(unknownKeys({ layers: [], period: "week" }, ["series", "range"], hints).map((d) => d.message)).toEqual([
            "Unknown key \"layers\". In this block it is called \"series\".",
            "Unknown key \"period\". In this block it is called \"range\".",
        ]);
    });

    it("a hint wins over the edit-distance guess, and the guess still works for the rest", () => {
        expect(unknownKeys({ serie: 1 }, ["series"], { serie: "range" })[0]?.message)
            .toBe("Unknown key \"serie\". In this block it is called \"range\".");
        expect(unknownKeys({ serie: 1 }, ["series"], hints)[0]?.message)
            .toBe("Unknown key \"serie\". Did you mean \"series\"?");
    });

    it("a known key is never hinted, and an inherited property is not a hint", () => {
        expect(unknownKeys({ layers: [] }, ["layers"], hints)).toEqual([]);
        expect(unknownKeys({ toString: 1 }, ["field"], hints)[0]?.message).toBe("Unknown key \"toString\", ignored.");
    });
});

describe("nearest", () => {
    it("finds a close one", () => expect(nearest("feild", ["field", "label"])).toBe("field"));
    it("does not reach for a distant one", () => expect(nearest("zzzzzz", ["field"])).toBeNull());
});

describe("isRecord", () => {
    it("tells an object from an array and null", () => {
        expect(isRecord({})).toBe(true);
        expect(isRecord([])).toBe(false);
        expect(isRecord(null)).toBe(false);
    });
});

describe("KEY_ALIASES comes from the schema", () => {
    it("carries every synonym the schema declares", () => {
        const declared: [string, string][] = [];
        for (const block of Object.values(schema.blocks) as Record<string, unknown>[]) {
            for (const level of [block.root, block.item]) {
                if (!level) continue;
                for (const [canonical, field] of Object.entries(level as Record<string, { aliases?: string[] }>)) {
                    for (const alias of field.aliases ?? []) declared.push([alias, canonical]);
                }
            }
        }
        expect(declared.length).toBeGreaterThan(0);
        for (const [alias, canonical] of declared) {
            expect(KEY_ALIASES[alias], alias).toBe(canonical);
        }
    });

    it("no two blocks claim the same synonym for different keys", () => {
        const seen = new Map<string, string>();
        const clashes: string[] = [];
        for (const block of Object.values(schema.blocks) as Record<string, unknown>[]) {
            for (const level of [block.root, block.item]) {
                if (!level) continue;
                for (const [canonical, field] of Object.entries(level as Record<string, { aliases?: string[] }>)) {
                    for (const alias of field.aliases ?? []) {
                        const first = seen.get(alias);
                        if (first && first !== canonical) clashes.push(`${alias} -> ${first} / ${canonical}`);
                        seen.set(alias, canonical);
                    }
                }
            }
        }
        // The table is flat, so a clash would silently let the last block win.
        expect(clashes).toEqual([]);
    });

    it("still maps the synonyms it always did", () => {
        expect(KEY_ALIASES).toMatchObject({
            folder: "source",
            from: "source",
            title: "label",
            name: "label",
            emoji: "icon",
            property: "field",
            prop: "field",
            aggregate: "agg",
            target: "goal",
            colour: "color",
        });
    });

    it("no longer carries a synonym that maps a key to itself", () => {
        for (const [alias, canonical] of Object.entries(KEY_ALIASES)) {
            expect(alias, `${alias} -> ${canonical}`).not.toBe(canonical);
        }
    });
});

describe("describeValue", () => {
    it("a string is itself", () => {
        expect(describeValue("avgg")).toBe("avgg");
    });

    it("numbers and booleans read as written", () => {
        expect(describeValue(42)).toBe("42");
        expect(describeValue(true)).toBe("true");
        expect(describeValue(1.5)).toBe("1.5");
    });

    it("a map reads back instead of [object Object]", () => {
        // YAML will happily produce a map where a string was expected, and
        // "[object Object]" tells the author nothing about what they wrote.
        expect(describeValue({ min: 1 })).toBe('{"min":1}');
    });

    it("a list reads back too", () => {
        expect(describeValue([1, 2])).toBe("[1,2]");
    });

    it("null and undefined are named", () => {
        expect(describeValue(null)).toBe("null");
        expect(describeValue(undefined)).toBe("undefined");
    });

    it("something with no reading says so rather than throwing", () => {
        expect(describeValue(Symbol("x"))).toBe("[unreadable]");
        expect(describeValue(() => undefined)).toBe("[unreadable]");
    });

    it("a structure that cannot be walked does not take the block down", () => {
        const loop: Record<string, unknown> = {};
        loop.self = loop;
        expect(describeValue(loop)).toBe("[unreadable]");
    });
});

describe("prototype-named keys (B-125)", () => {
    const own = (entries: [string, unknown][]): Record<string, unknown> => {
        const o: Record<string, unknown> = {};
        for (const [k, v] of entries) Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
        return o;
    };

    it("`__proto__` stays an own key and does not leak its fields into the block", () => {
        const input = own([["__proto__", { label: "Polluted" }], ["agg", "count"]]);
        const out = canonicalize(input, { root: ["columns", "items"], item: ["label", "agg"], bareItem: true }) as Record<string, unknown>;
        expect(Object.keys(out)).toEqual(["__proto__", "agg"]);
        expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
        expect((out as { label?: unknown }).label).toBeUndefined();
    });

    it("`constructor` is left as written, with or without a context", () => {
        expect(Object.keys(canonicalize({ constructor: 1 }) as object)).toEqual(["constructor"]);
        expect(Object.keys(canonicalize({ constructor: 1 }, { root: ["title"] }) as object)).toEqual(["constructor"]);
    });
});

