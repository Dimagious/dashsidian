#!/usr/bin/env node
/**
 * Builds the site's block reference out of src/blocks/schema.json: one page
 * per block under `site/reference/<block>/index.html` and the index
 * `site/reference/index.html`. Same contract as `build-skill.cjs`: the schema
 * is the only source of keys, and `--check` writes nothing and fails when a
 * page on disk differs from what the schema produces.
 *
 * What the schema does not hold (a page's tagline, its demo picture and the
 * YAML behind it, related guides) is site-only presentation and lives in
 * `PAGES` below. A block in the schema with no `PAGES` entry, or the other
 * way round, is an error: a new block cannot ship without its page.
 *
 * Fails loudly, before writing anything, on:
 *   - a `PAGES` block list that differs from the schema's blocks
 *   - a key `type` part other than string, number, boolean or list
 *   - two ids that clash on one page
 *   - an em or en dash, or an unbalanced backtick, in schema text
 *
 * The functions above `main()` take plain data (the parsed schema, the
 * `PAGES` list, guide titles), not the filesystem, so they run the same way
 * from the CLI and from `src/test/build-reference.test.ts`.
 *
 * Usage: node scripts/build-reference.cjs [--check]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SITE_URL = "https://dimagious.github.io/dashsidian/";
const SCHEMA_URL = "https://github.com/Dimagious/dashsidian/blob/master/src/blocks/schema.json";

/* ---------- site-only presentation, one entry per block, in reader order ---------- */
// `showcase.yaml` is the block behind `showcase.image`, verbatim: the block in
// the demo vault (`scripts/demo-vault.cjs`) that `e2e/capture.spec.ts`
// photographs for that picture. `guides` are folder names under site/guides/.
const PAGES = [
    {
        block: "stats", tagline: "the numbers", item: "card", items: "cards",
        showcase: { image: "stats", width: 700, height: 272,
            alt: "Eight number cards: counts, an average, sums, a maximum, a streak, two with sparklines",
            yaml: [
                "columns: 4",
                "items:",
                "  - { label: Days logged, source: Diary, agg: count, icon: 📔 }",
                "  - { label: Average sleep, source: Diary, field: sleep_score, agg: avg, precision: 1, trend: 30d }",
                "  - { label: Steps this week, source: Diary, field: steps, agg: sum, unit: steps, period: week }",
                "  - { label: Best night, source: Diary, field: sleep_score, agg: max, trend: 90d }",
                "  - { label: Longest streak, source: Diary, field: sleep_score, agg: streak, unit: days }",
                "  - { label: Latest steps, source: Diary, field: steps, agg: latest, sub: most recent note }",
                "  - { label: Great nights, source: Diary, where: \"sleep_score >= 90\", agg: count }",
                "  - { label: Books read, source: Books, period: year, date_field: finished, agg: count, icon: 📚 }",
            ].join("\n") },
        guides: ["habit-tracker-without-dataview", "streak-weekdays", "books-per-year", "homepage-dashboard"],
    },
    {
        block: "chart", tagline: "a number over time", item: "series", items: "series",
        callout: "With Obsidian Charts turned on, Dashy leaves the <code>chart</code> block to it. Write <code>dashy-chart</code> instead: same keys, always Dashy.",
        showcase: { image: "chart-weekly", width: 700, height: 223,
            alt: "Weekly bars of running distance over half a year, a dashed goal line at 30 km, the current week drawn lighter",
            yaml: "source: Diary\nfield: run_km\ntype: bar\nbucket: week\nunit: km\ngoal: 30" },
        guides: ["weekly-chart-tracker-alternative", "books-per-year"],
    },
    {
        block: "heatmap", tagline: "the year", item: "layer", items: "layers",
        showcase: { image: "heatmap", width: 700, height: 196,
            alt: "A year of days coloured by sleep score, with a legend",
            yaml: "source: Diary\nfield: sleep_score\ncolor: purple\nbands: [90, 80, 70]\ntitle: Sleep, last twelve months" },
        guides: ["habit-tracker-without-dataview", "heatmap-two-activities", "streak-weekdays"],
    },
    {
        block: "progress", tagline: "how far along", item: "bar", items: "bars",
        showcase: { image: "progress", width: 700, height: 156,
            alt: "Three progress bars, one past its goal and coloured green",
            yaml: [
                "items:",
                "  - { label: Days logged this year, source: Diary, agg: count, goal: 365, icon: 📔 }",
                "  - { label: Books this year, source: Books, period: year, date_field: finished, agg: count, goal: 24, icon: 📚 }",
                "  - { label: Steps, source: Diary, field: steps, agg: sum, goal: 3000000, unit: steps, sub: three million }",
            ].join("\n") },
        guides: ["streak-weekdays", "books-per-year"],
    },
    {
        block: "today", tagline: "where the day starts", item: null, items: null,
        showcase: { image: "today", width: 700, height: 74,
            alt: "The date and three chips linking to the daily, weekly and monthly notes",
            yaml: "daily: true\nweekly: true\nmonthly: true" },
        guides: ["homepage-dashboard"],
    },
    {
        block: "tiles", tagline: "getting around", item: "tile", items: "tiles",
        showcase: { image: "tiles", width: 700, height: 127,
            alt: "Four tiles with emoji, labels and note counts",
            yaml: [
                "columns: 4",
                "items:",
                "  - { label: Inbox, path: Inbox, icon: 📥, badge: count }",
                "  - { label: Diary, path: Diary, icon: 📔, badge: count, sub: one note a day }",
                "  - { label: Books, path: Books, icon: 📚, badge: count }",
                "  - { label: Sport, path: Diary, icon: 🏃, accent: true, sub: training log }",
            ].join("\n") },
        guides: ["homepage-dashboard"],
    },
    {
        block: "countdown", tagline: "what is coming", item: "date", items: "dates",
        showcase: { image: "countdown", width: 700, height: 187,
            alt: "Three cards counting the days to a race, a holiday and a review",
            yaml: [
                "columns: 3",
                "items:",
                "  - { label: IRONMAN 70.3, date: 2027-06-14, icon: 🏊 }",
                "  - { label: Holiday, date: 2027-01-20, icon: 🏖, sub: two weeks off }",
                "  - { label: Review, date: 2027-03-01, icon: 🗒 }",
            ].join("\n") },
        guides: ["countdown-birthday", "homepage-dashboard"],
    },
];

