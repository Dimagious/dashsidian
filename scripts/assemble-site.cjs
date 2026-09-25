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
 * Also fills in `{{version}}` and `{{minAppVersion}}` from `manifest.json`.
 * `site/index.html` never hand-writes a version: the Pages workflow deploys
 * from a release tag (see `.github/workflows/pages.yml`), so `manifest.json`
 * at that commit is already the version that just shipped.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { IMAGE_RENAME_MAP } = require("./site-check.cjs");

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

function assemble(root) {
    const siteDir = path.join(root, "site");
    const screensDir = path.join(root, "docs", "screens");
    const outDir = path.join(root, "_site");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

    fs.rmSync(outDir, { recursive: true, force: true });
    copyDir(siteDir, outDir);

    const indexPath = path.join(outDir, "index.html");
    fs.writeFileSync(indexPath, substitutePlaceholders(fs.readFileSync(indexPath, "utf8"), manifest));

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

module.exports = { assemble, substitutePlaceholders };
