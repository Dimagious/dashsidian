#!/usr/bin/env node
/**
 * Builds SKILL.md for an AI agent out of src/blocks/schema.json.
 *
 * Why generate rather than hand-write: the agent documentation IS the block
 * contract. Written by hand, it drifts away from the code within a couple of
 * releases, and the agent starts confidently inventing keys that do not exist.
 *
 * Two parts: the process (look at the vault, pick a block, write it, check it
 * without seeing the render), written by hand below, and the key reference,
 * built from the schema. Claude Code gets them as two files, SKILL.md and
 * reference.md next to it, so the process it reads on every request stays
 * short and the tables are read per block. Everything else reads AGENTS.md,
 * one section holding both parts. The parts are the same strings in both, so
 * they cannot drift between them.
 *
 * Writes:
 *   src/skill/skill-content.ts  — what the plugin drops into the vault
 *   docs/dashy.schema.json      — a machine-readable copy for any other tool
 *   docs/*.preview.md           — the same files, to read on GitHub
 *
 * `--check` writes nothing and fails when the generated output differs from
 * what is committed. That is the gate catching "edited the schema, forgot to
 * rebuild".
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "src/blocks/schema.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const check = process.argv.includes("--check");

const SKILL_DIR = ".claude/skills/dashy";
const SKILL_PATH = `${SKILL_DIR}/SKILL.md`;
const REFERENCE_PATH = `${SKILL_DIR}/reference.md`;
const AGENTS_PATH = "AGENTS.md";

/**
 * AGENTS.md belongs to the vault, not to us: other tools write there too. The
 * section is fenced so it can be replaced on update without touching a line
 * the user put around it.
 */
const AGENTS_BEGIN = "<!-- dashy:begin -->";
const AGENTS_END = "<!-- dashy:end -->";

/** A pipe inside a cell breaks the markdown table — escape it. */
function cell(v) {
    return String(v).replace(/\|/g, "\\|");
}

function fields(map) {
    const rows = Object.entries(map).map(([key, f]) => {
        const req = f.required ? "yes" : "—";
        const def = f.default !== undefined ? `\`${cell(f.default)}\`` : "—";
        const alias = f.aliases ? f.aliases.map((a) => `\`${a}\``).join(", ") : "—";
        return `| \`${key}\` | ${cell(f.type)} | ${req} | ${def} | ${alias} | ${cell(f.doc)} |`;
    });
    return ["| key | type | required | default | synonyms | what it does |",
            "|---|---|---|---|---|---|", ...rows].join("\n");
}

function blockSection(name, b) {
    const parts = [`### \`${name}\``, "", b.summary, ""];
    if (b.root) parts.push("**Block root**", "", fields(b.root), "");
    if (b.item) parts.push("**List item**", "", fields(b.item), "");
    // Keys an agent carries over from a neighbouring block (`layers` from the
    // heatmap in a chart): the parser names the right key when it sees one,
    // and so does the reference, before the agent writes it.
    if (b.hints) {
        parts.push("**Keys from other blocks and what they are here**", "",
            ...Object.entries(b.hints).map(([from, to]) => `- \`${from}\` is \`${to}\` here`), "");
    }
    parts.push("**Example**", "", "````markdown", "```" + name, b.example, "```", "````", "");
    if (b.notes) parts.push(...b.notes.map((n) => `- ${n}`), "");
    return parts.join("\n");
}

const blocks = Object.entries(schema.blocks);

/**
 * The key reference: every block's tables, examples and notes, then what the
 * plugin does not do. Built from the schema only.
 */