// Ids the page template uses for its own sections. A key with one of these
// names would make two elements share an id, so it is a build error.
const SECTION_IDS = ["note", "showcase", "example", "keys", "root-keys", "item-keys", "how-it-counts", "other-blocks", "related"];

/* ---------- text: schema strings to HTML ---------- */

/** HTML-escapes `&`, `<`, `>` and `"`. */
function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Throws on an em or en dash: the site and the schema use plain punctuation. */
function assertNoDash(s) {
    if (/[–—]/.test(s)) throw new Error(`build-reference: em or en dash in schema text: ${s}`);
}

/** Schema prose is plain text with `code` spans and nothing else: escape, then turn each backtick pair into <code>. */
function prose(s) {
    assertNoDash(s);
    const out = esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
    if (out.includes("`")) throw new Error(`build-reference: unbalanced backtick in: ${s}`);
    return out;
}

const TYPE_WORDS = { string: "text", number: "number", boolean: "true or false", list: "list" };

/** A schema `type` (`string|list`) as words a person reads (`text or list`). Throws on a part it does not know. */
function typeWords(t) {
    return String(t).split("|").map((p) => {
        if (!Object.prototype.hasOwnProperty.call(TYPE_WORDS, p)) throw new Error(`build-reference: unknown type "${p}"`);
        return TYPE_WORDS[p];
    }).join(" or ");
}

/**
 * A key's `doc` as a table cell, kept in the schema's own case. Some docs are
 * literal value lists (`agg`: "count sum avg ...", heatmap `color`), and
 * values are case-sensitive: a capital would teach `agg: Count`, which the
 * block rejects.
 */
function sentence(s) {
    return prose(s);
}

/** Schema text for a meta tag: code spans lose their backticks, nothing else changes. */
function plainText(s) {
    return String(s).replace(/`([^`]*)`/g, "$1");
}

/* ---------- pieces ---------- */
function codeblock(label, fenceName, body) {
    assertNoDash(body);
    return `<div class="codeblock" data-code>
          <div class="bar"><span>${esc(label)}</span><button class="copy" type="button">Copy</button></div>
