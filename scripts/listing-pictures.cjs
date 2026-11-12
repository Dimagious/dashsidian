#!/usr/bin/env node
/**
 * The catalog's pictures in design/listing: 1200x800 from the real captures in
 * docs/screens, each with one line of caption, and 900x1600 from Obsidian's
 * mobile interface (e2e/listing-mobile.spec.ts, which steals focus), taken with
 * the kit's demo fixture into .opdk/listing/stills and moved here.
 * Pass --desktop to skip the mobile run.
 */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");
const { pngSize } = require("./png-size.cjs");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "design/listing");
const SHOTS = path.join(ROOT, "docs/screens");
/** The stills in docs/screens are 2x (the kit's demo fixture), and the pictures here keep their 1200x800 size. */
const STILL_SCALE = 2;

const DESKTOP = [
    { file: "desktop-1-agent.png", shot: "agent-hero-dark.png", dark: true },
    { file: "desktop-2-habits.png", shot: "habits-light.png", caption: "A habit tracker from daily note checkboxes" },
    { file: "desktop-3-review.png", shot: "weekly-review-dark.png", caption: "A review counts its own week", dark: true },
    { file: "desktop-4-sleep.png", shot: "sleep-light.png", caption: "Sleep in hours and minutes, the way your watch writes it" },
    { file: "desktop-5-errors.png", shot: "diagnostics-dark.png", caption: "A broken block says why", dark: true },
];

function page({ shot, caption, dark }) {
    const data = fs.readFileSync(path.join(SHOTS, shot)).toString("base64");
    // Laid out at its pixel size, a 2x still would fill the frame where a 1x one sat inside it: it is laid out at half
    // of that, and the page is rendered at 1x so the file keeps the size the catalog asks for.
    // The caption frame's padding is part of the box (border-box), as it was around a 1x still's own width.
    const width = pngSize(path.join(SHOTS, shot)).width / STILL_SCALE + (caption ? 36 : 0);
    const bg = dark ? "#191722" : "#f4f1fd";
    const ink = dark ? "#e8e8ec" : "#222";
    const frame = dark ? "#3b3654" : "#d8d0f2";
    const sheet = dark ? "#1e1e1e" : "#fff";
    return `<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; width: 1200px; height: 800px; background: ${bg}; color: ${ink}; overflow: hidden; box-sizing: border-box;
             display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; padding: 30px 40px;
             font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
      h2 { margin: 0; font-size: 38px; line-height: 1.15; letter-spacing: -.01em; text-align: center; flex: none; }
      .wrap { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; width: 100%; }
      img { max-width: 100%; max-height: 100%; width: ${width}px; height: auto; min-height: 0; display: block; border-radius: 12px; background: ${sheet};
            padding: ${caption ? "18px" : "0"}; box-sizing: border-box; box-shadow: 0 0 0 1px ${frame}, 0 14px 40px rgba(70, 50, 140, .16); }
    </style>${caption ? `<h2>${caption}</h2>` : ""}<div class="wrap"><img src="data:image/png;base64,${data}"></div>`;
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
    const tab = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    for (const item of DESKTOP) {
        await tab.setContent(page(item), { waitUntil: "load" });
        await tab.screenshot({ path: path.join(OUT, item.file) });
    }
    await browser.close();
    if (process.argv.includes("--desktop")) return;
    execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
    execFileSync("node", ["scripts/demo-vault.cjs"], { cwd: ROOT, stdio: "inherit" });
    execFileSync("npx", ["playwright", "test", "e2e/listing-mobile.spec.ts", "--reporter=list"], {
        cwd: ROOT, stdio: "inherit", env: { ...process.env, LISTING: "1" },
    });
    const stills = path.join(ROOT, ".opdk/listing/stills");
    for (const name of fs.readdirSync(stills).filter((f) => /^mobile-\d-.*\.png$/.test(f))) {
        fs.copyFileSync(path.join(stills, name), path.join(OUT, name));
        console.log(`[listing] ${path.relative(ROOT, path.join(OUT, name))}`);
    }
})().catch((error) => { console.error(error); process.exit(1); });