const reference = `# Dashy block reference

The **${manifest.name}** plugin (\`${manifest.id}\`) draws a dashboard out of
markdown blocks. The config is YAML inside the block. No JavaScript, and no
Dataview required.

Blocks in total: ${blocks.length}.

${blocks.map(([n, b]) => blockSection(n, b)).join("\n")}
## What the plugin does NOT do

Do not invent blocks that do not exist. If asked for something on this list,
say what actually does the job.

${Object.entries(schema.notInV1).map(([k, v]) => `- **${k}** — ${v}`).join("\n")}

## General rules

- Quote values containing a colon, a comma or a hash: \`label: "Home: entry"\`.
- \`source\` and \`tag\` take one name as text. Quote a folder or tag that YAML would read as a number or a boolean: \`source: "2024"\`, \`tag: "2024"\`. Unquoted, or written as a list, the block shows an error and ignores the key.
- The key synonyms in the tables above are recognised, but write the canonical key in new configs.
- An unknown key does not break the block — a warning is drawn instead. Still, stray keys do not belong there.
- A block prints its own config errors straight into the note. If the user pastes an error, read it literally: it carries the line number.

The plugin speaks the language of the Obsidian interface. These blocks and keys
are the same in every language.
`;

/**
 * The process, written by hand: what an agent does on every request before
 * and after it writes a block. Every YAML block below is rendered by
 * `src/skill/skill-process.test.ts` against a fake vault and must draw
 * without an error or a warning, so this part cannot teach a key the plugin
 * does not have.
 *
 * `tables` says where the key reference is: a link to the file next to
 * SKILL.md, or the section further down in AGENTS.md.
 */