<pre><code class="yaml-fenced">\`\`\`${fenceName}
${esc(body)}
\`\`\`</code></pre>
        </div>`;
}

function picture(prefix, image, w, h, alt, lazy) {
    return `<picture>
            <source data-dark srcset="${prefix}img/${image}-dark.png" media="(prefers-color-scheme: dark)">
            <img src="${prefix}img/${image}-light.png" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""} alt="${esc(alt)}">
          </picture>`;
}

/**
 * Ids for the key rows, as a map from `root:<key>` / `item:<key>` to the id:
 * the key itself, or `<item>-<key>` when the block root already has that key
 * (`#layer-field`). Throws when two ids clash, with each other or with a
 * section id.
 */
function keyIds(b, page) {
    const ids = new Map();
    const taken = new Set(SECTION_IDS);
    const claim = (id) => {
        if (taken.has(id)) throw new Error(`build-reference: id "${id}" used twice on ${page.block}`);
        taken.add(id);
        return id;
    };
    for (const k of Object.keys(b.root || {})) ids.set(`root:${k}`, claim(k));
    for (const k of Object.keys(b.item || {})) ids.set(`item:${k}`, claim(b.root && b.root[k] ? `${page.item}-${k}` : k));
    return ids;
}

function keyTable(map, scope, ids) {
    const rows = Object.entries(map).map(([key, f]) => {
        const id = ids.get(`${scope}:${key}`);
        const badges = f.required ? ' <span class="req">required</span>' : "";
        const also = f.aliases ? `<span class="also">also ${f.aliases.map((a) => `<code>${esc(a)}</code>`).join(", ")}</span>` : "";
        const def = f.default !== undefined ? `<code>${esc(String(f.default))}</code>` : "";
        return `<tr id="${id}">
                <td class="k"><a class="key" href="#${id}"><code>${esc(key)}</code></a>${badges}${also}</td>
                <td class="d">${sentence(f.doc)}</td>
                <td class="t" data-h="type">${esc(typeWords(f.type))}</td>
                <td class="v" data-h="default">${def || '<span class="none">none</span>'}</td>
              </tr>`;
    });
    return `<div class="keytab-wrap">
          <table class="keytab">
            <thead><tr><th>Key</th><th>What it does</th><th>Type</th><th>Default</th></tr></thead>
            <tbody>
              ${rows.join("\n              ")}
            </tbody>
          </table>
        </div>`;
}

function chips(map, scope, ids) {
    return Object.keys(map).map((k) => `<a href="#${ids.get(`${scope}:${k}`)}"><code>${esc(k)}</code></a>`).join("");
}

