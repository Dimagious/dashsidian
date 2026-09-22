const esbuild = require("esbuild");
const fs = require("fs");
const { id: PLUGIN_ID, name: PLUGIN_NAME } = JSON.parse(
    require("fs").readFileSync(require("path").join(__dirname, "..", "manifest.json"), "utf8")
);

const path = require("path");

const OUT = process.env.VAULT_PLUGIN;
if (!OUT) {
    console.error(
        'Set VAULT_PLUGIN to your plugin folder path and rerun. Example:\n' +
        'VAULT_PLUGIN="/absolute/path/to/vault/.obsidian/plugins/<plugin-id>" npm run build:vault'
    );
    process.exit(1);
}

const outFile = path.join(OUT, "main.js");
const watch = process.argv.includes("--watch");

const EXTRA_FILES = ["styles.css", "manifest.json"];
// docs/screens is 16 MB of README demo reels and voiceover — GitHub needs it,
// a vault does not. Copying it here dumped the whole lot into every target vault.
const EXTRA_DIRS = [];

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

function copyFileSafe(src, dstDir) {
    if (!fs.existsSync(src)) return;
    ensureDir(dstDir);
    const dst = path.join(dstDir, path.basename(src));
    fs.copyFileSync(src, dst);
}

function copyDirSafe(srcDir, dstDir) {
    if (!fs.existsSync(srcDir)) return;
    ensureDir(dstDir);
    if (fs.cpSync) {
        fs.cpSync(srcDir, path.join(dstDir, path.basename(srcDir)), { recursive: true });
    } else {
        const base = path.join(dstDir, path.basename(srcDir));
        ensureDir(base);
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
            const s = path.join(srcDir, entry.name);
            const d = path.join(base, entry.name);
            if (entry.isDirectory()) {
                copyDirSafe(s, base);
            } else {
                fs.copyFileSync(s, d);
            }
        }
    }
}

function copyAssets() {
    for (const f of EXTRA_FILES) copyFileSafe(f, OUT);
    for (const d of EXTRA_DIRS) {
        if (!fs.existsSync(d)) continue;
        const targetParent = path.join(OUT, path.dirname(d)); // OUT/docs
        copyDirSafe(d, targetParent);
    }
    console.log(`[${PLUGIN_ID}] Assets copied`);
}

(async () => {
    const ctx = await esbuild.context({
        entryPoints: ["src/main.ts"],
        bundle: true,
        outfile: outFile,
        format: "cjs",
        platform: "node",
        target: "es2020",
        external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view"],
        loader: { ".css": "text" },
        plugins: [
            {
                name: "copy-assets",
                setup(build) {
                    build.onEnd((result) => {
                        copyAssets();
                        const ok = !result.errors?.length;
                        console.log(ok ? `[${PLUGIN_ID}] Built` : `[${PLUGIN_ID}] Build had errors`);
                    });
                },
            },
        ],
        footer: {
            js: "module.exports = module.exports.default || module.exports;",
        },
    });

    await ctx.rebuild();

    if (watch) {
        await ctx.watch();

        for (const f of EXTRA_FILES) {
            if (fs.existsSync(f)) {
                fs.watchFile(f, { interval: 300 }, copyAssets);
            }
        }

        for (const d of EXTRA_DIRS) {
            if (!fs.existsSync(d)) continue;
            try {
                fs.watch(d, { recursive: true }, () => copyAssets());
            } catch {
                fs.watch(d, () => copyAssets());
            }
        }

        console.log(`[${PLUGIN_ID}] Watching for changes…`);
    } else {
        await ctx.dispose();
    }
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
