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
    // Date-only: `today` still carries the hour the script happened to run
    // at, and that hour crossing midnight nudged the last book's `finished`
    // date computed below into tomorrow, which `period: year` then excludes
    // (this year's book count flipped 15/16 depending on the time of day).
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

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

        // A habit checkbox, not a number. Monday/Wednesday/Friday are the
        // standing plan, kept all year so no stretch of the grid ever reads
        // as "gave up" — a seasonal gate that zeroes out half the year was
        // tried and rejected for exactly that. Saturday is a bonus session
        // added only in the easier half of the year, which is what varies
        // the adherence rate without ever emptying a season. A two-week push
        // and a break sit on top: real training has both. The push's range
        // (41..54 back) sits inside a stretch with no missed-day note gaps,
        // so it reads as a real fourteen-day streak rather than one cut short
        // by an unrelated missing note.
        const weekday = date.getDay(); // 0 Sun .. 6 Sat
        const gymCore = weekday === 1 || weekday === 3 || weekday === 5; // Mon/Wed/Fri
        const gymSaturday = weekday === 6 && Math.sin((back / 365) * Math.PI * 2) > 0;
        const gymPushRest = back === 40 || back === 55; // a rest day bracketing the push below
        const gymPush = back >= 41 && back < 55; // a strong fortnight, every day counts
        const gymBreak = back >= 110 && back < 129; // an off patch, months back: injury or travel
        const gym = gymBreak ? false : gymPushRest ? false : gymPush ? true : gymCore || gymSaturday;

        fs.writeFileSync(
            path.join(out, "Diary", `${key(date)}.md`),
            `---\nsleep_score: ${sleep}\nsteps: ${steps}\ngym: ${gym}\n---\n\n## ${key(date)}\n`,
        );
    }

    for (let i = 1; i <= 7; i++) {
        fs.writeFileSync(path.join(out, "Inbox", `idea-${i}.md`), `# Idea ${i}\n`);
    }
    for (let i = 1; i <= 23; i++) {
        const thisYear = i % 3 !== 0;
        const bookYear = thisYear ? today.getFullYear() : today.getFullYear() - 1;
        // Spread `finished` dates across the book's year so `period: year`
        // (see the stats and progress blocks below) counts a believable
        // subset instead of every book landing on the same day. This year's
        // books stop at today, since a book cannot be finished tomorrow.
        const yearStart = new Date(bookYear, 0, 1);
        const yearEnd = thisYear ? todayMidnight : new Date(bookYear, 11, 31);
        const span = Math.round((yearEnd.getTime() - yearStart.getTime()) / 86_400_000);
        const finished = key(new Date(bookYear, 0, 1 + Math.floor((i / 23) * span)));
        fs.writeFileSync(
            path.join(out, "Books", `book-${i}.md`),
            `---\nyear: ${bookYear}\nrating: ${3 + (i % 3)}\nfinished: ${finished}\n---\n\n# Book ${i}\n`,
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
  - { label: Books read, source: Books, period: year, date_field: finished, agg: count, icon: 📚 }
\`\`\`

\`\`\`progress
items:
  - { label: Days logged this year, source: Diary, agg: count, goal: 365, icon: 📔 }
  - { label: Books this year, source: Books, period: year, date_field: finished, agg: count, goal: 24, icon: 📚 }
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

\`\`\`stats
columns: 4
items:
  - { label: Gym days, source: Diary, field: gym, agg: sum, icon: 🏋️ }
  - { label: Longest gym streak, source: Diary, field: gym, agg: streak, unit: days }
  - { label: Gym this week, source: Diary, field: gym, agg: sum, period: week, icon: 🏋️ }
  - { label: Gym this month, source: Diary, field: gym, agg: sum, period: month, icon: 🏋️ }
\`\`\`

\`\`\`heatmap
source: Diary
field: gym
color: orange
title: Gym, last twelve months
\`\`\`
`);

    // The file name is the heading Obsidian draws, so the note has none of its own.
    fs.writeFileSync(path.join(out, "A config with a mistake.md"), `\`\`\`heatmap
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
            lastOpenFiles: ["Dashboard.md", "A config with a mistake.md"],
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