function head({ title, description, canonical, ogImage, prefix }) {
    return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='2' y='2' width='28' height='28' rx='7' fill='%238b6cef'/%3E%3Crect x='7' y='7.5' width='11' height='3' rx='1.5' fill='%23fff'/%3E%3Crect x='7' y='13' width='8.5' height='7' rx='2' fill='%23fff' fill-opacity='.55'/%3E%3Crect x='16.5' y='13' width='8.5' height='7' rx='2' fill='%23fff'/%3E%3Crect x='7' y='22.5' width='18' height='3' rx='1.5' fill='%23fff' fill-opacity='.35'/%3E%3Crect x='7' y='22.5' width='12' height='3' rx='1.5' fill='%23fff'/%3E%3C/svg%3E">
<link rel="apple-touch-icon" href="${prefix}assets/apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Dashy">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title.replace(/ · Dashy$/, ""))}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="${prefix}assets/site.css">
<link rel="stylesheet" href="${prefix}assets/guides.css">
<link rel="stylesheet" href="${prefix}assets/reference.css">
</head>
<body>
<!-- Generated by scripts/build-reference.cjs from src/blocks/schema.json. Do not edit by hand. -->`;
}

function foot(prefix) {
    return `<footer class="note-foot">
          <span>MIT © Dmitriy Yurkin</span>
          <a href="${prefix}reference/">All blocks</a>
          <a href="${SCHEMA_URL}">Generated from schema.json</a>
          <a href="https://github.com/Dimagious/dashsidian/issues">Something wrong on this page?</a>
        </footer>`;
}

/* ---------- one block ---------- */

/**
 * The page for one block. `b` is `schema.blocks[page.block]`; `guideTitles`
 * maps a guide folder name to its title, as HTML (see `guideTitleFrom`).
 */
function blockPage(page, b, guideTitles) {
    const name = page.block;
    const prefix = "../../";
    const ids = keyIds(b, page);
    const rootN = Object.keys(b.root || {}).length;
    const itemN = Object.keys(b.item || {}).length;
    const keyCount = b.item ? `${rootN} on the block, ${itemN} on each ${page.item}` : `${rootN}`;
    const s = page.showcase;

    const toc = [
        ["showcase", "From the demo vault"],
        ["example", "A minimal block"],
        [b.item ? "root-keys" : "keys", b.item ? "Keys on the block" : "Keys"],
        ...(b.item ? [["item-keys", `Keys on each ${page.item}`]] : []),
        ...(b.hints ? [["other-blocks", "Keys from other blocks"]] : []),
        ...(b.notes ? [["how-it-counts", "How it behaves"]] : []),
        ...(page.guides.length ? [["related", "Guides that use it"]] : []),
    ];

    const parts = [];
    parts.push(head({
        title: `${name} block reference: every key · Dashy`,
        description: `${plainText(b.summary)} Every key of the Dashy ${name} block for Obsidian, with defaults, synonyms and examples.`,
        canonical: `${SITE_URL}reference/${name}/`,
        ogImage: `${SITE_URL}img/${s.image}-light.png`,
        prefix,
    }));
    parts.push(`<!--shell:top tab="${name}"-->

    <main class="note guide ref" id="note">
      <article class="file" style="padding-top:34px">
        <div class="crumb">Reference/${name}.md</div>
        <h1 class="inline-title"><code class="h-code">${name}</code>: ${esc(page.tagline)}</h1>

        <div class="props" aria-label="Properties">
          <div class="props-title"><svg><use href="#i-list"/></svg>Properties</div>
          <div class="prop"><div class="k"><svg><use href="#i-text"/></svg>code block</div><div class="v"><code>${name}</code>${name === "chart" ? "<code>dashy-chart</code>" : ""}</div></div>
          <div class="prop"><div class="k"><svg><use href="#i-hash"/></svg>keys</div><div class="v">${keyCount}</div></div>
          <div class="prop"><div class="k"><svg><use href="#i-box"/></svg>checked on</div><div class="v">Dashy {{version}}</div></div>
        </div>

        <p class="lede">${prose(b.summary)}</p>
${page.callout ? `
        <div class="callout warn">
          <div class="callout-title"><svg><use href="#i-alert"/></svg>Obsidian Charts turned on?</div>
          <p>${page.callout}</p>
        </div>
` : ""}
        <nav class="toc" aria-label="On this page">
          <b>ON THIS PAGE</b>
          <ol>
            ${toc.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join("\n            ")}
          </ol>
        </nav>

        <h2 id="showcase">From the demo vault</h2>
        <div class="pair">
          ${codeblock(name, name, s.yaml)}
          <div>
            <div class="renders">renders as</div>
            <figure class="shot plain">
          ${picture(prefix, s.image, s.width, s.height, s.alt, false)}
            </figure>
          </div>
        </div>

        <h2 id="example">A minimal block</h2>
        <p>The shortest config worth pasting. Change the folder and the property names to yours.</p>
        ${codeblock(name, name, b.example)}
`);

    if (b.item) {
        parts.push(`
        <h2 id="root-keys">Keys on the block</h2>
        <div class="keys">${chips(b.root, "root", ids)}</div>
        ${keyTable(b.root, "root", ids)}

        <h2 id="item-keys">Keys on each ${esc(page.item)}</h2>
        <p>Each entry under <code>items</code>${page.block === "heatmap" ? " (here <code>layers</code>)" : page.block === "chart" ? " (here <code>series</code>)" : ""} is one ${esc(page.item)}.</p>
        <div class="keys">${chips(b.item, "item", ids)}</div>
        ${keyTable(b.item, "item", ids)}
`);
    } else {
        parts.push(`
        <h2 id="keys">Keys</h2>
        <div class="keys">${chips(b.root, "root", ids)}</div>
        ${keyTable(b.root, "root", ids)}
