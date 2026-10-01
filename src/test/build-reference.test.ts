import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

// scripts/build-reference.cjs is a plain Node CommonJS script, kept outside
// `src/` on purpose (it builds site pages, not the plugin). `require` rather
// than a static import, the same reasoning as `site-check.test.ts`.
const require = createRequire(import.meta.url);

interface KeySpec {
    type: string;
    doc: string;
    required?: boolean;
    default?: string | number | boolean;
    aliases?: string[];
}

interface BlockSpec {
    summary: string;
    example: string;
    root?: Record<string, KeySpec>;
    item?: Record<string, KeySpec>;
    notes?: string[];
    hints?: Record<string, string>;
}

interface Schema {
    blocks: Record<string, BlockSpec>;
    notInV1: Record<string, string>;
}

interface Page {
    block: string;
    tagline: string;
    item: string | null;
    items: string | null;
    showcase: { image: string; width: number; height: number; alt: string; yaml: string };
    guides: string[];
    callout?: string;
}

interface Target {
    file: string;
    body: string;
}

interface BuildReferenceModule {
    SITE_URL: string;
    PAGES: Page[];
    SECTION_IDS: string[];
    esc: (s: string) => string;
    prose: (s: string) => string;
    typeWords: (t: string) => string;
    sentence: (s: string) => string;
    keyIds: (b: BlockSpec, page: Page) => Map<string, string>;
    blockPage: (page: Page, b: BlockSpec, guideTitles: Record<string, string>) => string;
    indexPage: (schema: Schema, pages: Page[]) => string;
    assertPagesMatchSchema: (schema: Schema, pages: Page[]) => void;
    buildTargets: (schema: Schema, pages: Page[], guideTitles: Record<string, string>) => Target[];
    findStaleTargets: (targets: Target[], readCurrent: (file: string) => string | null) => string[];
    findOrphanBlockDirs: (dirNames: string[], schema: Schema) => string[];
    guideTitleFrom: (html: string, slug: string) => string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ref = require("../../scripts/build-reference.cjs") as BuildReferenceModule;
const {
    SITE_URL,
    PAGES,
    SECTION_IDS,
    esc,
    prose,
    typeWords,
    sentence,
    keyIds,
    blockPage,
    indexPage,
    assertPagesMatchSchema,
    buildTargets,
    findStaleTargets,
    findOrphanBlockDirs,
    guideTitleFrom,
} = ref;

const showcase = (image: string): Page["showcase"] => ({ image, width: 700, height: 100, alt: `${image} picture`, yaml: "source: Diary" });

const cards: BlockSpec = {
    summary: "Number cards over `source`.",
    example: "items:\n  - { label: Days, source: Diary, agg: count }",
    root: {
        columns: { type: "number", doc: "columns in the grid", default: 3 },
        field: { type: "string", doc: "a shared field" },
    },
    item: {
        label: { type: "string", doc: "caption", required: true, aliases: ["title", "name"] },
        field: { type: "string|list", doc: "where `rating >= 4` holds" },
        compare: { type: "boolean", doc: "`period` against the last one", default: false },
    },
    notes: ["`streak` counts days & nights."],
    hints: { layers: "series" },
};

const solo: BlockSpec = {
    summary: "Today and its links.",
    example: "daily: true",
    root: { daily: { type: "boolean", doc: "daily link", default: true } },
};

const schema: Schema = {
    blocks: { cards, solo },
    notInV1: { tables: "use `Bases`" },
};

const pages: Page[] = [
    { block: "solo", tagline: "where the day starts", item: null, items: null, showcase: showcase("solo"), guides: [] },
    { block: "cards", tagline: "the numbers", item: "card", items: "cards", showcase: showcase("cards"), guides: ["g1"] },
];
// Guide titles are read out of the guide's HTML, so they go in as they are.
const titles = { g1: "A guide &amp; more" };

describe("build-reference — text", () => {
    it("escapes the four HTML characters", () => {
        expect(esc(`a < b & "c" > d`)).toBe("a &lt; b &amp; &quot;c&quot; &gt; d");
    });

    it("turns backtick pairs into code spans after escaping", () => {
        expect(prose("where `rating >= 4` and `x`")).toBe("where <code>rating &gt;= 4</code> and <code>x</code>");
    });

    it("throws on an unbalanced backtick", () => {
        expect(() => prose("one `open and `closed` span")).toThrow(/unbalanced backtick/);
    });

    it("throws on an em or an en dash", () => {
        expect(() => prose("a — b")).toThrow(/em or en dash/);
        expect(() => prose("1–2")).toThrow(/em or en dash/);
    });

    it("upper-cases a key doc that starts lower case, and leaves code or a capital alone", () => {
        expect(sentence("columns in the grid")).toBe("columns in the grid");
        // a value list keeps its case: `agg: Count` is not a value
        expect(sentence("count sum avg")).toBe("count sum avg");
        expect(sentence("`period` first")).toBe("<code>period</code> first");
        expect(sentence("Already a sentence")).toBe("Already a sentence");
    });
});

describe("build-reference — typeWords", () => {
    it("reads each schema type as words", () => {
        expect(typeWords("string")).toBe("text");
        expect(typeWords("number")).toBe("number");
        expect(typeWords("boolean")).toBe("true or false");
        expect(typeWords("list")).toBe("list");
    });

    it("joins a union with or", () => {
        expect(typeWords("string|list")).toBe("text or list");
        expect(typeWords("number|string")).toBe("number or text");
    });

    it("throws on a type it does not know, including an inherited property name", () => {
        expect(() => typeWords("date")).toThrow(/unknown type "date"/);
        expect(() => typeWords("string|toString")).toThrow(/unknown type "toString"/);
    });
});

describe("build-reference — keyIds", () => {
    const page = pages[1] as Page;

    it("uses the key as its id, and prefixes an item key the root also has", () => {
        const ids = keyIds(cards, page);
        expect(ids.get("root:columns")).toBe("columns");
        expect(ids.get("root:field")).toBe("field");
        expect(ids.get("item:field")).toBe("card-field");
        expect(ids.get("item:label")).toBe("label");
    });

    it("throws when a key would take a section's id", () => {
        expect(SECTION_IDS).toContain("example");
        const clash: BlockSpec = { ...solo, root: { example: { type: "string", doc: "x" } } };
        expect(() => keyIds(clash, { ...page, block: "clash" })).toThrow(/id "example" used twice on clash/);
    });

    it("throws when an item key's prefixed id is already a root key", () => {
        const clash: BlockSpec = {
            ...solo,
            root: { "card-field": { type: "string", doc: "x" }, field: { type: "string", doc: "y" } },
            item: { field: { type: "string", doc: "z" } },
        };
        expect(() => keyIds(clash, page)).toThrow(/id "card-field" used twice/);
    });
});

describe("build-reference — assertPagesMatchSchema", () => {
    it("passes when both lists hold the same blocks, in any order", () => {
        expect(() => assertPagesMatchSchema(schema, pages)).not.toThrow();
    });

    it("throws when the schema has a block without a page", () => {
        expect(() => assertPagesMatchSchema(schema, pages.slice(0, 1))).toThrow(/PAGES \(solo\) and schema blocks \(cards, solo\) differ/);
    });

    it("throws when a page names a block the schema does not have", () => {
        const extra = [...pages, { ...(pages[0] as Page), block: "gone" }];
        expect(() => assertPagesMatchSchema(schema, extra)).toThrow(/differ/);
    });
});

describe("build-reference — a block page with items", () => {
    const html = blockPage(pages[1] as Page, cards, titles);

    it("is marked as generated and asks for the shell with the block as its tab", () => {
        expect(html).toContain("<!-- Generated by scripts/build-reference.cjs from src/blocks/schema.json. Do not edit by hand. -->");
        expect(html).toContain('<!--shell:top tab="cards"-->');
        expect(html.trimEnd().endsWith("<!--shell:bottom-->")).toBe(true);
    });

    it("carries its own canonical URL and the showcase picture as og:image", () => {
        expect(html).toContain(`<link rel="canonical" href="${SITE_URL}reference/cards/">`);
        expect(html).toContain(`<meta property="og:url" content="${SITE_URL}reference/cards/">`);
        expect(html).toContain(`<meta property="og:image" content="${SITE_URL}img/cards-light.png">`);
        expect(html).toContain("<title>cards block reference: every key · Dashy</title>");
    });

    it("counts keys on the block and on each item", () => {
        expect(html).toContain('<div class="v">2 on the block, 3 on each card</div>');
    });

    it("draws one row per key with its id, type words and default, or none", () => {
        expect(html).toContain('<tr id="columns">');
        expect(html).toContain('<tr id="card-field">');
        expect(html).toContain('<td class="t" data-h="type">text or list</td>');
        expect(html).toContain('<td class="v" data-h="default"><code>3</code></td>');
        expect(html).toContain('<td class="v" data-h="default"><code>false</code></td>');
        expect(html).toContain('<td class="d">where <code>rating &gt;= 4</code> holds</td>');
        expect(html.match(/<tr id="/g)).toHaveLength(5);
        expect(html.match(/<span class="none">none<\/span>/g)).toHaveLength(3);
    });

    it("marks a required key and lists its synonyms", () => {
        expect(html).toContain('<a class="key" href="#label"><code>label</code></a> <span class="req">required</span><span class="also">also <code>title</code>, <code>name</code></span>');
    });

    it("lists hints, notes and related guides, each in the table of contents", () => {
        expect(html).toContain("<li><code>layers</code> is <code>series</code> here</li>");
        expect(html).toContain("<li><code>streak</code> counts days &amp; nights.</li>");
        expect(html).toContain('<li><a href="../../guides/g1/">A guide &amp; more</a></li>');
        for (const id of ["showcase", "example", "root-keys", "item-keys", "other-blocks", "how-it-counts", "related"]) {
            expect(html).toContain(`<li><a href="#${id}">`);
            expect(html).toContain(`id="${id}"`);
        }
    });

    it("shows both YAML bodies fenced with the block name, escaped", () => {
        expect(html).toContain("```cards\nsource: Diary\n```");
        expect(html).toContain("```cards\nitems:\n  - { label: Days, source: Diary, agg: count }\n```");
    });

    it("throws when a related guide has no title", () => {
        expect(() => blockPage(pages[1] as Page, cards, {})).toThrow(/no title for guide "g1" on cards/);
    });

    it("throws on a dash in the schema example", () => {
        expect(() => blockPage(pages[1] as Page, { ...cards, example: "label: a — b" }, titles)).toThrow(/em or en dash/);
    });
});

describe("build-reference — a block page without items", () => {
    const html = blockPage(pages[0] as Page, solo, titles);

    it("has one Keys table and no item, hint, note or guide section", () => {
        expect(html).toContain('<h2 id="keys">Keys</h2>');
        expect(html).toContain('<div class="v">1</div>');
        for (const id of ["root-keys", "item-keys", "other-blocks", "how-it-counts", "related"]) {
            expect(html).not.toContain(`id="${id}"`);
        }
    });
});

describe("build-reference — index page and targets", () => {
    it("links a card per block in page order, with its key count", () => {
        const html = indexPage(schema, pages);
        const hrefs = Array.from(html.matchAll(/<a class="card" href="([^"]+)">/g), (m) => m[1]);
        expect(hrefs).toEqual(["solo/", "cards/"]);
        expect(html).toContain('<span class="pill">1 keys</span>');
        expect(html).toContain('<span class="pill">5 keys</span>');
        expect(html).toContain("<li><b>tables</b>: use <code>Bases</code></li>");
        expect(html).toContain(`<link rel="canonical" href="${SITE_URL}reference/">`);
    });

    it("gives a wide picture the fit thumbnail and a tall one the cropped one", () => {
        const wide = [
            { ...(pages[0] as Page), showcase: { ...showcase("solo"), height: 74 } },
            { ...(pages[1] as Page), showcase: { ...showcase("cards"), height: 272 } },
        ];
        const html = indexPage(schema, wide);
        expect(html).toContain('<div class="thumb fit"><picture><source data-dark srcset="../img/solo-dark.png"');
        expect(html).toContain('<div class="thumb"><picture><source data-dark srcset="../img/cards-dark.png"');
    });

    it("builds the index and one page per block, and nothing when the lists differ", () => {
        expect(buildTargets(schema, pages, titles).map((t) => t.file)).toEqual([
            "reference/index.html",
            "reference/solo/index.html",
            "reference/cards/index.html",
        ]);
        expect(() => buildTargets(schema, pages.slice(1), titles)).toThrow(/differ/);
    });

    it("finds the targets that differ from disk or are missing", () => {
        const targets = [
            { file: "a.html", body: "same" },
            { file: "b.html", body: "new" },
            { file: "c.html", body: "x" },
        ];
        const disk: Record<string, string> = { "a.html": "same", "b.html": "old" };
        expect(findStaleTargets(targets, (f) => disk[f] ?? null)).toEqual(["b.html", "c.html"]);
    });

    it("finds folders for blocks the schema no longer has", () => {
        expect(findOrphanBlockDirs(["solo", "gone", "cards", "constructor"], schema)).toEqual(["constructor", "gone"]);
        expect(findOrphanBlockDirs([], schema)).toEqual([]);
    });

    it("reads a guide's title from its h1, and throws without one", () => {
        expect(guideTitleFrom('<h1 class="inline-title">\n  Two habits\n</h1>', "x")).toBe("Two habits");
        expect(() => guideTitleFrom("<h1>Two habits</h1>", "x")).toThrow(/no <h1 class="inline-title"> in guides\/x\/index.html/);
    });
});

describe("build-reference — the real schema and PAGES", () => {
    const repoRoot = path.resolve(path.dirname(require.resolve("../../scripts/build-reference.cjs")), "..");
    const realSchema = JSON.parse(readFileSync(path.join(repoRoot, "src/blocks/schema.json"), "utf8")) as Schema;
    const realTitles: Record<string, string> = {};
    for (const slug of new Set(PAGES.flatMap((p) => p.guides))) {
        const html = readFileSync(path.join(repoRoot, "site/guides", slug, "index.html"), "utf8");
        realTitles[slug] = guideTitleFrom(html, slug);
    }

    it("covers every schema block in reader order", () => {
        expect(PAGES.map((p) => p.block)).toEqual(["stats", "chart", "heatmap", "progress", "today", "tiles", "countdown"]);
        expect(() => assertPagesMatchSchema(realSchema, PAGES)).not.toThrow();
    });

    it("draws a row for every key of every block", () => {
        const targets = buildTargets(realSchema, PAGES, realTitles);
        for (const page of PAGES) {
            const b = realSchema.blocks[page.block] as BlockSpec;
            const body = targets.find((t) => t.file === `reference/${page.block}/index.html`)?.body ?? "";
            const keyCount = Object.keys(b.root ?? {}).length + Object.keys(b.item ?? {}).length;
            expect(body.match(/<tr id="/g)?.length).toBe(keyCount);
        }
    });
});
