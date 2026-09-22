#!/usr/bin/env node
/**
 * A vault as a newcomer actually has it, for the first-run audit.
 *
 * The point is that the data for a dashboard is there and the names are not
 * ours: no `Diary`, no `01-Areas`, no `sleep_score`. A folder called `Journal`,
 * a `Templates` folder like almost every vault has, and frontmatter someone
 * chose themselves. If a first run only works when the vault is shaped like
 * the examples, it does not work.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, ".capture", "newcomer");

const key = (d) =>
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

function build() {
    fs.rmSync(out, { recursive: true, force: true });
    for (const dir of ["Journal", "Work", "Templates", ".obsidian"]) {
        fs.mkdirSync(path.join(out, dir), { recursive: true });
    }

    const today = new Date();
    let written = 0;
    for (let back = 60; back >= 0; back--) {
        if (back % 6 === 2) continue; // days they missed
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
        written += 1;
        fs.writeFileSync(
            path.join(out, "Journal", `${key(date)}.md`),
            `---\nmood: ${3 + (back % 3)}\nran_km: ${(back % 9) + 1}\n---\n\nWoke up. Did things.\n`,
        );
    }

    // The template that used to poison `latest`.
    fs.writeFileSync(
        path.join(out, "Templates", "Daily.md"),
        "---\nmood: \nran_km: \n---\n\n## {{date}}\n",
    );

    for (let i = 1; i <= 12; i++) {
        fs.writeFileSync(path.join(out, "Work", `meeting-${i}.md`), `# Meeting ${i}\n\nNotes.\n`);
    }
    fs.writeFileSync(path.join(out, "Welcome.md"), "# Welcome\n\nThis is my vault.\n");

    fs.writeFileSync(path.join(out, ".obsidian", "community-plugins.json"), '["dashsidian"]\n');
    fs.writeFileSync(
        path.join(out, ".obsidian", "workspace.json"),
        JSON.stringify({
            main: {
                id: "nc-main", type: "split", direction: "vertical",
                children: [{
                    id: "nc-tabs", type: "tabs",
                    children: [{
                        id: "nc-leaf", type: "leaf",
                        state: {
                            type: "markdown",
                            state: { file: "Welcome.md", mode: "source", source: false },
                            icon: "lucide-file", title: "Welcome",
                        },
                    }],
                }],
            },
            left: { id: "nc-left", type: "split", children: [], direction: "horizontal", width: 0, collapsed: true },
            right: { id: "nc-right", type: "split", children: [], direction: "horizontal", width: 0, collapsed: true },
            active: "nc-leaf",
            lastOpenFiles: ["Welcome.md"],
        }, null, 2) + "\n",
    );

    const pluginDir = path.join(out, ".obsidian", "plugins", "dashsidian");
    fs.mkdirSync(pluginDir, { recursive: true });
    for (const f of ["main.js", "manifest.json", "styles.css"]) {
        fs.symlinkSync(path.join(root, f), path.join(pluginDir, f));
    }

    console.log(`[firstrun] newcomer vault: ${out} (${written} journal entries, 12 work notes, 1 template)`);
}

build();
