#!/usr/bin/env node
/**
 * Draws the card people see when the repository link is shared.
 *
 * GitHub generates one by default — an avatar, the repository name and the
 * description on grey. For a plugin whose entire job is to look like
 * something, that wastes the only thing worth showing, so the card carries a
 * real fragment of a real dashboard: the same `docs/screens/dashboard-dark.png`
 * the README uses, captured from a running Obsidian. Nothing here is drawn by
 * hand — a picture showing something other than what installs is a lie,
 * however small.
 *
 * The result is not referenced by any file: GitHub keeps it as an upload under
 * Settings → General → Social preview, and there is no API for that. This
 * script exists so the image can be rebuilt rather than recovered, and reused
 * anywhere else a link needs a picture.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "docs/screens/dashboard-dark.png");
const OUT = path.join(ROOT, "docs/screens/social-preview.png");

/** What GitHub asks for, and refuses to scale gracefully away from. */
const CARD = { width: 1280, height: 640, maxBytes: 1024 * 1024 };

/**
 * The part of the 1280×900 window worth showing: tiles, number cards and the
 * sparklines under them. Above it is Obsidian's own chrome, below it the
 * progress bars, which do not survive being shrunk this far.
 */
const CROP = { x: 279, y: 236, width: 719, height: 462, scale: 0.855 };

const { name: PLUGIN_NAME } = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

/**
 * Not the manifest description — that one is a list of six blocks, written for
 * a catalogue entry where the reader has already stopped to look. A card is
 * read in a feed, at a glance.
 */
const TAGLINE = "Dashboards for your notes,<br>written in YAML";
const FOOTNOTE = "An Obsidian plugin · no JavaScript";

function html() {
    // Inlined rather than linked: the page is loaded via setContent, so it has
    // no origin of its own and the browser refuses to read `file://` from it.
    const shot = "data:image/png;base64," + fs.readFileSync(SOURCE).toString("base64");
    const px = (n) => `${Math.round(n)}px`;

    return `<!doctype html><meta charset="utf-8"><style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            width: ${px(CARD.width)}; height: ${px(CARD.height)}; overflow: hidden;
            display: flex; align-items: center; gap: 56px; padding-left: 72px;
            background: #16161b;
            /* System stack on purpose: no webfont to fetch, and the card is
               rendered once and committed rather than built on a runner. */
            font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
            color: #e8e8ec;
        }
        .left { width: 440px; flex: none; }
        .name { font-size: 96px; font-weight: 300; letter-spacing: -2px; margin-bottom: 20px; }
        .tag { font-size: 30px; line-height: 1.32; color: #a9a9b8; }
        .foot { margin-top: 34px; font-size: 21px; color: #6f6f80; }
        .shot {
            width: ${px(CROP.width * CROP.scale)}; height: ${px(CROP.height * CROP.scale)};
            flex: none; border-radius: 14px; border: 1px solid #2e2e38;
            box-shadow: 0 28px 70px rgba(0, 0, 0, .55);
            background-image: url("${shot}");
            background-repeat: no-repeat;
            background-size: ${px(CARD.width * CROP.scale)} auto;
            background-position: -${px(CROP.x * CROP.scale)} -${px(CROP.y * CROP.scale)};
        }
    </style>
    <div class="left">
        <div class="name">${PLUGIN_NAME}</div>
        <div class="tag">${TAGLINE}</div>
        <div class="foot">${FOOTNOTE}</div>
    </div>
    <div class="shot"></div>`;
}

async function launch() {
    // The installed Playwright wants a Chromium build that is not in the cache,
    // and downloading one to draw a single picture is not worth 150 MB. The
    // browser on the machine renders this page identically.
    try {
        return await chromium.launch({ channel: "chrome" });
    } catch {
        console.log("[social-card] no system Chrome; falling back to Playwright's own browser");
        return await chromium.launch();
    }
}

(async () => {
    if (!fs.existsSync(SOURCE)) {
        console.error(`[social-card] ${path.relative(ROOT, SOURCE)} is missing — run \`npm run capture\` first`);
        process.exit(1);
    }

    const browser = await launch();
    const page = await browser.newPage({
        viewport: { width: CARD.width, height: CARD.height },
        deviceScaleFactor: 1,
    });
    await page.setContent(html());
    await page.screenshot({ path: OUT });
    await browser.close();

    const bytes = fs.statSync(OUT).size;
    if (bytes > CARD.maxBytes) {
        console.error(`[social-card] ${bytes} bytes — GitHub refuses anything over ${CARD.maxBytes}`);
        process.exit(1);
    }
    console.log(
        `[social-card] ${path.relative(ROOT, OUT)}: ${CARD.width}×${CARD.height}, ${Math.round(bytes / 1024)} KB`
    );
    console.log("[social-card] upload it by hand: Settings → General → Social preview (GitHub has no API for it)");
})();
