# Dashy

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/banner-dark.svg">
  <img alt="Dashy: a dashboard inside an Obsidian note, built from seven markdown blocks (dashsidian)"
       src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/banner-light.svg">
</picture>

[![Downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&query=%24.dashsidian.downloads&label=downloads&color=7c5ce8)](https://community.obsidian.md/plugins/dashsidian)
[![Latest release](https://img.shields.io/github/v/release/Dimagious/dashsidian?color=7c5ce8)](https://github.com/Dimagious/dashsidian/releases)
[![Stars](https://img.shields.io/github/stars/Dimagious/dashsidian?color=7c5ce8)](https://github.com/Dimagious/dashsidian/stargazers)

**Charts, streaks, heatmaps and goals from the properties in your daily notes.**
Each block is a few lines of YAML. No JavaScript, no Dataview, and it runs on your phone.

[Website](https://dimagious.github.io/dashsidian/) · [Every block and key](https://dimagious.github.io/dashsidian/reference/) · [Guides](https://dimagious.github.io/dashsidian/guides/) · [Changelog](https://github.com/Dimagious/dashsidian/blob/master/CHANGELOG.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/hero-dark.png">
  <img alt="One Obsidian note: four cards (sleep this week, days in a row, run this week, gym days), weekly running bars against a 30 km goal line, and six months of nights as a heatmap"
       src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/hero-light.png">
</picture>

That page is one note and three blocks: `stats`, `chart` and `heatmap`.

## Install

Settings → **Community plugins** → **Browse** → search for **Dashy** → Install → Enable.

Open a note, run **Dashy: Insert block** from the command palette, pick a block. A working
example lands at the cursor, already pointed at a folder and a property from your own vault.

## Or let your AI agent write it

In Dashy's settings, under **AI agent skill**, the **Install** button on **Skill file in this
vault** writes a skill for Claude Code, and the one on **AGENTS.md in the vault root** writes the
same for Codex, Cursor and other agents. Open the vault
in your agent and say what you want to see. It reads your property names and folders, writes the
blocks, and you open the note to check.

> Count the books I finished this year against a goal of 24.

Setup, six prompts to copy, and what to do when a block shows an error:
[build an Obsidian dashboard with an AI agent](https://dimagious.github.io/dashsidian/guides/ai-agent-dashboard/).

## A habit tracker in two blocks

Tick `gym: true` in a daily note's Properties. Paste this into any other note:

````markdown
```stats
columns: 4
source: Diary
items:
  - { label: Gym days, field: gym, agg: sum, icon: 🏋️ }
  - { label: Longest gym streak, field: gym, agg: streak, unit: days, icon: 🔥 }
  - { label: Gym this week, field: gym, agg: sum, period: week, icon: 📅, compare: true, better: up }
  - { label: Gym this month, field: gym, agg: sum, period: month, icon: 🗓 }
```

```heatmap
source: Diary
field: gym
color: orange
title: Gym
```
````

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/habits-dark.png">
  <img alt="Four cards: gym days, longest streak, this week against last week, this month; below them a year of days with the gym days in orange"
       src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/habits-light.png">
</picture>

`Diary` is the folder your daily notes live in, and each note's name starts with its date.
Written once at the top, it applies to every card; a card with its own `source` reads that folder instead.
A ticked box counts as 1. `period: week` is always the current week, and `compare: true` sets it
against the same days of last week. The step-by-step version, with the same tracker in Tracker
and dataviewjs next to it: [a habit tracker without Dataview](https://dimagious.github.io/dashsidian/guides/habit-tracker-without-dataview/).

## Seven blocks

Every block reads frontmatter through Obsidian's own metadata cache. Each name below opens its
page: a picture, an example, every key.

- [`stats`](https://dimagious.github.io/dashsidian/reference/stats/): number cards, or one line of numbers for a page header. Count, sum, average, best and current streak, this week against last or against your usual level.
- [`chart`](https://dimagious.github.io/dashsidian/reference/chart/): a line or bars of a number by day, week, month or year, with a goal line.
- [`heatmap`](https://dimagious.github.io/dashsidian/reference/heatmap/): a year of days coloured by a number or a checkbox, several habits on one grid, or [a month as a calendar](https://dimagious.github.io/dashsidian/guides/monthly-habit-calendar/) with a dot under every day you kept a habit.
- [`progress`](https://dimagious.github.io/dashsidian/reference/progress/): bars towards a goal, like 24 books this year.
- [`today`](https://dimagious.github.io/dashsidian/reference/today/): today's date, an optional live clock, and links to the daily, weekly and monthly notes.
- [`tiles`](https://dimagious.github.io/dashsidian/reference/tiles/): link tiles into the vault, with live note counts.
- [`countdown`](https://dimagious.github.io/dashsidian/reference/countdown/): days until a race, a holiday, the next birthday, or a date kept in a note.

A weekly or monthly review counts its own period: `period: note` on `stats` and `progress`,
`range: note` on `chart` and `heatmap`, in a note named `2026-W40` or `2026-10`, however late
you open it. The same keys take a period written out, `2026-Q4`, or two dates,
`{ from: 2026-09-01, to: 2026-09-30 }`. Step by step: [a weekly review without Dataview](https://dimagious.github.io/dashsidian/guides/weekly-review-without-dataview/).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/chart-weekly-dark.png">
  <img alt="Weekly bars of running distance over half a year, a dashed goal line at 30 km, the current week drawn lighter"
       src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/chart-weekly-light.png">
</picture>

Dates read the way your daily notes are named: `2026-10-05`, or `05.10.2026` in the day format
set in Daily notes or Periodic Notes, or in one a block names with `date_format: DD.MM.YYYY`.
Durations read the way your watch writes them: `sleep: 7h 38min` counts as a number and comes
back as `7h 38m`. Race times written to the second, `time: 2:16:32`, come back to the second
as a clock; `H:MM` always means hours and minutes, so write a 5 km time as `0:18:51`. Every
block redraws when a note changes and takes its colours from your theme. With Obsidian Charts
turned on, write the chart block as `dashy-chart`.

When the config is wrong, the block says so in the note: a typo gets a "did you mean", a broken
YAML line gets its line number.

<img alt="Messages inside a note: an unknown key with a suggestion, a missing field, an unknown aggregate, a filter using or, and a chart key borrowed from another block"
     src="https://raw.githubusercontent.com/Dimagious/dashsidian/HEAD/docs/screens/diagnostics-dark.png">

## Guides

One problem per page, with the notes, the block, and the Bases, Tracker or dataviewjs version beside it:

- [Build an Obsidian dashboard with an AI agent](https://dimagious.github.io/dashsidian/guides/ai-agent-dashboard/)
- [A habit tracker without Dataview](https://dimagious.github.io/dashsidian/guides/habit-tracker-without-dataview/)
- [A habit streak that skips weekends](https://dimagious.github.io/dashsidian/guides/streak-weekdays/)
- [Two activities on one heatmap](https://dimagious.github.io/dashsidian/guides/heatmap-two-activities/)
- [A monthly habit calendar without Dataview](https://dimagious.github.io/dashsidian/guides/monthly-habit-calendar/)
- [A weekly review without Dataview](https://dimagious.github.io/dashsidian/guides/weekly-review-without-dataview/)
- [A weekly chart without Tracker](https://dimagious.github.io/dashsidian/guides/weekly-chart-tracker-alternative/)
- [Countdown to a birthday](https://dimagious.github.io/dashsidian/guides/countdown-birthday/)
- [Books per year: a reading log chart](https://dimagious.github.io/dashsidian/guides/books-per-year/)
- [A homepage dashboard without code](https://dimagious.github.io/dashsidian/guides/homepage-dashboard/)

## What it leaves out

Pie, radar and scatter charts and stacked bars ([Obsidian Charts](https://github.com/phibr0/obsidian-charts)),
tables and queries (Bases, Dataview), kanban, tasks. It reads frontmatter only, not inline
`key:: value` fields or tags with values. If that stops you, [say what you tried](https://github.com/Dimagious/dashsidian/issues).

## Questions

<details>
<summary>Do I need Dataview?</summary>

No. Dashy reads frontmatter from Obsidian's own metadata cache. Nothing else to install.

</details>

<details>
<summary>Does it work on a phone?</summary>

Yes. A tap on a heatmap cell or a chart bar shows its value, and a second tap opens the note.

</details>

<details>
<summary>How does a block know a note's date?</summary>

From its name, when it starts with `YYYY-MM-DD`: `2026-01-05 Monday` counts. Names written
another way, like `05.01.2026`, are read in the day format set in the Daily notes or Periodic
Notes settings, or in one the block names with `date_format: DD.MM.YYYY`. Otherwise add
`date_field` to the block and keep the date in a property.

</details>

<details>
<summary>Which languages does it speak?</summary>

English, Russian, German, French and Spanish, following Obsidian or picked in the settings.
Corrections to a translation are welcome: copy [`src/i18n/en.ts`](https://github.com/Dimagious/dashsidian/blob/master/src/i18n/en.ts) and translate the values.

</details>

## Bugs and ideas

The settings tab has a row for each. It opens a GitHub issue with your plugin and Obsidian
versions filled in. Or go straight to [the issue tracker](https://github.com/Dimagious/dashsidian/issues).

## Development

```bash
npm install
npm test             # vitest, with coverage gates
npm run lint         # eslint + eslint-plugin-obsidianmd
npm run typecheck
npm run build        # main.js + styles.css
npm run dev:vault    # build into a test vault and watch
npm run build:skill  # regenerate the agent skill from the schema
npm run build:reference  # regenerate the site's block reference
```

`npm run preview` shows every block in every state in a browser. `npm run e2e` runs the suite
against a real Obsidian, and `npm run capture` retakes the pictures. Logic lives in `src/core/`,
which imports neither Obsidian nor the DOM. Block keys live in
[`src/blocks/schema.json`](https://github.com/Dimagious/dashsidian/blob/master/src/blocks/schema.json); the agent skill and the site's
reference pages are generated from it. Design notes: [`docs/SPEC.md`](https://github.com/Dimagious/dashsidian/blob/master/docs/SPEC.md).

## License

[MIT](https://github.com/Dimagious/dashsidian/blob/master/LICENSE) © Dmitriy Yurkin
