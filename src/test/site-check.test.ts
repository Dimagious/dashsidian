import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// scripts/site-check.cjs is a plain Node CommonJS script with no dependency
// on `obsidian` or the DOM, kept outside `src/` on purpose (it checks the
// static site in `site/`, not the plugin). `require` rather than a static
// import keeps that boundary explicit and sidesteps any ESM/CJS interop
// guessing for a `.cjs` file.
const require = createRequire(import.meta.url);

interface SiteCheckModule {
    SITE_URL: string;
    pageDirOf: (pagePath: string) => string;
    expectedUrlFor: (pagePath: string) => string;
    resolveRef: (pagePath: string, ref: string) => { path: string; fragment: string } | null;
    fillShell: (html: string, shell: string | null, pagePath: string) => string;
    screenPathFor: (imageName: string) => string;
    extractImageRefs: (html: string, pagePath?: string) => string[];
    findMissingImages: (html: string, availableScreens: Set<string>, pagePath?: string) => string[];
    findDeadAnchors: (html: string) => string[];
    findBrokenRelativeRefs: (html: string, fileExists: (ref: string) => boolean, pagePath?: string) => string[];
    findDeadCrossPageAnchors: (
        html: string,
        pagePath: string,
        idsOf: (path: string) => Set<string> | null
    ) => string[];
    findOrphanPages: (
        pagePaths: string[],
        sitemapXml: string | null,
        guidesIndexHtml: string | null,
        referenceIndexHtml?: string | null
    ) => string[];
    findClaudePathMentions: (html: string) => string[];
    stripToVisibleText: (html: string) => string;
    findTypographicDashes: (html: string) => string[];
    findMissingSiteFiles: (siteFiles: Set<string>) => string[];
    checkCanonicalUrl: (html: string, expectedUrl: string) => string[];
    findMissingVersionPlaceholders: (html: string) => string[];
    findHardcodedVersionStrings: (html: string) => string[];
    findThirdPartyRequestUrls: (html: string) => string[];
    runChecks: (
        html: string,
        opts: {
            availableScreens: Set<string>;
            siteFileExists: (ref: string) => boolean;
            siteFiles: Set<string>;
            pagePath?: string;
            idsOf?: (path: string) => Set<string> | null;
        }
    ) => string[];
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const siteCheck = require("../../scripts/site-check.cjs") as SiteCheckModule;
const {
    SITE_URL,
    pageDirOf,
    expectedUrlFor,
    resolveRef,
    fillShell,
    findDeadCrossPageAnchors,
    findOrphanPages,
    screenPathFor,
    extractImageRefs,
    findMissingImages,
    findDeadAnchors,
    findBrokenRelativeRefs,
    findClaudePathMentions,
    stripToVisibleText,
    findTypographicDashes,
    findMissingSiteFiles,
    checkCanonicalUrl,
    findMissingVersionPlaceholders,
    findHardcodedVersionStrings,
    findThirdPartyRequestUrls,
    runChecks,
} = siteCheck;

const okOpts = () => ({
    availableScreens: new Set<string>(["dashboard-light.png", "firstrun/1-picker.png"]),
    siteFileExists: (_ref: string) => true,
    siteFiles: new Set<string>(["index.html", "sitemap.xml", "robots.txt", "llms.txt"]),
});

const versionRow =
    '<div class="prop"><div class="k">version</div><div class="v">{{version}} <span>. Obsidian {{minAppVersion}} or later</span></div></div>';

const cleanPage = `<!doctype html><html><head>
<link rel="canonical" href="${SITE_URL}">
<meta property="og:url" content="${SITE_URL}">
</head><body>
${versionRow}
<a href="#today">today</a>
<a href="assets/apple-touch-icon.png">icon file</a>
<img src="img/dashboard-light.png" alt="ok">
<section id="today">today</section>
</body></html>`;

describe("site-check — a clean page", () => {
    it("runChecks reports no issues", () => {
        expect(runChecks(cleanPage, okOpts())).toEqual([]);
    });
});

describe("site-check — findMissingImages", () => {
    it("flags an img/ reference with no matching file under docs/screens/", () => {
        const html = `<img src="img/does-not-exist.png">`;
        expect(findMissingImages(html, new Set(["dashboard-light.png"]))).toEqual(["img/does-not-exist.png"]);
    });

    it("also reads an absolute og:image URL", () => {
        const html = `<meta property="og:image" content="${SITE_URL}img/social-preview.png">`;
        expect(extractImageRefs(html)).toEqual(["img/social-preview.png"]);
    });

    it("applies the firstrun-picker rename before checking", () => {
        const html = `<img src="img/firstrun-picker.png">`;
        expect(findMissingImages(html, new Set(["firstrun/1-picker.png"]))).toEqual([]);
        expect(findMissingImages(html, new Set(["firstrun-picker.png"]))).toEqual(["img/firstrun-picker.png"]);
    });

    it("screenPathFor passes through a name with no special mapping", () => {
        expect(screenPathFor("dashboard-light.png")).toBe("dashboard-light.png");
    });

    it("dedupes a src and a srcset pointing at the same file", () => {
        const html = `<source srcset="img/dashboard-dark.png"><img src="img/dashboard-dark.png">`;
        expect(extractImageRefs(html)).toEqual(["img/dashboard-dark.png"]);
    });
});

describe("site-check — findDeadAnchors", () => {
    it("flags an href=\"#x\" with no id=\"x\" on the page", () => {
        const html = `<a href="#nowhere">go</a><section id="today"></section>`;
        expect(findDeadAnchors(html)).toEqual(["nowhere"]);
    });

    it("passes when the id is present", () => {
        const html = `<a href="#today">go</a><section id="today"></section>`;
        expect(findDeadAnchors(html)).toEqual([]);
    });

    it("one dead anchor among several live ones is still reported, and only that one", () => {
        const html = `<a href="#a">a</a><a href="#b">b</a><a href="#missing">c</a><div id="a"></div><div id="b"></div>`;
        expect(findDeadAnchors(html)).toEqual(["missing"]);
    });

    it("does not mistake a JS string built from href=\"#\" + id for a real anchor", () => {
        const html = `<script>var a = '<a href="#' + e.id + '">x</a>';</script><section id="today"></section>`;
        expect(findDeadAnchors(html)).toEqual([]);
    });
});

describe("site-check — findBrokenRelativeRefs", () => {
    it("flags a relative link the fileExists callback rejects", () => {
        const html = `<a href="assets/ghost.png">x</a>`;
        expect(findBrokenRelativeRefs(html, () => false)).toEqual(["assets/ghost.png"]);
    });

    it("ignores anchors, img/ references and full URLs", () => {
        const html = `<a href="#x">x</a><img src="img/y.png"><a href="https://example.com">z</a>`;
        expect(findBrokenRelativeRefs(html, () => false)).toEqual([]);
    });

    it("passes when fileExists says yes", () => {
        const html = `<a href="assets/apple-touch-icon.png">x</a>`;
        expect(findBrokenRelativeRefs(html, () => true)).toEqual([]);
    });

    it("flags a missing external script, which stripScripts would otherwise hide", () => {
        const html = `<script src="assets/site.js"></script><script>const x = "assets/ghost.js";</script>`;
        expect(findBrokenRelativeRefs(html, () => false)).toEqual(["assets/site.js"]);
    });

    it("ignores a data: URI favicon", () => {
        const html = `<link rel="icon" href="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">`;
        expect(findBrokenRelativeRefs(html, () => false)).toEqual([]);
    });
});

describe("site-check — findClaudePathMentions", () => {
    it("catches a leaked .claude path", () => {
        expect(findClaudePathMentions(`<!-- see .claude/private/notes.md -->`)).toEqual([".claude/private/notes.md"]);
    });

    it("a page with no mention of .claude is clean", () => {
        expect(findClaudePathMentions(`<p>Dashy reads frontmatter.</p>`)).toEqual([]);
    });

    it("does not flag the one allowed mention: the vault path Dashy itself writes", () => {
        const html = `<code>.claude/skills/dashy/SKILL.md</code>`;
        expect(findClaudePathMentions(html)).toEqual([]);
    });

    it("still flags a different .claude path next to the allowed one", () => {
        const html = `<code>.claude/skills/dashy/SKILL.md</code> <!-- .claude/private/notes.md -->`;
        expect(findClaudePathMentions(html)).toEqual([".claude/private/notes.md"]);
    });

    it("flags a similar but different vault path: only the exact dashy skill path is allowed", () => {
        const html = `<code>.claude/skills/other/SKILL.md</code>`;
        expect(findClaudePathMentions(html)).toEqual([".claude/skills/other/SKILL.md"]);
    });
});

describe("site-check — findTypographicDashes", () => {
    it("catches an em dash in visible text", () => {
        expect(findTypographicDashes(`<p>Six blocks — no Dataview.</p>`).length).toBe(1);
    });

    it("catches an en dash in visible text", () => {
        expect(findTypographicDashes(`<p>2020–2026</p>`).length).toBe(1);
    });

    it("does not flag a dash inside <script>, <style> or a comment", () => {
        const html = `<script>var x = "—";</script><style>.a::before{content:"–"}</style><!-- — --><p>fine.</p>`;
        expect(findTypographicDashes(html)).toEqual([]);
    });

    it("a page with only plain punctuation is clean", () => {
        expect(findTypographicDashes(`<p>Six blocks, no Dataview.</p>`)).toEqual([]);
    });

    it("stripToVisibleText decodes a named dash entity before the scan sees it", () => {
        expect(stripToVisibleText(`<p>a&mdash;b</p>`)).toContain("—");
    });
});

describe("site-check — findMissingSiteFiles", () => {
    it("flags each of sitemap.xml, robots.txt and llms.txt that is missing", () => {
        expect(findMissingSiteFiles(new Set(["index.html"]))).toEqual(["sitemap.xml", "robots.txt", "llms.txt"]);
    });

    it("passes when all three are present, alongside other files", () => {
        expect(
            findMissingSiteFiles(new Set(["index.html", "sitemap.xml", "robots.txt", "llms.txt", "assets"]))
        ).toEqual([]);
    });
});

describe("site-check — checkCanonicalUrl", () => {
    it("flags a missing canonical link and a missing og:url", () => {
        const problems = checkCanonicalUrl(`<html></html>`, SITE_URL);
        expect(problems).toHaveLength(2);
    });

    it("flags a canonical link that points somewhere else", () => {
        const html = `<link rel="canonical" href="https://example.com/"><meta property="og:url" content="${SITE_URL}">`;
        const problems = checkCanonicalUrl(html, SITE_URL);
        expect(problems).toEqual([`canonical is "https://example.com/", expected "${SITE_URL}"`]);
    });

    it("passes when both match the expected URL", () => {
        const html = `<link rel="canonical" href="${SITE_URL}"><meta property="og:url" content="${SITE_URL}">`;
        expect(checkCanonicalUrl(html, SITE_URL)).toEqual([]);
    });
});

describe("site-check — findMissingVersionPlaceholders", () => {
    it("flags both placeholders missing from a page with no version row at all", () => {
        expect(findMissingVersionPlaceholders(`<p>no version here</p>`)).toEqual(["{{version}}", "{{minAppVersion}}"]);
    });

    it("flags only the one that is missing", () => {
        expect(findMissingVersionPlaceholders(`<p>{{version}}</p>`)).toEqual(["{{minAppVersion}}"]);
    });

    it("passes when both placeholders are present", () => {
        expect(findMissingVersionPlaceholders(versionRow)).toEqual([]);
    });
});

describe("site-check — findHardcodedVersionStrings", () => {
    it("flags a literal x.y.z sitting where {{version}} belongs", () => {
        const html = '<div class="prop"><div class="k">version</div><div class="v">1.3.0 . Obsidian 1.13.0 or later</div></div>';
        expect(findHardcodedVersionStrings(html)).toEqual(["1.3.0"]);
    });

    it("passes when the row uses the placeholders instead", () => {
        expect(findHardcodedVersionStrings(versionRow)).toEqual([]);
    });

    it("passes when there is no version row on the page at all", () => {
        expect(findHardcodedVersionStrings(`<p>1.3.0 is a fine sentence about a version, unrelated to the row.</p>`)).toEqual([]);
    });
});

describe("site-check — findThirdPartyRequestUrls", () => {
    it("flags a Google Fonts stylesheet link", () => {
        const html = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">`;
        expect(findThirdPartyRequestUrls(html)).toEqual(["https://fonts.googleapis.com/css2?family=Inter"]);
    });

    it("flags a preconnect hint", () => {
        const html = `<link rel="preconnect" href="https://fonts.gstatic.com">`;
        expect(findThirdPartyRequestUrls(html)).toEqual(["https://fonts.gstatic.com"]);
    });

    it("flags a font loaded through a CSS url() inside <style>", () => {
        const html = `<style>@font-face{src:url(https://fonts.gstatic.com/s/inter/a.woff2)}</style>`;
        expect(findThirdPartyRequestUrls(html)).toEqual(["https://fonts.gstatic.com/s/inter/a.woff2"]);
    });

    it("flags an external <script src>", () => {
        const html = `<script src="https://example.com/analytics.js"></script>`;
        expect(findThirdPartyRequestUrls(html)).toEqual(["https://example.com/analytics.js"]);
    });

    it("flags an external <img src>", () => {
        const html = `<img src="https://example.com/pixel.gif">`;
        expect(findThirdPartyRequestUrls(html)).toEqual(["https://example.com/pixel.gif"]);
    });

    it("does not flag an <a href> link: that is navigation, not a request", () => {
        const html = `<a href="https://github.com/Dimagious/dashsidian">GitHub</a>`;
        expect(findThirdPartyRequestUrls(html)).toEqual([]);
    });

    it("does not flag the canonical link or og:url meta, which are not fetching rels", () => {
        const html = `<link rel="canonical" href="${SITE_URL}"><meta property="og:url" content="${SITE_URL}">`;
        expect(findThirdPartyRequestUrls(html)).toEqual([]);
    });

    it("does not flag a local, relative asset", () => {
        const html = `<link rel="stylesheet" href="assets/site.css"><img src="img/dashboard-light.png">`;
        expect(findThirdPartyRequestUrls(html)).toEqual([]);
    });
});

describe("site-check — runChecks, mutated fixtures each fail on exactly one rule", () => {
    it("a missing image is the only reported issue", () => {
        const html = cleanPage.replace("img/dashboard-light.png", "img/missing.png");
        expect(runChecks(html, okOpts())).toEqual([
            'missing image: "img/missing.png" has no matching file under docs/screens/',
        ]);
    });

    it("a dead anchor is the only reported issue", () => {
        const html = cleanPage.replace('href="#today"', 'href="#gone"');
        expect(runChecks(html, okOpts())).toEqual(['dead anchor: href="#gone" has no id="gone" on the page']);
    });

    it("an em dash slipped into the copy is the only reported issue", () => {
        const html = cleanPage.replace("today</a>", "today — now</a>");
        expect(runChecks(html, okOpts())).toEqual([
            'typographic dash in visible text: "...on}} or later today — now icon file tod..."',
        ]);
    });

    it("a hand-written version instead of the placeholder is the only reported issue", () => {
        const html = cleanPage.replace(
            "{{version}} <span>. Obsidian {{minAppVersion}} or later</span>",
            "1.3.0 <span>. Obsidian 1.13.0 or later</span>"
        );
        expect(runChecks(html, okOpts())).toEqual([
            'missing version placeholder: "{{version}}"',
            'missing version placeholder: "{{minAppVersion}}"',
            'hardcoded version "1.3.0" next to the version label; use {{version}}/{{minAppVersion}} instead',
        ]);
    });

    it("a reintroduced Google Fonts link is the only reported issue", () => {
        const html = cleanPage.replace(
            "</head>",
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head>'
        );
        expect(runChecks(html, okOpts())).toEqual([
            'third-party request: "https://fonts.googleapis.com/css2?family=Inter"',
        ]);
    });
});

// A guide two folders down, as it reads once the shell is filled in.
const GUIDE = "guides/habits/index.html";
const GUIDE_URL = `${SITE_URL}guides/habits/`;

const cleanGuide = `<!doctype html><html><head>
<link rel="canonical" href="${GUIDE_URL}">
<meta property="og:url" content="${GUIDE_URL}">
<link rel="stylesheet" href="../../assets/site.css">
</head><body>
<p>Checked on Dashy {{version}}.</p>
<a href="#step">step</a>
<a href="../../#install">install</a>
<a href="../">all guides</a>
<img src="../../img/dashboard-light.png" alt="ok">
<h2 id="step">step</h2>
<script src="../../assets/site.js"></script>
</body></html>`;

describe("site-check — resolveRef and page paths", () => {
    it("resolves ../../img/x.png on a guide to img/x.png", () => {
        expect(resolveRef(GUIDE, "../../img/x.png")).toEqual({ path: "img/x.png", fragment: "" });
    });

    it("reads a trailing slash as that folder's index.html and splits off the fragment", () => {
        expect(resolveRef(GUIDE, "../../#install")).toEqual({ path: "index.html", fragment: "install" });
        expect(resolveRef("guides/index.html", "habits/")).toEqual({ path: "guides/habits/index.html", fragment: "" });
        expect(resolveRef(GUIDE, "../")).toEqual({ path: "guides/index.html", fragment: "" });
    });

    it("reads . and .. without a slash as folders too", () => {
        expect(resolveRef(GUIDE, ".")).toEqual({ path: "guides/habits/index.html", fragment: "" });
        expect(resolveRef(GUIDE, "..")).toEqual({ path: "guides/index.html", fragment: "" });
    });

    it("drops a query string, and a bare fragment is the page itself", () => {
        expect(resolveRef(GUIDE, "../../assets/site.css?v=2")).toEqual({ path: "assets/site.css", fragment: "" });
        expect(resolveRef(GUIDE, "#step")).toEqual({ path: GUIDE, fragment: "step" });
    });

    it("returns null for a ref that climbs above the site root or is root-absolute", () => {
        expect(resolveRef(GUIDE, "../../../img/x.png")).toBeNull();
        expect(resolveRef("index.html", "../x.html")).toBeNull();
        expect(resolveRef(GUIDE, "/dashsidian/img/x.png")).toBeNull();
    });

    it("pageDirOf and expectedUrlFor give the page's folder and its deployed URL", () => {
        expect(pageDirOf("index.html")).toBe("");
        expect(pageDirOf(GUIDE)).toBe("guides/habits/");
        expect(expectedUrlFor("index.html")).toBe(SITE_URL);
        expect(expectedUrlFor("guides/index.html")).toBe(`${SITE_URL}guides/`);
        expect(expectedUrlFor(GUIDE)).toBe(GUIDE_URL);
    });
});

describe("site-check — nested pages: images and relative links", () => {
    it("maps a ../../img/ reference on a guide to docs/screens/", () => {
        const html = `<source srcset="../../img/a-dark.png"><img src="../../img/firstrun-picker.png">`;
        expect(extractImageRefs(html, GUIDE)).toEqual(["img/a-dark.png", "img/firstrun-picker.png"]);
        expect(findMissingImages(html, new Set(["a-dark.png", "firstrun/1-picker.png"]), GUIDE)).toEqual([]);
        expect(findMissingImages(html, new Set(["firstrun/1-picker.png"]), GUIDE)).toEqual(["img/a-dark.png"]);
    });

    it("an img/ path written as on the root page is not an image on a guide, and is a broken link there", () => {
        const html = `<img src="img/dashboard-light.png">`;
        expect(extractImageRefs(html, GUIDE)).toEqual([]);
        const exists = (rel: string) => rel === "img/dashboard-light.png";
        expect(findBrokenRelativeRefs(html, exists, GUIDE)).toEqual(["img/dashboard-light.png"]);
    });

    it("checks the resolved path, without the fragment, against site/", () => {
        const seen: string[] = [];
        const exists = (rel: string) => {
            seen.push(rel);
            return rel !== "guides/nope/index.html";
        };
        const html = `<a href="../../#install">a</a><link href="../../assets/site.css"><a href="../nope/">b</a>`;
        expect(findBrokenRelativeRefs(html, exists, GUIDE)).toEqual(["../nope/"]);
        expect(seen.sort()).toEqual(["assets/site.css", "guides/nope/index.html", "index.html"]);
    });

    it("flags a link that climbs above the site root", () => {
        expect(findBrokenRelativeRefs(`<a href="../../../x.html">x</a>`, () => true, GUIDE)).toEqual(["../../../x.html"]);
    });
});

describe("site-check — findDeadCrossPageAnchors", () => {
    const ids = new Map<string, Set<string>>([
        ["index.html", new Set(["install", "stats"])],
        ["guides/index.html", new Set(["note"])],
    ]);
    const idsOf = (p: string) => ids.get(p) ?? null;

    it("passes a fragment that exists on the target page", () => {
        expect(findDeadCrossPageAnchors(`<a href="../../#install">x</a>`, GUIDE, idsOf)).toEqual([]);
    });

    it("flags a fragment missing from the target page, and only that one", () => {
        const html = `<a href="../../#install">a</a><a href="../../#gone">b</a><a href="../#note">c</a>`;
        expect(findDeadCrossPageAnchors(html, GUIDE, idsOf)).toEqual(["../../#gone"]);
    });

    it("skips a target the run does not know as a page, and a link with no fragment", () => {
        const html = `<a href="../../llms.txt#x">a</a><a href="../../">b</a>`;
        expect(findDeadCrossPageAnchors(html, GUIDE, idsOf)).toEqual([]);
    });

    it("checks a link back into the same page by its path too", () => {
        expect(findDeadCrossPageAnchors(`<a href="index.html#nope">x</a>`, "index.html", idsOf)).toEqual(["index.html#nope"]);
    });
});

describe("site-check — fillShell", () => {
    const shell = `<nav><a href="{{root}}">home</a><a href="{{root}}guides/" class="{{active:guides/}}">all</a><a href="{{root}}guides/habits/" class="{{active:guides/habits/}}">habits</a><span>{{tab}}</span><main>
<!--shell:content-->
</main><script src="{{root}}assets/site.js"></script>`;
    const page = (tab: string) => `<head></head><body><!--shell:top tab="${tab}"--><p>body</p><!--shell:bottom--></body>`;

    it("fills root, tab and the active link for a guide two folders down", () => {
        const out = fillShell(page("Habits"), shell, GUIDE);
        expect(out).toContain('<a href="../../">home</a>');
        expect(out).toContain('<a href="../../guides/" class="">all</a>');
        expect(out).toContain('<a href="../../guides/habits/" class="active">habits</a>');
        expect(out).toContain("<span>Habits</span>");
        expect(out).toContain('<p>body</p>\n</main><script src="../../assets/site.js">');
        expect(out).not.toContain("<!--shell:");
        expect(out).not.toContain("{{");
    });

    it("fills a page one folder down with ../ and marks its own link", () => {
        const out = fillShell(page("All guides"), shell, "guides/index.html");
        expect(out).toContain('<a href="../guides/" class="active">all</a>');
        expect(out).toContain('<a href="../guides/habits/" class="">habits</a>');
    });

    it("returns a page without shell placeholders unchanged, even with no shell file", () => {
        const html = "<body><p>home</p></body>";
        expect(fillShell(html, null, "index.html")).toBe(html);
    });

    it("names the page's folder in the view header: Guides, Reference, or nothing elsewhere", () => {
        const header = "<div>Dashy vault / <span>{{folder}}</span> / <b>{{tab}}</b></div><!--shell:content-->";
        expect(fillShell(page("Habits"), header, GUIDE)).toContain("<span>Guides</span> / <b>Habits</b>");
        expect(fillShell(page("All guides"), header, "guides/index.html")).toContain("<span>Guides</span>");
        expect(fillShell(page("stats"), header, "reference/stats/index.html")).toContain("<span>Reference</span> / <b>stats</b>");
        expect(fillShell(page("Block reference"), header, "reference/index.html")).toContain("<span>Reference</span>");
        expect(fillShell(page("About"), header, "about/index.html")).toContain("<span></span>");
        expect(fillShell(page("Home"), header, "index.html")).toContain("<span></span>");
        expect(fillShell(page("Proto"), header, "__proto__/index.html")).toContain("<span></span>");
    });

    it("keeps a $ sequence in the shell as text", () => {
        const out = fillShell(page("T"), "<b>$& $1</b><!--shell:content-->", GUIDE);
        expect(out).toContain("<b>$& $1</b>");
    });

    it("throws, naming the page, when the bottom placeholder is missing or repeated", () => {
        expect(() => fillShell(`<!--shell:top tab="T"--><p></p>`, shell, GUIDE)).toThrow(/guides\/habits\/index\.html: expected one/);
        expect(() => fillShell(`${page("T")}<!--shell:bottom-->`, shell, GUIDE)).toThrow(/found 1 and 2/);
    });

    it("throws on a top placeholder without its tab attribute", () => {
        expect(() => fillShell(`<!--shell:top--><p></p><!--shell:bottom-->`, shell, GUIDE)).toThrow(/found 0 and 1/);
    });

    it("throws when the bottom placeholder comes first", () => {
        expect(() => fillShell(`<!--shell:bottom--><!--shell:top tab="T"-->`, shell, GUIDE)).toThrow(/comes before/);
    });

    it("throws when the page uses the shell but the shell file is missing", () => {
        expect(() => fillShell(page("T"), null, GUIDE)).toThrow(/site\/_shell\.html does not exist/);
    });

    it("throws when the shell has no content marker, or two", () => {
        expect(() => fillShell(page("T"), "<nav></nav>", GUIDE)).toThrow(/found 0/);
        expect(() => fillShell(page("T"), "<!--shell:content--><!--shell:content-->", GUIDE)).toThrow(/found 2/);
    });
});

describe("site-check — findOrphanPages", () => {
    const loc = (url: string) => `<url><loc>${url}</loc></url>`;
    const sitemap = `<urlset>${loc(SITE_URL)}${loc(`${SITE_URL}guides/`)}${loc(GUIDE_URL)}</urlset>`;
    const index = `<a class="card" href="habits/">Habits</a>`;
    const pages = ["index.html", "guides/index.html", GUIDE];

    it("passes when every page is in the sitemap and every guide is linked from the index", () => {
        expect(findOrphanPages(pages, sitemap, index)).toEqual([]);
    });

    it("flags a guide missing from the sitemap", () => {
        const noGuide = `<urlset>${loc(SITE_URL)}${loc(`${SITE_URL}guides/`)}</urlset>`;
        expect(findOrphanPages(pages, noGuide, index)).toEqual([
            `guides/habits/index.html is not in sitemap.xml: add <loc>${GUIDE_URL}</loc>`,
        ]);
    });

    it("flags a guide the guides index does not link to", () => {
        expect(findOrphanPages(pages, sitemap, `<a href="other/">x</a>`)).toEqual([
            "guides/habits/index.html is not linked from guides/index.html",
        ]);
    });

    it("flags every guide as unlinked when there is no guides index at all", () => {
        expect(findOrphanPages(pages, sitemap, null)).toEqual(["guides/habits/index.html is not linked from guides/index.html"]);
    });

    it("leaves the sitemap rule to the missing-file check when sitemap.xml is absent", () => {
        expect(findOrphanPages(pages, null, index)).toEqual([]);
    });

    it("flags a block reference page the reference index does not link to, and passes once it does", () => {
        const ref = "reference/stats/index.html";
        const all = `${sitemap}${loc(`${SITE_URL}reference/`)}${loc(`${SITE_URL}reference/stats/`)}`;
        const withRef = [...pages, "reference/index.html", ref];
        expect(findOrphanPages(withRef, all, index, `<a href="chart/">chart</a>`)).toEqual([
            "reference/stats/index.html is not linked from reference/index.html",
        ]);
        expect(findOrphanPages(withRef, all, index, null)).toEqual([
            "reference/stats/index.html is not linked from reference/index.html",
        ]);
        expect(findOrphanPages(withRef, all, index, `<a class="card" href="stats/">stats</a>`)).toEqual([]);
    });

    it("does not ask a non-guide page to be linked from the guides index", () => {
        const extra = [...pages, "guides/habits/notes.html", "about/index.html"];
        const all = `${sitemap}${loc(`${SITE_URL}guides/habits/`)}${loc(`${SITE_URL}about/`)}`;
        expect(findOrphanPages(extra, all, index)).toEqual([]);
    });
});

describe("site-check — runChecks on a guide", () => {
    const guideOpts = () => ({
        ...okOpts(),
        pagePath: GUIDE,
        siteFiles: new Set<string>(),
        idsOf: (p: string) => (p === "index.html" ? new Set(["install"]) : p === "guides/index.html" ? new Set<string>() : null),
    });

    it("a clean guide has no issues: no root-only file or version-row checks, {{version}} alone is fine", () => {
        expect(runChecks(cleanGuide, guideOpts())).toEqual([]);
    });

    it("expects the guide's own URL as canonical, not the site root", () => {
        const html = cleanGuide.replace(`<link rel="canonical" href="${GUIDE_URL}">`, `<link rel="canonical" href="${SITE_URL}">`);
        expect(runChecks(html, guideOpts())).toEqual([`canonical URL: canonical is "${SITE_URL}", expected "${GUIDE_URL}"`]);
    });

    it("a dead cross-page anchor is the only reported issue", () => {
        const html = cleanGuide.replace("../../#install", "../../#nowhere");
        expect(runChecks(html, guideOpts())).toEqual([
            'dead anchor: href="../../#nowhere" has no matching id on the page it points to',
        ]);
    });

    it("a missing ../../img/ screenshot is the only reported issue", () => {
        const html = cleanGuide.replace("../../img/dashboard-light.png", "../../img/gone.png");
        expect(runChecks(html, guideOpts())).toEqual(['missing image: "img/gone.png" has no matching file under docs/screens/']);
    });

    it("a missing ../../assets/site.js is reported on a guide", () => {
        const opts = { ...guideOpts(), siteFileExists: (ref: string) => !ref.includes("gone.js") };
        const issues = runChecks(cleanGuide.replace("assets/site.js", "assets/gone.js"), opts);
        expect(issues.some((i) => i.includes("../../assets/gone.js"))).toBe(true);
    });

    it("the root page still requires its files and both version placeholders", () => {
        const issues = runChecks(cleanGuide.replaceAll(GUIDE_URL, SITE_URL), { ...okOpts(), siteFiles: new Set<string>() });
        expect(issues).toContain('missing site file: "sitemap.xml"');
        expect(issues).toContain('missing version placeholder: "{{minAppVersion}}"');
    });
});