function processPart(tables) {
    return `# Dashy: dashboard blocks in Obsidian notes

The **${manifest.name}** plugin (\`${manifest.id}\`) draws a dashboard out of
fenced code blocks, YAML inside, no JavaScript and no Dataview. You write the
blocks, the user asks and reviews. You cannot see the rendered note, so the
work goes: look, pick, write, check.

${tables.pointer}

## 1. Look before writing

Never guess a property name or a folder; read a few small files.
\`<configDir>\` is the vault's config folder: by default a dot followed by
\`obsidian\`, at the vault root; the user may have renamed it in Settings,
About, Override config folder.

- \`<configDir>/types.json\`: the vault's property names and their types
  (\`checkbox\`, \`number\`, \`date\`).
- \`<configDir>/daily-notes.json\` (core Daily notes: \`folder\`, \`format\`) and,
  if present, \`<configDir>/plugins/periodic-notes/data.json\` (\`daily\`,
  \`weekly\`, \`monthly\`, each with \`folder\` and \`format\`; version 1.x
  keeps them under \`calendarSets\`, in the set \`activeCalendarSet\` names,
  and when the file holds both shapes, the installed version in
  \`plugins/periodic-notes/manifest.json\` decides). The \`today\` block links
  the notes they describe; Periodic Notes wins over Daily notes.
- \`<configDir>/plugins/dashsidian/data.json\`: Dashy's own settings.
  \`dailyFolder\`, \`weeklyFolder\` and \`monthlyFolder\`, when not empty,
  replace the folders above; \`startDayHour\` (0 to 6) moves the start of
  the day past midnight for every block.
- The frontmatter of 3 to 5 recent notes in the folder the user means. Do
  not walk the whole vault. Note what the values are: numbers, ticked
  checkboxes (count as 1), or durations like \`7:30\` or \`5h 58min\`, which
  count as minutes.

Then settle how a note's date is known. A name starting with \`YYYY-MM-DD\`
(\`2026-03-02 Monday\`) dates the note. Any other name (\`02.03.2026\`,
\`Dune\`) needs \`date_field\` naming a date property; otherwise \`period\`,
streaks, \`chart\` and \`heatmap\` find no dates. Daily notes named in
another format (\`02.03.2026\`) are read by the format set in Daily notes or
Periodic Notes; if neither names it, write it: \`date_format: DD.MM.YYYY\`.

## 2. Pick the block

| The user asks for | Block |
|---|---|
| a number: a count, a sum, an average, a streak | \`stats\` |
| how far along a goal is | \`progress\`, with \`goal\` |
| days until or since a date, the next birthday | \`countdown\`, \`repeat: yearly\` for a birthday |
| today's date with links to the daily, weekly, monthly note | \`today\` |
| a grid of links to folders or notes | \`tiles\` |
| a year of days coloured by a value, a habit year | \`heatmap\` |
| several habits on one grid | \`heatmap\` with \`layers\` |
| a habit calendar for this month | \`heatmap\` with \`range: month\` and \`layout: calendar\` |
| a number per day, week, month or year over time | \`chart\`, with \`bucket\` |
| a weekly or monthly review counting its own week or month | \`stats\` in that note, \`period: note\` on the block root |

If \`obsidian-charts\` is listed in \`<configDir>/community-plugins.json\`, the
Obsidian Charts plugin owns the \`chart\` fence: write \`dashy-chart\` instead,
with the same keys.

## 3. Write

- One block per fenced code block, the block name as its language.
- Canonical keys from ${tables.name}, not their synonyms.
- In \`stats\` and \`progress\`, write the selection the cards share
  (\`source\`, \`tag\`, \`where\`, \`period\`, \`date_field\`) once on the block
  root. Every card inherits it; a card's own value replaces the root's, and a
  card's \`where\` narrows the root's further.
- Quote a value holding a colon, a comma or a hash:
  \`label: "Home: entry"\`, \`label: "Books, read"\`.
- Write titles and labels in the language the user writes to you in.
- \`streak\` is the longest run on record, \`current_streak\` the run going on
  now. Label them that way.
- Put the blocks where the user asked. Do not rewrite the rest of the note,
  and do not change the data in their notes unless asked.

## 4. Recipes

A habit tracker from checkboxes in daily notes under \`Diary\`; the last card
skips weekends and the days ticked \`vacation\`:

\`\`\`stats
source: Diary
columns: 4
items:
  - { label: Gym this month, field: gym, agg: sum, period: month }
  - { label: Days in a row, field: gym, agg: current_streak, unit: days }
  - { label: Best streak, field: gym, agg: streak, unit: days }
  - { label: Workdays in a row, field: deep_work, agg: current_streak, days: weekdays, skip_field: vacation, unit: days }
\`\`\`

Two activities on one heatmap, then one habit as this month's calendar:

\`\`\`heatmap
source: Diary
layers:
  - { field: gym, color: orange, label: Gym }
  - { field: read, color: green, label: Reading }
title: Gym and reading
\`\`\`

\`\`\`heatmap
source: Diary
field: gym
range: month
layout: calendar
\`\`\`

Kilometres per week as bars with a goal:

\`\`\`chart
source: Diary
field: run_km
type: bar
bucket: week
unit: km
goal: 30
\`\`\`

A yearly reading goal, from notes in \`Reading\` dated by a \`date_read\` property:

\`\`\`progress
source: Reading
date_field: date_read
period: year
items:
  - { label: Books this year, agg: count, goal: 24 }
  - { label: Pages this year, field: pages, agg: sum, goal: 8000 }
\`\`\`

The next birthday, read from a person's note, and a written date:

\`\`\`countdown
items:
  - { label: Anna, field: birthday, repeat: yearly, source: People, where: "name = Anna" }
  - { label: Our wedding, date: 2015-06-20, repeat: yearly }
\`\`\`

A home page: today's notes and a grid of folders with note counts:

\`\`\`today
daily: true
weekly: true
\`\`\`

\`\`\`tiles
items:
  - { label: Inbox, path: Inbox, badge: count }
  - { label: Projects, path: Projects, badge: count }
\`\`\`

## 5. Check before handing over

1. Every key you wrote is in ${tables.name} for that block, at the level you
   wrote it (block root or list item).
2. Every \`field\`, \`date_field\`, \`skip_field\` and property in \`where\`
   is in the frontmatter you sampled, spelled the same.
3. Every \`source\` folder and tile \`path\` exists.
4. Dates resolve: names start with \`YYYY-MM-DD\`, or \`date_field\` is set.

Then ask the user to open the note in Reading view. A block draws its own
errors and warnings in place, naming the key or the line. If one shows up,
ask for its text and fix the block from it rather than guessing.

## 6. When Dashy cannot do it

If the request is on the list under "What the plugin does NOT do" in
${tables.name}, say so and name what does the job. Do not improvise
DataviewJS, and do not invent a block or a key.
`;
}

