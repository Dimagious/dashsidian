import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// scripts/readme-check.cjs is a plain Node CommonJS script with no dependency
// on `obsidian` or the DOM, kept outside `src/` on purpose (it checks
// README.md, not the plugin). `require` rather than a static import keeps
// that boundary explicit and sidesteps ESM/CJS interop guessing for a `.cjs`
// file, the same reasoning as `site-check.test.ts`.
const require = createRequire(import.meta.url);

interface ReadmeCheckModule {
    headingPlainText: (rawHeadingText: string) => string;
    slugifyHeading: (headingText: string) => string;
    extractHeadings: (markdown: string) => Array<{ level: number; text: string }>;
    collectAnchorIds: (markdown: string) => Set<string>;
    extractAnchorTargets: (markdown: string) => string[];
    findDeadAnchors: (markdown: string) => string[];
    isExemptRef: (ref: string) => boolean;
    extractRelativeRefs: (markdown: string) => string[];
    findMissingRefs: (markdown: string, fileExists: (ref: string) => boolean) => string[];
    stripToProse: (markdown: string) => string;
    findTypographicDashes: (markdown: string) => string[];
    runChecks: (markdown: string, opts: { fileExists: (ref: string) => boolean }) => string[];
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const readmeCheck = require("../../scripts/readme-check.cjs") as ReadmeCheckModule;
const {
    headingPlainText,
    slugifyHeading,
    extractHeadings,
    collectAnchorIds,
    extractAnchorTargets,
    findDeadAnchors,
    isExemptRef,
    extractRelativeRefs,
    findMissingRefs,
    stripToProse,
    findTypographicDashes,
    runChecks,
} = readmeCheck;

describe("readme-check — headingPlainText", () => {
    it("strips code backticks but keeps their content", () => {
        expect(headingPlainText("`today`: where the day starts")).toBe("today: where the day starts");
    });

    it("strips bold and italic markers", () => {
        expect(headingPlainText("**Bold** and _italic_ and *also italic*")).toBe("Bold and italic and also italic");
    });

    it("a heading with no markdown formatting passes through unchanged", () => {
        expect(headingPlainText("Install")).toBe("Install");
    });
});

describe("readme-check — slugifyHeading", () => {
    it("lowercases the heading", () => {
        expect(slugifyHeading("Install")).toBe("install");
    });

    it("turns spaces into hyphens", () => {
        expect(slugifyHeading("The blocks")).toBe("the-blocks");
    });

    it("drops punctuation: a colon and a comma disappear rather than becoming a hyphen", () => {
        expect(slugifyHeading("progress: how far along")).toBe("progress-how-far-along");
        expect(slugifyHeading("A, B, C")).toBe("a-b-c");
    });

    it("drops backticks and keeps the code content, matching a real block heading", () => {
        expect(slugifyHeading("`heatmap`: the year")).toBe("heatmap-the-year");
    });

    it("matches the slug this README already links to by hand", () => {
        expect(slugifyHeading("A habit tracker from daily note checkboxes")).toBe(
            "a-habit-tracker-from-daily-note-checkboxes",
        );
    });

    it("collapses a run of whitespace into one hyphen", () => {
        expect(slugifyHeading("Two   spaces")).toBe("two-spaces");
    });
});

describe("readme-check — extractHeadings", () => {
    it("reads ATX headings of every level, in order", () => {
        const md = "# Title\n\nsome text\n\n## Section\n\n### Sub `code`\n";
        expect(extractHeadings(md)).toEqual([
            { level: 1, text: "Title" },
            { level: 2, text: "Section" },
            { level: 3, text: "Sub `code`" },
        ]);
    });

    it("does not read a `#` inside a sentence as a heading", () => {
        expect(extractHeadings("This is not #a heading, just text.\n")).toEqual([]);
    });
});

describe("readme-check — collectAnchorIds (duplicate slugs)", () => {
    it("a repeated heading text gets -1, -2 suffixes for the second and third occurrence", () => {
        const md = "## Notes\n\n## Notes\n\n## Notes\n";
        expect(collectAnchorIds(md)).toEqual(new Set(["notes", "notes-1", "notes-2"]));
    });

    it("also picks up an explicit id=\"...\" on raw HTML", () => {
        const md = "## Title\n\n<div id=\"custom-anchor\"></div>\n";
        expect(collectAnchorIds(md)).toEqual(new Set(["title", "custom-anchor"]));
    });
});

describe("readme-check — findDeadAnchors", () => {
    it("flags a [text](#x) link with no heading slug or id for x", () => {
        const md = "[go](#nowhere)\n\n## Somewhere\n";
        expect(findDeadAnchors(md)).toEqual(["nowhere"]);
    });

    it("passes when the anchor matches a heading slug", () => {
        const md = "[go](#somewhere)\n\n## Somewhere\n";
        expect(findDeadAnchors(md)).toEqual([]);
    });

    it("one dead anchor among several live ones is reported, and only that one", () => {
        const md = "[a](#a) [b](#b) [c](#missing)\n\n## A\n\n## B\n";
        expect(findDeadAnchors(md)).toEqual(["missing"]);
    });

    it("also checks a raw href=\"#x\" anchor, not just the Markdown form", () => {
        const md = '<a href="#gone">go</a>\n\n## Somewhere\n';
        expect(findDeadAnchors(md)).toEqual(["gone"]);
    });
});

describe("readme-check — isExemptRef / extractRelativeRefs", () => {
    it("exempts anchors, full URLs, mailto, tel and data URIs", () => {
        expect(isExemptRef("#x")).toBe(true);
        expect(isExemptRef("https://example.com")).toBe(true);
        expect(isExemptRef("http://example.com")).toBe(true);
        expect(isExemptRef("mailto:x@example.com")).toBe(true);
        expect(isExemptRef("tel:+1234567890")).toBe(true);
        expect(isExemptRef("data:image/png;base64,AAAA")).toBe(true);
        expect(isExemptRef("")).toBe(true);
    });

    it("does not exempt a relative path", () => {
        expect(isExemptRef("docs/screens/today-light.png")).toBe(false);
    });

    it("reads a Markdown image and a Markdown link", () => {
        const md = "![alt](docs/screens/a.png)\n\nSee [the code](src/blocks/schema.json).\n";
        expect(extractRelativeRefs(md)).toEqual(["docs/screens/a.png", "src/blocks/schema.json"]);
    });

    it("reads raw HTML src, srcset and href, as used by the <picture> blocks", () => {
        const md = '<source srcset="docs/screens/dark.png"><img src="docs/screens/light.png">';
        expect(extractRelativeRefs(md)).toEqual(["docs/screens/dark.png", "docs/screens/light.png"]);
    });

    it("ignores an anchor link and a full URL", () => {
        const md = "[here](#section) and [Obsidian](https://obsidian.md)\n";
        expect(extractRelativeRefs(md)).toEqual([]);
    });
});

describe("readme-check — findMissingRefs", () => {
    it("flags a reference the fileExists callback rejects", () => {
        const md = "![alt](docs/screens/ghost.png)\n";
        expect(findMissingRefs(md, () => false)).toEqual(["docs/screens/ghost.png"]);
    });

    it("passes when fileExists says yes", () => {
        const md = "![alt](docs/screens/real.png)\n";
        expect(findMissingRefs(md, () => true)).toEqual([]);
    });
});

describe("readme-check — stripToProse / findTypographicDashes", () => {
    it("catches an em dash in prose", () => {
        expect(findTypographicDashes("Six blocks — no Dataview.").length).toBe(1);
    });

    it("catches an en dash in prose", () => {
        expect(findTypographicDashes("2020–2026").length).toBe(1);
    });

    it("does not flag a dash inside a fenced code block", () => {
        const md = "```\nem — dash inside code\n```\n";
        expect(findTypographicDashes(md)).toEqual([]);
    });

    it("does not flag a dash inside a 4-backtick fence wrapping a 3-backtick example", () => {
        const md = "````markdown\n```today\ntitle: em — dash\n```\n````\n";
        expect(findTypographicDashes(md)).toEqual([]);
    });

    it("does not flag a dash inside inline code", () => {
        expect(findTypographicDashes("Use `a—b` as a key.")).toEqual([]);
    });

    it("does not flag a dash inside a raw HTML attribute (e.g. an alt text) once tags are stripped, but does flag one in the visible text next to it", () => {
        const md = '<img alt="a picture" src="x.png"> and prose — right here';
        expect(stripToProse(md)).toContain(" and prose — right here");
        expect(findTypographicDashes(md).length).toBe(1);
    });

    it("a README with only plain punctuation is clean", () => {
        expect(findTypographicDashes("Six blocks, no Dataview.")).toEqual([]);
    });
});

describe("readme-check — runChecks on a clean README", () => {
    it("reports no issues", () => {
        const md = [
            "# Title",
            "",
            "[Install](#install) and [Blocks](#the-blocks).",
            "",
            "![shot](docs/screens/a.png)",
            "",
            "## Install",
            "",
            "## The blocks",
            "",
        ].join("\n");
        expect(runChecks(md, { fileExists: () => true })).toEqual([]);
    });

    it("reports a missing file, a dead anchor and a typographic dash together", () => {
        const md = [
            "# Title",
            "",
            "[Blocks](#the-blocks)",
            "",
            "![shot](docs/screens/ghost.png)",
            "",
            "Some text — with a dash.",
            "",
        ].join("\n");
        const issues = runChecks(md, { fileExists: () => false });
        expect(issues).toHaveLength(3);
        expect(issues.some((i) => i.includes("ghost.png"))).toBe(true);
        expect(issues.some((i) => i.includes("the-blocks"))).toBe(true);
        expect(issues.some((i) => i.includes("dash"))).toBe(true);
    });
});

describe("readme-check — extractAnchorTargets", () => {
    it("reads both the Markdown and the raw HTML anchor forms", () => {
        const md = '[a](#one) <a href="#two">b</a>';
        expect(extractAnchorTargets(md)).toEqual(["one", "two"]);
    });
});
