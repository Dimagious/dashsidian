#!/usr/bin/env node
/**
 * Assembles the deployable `_site/` directory: a copy of `site/` plus
 * `docs/screens/` flattened into `_site/img/`. Screenshots are not
 * duplicated in the repo; this is the one place that stitches the two
 * together, and it is the same step whether it runs in the Pages workflow
 * or locally before a Playwright screenshot check.
 *
 * Shares `IMAGE_RENAME_MAP` with `scripts/site-check.cjs` so the page's one
 * or two renamed image references and this assembly step can never drift
 * apart: the checker validates against the same map this script acts on.
 *
 * Then, on every `.html` page under `_site/`, in this order:
 *   1. the shared shell. A page holding `<!--shell:top tab="..."-->` and
 *      `<!--shell:bottom-->` gets `site/_shell.html` around its content: the
 *      part before the shell's `<!--shell:content-->` marker in place of the
 *      first placeholder, the part after it in place of the second, with
 *      `{{root}}`, `{{tab}}`, `{{folder}}` and `{{active:<folder>/}}` filled for that page
 *      (`fillShell` in `site-check.cjs`, which checks pages the same way).
 *      `_shell.html` is a source file and is not copied into `_site/`.
 *   2. `{{version}}` and `{{minAppVersion}}` from `manifest.json`. No page
 *      hand-writes a version: the Pages workflow deploys from a release tag
 *      (see `.github/workflows/pages.yml`), so `manifest.json` at that commit
 *      is already the version that just shipped.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { IMAGE_RENAME_MAP, SHELL_FILE, fillShell } = require("./site-check.cjs");

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(from, to);
        else fs.copyFileSync(from, to);
    }
}

/** Replaces `{{version}}` and `{{minAppVersion}}` with the values from `manifest` (`{version, minAppVersion}`). */
function substitutePlaceholders(html, manifest) {
    return html.replaceAll("{{version}}", manifest.version).replaceAll("{{minAppVersion}}", manifest.minAppVersion);
}

/** One page as it deploys: the shell put around it, then the version placeholders filled. `pagePath` is relative to the site root. */
function assemblePage(html, shell, pagePath, manifest) {
    return substitutePlaceholders(fillShell(html, shell, pagePath), manifest);
}

/** Every `.html` file under `dir`, as forward-slash paths relative to it. */
function listHtml(dir, sub = "") {
    const result = [];
    for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
        const rel = sub ? `${sub}/${entry.name}` : entry.name;
        if (entry.isDirectory()) result.push(...listHtml(dir, rel));
        else if (entry.name.endsWith(".html")) result.push(rel);
    }
    return result;
}

function assemble(root) {
    const siteDir = path.join(root, "site");
    const screensDir = path.join(root, "docs", "screens");
    const outDir = path.join(root, "_site");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

    const shellPath = path.join(siteDir, SHELL_FILE);
    const shell = fs.existsSync(shellPath) ? fs.readFileSync(shellPath, "utf8") : null;

    fs.rmSync(outDir, { recursive: true, force: true });
    copyDir(siteDir, outDir);
    fs.rmSync(path.join(outDir, SHELL_FILE), { force: true });

    for (const page of listHtml(outDir)) {
        const pagePath = path.join(outDir, page);
        fs.writeFileSync(pagePath, assemblePage(fs.readFileSync(pagePath, "utf8"), shell, page, manifest));
    }

    const imgDir = path.join(outDir, "img");
    fs.mkdirSync(imgDir, { recursive: true });

    // Every top-level file in docs/screens/, under its own name.
    for (const entry of fs.readdirSync(screensDir, { withFileTypes: true })) {
        if (entry.isFile()) {
            fs.copyFileSync(path.join(screensDir, entry.name), path.join(imgDir, entry.name));
        }
    }
    // The handful of renamed references site/index.html makes, such as
    // img/firstrun-picker.png for docs/screens/firstrun/1-picker.png.
    for (const [imgName, screensRelPath] of Object.entries(IMAGE_RENAME_MAP)) {
        fs.copyFileSync(path.join(screensDir, screensRelPath), path.join(imgDir, imgName));
    }

    return outDir;
}

if (require.main === module) {
    const out = assemble(path.resolve(__dirname, ".."));
    console.log(`[assemble-site] wrote ${out}`);
}

module.exports = { assemble, assemblePage, substitutePlaceholders };
