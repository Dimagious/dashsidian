import { describe, it, expect } from "vitest";
import { parseConfig, canonicalize, asItems, unknownKeys, nearest, isRecord, KEY_ALIASES } from "./parse";
import schema from "../blocks/schema.json";

describe("canonicalize — block context", () => {
    it("a block's own key does not drift into a synonym", () => {
        // `title` is a synonym of `label` for a tile, but heatmap's own key.
        expect(canonicalize({ title: "My sleep" }, { root: ["title"] }))
            .toEqual({ title: "My sleep" });
    });

    it("the same key outside the canonical list is still a synonym", () => {
        expect(canonicalize({ title: "Tile" }, { root: ["columns", "items"], item: ["label"] }))
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
        expect(canonicalize([{ title: "A" }], { root: ["title"], item: [] }))
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
