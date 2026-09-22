#!/usr/bin/env node
/**
 * The preview stand: every block, in every state, in a browser.
 *
 * Why it exists: launching Obsidian to look at a border radius is twenty
 * seconds and a context switch, and the states worth looking at — an empty
 * selection, a broken config, a goal already passed — take a vault to set up.
 * This one is built in a second from a fake vault.
 *
 * It is not a substitute for the E2E suite. The stand cannot tell you whether
 * Obsidian loaded the stylesheet at all; that is what the real one is for.
 */
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { buildCSS } = require("./build-css.cjs");

const root = path.resolve(__dirname, "..");
const out = path.join(root, ".preview");
const watch = process.argv.includes("--watch");

async function build() {
    // The stylesheet that ships, not a copy of it.
    buildCSS();
    fs.mkdirSync(out, { recursive: true });
    fs.copyFileSync(path.join(root, "styles.css"), path.join(out, "styles.css"));
    fs.copyFileSync(path.join(root, "src/preview/index.html"), path.join(out, "index.html"));

    const options = {
        entryPoints: [path.join(root, "src/preview/stand.ts")],
        bundle: true,
        outfile: path.join(out, "stand.js"),
        format: "iife",
        target: "es2020",
        sourcemap: true,
        // The blocks import `obsidian`; in a browser they get the same stub the
        // unit tests use, so the stand runs the code that ships.
        alias: { obsidian: path.join(root, "src/test/stubs/obsidian.ts") },
    };

    if (!watch) {
        await esbuild.build(options);
        return null;
    }
    const ctx = await esbuild.context(options);
    await ctx.watch();
    fs.watch(path.join(root, "src/styles"), { recursive: true }, () => {
        buildCSS();
        fs.copyFileSync(path.join(root, "styles.css"), path.join(out, "styles.css"));
    });
    return ctx;
}

build()
    .then((ctx) => {
        const page = path.join(out, "index.html");
        console.log(`[preview] ${page}`);
        if (ctx) {
            console.log("[preview] watching src/ — reload the page to see changes");
        } else if (process.platform === "darwin") {
            spawn("open", [page], { detached: true, stdio: "ignore" }).unref();
        }
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
