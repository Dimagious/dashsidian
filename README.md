# Dashy

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/banner-dark.svg">
  <img alt="Dashy (dashsidian): describe the dashboard you want, and your AI agent builds it in your Obsidian note"
       src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/banner-light.svg">
</picture>

[![Downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&query=%24.dashsidian.downloads&label=downloads&color=7c5ce8)](https://community.obsidian.md/plugins/dashsidian)
[![Latest release](https://img.shields.io/github/v/release/Dimagious/dashsidian?color=7c5ce8)](https://github.com/Dimagious/dashsidian/releases)
[![Stars](https://img.shields.io/github/stars/Dimagious/dashsidian?color=7c5ce8)](https://github.com/Dimagious/dashsidian/stargazers)

**Describe the dashboard you want. Your AI agent builds it in your note.**

Charts, streaks, heatmaps and goals from your daily notes' properties.
Plain YAML you can read and edit. No JavaScript, no Dataview, works on your phone.

<img alt="A terminal beside an Obsidian note: the request &quot;Count the books I finished this year against a goal of 24&quot;, the agent reading the vault profile and writing the block, and a progress bar landing in the note at 16 of 24" src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/film-agent-block-wide.gif" width="100%">

**Install:** Settings → **Community plugins** → **Browse** → search for **Dashy**. Then install the agent skill from Dashy's settings, under **AI agent skill**, and ask for what you want to see. Works with Claude Code, Codex, Cursor and other agents.

[Website](https://dimagious.github.io/dashsidian/) · [Every block and key](https://dimagious.github.io/dashsidian/reference/) · [Guides](https://dimagious.github.io/dashsidian/guides/) · [Changelog](https://github.com/Dimagious/dashsidian/blob/master/CHANGELOG.md)

## What you can do

**Tick a box, the numbers follow.** Every block redraws when a note changes. No agent needed: [a habit tracker in two blocks](https://dimagious.github.io/dashsidian/guides/habit-tracker-without-dataview/).

**A broken block says why.** A typo gets a "did you mean", a broken YAML line gets its line number. Your agent can read the same messages and fix the block.

<p>
  <img alt="The gym checkbox ticked in a daily note, and below it the week count and current streak rolling up by one while today's cell of the year heatmap fills with colour" src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/film-one-tick.gif" width="49%">
  <img alt="A heatmap block loses a letter, field becomes fild, and in its place the note says: Unknown key &quot;fild&quot;. Did you mean &quot;field&quot;? The letter goes back and the heatmap returns" src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/film-error-message.gif" width="49%">
</p>

**A review counts its own week.** A note named `2026-W40` shows that week, however late you open it, and the same template works every week: [a weekly review without Dataview](https://dimagious.github.io/dashsidian/guides/weekly-review-without-dataview/).

<img alt="Two tabs, 2026-W40 and 2026-W41, with the same blocks: switching tabs changes the cards and the chart to the week each note is named for" src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/film-review-week-wide.gif" width="100%">

**Works on your phone.** A tap on a heatmap cell or a chart bar shows its value, and a second tap opens the note.

<img alt="Obsidian's mobile interface with a sleep heatmap: a tap on a day shows its value under the grid, a second tap opens that day's note with its properties, and the back button returns to the dashboard" src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/film-phone.gif" width="100%">

**Read and edit what it writes.** Plain YAML, no JavaScript, no Dataview. [Setup and six prompts to copy](https://dimagious.github.io/dashsidian/guides/ai-agent-dashboard/).

````markdown
```progress
source: Books
date_field: finished
period: year
items:
  - { label: Books this year, agg: count, goal: 24 }
```
````

<sub>The phone clip is the plugin running in Obsidian's mobile interface, in a phone-sized window on a desktop, with a demo vault. The other clips are drawn illustrations with made-up data. The picture below is a real note in a demo vault.</sub>

## Seven blocks

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/agent-hero-dark.png">
  <img alt="Left, a request to an AI agent: a running dashboard with weekly distance as bars against a 40 km goal, this week's distance, the current streak and a countdown to a marathon on May 17. Right, the Obsidian note it wrote: a countdown to the marathon, two cards for this week's distance and the current streak, and weekly bars under a dashed 40 km line."
       src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/agent-hero-light.png">
</picture>

- [`stats`](https://dimagious.github.io/dashsidian/reference/stats/): number cards, streaks, this week against last.
- [`progress`](https://dimagious.github.io/dashsidian/reference/progress/): bars towards a goal.
- [`heatmap`](https://dimagious.github.io/dashsidian/reference/heatmap/): a year of days, several habits on one grid, or a month as a calendar.
- [`chart`](https://dimagious.github.io/dashsidian/reference/chart/): a line or bars by day, week, month or year, with a goal line.
- [`countdown`](https://dimagious.github.io/dashsidian/reference/countdown/): days until a race, a holiday or the next birthday.
- [`today`](https://dimagious.github.io/dashsidian/reference/today/): the date and links to your daily, weekly and monthly notes.
- [`tiles`](https://dimagious.github.io/dashsidian/reference/tiles/): link tiles into the vault, with live note counts.

Blocks take their colours from your theme and read frontmatter only, not inline `key:: value` fields. Pie charts, tables, kanban and tasks are left to other plugins: [what it leaves out](https://dimagious.github.io/dashsidian/#scope).

## Questions

<details>
<summary>What does my agent see, and where does it go?</summary>

Your agent reads the notes it opens and sends them to its model provider, as it does with any
file it works on. Check what it is allowed to open before you point it at a vault with private
notes. Dashy makes no network requests, apart from a tile `image` you set to an
`https://` address. It writes the skill files and `.dashy/` only when you ask, and
`.dashy/vault-profile.md` holds one real value of each property, so read it before you hand it
over. [The details](https://dimagious.github.io/dashsidian/guides/ai-agent-dashboard/#privacy).

</details>

<details>
<summary>Do I need an AI agent?</summary>

No. **Dashy: Insert block** puts a working example at the cursor, already pointed at a folder and
a property from your vault. Every block is a few lines of YAML.

</details>

<details>
<summary>Does it work on a phone?</summary>

Yes. A tap on a heatmap cell or a chart bar shows its value, and a second tap opens the note.

</details>

<details>
<summary>How does a block know a note's date?</summary>

From its name. `2026-01-05 Monday` counts, and so does `05.01.2026` when that is the day format in
your Daily notes or Periodic Notes settings. A block can also name a format with `date_format`, or read a property with `date_field`.

</details>

<details>
<summary>Which languages does it speak?</summary>

English, Russian, German, French and Spanish, following Obsidian or picked in the settings.

</details>

## Bugs and ideas

The settings tab has a row for each, and it fills in your versions. Or go straight to [the issue tracker](https://github.com/Dimagious/dashsidian/issues).

<details>
<summary>Development</summary>

```bash
npm install
npm test             # vitest, with coverage gates
npm run lint         # eslint + eslint-plugin-obsidianmd
npm run typecheck
npm run build        # main.js + styles.css
npm run dev:vault    # build into a test vault and watch
```

Logic lives in `src/core/`, which imports neither Obsidian nor the DOM. Block keys live in
[`src/blocks/schema.json`](https://github.com/Dimagious/dashsidian/blob/master/src/blocks/schema.json); the agent skill and the site's
reference pages are generated from it. Design notes: [`docs/SPEC.md`](https://github.com/Dimagious/dashsidian/blob/master/docs/SPEC.md).

</details>

## License

[MIT](https://github.com/Dimagious/dashsidian/blob/master/LICENSE) © Dmitriy Yurkin
