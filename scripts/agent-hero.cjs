#!/usr/bin/env node
/**
 * The 2.0 hero (B-184): one request on the left, the note it produced on the
 * right.
 *
 * The prompt below was given, word for word, to an agent with only the Dashy
 * skill installed, in the demo vault, on 2026-10-06. Its blocks are
 * `Running.md` in scripts/demo-vault.cjs, and the right half is that note
 * photographed in a running Obsidian by `npm run capture`
 * (`agent-note-*.png`). Nothing on the right is drawn here, and the left
 * carries no reply the agent did not give: a picture claiming the agent wrote
 * something it did not would be a lie, however small.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "docs/screens");
const SIZE = { width: 1280, height: 800 };

const PROMPT =
    "Make me a dashboard for my running in a new note called Running: weekly distance as bars " +
    "with a 40 km goal, cards for this week's distance and my current streak, and a countdown " +
    "to my marathon on May 17.";

/** Obsidian's default theme colours, the ones the note on the right is shot in. */
const THEMES = {
    light: { bg: "#ffffff", bg2: "#f6f6f6", border: "#e3e3e3", text: "#222222", muted: "#5c5c5c", accent: "#7c5ce8" },
    dark: { bg: "#1e1e1e", bg2: "#262626", border: "#363636", text: "#dadada", muted: "#a8a8a8", accent: "#8b6cef" },
};

function html(theme, shot) {
    const c = THEMES[theme];
    const data = "data:image/png;base64," + fs.readFileSync(shot).toString("base64");
    return `<!doctype html><meta charset="utf-8"><style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            width: ${SIZE.width}px; height: ${SIZE.height}px; overflow: hidden;
            display: flex; align-items: center; gap: 48px; padding: 0 56px;
            background: ${c.bg2}; color: ${c.text};
            font-family: -apple-system, "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        }
        .ask { width: 360px; flex: none; }
        .label {
            font: 600 14px ui-monospace, "SF Mono", Menlo, monospace;
            letter-spacing: .06em; text-transform: uppercase; color: ${c.accent};
            margin-bottom: 14px;
        }
        .prompt {
            background: ${c.bg}; border: 1px solid ${c.border}; border-radius: 14px;
            padding: 26px 28px; font-size: 22px; line-height: 1.45;
        }
        .then { margin-top: 22px; font-size: 16px; line-height: 1.5; color: ${c.muted}; }
        .note { flex: 1; min-width: 0; display: flex; justify-content: center; }
        .note img {
            max-width: 100%; max-height: ${SIZE.height - 96}px; display: block;
            border-radius: 12px; border: 1px solid ${c.border};
            box-shadow: 0 24px 60px rgba(0, 0, 0, ${theme === "dark" ? ".5" : ".12"});
        }
    </style>
    <div class="ask">
        <div class="label">You ask your agent</div>
        <div class="prompt">${PROMPT}</div>
        <div class="then">It writes three Dashy blocks into the note. Obsidian draws them on the right.</div>
    </div>
    <div class="note"><img src="${data}"></div>`;
}

async function launch() {
    // Same reasoning as scripts/social-card.cjs: the system Chrome renders
    // this page identically, without a 150 MB browser download.
    try {
        return await chromium.launch({ channel: "chrome" });
    } catch {
        console.log("[agent-hero] no system Chrome; falling back to Playwright's own browser");
        return await chromium.launch();
    }
}

(async () => {
    for (const theme of ["light", "dark"]) {
        const shot = path.join(SHOTS, `agent-note-${theme}.png`);
        if (!fs.existsSync(shot)) {
            console.error(`[agent-hero] ${path.relative(ROOT, shot)} is missing; run \`npm run capture\` first`);
            process.exit(1);
        }
    }
    const browser = await launch();
    for (const theme of ["light", "dark"]) {
        const shot = path.join(SHOTS, `agent-note-${theme}.png`);
        const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
        await page.setContent(html(theme, shot));
        const out = path.join(SHOTS, `agent-hero-${theme}.png`);
        await page.screenshot({ path: out });
        await page.close();
        console.log(`[agent-hero] ${path.relative(ROOT, out)}`);
    }
    await browser.close();
})();