`);
    }

    if (b.hints) {
        parts.push(`
        <h2 id="other-blocks">Keys from other blocks</h2>
        <p>Written here by habit, these get a message naming the key this block uses instead.</p>
        <ul class="hints">
          ${Object.entries(b.hints).map(([from, to]) => `<li><code>${esc(from)}</code> is <code>${esc(to)}</code> here</li>`).join("\n          ")}
        </ul>
`);
    }
    if (b.notes) {
        parts.push(`
        <h2 id="how-it-counts">How it behaves</h2>
        <ul class="notes">
          ${b.notes.map((n) => `<li>${prose(n)}</li>`).join("\n          ")}
        </ul>
`);
    }
    if (page.guides.length) {
        parts.push(`
        <h2 id="related">Guides that use it</h2>
        <ul class="guide-links">
          ${page.guides.map((g) => {
              const title = guideTitles[g];
              if (!title) throw new Error(`build-reference: no title for guide "${g}" on ${name}`);
              // Already HTML: it is the guide's own <h1> content.
              return `<li><a href="${prefix}guides/${g}/">${title}</a></li>`;
          }).join("\n          ")}
        </ul>
`);
    }
    parts.push(`
        <div class="next">
          <p>Dashy is in Obsidian's community plugins. Search for <b>Dashy</b>, install, enable, then run <b>Dashy: Insert block</b> and pick <code>${name}</code>.</p>
          <div class="actions">
            <a class="btn primary" href="${prefix}#install"><svg><use href="#i-plug"/></svg>Install Dashy</a>
            <a class="btn" href="${prefix}reference/">All blocks</a>
          </div>
        </div>

        ${foot(prefix)}
      </article>
    </main>
<!--shell:bottom-->
`);
    return parts.join("\n");
}

/* ---------- the index ---------- */

/** The index page: a card per block in `pages` order, the general rules, and `notInV1`. */
function indexPage(schema, pages) {
    const prefix = "../";
    const cards = pages.map((page) => {
        const b = schema.blocks[page.block];
        const s = page.showcase;
        const n = Object.keys(b.root || {}).length + Object.keys(b.item || {}).length;
        return `<a class="card" href="${page.block}/">
            <div class="thumb${s.width / s.height > 2.6 ? " fit" : ""}">${picture(prefix, s.image, s.width, s.height, "", true).replace(/\n\s*/g, "")}</div>
            <div class="body">
              <span class="card-title"><code>${page.block}</code>: ${esc(page.tagline)}</span>
              <p class="card-promise">${prose(b.summary)}</p>
              <div class="meta"><span class="pill">${n} keys</span></div>
            </div>
          </a>`;
    });
    return `${head({
        title: "Block reference · Dashy",
        description: "Every Dashy block for Obsidian and every key it takes, generated from the schema the plugin validates against.",
        canonical: `${SITE_URL}reference/`,
        ogImage: `${SITE_URL}img/social-preview.png`,
        prefix,
    })}
<!--shell:top tab="Block reference"-->

    <main class="note guide ref" id="note">
      <article class="file" style="padding-top:34px">
        <div class="crumb">Reference/All blocks.md</div>
        <h1 class="inline-title">Block reference</h1>
        <p class="lede">Seven blocks, one page each: a picture, a block to paste, and every key with its default and synonyms.</p>
        <p class="muted" style="font-size:14.5px">Generated from <a href="${SCHEMA_URL}"><code>schema.json</code></a>, the file the plugin checks your config against. Dashy {{version}}.</p>

        <div class="cards">
          ${cards.join("\n          ")}
        </div>

        <h2 id="rules">Rules for every block</h2>
        <ul>
          <li>Quote a value with a colon, a comma or a hash in it: <code>label: "Home: entry"</code>.</li>
          <li>Synonyms work, <code>folder</code> for <code>source</code> for example, but the pages above list the main name first.</li>
          <li>An unknown key does not break a block. It draws a warning, with the key it probably meant.</li>
          <li>A block prints its own errors into the note, with the line number for broken YAML.</li>
        </ul>

        <h2 id="not-in-dashy">Not in Dashy</h2>
        <ul>
          ${Object.entries(schema.notInV1).map(([k, v]) => `<li><b>${esc(k)}</b>: ${prose(v)}</li>`).join("\n          ")}
        </ul>

        ${foot(prefix)}
      </article>
    </main>