const skillProcess = processPart({
    name: "reference.md",
    pointer: "Key tables for every block are in [reference.md](reference.md); read the section of the block you are about to write before writing it.",
});
const inlineProcess = processPart({
    name: "the block reference below",
    pointer: "Key tables for every block are in the block reference below; read the section of the block you are about to write before writing it.",
});

const markdown = `---
name: dashy
description: >-
  Build a dashboard inside an Obsidian note with Dashy blocks: a grid of
  navigation tiles, number cards computed from frontmatter, progress bars
  towards a goal, countdowns to a date, a day row linking to the daily,
  weekly and monthly notes, a year heatmap or a month habit calendar, and a
  line or bar chart of a number per day, week, month or year. Use it when
  asked for a dashboard, a home page, a tile grid, cards with counters or
  averages, a goal or progress bar, days until a date or the next birthday,
  a link to today's note, a day calendar, a heatmap, a habit tracker, a
  chart or graph of a number over time, a weekly or monthly review that
  counts its own week or month, or a visual entry point into the vault.
version: ${schema.version}
---

${skillProcess}`;

/** reference.md has no frontmatter; the comment keeps its version visible. */
const referenceFile = `<!-- Dashy skill reference, version ${schema.version}. Generated from the
     block schema by the ${manifest.name} plugin; read it together with SKILL.md. -->

${reference}`;

/** One text holding both parts, for AGENTS.md and the "Copy markdown" button. */
const combined = `${inlineProcess}
${reference}`;

const agents = `${AGENTS_BEGIN}
<!-- Generated by the ${manifest.name} plugin, version ${schema.version}.
     Everything between these two markers is replaced on update; anything
     outside them is left alone. -->

${combined}
${AGENTS_END}`;

const contentTs = `/**
 * WARNING: this file is generated by \`npm run build:skill\` from
 * src/blocks/schema.json. Do not edit by hand — the edit is lost on the next
 * build and the documentation drifts away from the behaviour. That is exactly
 * how agent instructions go stale.
 */
export const SKILL_VERSION = ${JSON.stringify(schema.version)};
export const SKILL_DIR = ${JSON.stringify(SKILL_DIR)};
export const SKILL_PATH = ${JSON.stringify(SKILL_PATH)};
export const SKILL_MARKDOWN = ${JSON.stringify(markdown)};
export const REFERENCE_PATH = ${JSON.stringify(REFERENCE_PATH)};
export const REFERENCE_MARKDOWN = ${JSON.stringify(referenceFile)};
export const COMBINED_MARKDOWN = ${JSON.stringify(combined)};
export const AGENTS_PATH = ${JSON.stringify(AGENTS_PATH)};
export const AGENTS_SECTION = ${JSON.stringify(agents)};
export const AGENTS_BEGIN = ${JSON.stringify(AGENTS_BEGIN)};
export const AGENTS_END = ${JSON.stringify(AGENTS_END)};
`;

const targets = [
    { file: "src/skill/skill-content.ts", body: contentTs },
    { file: "docs/dashy.schema.json", body: JSON.stringify(schema, null, 2) + "\n" },
    { file: "docs/SKILL.preview.md", body: markdown },
    { file: "docs/reference.preview.md", body: referenceFile },
    { file: "docs/AGENTS.preview.md", body: agents + "\n" },
];

let stale = [];
for (const t of targets) {
    const full = path.join(root, t.file);
    const current = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    if (current === t.body) continue;
    if (check) { stale.push(t.file); continue; }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, t.body, "utf8");
    console.log(`[${manifest.id}] wrote ${t.file}`);
}

if (check && stale.length) {
    console.error(`[${manifest.id}] skill is out of sync with the schema: ${stale.join(", ")}`);
    console.error(`[${manifest.id}] run: npm run build:skill`);
    process.exit(1);
}
if (check) console.log(`[${manifest.id}] skill is in sync with the schema`);
