#!/usr/bin/env node
/**
 * Builds the vault the listing screenshots are taken from.
 *
 * Generated rather than committed: the dates have to end today or the heatmap
 * is a stripe that stops in the middle and the day row links to nothing. Three
 * hundred committed notes that go stale in a week are worse than a script.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, ".capture", "vault");

const key = (d) =>
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

function build() {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(path.join(out, "Diary"), { recursive: true });
    fs.mkdirSync(path.join(out, "Inbox"), { recursive: true });
    fs.mkdirSync(path.join(out, "Books"), { recursive: true });
    fs.mkdirSync(path.join(out, ".obsidian"), { recursive: true });

    const today = new Date();

    // A year of days with a believable rhythm: a slow seasonal swing, a weekly
    // one, and gaps where life got in the way. Flat noise looks generated.
    let days = 0;
    for (let back = 364; back >= 0; back--) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
        const seasonal = Math.sin((back / 365) * Math.PI * 2);
        const weekly = Math.sin((back / 7) * Math.PI * 2);
        if (back % 17 === 5 || back % 23 === 11) continue; // missed days
        days += 1;
        const sleep = Math.round(80 + seasonal * 8 + weekly * 5);
        const steps = Math.round(9500 + seasonal * 2500 + weekly * 2000 + (back % 5) * 300);
        fs.writeFileSync(
            path.join(out, "Diary", `${key(date)}.md`),
            `---\nsleep_score: ${sleep}\nsteps: ${steps}\n---\n\n## ${key(date)}\n`,
        );
    }

    for (let i = 1; i <= 7; i++) {
        fs.writeFileSync(path.join(out, "Inbox", `idea-${i}.md`), `# Idea ${i}\n`);
    }
    for (let i = 1; i <= 23; i++) {
        const year = i % 3 === 0 ? today.getFullYear() - 1 : today.getFullYear();
        fs.writeFileSync(
            path.join(out, "Books", `book-${i}.md`),
            `---\nyear: ${year}\nrating: ${3 + (i % 3)}\n---\n\n# Book ${i}\n`,
        );
    }

    const year = today.getFullYear();
    fs.writeFileSync(path.join(out, "Dashboard.md"), `\`\`\`today
daily: true
weekly: true
monthly: true
\`\`\`

\`\`\`tiles
columns: 4
items:
  - { label: Inbox, path: Inbox, icon: 📥, badge: count }
  - { label: Diary, path: Diary, icon: 📔, badge: count, sub: one note a day }
  - { label: Books, path: Books, icon: 📚, badge: count }
  - { label: Sport, path: Diary, icon: 🏃, accent: true, sub: training log }
\`\`\`

\`\`\`stats
columns: 4
items:
  - { label: Days logged, source: Diary, agg: count, icon: 📔 }
  - { label: Average sleep, source: Diary, field: sleep_score, agg: avg, precision: 1, trend: 30d }
  - { label: Steps this year, source: Diary, field: steps, agg: sum, unit: steps }
  - { label: Best night, source: Diary, field: sleep_score, agg: max, trend: 90d }
  - { label: Longest streak, source: Diary, field: sleep_score, agg: streak, unit: days }
  - { label: Latest steps, source: Diary, field: steps, agg: latest, sub: most recent note }
  - { label: Great nights, source: Diary, where: "sleep_score >= 90", agg: count }
  - { label: Books read, source: Books, where: "year = ${year}", agg: count, icon: 📚 }
\`\`\`

\`\`\`progress
items:
  - { label: Days logged this year, source: Diary, agg: count, goal: 365, icon: 📔 }
  - { label: Books this year, source: Books, where: "year = ${year}", agg: count, goal: 24, icon: 📚 }
  - { label: Steps, source: Diary, field: steps, agg: sum, goal: 3000000, unit: steps, sub: three million }
\`\`\`

\`\`\`countdown
columns: 3
items:
  - { label: IRONMAN 70.3, date: ${year + 1}-06-14, icon: 🏊 }
  - { label: Holiday, date: ${year + 1}-01-20, icon: 🏖, sub: two weeks off }
  - { label: Review, date: ${year + 1}-03-01, icon: 🗒 }
\`\`\`

\`\`\`heatmap
source: Diary
field: sleep_score
color: purple
bands: [90, 80, 70]
title: Sleep, last twelve months
\`\`\`

\`\`\`heatmap
source: Diary
field: steps
color: green
bands: [12000, 9000, 6000]
title: Steps, last twelve months
\`\`\`
`);

    fs.writeFileSync(path.join(out, "Typo.md"), `# A config with a mistake

\`\`\`heatmap
source: Diary
feild: sleep_score
\`\`\`

\`\`\`stats
items:
  - { label: Average sleep, source: Diary, agg: avgg, field: sleep_score }
  - { label: Great nights, source: Diary, where: "sleep_score >= 90 and steps > 10000", agg: count }
\`\`\`
`);

    fs.writeFileSync(path.join(out, ".obsidian", "community-plugins.json"), '["dashsidian"]\n');
    fs.writeFileSync(
        path.join(out, ".obsidian", "app.json"),
        JSON.stringify({ promptDelete: false, showLineNumber: false }, null, 2) + "\n",
    );
    fs.writeFileSync(
        path.join(out, ".obsidian", "appearance.json"),
        JSON.stringify({ theme: "obsidian", showRibbon: false }, null, 2) + "\n",
    );
    fs.writeFileSync(
        path.join(out, ".obsidian", "workspace.json"),
        JSON.stringify({
            main: {
                id: "cap-main", type: "split", direction: "vertical",
                children: [{
                    id: "cap-tabs", type: "tabs",
                    children: [{
                        id: "cap-leaf", type: "leaf",
                        state: {
                            type: "markdown",
                            state: { file: "Dashboard.md", mode: "preview", source: false },
                            icon: "lucide-file", title: "Dashboard",
                        },
                    }],
                }],
            },
            left: { id: "cap-left", type: "split", children: [], direction: "horizontal", width: 0, collapsed: true },
            right: { id: "cap-right", type: "split", children: [], direction: "horizontal", width: 0, collapsed: true },
            active: "cap-leaf",
            lastOpenFiles: ["Dashboard.md", "Typo.md"],
        }, null, 2) + "\n",
    );

    // Symlink the built plugin in, the way the E2E setup does.
    const pluginDir = path.join(out, ".obsidian", "plugins", "dashsidian");
    fs.mkdirSync(pluginDir, { recursive: true });
    for (const f of ["main.js", "manifest.json", "styles.css"]) {
        fs.symlinkSync(path.join(root, f), path.join(pluginDir, f));
    }

    console.log(`[capture] demo vault: ${out} (${days} diary notes)`);
}

build();
