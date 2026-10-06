---
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
version: 1.9.0
---

# Dashy: dashboard blocks in Obsidian notes

The **Dashy** plugin (`dashsidian`) draws a dashboard out of
fenced code blocks, YAML inside, no JavaScript and no Dataview. You write the
blocks, the user asks and reviews. You cannot see the rendered note, so the
work goes: look, pick, write, check.

Key tables for every block are in [reference.md](reference.md); read the section of the block you are about to write before writing it.

## 1. Look before writing

Never guess a property name or a folder; read a few small files.
`<configDir>` is the vault's config folder: by default a dot followed by
`obsidian`, at the vault root; the user may have renamed it in Settings,
About, Override config folder.

- `<configDir>/types.json`: the vault's property names and their types
  (`checkbox`, `number`, `date`).
- `<configDir>/daily-notes.json` (core Daily notes: `folder`, `format`) and,
  if present, `<configDir>/plugins/periodic-notes/data.json` (`daily`,
  `weekly`, `monthly`, each with `folder` and `format`; version 1.x
  keeps them under `calendarSets`, in the set `activeCalendarSet` names,
  and when the file holds both shapes, the installed version in
  `plugins/periodic-notes/manifest.json` decides). The `today` block links
  the notes they describe; Periodic Notes wins over Daily notes.
- `<configDir>/plugins/dashsidian/data.json`: Dashy's own settings.
  `dailyFolder`, `weeklyFolder` and `monthlyFolder`, when not empty,
  replace the folders above; `startDayHour` (0 to 6) moves the start of
  the day past midnight for every block.
- The frontmatter of 3 to 5 recent notes in the folder the user means. Do
  not walk the whole vault. Note what the values are: numbers, ticked
  checkboxes (count as 1), or durations like `7:30` or `5h 58min`, which
  count as minutes.

Then settle how a note's date is known. A name starting with `YYYY-MM-DD`
(`2026-03-02 Monday`) dates the note. Any other name (`02.03.2026`,
`Dune`) needs `date_field` naming a date property; otherwise `period`,
streaks, `chart` and `heatmap` find no dates. Daily notes named in
another format (`02.03.2026`) are read by the format set in Daily notes or
Periodic Notes; if neither names it, write it: `date_format: DD.MM.YYYY`.

## 2. Pick the block

| The user asks for | Block |
|---|---|
| a number: a count, a sum, an average, a streak | `stats` |
| how far along a goal is | `progress`, with `goal` |
| days until or since a date, the next birthday | `countdown`, `repeat: yearly` for a birthday |
| today's date with links to the daily, weekly, monthly note | `today` |
| a grid of links to folders or notes | `tiles` |
| a year of days coloured by a value, a habit year | `heatmap` |
| several habits on one grid | `heatmap` with `layers` |
| a habit calendar for this month | `heatmap` with `range: month` and `layout: calendar` |
| a number per day, week, month or year over time | `chart`, with `bucket` |
| a weekly or monthly review counting its own week or month | `stats` in that note, `period: note` on the block root |

If `obsidian-charts` is listed in `<configDir>/community-plugins.json`, the
Obsidian Charts plugin owns the `chart` fence: write `dashy-chart` instead,
with the same keys.

## 3. Write

- One block per fenced code block, the block name as its language.
- Canonical keys from reference.md, not their synonyms.
- In `stats` and `progress`, write the selection the cards share
  (`source`, `tag`, `where`, `period`, `date_field`) once on the block
  root. Every card inherits it; a card's own value replaces the root's, and a
  card's `where` narrows the root's further.
- Quote a value holding a colon, a comma or a hash:
  `label: "Home: entry"`, `label: "Books, read"`.
- Write titles and labels in the language the user writes to you in.
- `streak` is the longest run on record, `current_streak` the run going on
  now. Label them that way.
- Put the blocks where the user asked. Do not rewrite the rest of the note,
  and do not change the data in their notes unless asked.

## 4. Recipes

A habit tracker from checkboxes in daily notes under `Diary`; the last card
skips weekends and the days ticked `vacation`:

```stats
source: Diary
columns: 4
items:
  - { label: Gym this month, field: gym, agg: sum, period: month }
  - { label: Days in a row, field: gym, agg: current_streak, unit: days }
  - { label: Best streak, field: gym, agg: streak, unit: days }
  - { label: Workdays in a row, field: deep_work, agg: current_streak, days: weekdays, skip_field: vacation, unit: days }
```

Two activities on one heatmap, then one habit as this month's calendar:

```heatmap
source: Diary
layers:
  - { field: gym, color: orange, label: Gym }
  - { field: read, color: green, label: Reading }
title: Gym and reading
```

```heatmap
source: Diary
field: gym
range: month
layout: calendar
```

Kilometres per week as bars with a goal:

```chart
source: Diary
field: run_km
type: bar
bucket: week
unit: km
goal: 30
```

A yearly reading goal, from notes in `Reading` dated by a `date_read` property:

```progress
source: Reading
date_field: date_read
period: year
items:
  - { label: Books this year, agg: count, goal: 24 }
  - { label: Pages this year, field: pages, agg: sum, goal: 8000 }
```

The next birthday, read from a person's note, and a written date:

```countdown
items:
  - { label: Anna, field: birthday, repeat: yearly, source: People, where: "name = Anna" }
  - { label: Our wedding, date: 2015-06-20, repeat: yearly }
```

A home page: today's notes and a grid of folders with note counts:

```today
daily: true
weekly: true
```

```tiles
items:
  - { label: Inbox, path: Inbox, badge: count }
  - { label: Projects, path: Projects, badge: count }
```

## 5. Check before handing over

1. Every key you wrote is in reference.md for that block, at the level you
   wrote it (block root or list item).
2. Every `field`, `date_field`, `skip_field` and property in `where`
   is in the frontmatter you sampled, spelled the same.
3. Every `source` folder and tile `path` exists.
4. Dates resolve: names start with `YYYY-MM-DD`, or `date_field` is set.

Then ask the user to open the note in Reading view. A block draws its own
errors and warnings in place, naming the key or the line. If one shows up,
ask for its text and fix the block from it rather than guessing.

## 6. When Dashy cannot do it

If the request is on the list under "What the plugin does NOT do" in
reference.md, say so and name what does the job. Do not improvise
DataviewJS, and do not invent a block or a key.
