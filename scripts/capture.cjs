#!/usr/bin/env node
/**
 * Takes the listing pictures from a running Obsidian.
 *
 * Builds the plugin, generates a demo vault whose dates end today, and runs the
 * capture spec against it. A listing showing something other than what installs
 * is a lie, however small, so nothing here is mocked.
 */
const { execFileSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const run = (cmd, args, env) =>
    execFileSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

run("npm", ["run", "build"]);
run("node", ["scripts/demo-vault.cjs"]);

const env = {
    CAPTURE: "1",
    DASHY_VAULT: ".capture/vault",
    // Electron refuses the debugging port when this is set; the npm script
    // cannot unset it for a nested call, so it goes here.
    ELECTRON_RUN_AS_NODE: undefined,
};
delete env.ELECTRON_RUN_AS_NODE;

run("npx", ["playwright", "test", "e2e/capture.spec.ts", "--reporter=list"], {
    ...env,
    ELECTRON_RUN_AS_NODE: "",
});

// Frames to GIFs. A shared palette per reel: the default 256-colour quantiser
// bands the gradients on the cards into visible steps.
const fs = require("fs");
const frames = path.join(root, ".capture", "frames");
const shots = path.join(root, "docs", "screens");

for (const reel of fs.existsSync(frames) ? fs.readdirSync(frames) : []) {
    const dir = path.join(frames, reel);
    if (!fs.statSync(dir).isDirectory()) continue;
    const out = path.join(shots, `${reel}.gif`);
    try {
        execFileSync("ffmpeg", [
            "-y", "-loglevel", "error",
            "-framerate", "4",
            "-i", path.join(dir, "%03d.png"),
            "-vf", "scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
            "-loop", "0",
            out,
        ], { cwd: root, stdio: "inherit" });
        console.log(`[capture] ${path.relative(root, out)}`);
    } catch {
        console.warn(`[capture] ffmpeg missing or failed — ${reel}.gif not built`);
    }
}

console.log("\n[capture] docs/screens/");