<!--shell:bottom-->
`;
}

/* ---------- targets ---------- */

/** Throws when the blocks in `pages` and in the schema are not the same set. */
function assertPagesMatchSchema(schema, pages) {
    const schemaBlocks = Object.keys(schema.blocks).sort();
    const pageBlocks = pages.map((p) => p.block).sort();
    if (schemaBlocks.join() !== pageBlocks.join()) {
        throw new Error(`build-reference: PAGES (${pageBlocks.join(", ")}) and schema blocks (${schemaBlocks.join(", ")}) differ`);
    }
}

/** Every page to write, as `{ file, body }` with `file` relative to `site/`. Throws on any of the errors listed at the top. */
function buildTargets(schema, pages, guideTitles) {
    assertPagesMatchSchema(schema, pages);
    const targets = [{ file: "reference/index.html", body: indexPage(schema, pages) }];
    for (const page of pages) {
        targets.push({ file: `reference/${page.block}/index.html`, body: blockPage(page, schema.blocks[page.block], guideTitles) });
    }
    return targets;
}

/** Targets whose file differs from what is on disk. `readCurrent(file)` returns the file's text, or null when it does not exist. */
function findStaleTargets(targets, readCurrent) {
    return targets.filter((t) => readCurrent(t.file) !== t.body).map((t) => t.file);
}

/** Folders under `site/reference/` named for a block the schema no longer has. */
function findOrphanBlockDirs(dirNames, schema) {
    return dirNames.filter((d) => !Object.prototype.hasOwnProperty.call(schema.blocks, d)).sort();
}

/** A guide's title, the HTML inside its `<h1 class="inline-title">`, so a renamed guide cannot leave a stale title on a reference page. */
function guideTitleFrom(html, slug) {
    const m = html.match(/<h1 class="inline-title">([\s\S]*?)<\/h1>/);
    if (!m) throw new Error(`build-reference: no <h1 class="inline-title"> in guides/${slug}/index.html`);
    return m[1].trim();
}

function main() {
    const root = path.resolve(__dirname, "..");
    const siteDir = path.join(root, "site");
    const refDir = path.join(siteDir, "reference");
    const check = process.argv.includes("--check");
    const schema = JSON.parse(fs.readFileSync(path.join(root, "src/blocks/schema.json"), "utf8"));

    let targets;
    try {
        const guideTitles = {};
        for (const slug of new Set(PAGES.flatMap((p) => p.guides))) {
            const file = path.join(siteDir, "guides", slug, "index.html");
            if (!fs.existsSync(file)) throw new Error(`guide "${slug}" has no page at site/guides/${slug}/index.html`);
            guideTitles[slug] = guideTitleFrom(fs.readFileSync(file, "utf8"), slug);
        }
        targets = buildTargets(schema, PAGES, guideTitles);
    } catch (err) {
        console.error(`[build-reference] ${err.message}`);
        process.exit(1);
    }

    const readCurrent = (file) => {
        const full = path.join(siteDir, file);
        return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    };
    const stale = findStaleTargets(targets, readCurrent);
    const dirs = fs.existsSync(refDir)
        ? fs.readdirSync(refDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
        : [];
    const orphans = findOrphanBlockDirs(dirs, schema);

    if (check) {
        const out = [...stale, ...orphans.map((d) => `reference/${d}/`)];
        if (out.length) {
            console.error(`[build-reference] site reference is out of sync with the schema: ${out.join(", ")}`);
            console.error("[build-reference] run: npm run build:reference");
            process.exit(1);
        }
        console.log("[build-reference] site reference is in sync with the schema");
        return;
    }

    for (const t of targets) {
        if (!stale.includes(t.file)) continue;
        const full = path.join(siteDir, t.file);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, t.body, "utf8");
        console.log(`[build-reference] wrote site/${t.file}`);
    }
    for (const d of orphans) {
        fs.rmSync(path.join(refDir, d), { recursive: true });
        console.log(`[build-reference] removed site/reference/${d}/`);
    }
}

module.exports = {
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
};

if (require.main === module) {
    main();
}
