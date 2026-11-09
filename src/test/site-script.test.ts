import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// `site/assets/site.js` is the site's browser script, not plugin code. It
// builds its markup from DOM nodes (B-217: the community scanner reports
// `innerHTML`), so these tests pin what that markup is, run against the
// test environment's jsdom page.
const source = fs.readFileSync(path.resolve(__dirname, "../../site/assets/site.js"), "utf8");
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const run = (): void => (new Function(source) as () => void)();

function page(body: string): void {
    document.documentElement.className = "no-js";
    document.body.innerHTML = body;
}

describe("site.js: YAML colouring", () => {
    const raw = [
        "```dashy-stats",
        "title: \"A <b> & 'c'\"",
        "items:",
        "  - label: Run, ok",
        "    value: 5",
        "    on: true",
        "    tags: [a, b]",
        "# Heading",
        "---",
        "plain & <text>",
        "```",
    ].join("\n");

    beforeEach(() => {
        page(`<pre><code class="yaml-fenced"></code></pre>`);
        const code = document.querySelector("code");
        if (code) code.textContent = raw;
        run();
    });

    it("colours keys, punctuation, strings, numbers, fences and headings as before", () => {
        // The markup the innerHTML version produced for the same text, verbatim.
        expect(document.querySelector("code")?.innerHTML).toBe(
            '<span class="t-fence">```</span><span class="t-lang">dashy-stats</span>\n' +
            '<span class="t-key">title</span><span class="t-p">:</span> <span class="t-str">"A &lt;b&gt; &amp; \'c\'"</span>\n' +
            '<span class="t-key">items</span><span class="t-p">:</span>\n' +
            '<span class="t-p">  - </span><span class="t-key">label</span><span class="t-p">:</span> <span class="t-str">Run</span><span class="t-p">,</span> <span class="t-str">ok</span>\n' +
            '    <span class="t-key">value</span><span class="t-p">:</span> <span class="t-num">5</span>\n' +
            '    <span class="t-key">on</span><span class="t-p">:</span> <span class="t-num">true</span>\n' +
            '    <span class="t-key">tags</span><span class="t-p">:</span> <span class="t-p">[</span><span class="t-str">a</span><span class="t-p">,</span> <span class="t-str">b</span><span class="t-p">]</span>\n' +
            '<span class="t-p"># Heading</span>\n' +
            '<span class="t-fence">---</span>\n' +
            "plain &amp; &lt;text&gt;\n" +
            '<span class="t-fence">```</span>'
        );
    });

    it("keeps the text a reader copies, and never turns it into elements", () => {
        const code = document.querySelector("code");
        expect(code?.dataset.raw).toBe(raw);
        expect(code?.querySelector("b")).toBeNull();
        expect(code?.querySelectorAll("span:not([class])")).toHaveLength(0);
    });

    it("leaves no empty text node behind", () => {
        const nodes = [...(document.querySelector("code")?.childNodes ?? [])];
        expect(nodes.filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent === "")).toEqual([]);
    });
});

describe("site.js: On this page", () => {
    it.each([
        [1, "1"],
        [9, "5"],
        [10, "5"],
        [13, "7"],
    ])("sets %i items to read down %s rows", (items, rows) => {
        page(`<nav class="toc"><ol>${"<li><a href=\"#x\">x</a></li>".repeat(items)}</ol></nav>`);
        run();
        expect(document.querySelector<HTMLElement>(".toc ol")?.style.getPropertyValue("--toc-rows")).toBe(rows);
        expect(document.documentElement.classList.contains("no-js")).toBe(false);
    });
});

describe("site.js: quick switcher", () => {
    beforeEach(() => {
        page(`
            <button data-open-palette>open</button>
            <ul id="tree"><li><a href="guides/a/" data-where="guides">A &lt;img src=x&gt; guide.md</a></li><li><a class="active" href="./">Here.md</a></li></ul>
            <main><h2 id="one">1 First</h2><h2 id="two" data-short="Second">2 Long second</h2></main>
            <div id="paletteScrim"></div>
            <div id="palette"><input id="paletteInput"><ul id="paletteList"></ul></div>`);
        run();
        document.querySelector<HTMLElement>("[data-open-palette]")?.click();
    });

    const items = (): string[] =>
        [...document.querySelectorAll("#paletteList li")].map((li) => li.outerHTML);

    it("lists the headings, then the other pages, the first one selected", () => {
        expect(items()).toEqual([
            '<li><a href="#one" class="sel">First<small>on this page</small></a></li>',
            '<li><a href="#two" class="">Second<small>on this page</small></a></li>',
            '<li><a href="guides/a/" class="">A &lt;img src=x&gt; guide<small>guides</small></a></li>',
        ]);
        expect(document.querySelector("#paletteList img")).toBeNull();
    });

    it("moves the selection with the arrow keys", () => {
        const input = document.querySelector<HTMLInputElement>("#paletteInput");
        input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
        expect(document.querySelector("#paletteList a.sel")?.getAttribute("href")).toBe("#two");
    });

    it("filters by what is typed, and says so when nothing matches", () => {
        const input = document.querySelector<HTMLInputElement>("#paletteInput");
        if (!input) throw new Error("no input");
        input.value = "guide";
        input.dispatchEvent(new Event("input"));
        expect(document.querySelectorAll("#paletteList a")).toHaveLength(1);
        input.value = "zzz";
        input.dispatchEvent(new Event("input"));
        expect(items()).toEqual(['<li class="none">No note by that name.</li>']);
    });
});
