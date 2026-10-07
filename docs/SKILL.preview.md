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

Key tables for every block are in [reference.md](reference.md); read the section of the block you are about to write before writing it, and the "Keys shared by several blocks" section at its top, where `where`, `date_field` and `date_format` are explained once.

## 1. Look before writing

Never guess a property name or a folder; read a few small files.
`<configDir>` is the vault's config folder: by default a dot followed by
`obsidian`, at the vault root; the user may have renamed it in Settings,
About, Override config folder.

- `<configDir>/types.json`: the vault's property names and their types
  (`checkbox`, `number`, `date`).
- `<configDir>/daily-notes.json` (core Daily notes: `folder`, `format`) and,
  if present, `<configDir>/plugins/periodic-notes/data.json`: version 0.x
  keeps `daily`, `weekly`, `monthly`, each with `enabled`, `folder`
  and `format`; version 1.x keeps `day`, `week`, `month` under
  `calendarSets`, in the set `activeCalendarSet` names (else the first).
  When the file holds both shapes, the installed version in
  `plugins/periodic-notes/manifest.json` decides. The `today` block links
  the notes they describe, the daily note from Periodic Notes when its day is
  switched on there, otherwise from Daily notes. A week named in
  `gggg-[W]ww` is a locale week, read in Obsidian's interface language;
  `GGGG-[W]WW` is the ISO week.
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

If the vault lacks what the block needs (no note for the coming race, no
property for the habit), say so before writing: ask for the date, or offer
the property to add to their notes, with its type. Do not leave a block
that draws an error as a placeholder. Write it anyway only when the
user asks for that after hearing it will show an error or a dash until the
data is there.

## 2. Pick the block

| The user asks for | Block |
|---|---|
| a number: a count, a sum, an average, a streak | `stats` |
| how far along a goal is | `progress`, with `goal` |
| days until or since a date, the next birthday | `countdown`, `repeat: yearly` for a birthday |
| days until the next of many events, one note each (races, trips) | `countdown` with `field` and `pick: next` |
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
- No `period` value means all time, so a card cannot leave the root's
  window: a card that must count all time, like `current_streak` in a
  weekly review with `period: note` at the root, goes in a block of its
  own without `period`.
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

Habits kept as numbers in the same notes: `sum` adds them up, `at_least`
counts a day towards a streak only from that value up, and `compare` on a
`count` sets this week's days against last week's, to date:

```stats
source: Diary
columns: 3
items:
  - { label: Steps this week, field: steps, agg: sum, period: week }
  - { label: 10k steps in a row, field: steps, agg: current_streak, at_least: 10000, unit: days }
  - { label: Days read 20+ min, agg: count, where: "read_min >= 20", period: week, compare: true, better: up }
```

A streak over two conditions, 10 000 steps and a sleep score of 80 or more:
`where` keeps only the days that pass the second, and a day it leaves out
ends the run the way a day under 10 000 steps does:

```stats
source: Diary
where: "sleep_score >= 80"
items:
  - { label: Best run of 10k steps and sleep 80+, field: steps, agg: streak, at_least: 10000, unit: days }
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

Without `range`, a heatmap draws a grid for each year up to this one in
which some note holds the field, so a year with none gets no grid;
`range: year` draws this year alone.

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

The next birthday, read from a person's note, a written date, and the next
race among the notes in `Races`, each with its date in a `date` property:

```countdown
items:
  - { label: Anna, field: birthday, repeat: yearly, source: People, where: "name = Anna" }
  - { label: Our wedding, date: 2015-06-20, repeat: yearly }
  - { label: Next race, field: date, source: Races, pick: next }
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
reference.md, say that Dashy does not draw it and name what does the job.
Write nothing for that part: write DataviewJS or another plugin's block only if the user
asks for it after that, even when the vault already holds an example to copy.
Do not invent a block or a key.
