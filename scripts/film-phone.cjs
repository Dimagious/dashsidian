#!/usr/bin/env node
/**
 * The phone film: real Obsidian in its mobile interface (e2e/film-phone.spec.ts)
 * set beside two captions, then an MP4 for the site and a GIF for the README.
 * Steals focus while it runs, so it is run by hand: `node scripts/film-phone.cjs`.
 */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, ".capture/frames/phone");
const FRAMES = path.join(ROOT, ".capture/frames/phone-composed");
const OUT = path.join(ROOT, "docs/screens");
const FPS = 15;
const run = (cmd, args, env) =>
    execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });

/** One composed frame: the still in a rounded screen, the caption of its beat lit. */
function page(still, beat, dark) {
    const step = (n, head, text) =>
        `<li class="${beat === n ? "on" : ""}"><b>${head}</b><span>${text}</span></li>`;
    return `<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; width: 1000px; height: 620px; display: flex; align-items: center; gap: 72px; padding: 0 0 0 190px; box-sizing: border-box;
             background: ${dark ? "#191722" : "#f4f1fd"}; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: ${dark ? "#e4e4e8" : "#222"}; overflow: hidden; }
      img { width: 307px; height: 580px; border-radius: 30px; box-shadow: 0 0 0 1px ${dark ? "#3b3654" : "#d8d0f2"}, 0 14px 40px rgba(70, 50, 140, .18); flex: none; }
      h2 { margin: 0 0 30px; font-size: 42px; line-height: 1.15; letter-spacing: -.01em; }
      ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 22px; }
      li { display: grid; gap: 3px; opacity: .42; }
      li.on { opacity: 1; }
      li b { font-size: 29px; color: ${dark ? "#a48cff" : "#6f4fe0"}; }
      li span { font-size: 24px; color: ${dark ? "#b3b3b8" : "#444"}; }
    </style><img src="data:image/png;base64,${fs.readFileSync(path.join(SHOTS, still)).toString("base64")}">
    <div><h2>Works on<br>your phone</h2><ul>
      ${step(1, "Tap a day", "See its value")}
      ${step(2, "Tap again", "Open its note")}
    </ul></div>`;
}

async function compose(shots, suffix) {
    fs.rmSync(FRAMES, { recursive: true, force: true });
    fs.mkdirSync(FRAMES, { recursive: true });
    const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
    const tab = await browser.newPage({ viewport: { width: 1000, height: 620 }, deviceScaleFactor: 2 });
    let frame = 0;
    for (const shot of shots) {
        await tab.setContent(page(shot.file, shot.beat, suffix === "-dark"), { waitUntil: "load" });
        const first = path.join(FRAMES, `${String(frame).padStart(4, "0")}.png`);
        await tab.screenshot({ path: first });
        for (let i = 0; i < shot.frames; i++, frame++) {
            const file = path.join(FRAMES, `${String(frame).padStart(4, "0")}.png`);
            if (file !== first) fs.copyFileSync(first, file);
        }
        if (shot.frames > 20 && shot.beat === 1) fs.copyFileSync(first, path.join(OUT, `film-phone${suffix}-poster.png`));
    }
    await browser.close();
    console.log(`[film-phone] ${frame} frames, ${(frame / FPS).toFixed(1)} s`);
}

(async () => {
    run("npm", ["run", "build"]);
    run("node", ["scripts/demo-vault.cjs"]);
    for (const [theme, suffix] of [["moonstone", ""], ["obsidian", "-dark"]]) {
        run("npx", ["playwright", "test", "e2e/film-phone.spec.ts", "--reporter=list"], {
            FILM: "1", FILM_THEME: theme, DASHY_VAULT: ".capture/vault", ELECTRON_RUN_AS_NODE: "",
        });
        await compose(JSON.parse(fs.readFileSync(path.join(SHOTS, "shots.json"), "utf8")), suffix);
        const input = ["-v", "error", "-y", "-framerate", String(FPS), "-i", path.join(FRAMES, "%04d.png")];
        run("ffmpeg", [...input, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", path.join(OUT, `film-phone${suffix}.mp4`)]);
        // The README's GIF is light only; the site swaps the MP4 by theme.
        if (!suffix) run("ffmpeg", [...input, "-vf", "scale=1000:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", "-loop", "0", path.join(OUT, "film-phone.gif")]);
    }
})().catch((error) => { console.error(error); process.exit(1); });
