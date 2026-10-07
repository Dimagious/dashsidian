import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Every guide carries an "Ask your agent" section (B-166, ADR 0008): the
 * guide's outcome as a request in plain words, next to the YAML it teaches.
 * The prompt is for a reader who does not write YAML, so it must not slip
 * into it: no backticks, no fences, no `key:` from the schema.
 *
 * The onboarding guide itself is the long form of this section and is left out.
 */

// vitest runs from the repository root; import.meta.url is not a file URL under jsdom.
const GUIDES = path.resolve(process.cwd(), "site/guides");
const ONBOARDING = "ai-agent-dashboard";

interface SchemaField {
    aliases?: string[];
}
interface SchemaFile {
    blocks: Record<string, { root?: Record<string, SchemaField>; item?: Record<string, SchemaField> }>;
}

const schema = JSON.parse(readFileSync(path.resolve(process.cwd(), "src/blocks/schema.json"), "utf8")) as SchemaFile;

/** Every key and synonym a block reads, plus the block names themselves. */
function schemaWords(): string[] {
    const words = new Set<string>(Object.keys(schema.blocks));
    words.add("dashy-chart");
    for (const block of Object.values(schema.blocks)) {
        for (const level of [block.root, block.item]) {
            for (const [key, field] of Object.entries(level ?? {})) {
                words.add(key);
                for (const alias of field.aliases ?? []) words.add(alias);
            }
        }
    }
    return [...words];
}

const WORDS = schemaWords();

/** The schema words a text writes the way YAML does, `goal:`, in any case. */
function keysWrittenAsYaml(text: string): string[] {
    return WORDS.filter((word) => new RegExp(`(^|[^\\w-])${word.replace(/-/g, "\\-")}\\s*:`, "im").test(text));
}

function guideSlugs(): string[] {
    return readdirSync(GUIDES, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== ONBOARDING)
        .filter((entry) => existsSync(path.join(GUIDES, entry.name, "index.html")))
        .map((entry) => entry.name)
        .sort();
}

function page(slug: string): Document {
    const html = readFileSync(path.join(GUIDES, slug, "index.html"), "utf8");
    return new DOMParser().parseFromString(html, "text/html");
}

/** The elements between a heading and the next `h2`. */
function sectionAfter(heading: Element): Element[] {
    const out: Element[] = [];
    for (let el = heading.nextElementSibling; el && el.tagName !== "H2"; el = el.nextElementSibling) out.push(el);
    return out;
}

describe("guide prompts: the check itself", () => {
    it("finds a schema key written as YAML, and leaves plain words alone", () => {
        expect(keysWrittenAsYaml("a goal of 24, by week")).toEqual([]);
        expect(keysWrittenAsYaml("Show books, goal: 24")).toEqual(["goal"]);
        expect(keysWrittenAsYaml("Period : month")).toEqual(["period"]);
        expect(keysWrittenAsYaml("- { field: gym }")).toEqual(["field"]);
        expect(keysWrittenAsYaml("in my weekly review template, add numbers that count the week each note is named for: sleep")).toEqual([]);
    });

    it("covers every guide but the onboarding one", () => {
        const slugs = guideSlugs();
        expect(slugs).not.toContain(ONBOARDING);
        expect(slugs).toEqual(
            expect.arrayContaining([
                "books-per-year",
                "countdown-birthday",
                "habit-tracker-without-dataview",
                "heatmap-two-activities",
                "homepage-dashboard",
                "monthly-habit-calendar",
                "streak-weekdays",
                "weekly-chart-tracker-alternative",
                "weekly-review-without-dataview",
            ])
        );
    });
});

describe.each(guideSlugs())("guide prompts: %s", (slug) => {
    const doc = page(slug);
    const headings = [...doc.querySelectorAll("main h2[id]")];
    const heading = doc.getElementById("ask-your-agent");
    const section = heading ? sectionAfter(heading) : [];

    it("has one Ask your agent section, right after the whole note", () => {
        expect(doc.querySelectorAll('[id="ask-your-agent"]')).toHaveLength(1);
        expect(heading?.tagName).toBe("H2");
        expect(heading?.textContent).toBe("Ask your agent");
        expect(heading?.getAttribute("data-short")).toBe("Ask your agent");
        const ids = headings.map((h) => h.id);
        expect(ids[ids.indexOf("ask-your-agent") - 1]).toBe("full");
    });

    it("lists the section under On this page, after the whole note", () => {
        const links = [...doc.querySelectorAll("nav.toc a")].map((a) => a.getAttribute("href"));
        expect(links.filter((href) => href === "#ask-your-agent")).toHaveLength(1);
        expect(links[links.indexOf("#ask-your-agent") - 1]).toBe("#full");
        expect(doc.querySelector('nav.toc a[href="#ask-your-agent"]')?.textContent).toBe("Ask your agent");
    });

    it("holds one prompt block, with a Copy button, in plain words", () => {
        const blocks = section.filter((el) => el.matches(".codeblock[data-code]"));
        expect(blocks).toHaveLength(1);
        const block = blocks[0];
        expect(block?.querySelector(".bar > span")?.textContent).toBe("Prompt");
        expect(block?.querySelector(".bar button.copy")?.textContent).toBe("Copy");
        const prompt = block?.querySelector("pre > code.plain")?.textContent ?? "";
        expect(prompt.trim().length).toBeGreaterThan(40);
        expect(prompt).not.toContain("`");
        expect(prompt).not.toContain("\n");
        expect(keysWrittenAsYaml(prompt)).toEqual([]);
    });

    it("links to the onboarding guide", () => {
        const links = section.flatMap((el) => [...el.querySelectorAll("a")]);
        const onboarding = links.filter((a) => a.getAttribute("href") === `../${ONBOARDING}/`);
        expect(onboarding).toHaveLength(1);
        expect(onboarding[0]?.textContent).toBe("More on working with an agent");
    });
});
