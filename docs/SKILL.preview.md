---
name: dashy
description: >-
  Build a dashboard inside an Obsidian note with Dashy blocks: a grid of
  navigation tiles, number cards computed from frontmatter, a day row linking
  to the daily, weekly and monthly notes, a year heatmap, and a line or bar
  chart of a number per day, week, month or year. Use it when asked for a
  dashboard, a home page, a tile grid, cards with counters or averages, a
  link to today's note, a day calendar, a heatmap, a habit tracker, a chart
  or graph of a number over time, or a visual entry point into the vault.
version: 1.7.0
---

# Dashy — dashboard blocks

The **Dashy** plugin (`dashsidian`) draws a dashboard out of
markdown blocks. The config is YAML inside the block. No JavaScript, and no
Dataview required.

Blocks in total: 7.

### `tiles`

A grid of link tiles for navigating the vault.

**Block root**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `columns` | number | — | `4` | — | columns in the grid, 1 to 8 |
| `items` | list | yes | — | — | the list of tiles |

**List item**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `label` | string | yes | — | `title`, `name` | caption |
| `path` | string | yes | — | — | where it leads: a note, File.base#View, or a folder. A folder opens its folder note, `Folder/Folder.md` or else `Folder.md` next to it, and without one shows the folder in the file explorer |
| `tag` | string | — | — | — | tag, with or without the hash; narrows `badge: count` |
| `where` | string\|list | — | — | — | a condition like `year = 2026`, `rating >= 4`, `tags contains books`, or several that must all hold: joined with `and` (`year = 2026 and rating >= 4`) or written as a list (`[year = 2026, "rating >= 4"]`). The field name may be a dotted path into a nested property, like `health.sleep > 70`. `or` is not supported; quote a value holding the word `and` or `or`. One unreadable condition drops the whole filter with a warning, and the count is drawn unfiltered. Narrows `badge: count` |
| `period` | string\|number | — | — | — | narrow `badge: count` to a window ending today: `week`, `month`, `year` (the current calendar one) or a rolling count of days like `30d`. Notes without a date are left out first. A week starts on the first day of the interface language, Dashy's own when one is picked in its settings, otherwise Obsidian's: Sunday in English, Monday in most European languages |
| `date_field` | string | — | — | — | a date frontmatter property to read instead of the note name for `period`: `2026-03-02` or `2026-03-02T10:30`, or a dotted path into a nested property like `meta.date`; has no effect without `period` |
| `icon` | string | — | — | `emoji` | emoji |
| `sub` | string | — | — | — | small caption under the title |
| `badge` | string\|number | — | — | — | count, meaning the number of notes in the folder narrowed by `tag`, `where` and `period` when given, or your own string |
| `accent` | boolean | — | — | — | accent stripe on the left |
| `image` | string | — | — | — | a cover image above the icon and label: a vault path (`Attachments/gym.jpg`), a `[[wikilink]]`, or an `https://` URL. A vault path that does not resolve, or anything other than those three, warns and the tile draws without a cover |

**Example**

````markdown
```tiles
columns: 4
items:
  - { label: Inbox, path: 00-Inbox, icon: 📥, badge: count }
  - { label: Sport, path: 01-Areas/Sport/Training-Log, icon: 🏆, sub: workouts, accent: true }
```
````

### `stats`

Number cards: one value per card, computed over a selection of notes.

**Block root**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `columns` | number | — | `3` | — | columns in the grid, 1 to 6 |
| `layout` | string | — | `cards` | — | `cards` draws a grid of cards; `inline` draws the same numbers as one line of text, like `1001 notes · 188 journal entries · 14 open tasks`, for a page header. Inline keeps `icon`, `unit` and the `compare` delta, but draws no `trend` and no `sub` and ignores `columns`, with one warning for each. An unrecognised value warns and falls back to cards |
| `items` | list | yes | — | — | the list of cards |
| `source` | string | — | — | `folder`, `from` | folder for every card that names none of its own; includes nested ones. A card's own `source` replaces it |
| `tag` | string | — | — | — | tag for every card that names none of its own, with or without the hash. A card's own `tag` replaces it |
| `where` | string\|list | — | — | — | conditions every card must meet, written like a card's `where`. A card's own `where` does not replace it but narrows further: both must hold |
| `period` | string\|number | — | — | — | window for every card that sets none of its own, written like a card's `period`. A card's own `period` replaces it |
| `date_field` | string | — | — | — | date property for every card that sets none of its own, written like a card's `date_field`. A card's own `date_field` replaces it |

**List item**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `label` | string | yes | — | `title`, `name` | caption under the number, or after it with `layout: inline` |
| `source` | string | — | — | `folder`, `from` | folder; includes nested ones |
| `tag` | string | — | — | — | tag, with or without the hash |
| `where` | string\|list | — | — | — | a condition like `year = 2026`, `rating >= 4`, `tags contains books`, or several that must all hold: joined with `and` (`year = 2026 and rating >= 4`) or written as a list (`[year = 2026, "rating >= 4"]`). The field name may be a dotted path into a nested property, like `health.sleep > 70`. `or` is not supported; quote a value holding the word `and` or `or`. One unreadable condition drops the whole filter with a warning, and the numbers are drawn unfiltered |
| `period` | string\|number | — | — | — | narrow to a window ending today: `week`, `month`, `year` (the current calendar one) or a rolling count of days like `30d`. Notes without a date are left out first, then every agg, count included, runs on what remains. A week starts on the first day of the interface language, Dashy's own when one is picked in its settings, otherwise Obsidian's: Sunday in English, Monday in most European languages |
| `date_field` | string | — | — | — | a date frontmatter property to read instead of the note name: `2026-03-02` or `2026-03-02T10:30`, or a dotted path into a nested property like `meta.date`. Feeds `period`'s window and the `streak`, `current_streak`, `latest` and `trend` readings; has no effect on `count`, `sum`, `avg`, `min` or `max` without `period` |
| `compare` | boolean | — | — | — | show the delta against the same stretch of the previous period, to date: this week compares against the same weekdays last week, not the whole of last week. Only with `period` set, and not with `agg: streak` or `current_streak` |
| `better` | string | — | — | — | `up` colours a rise green and a fall red; `down` reverses that for a number where less is better. No change stays neutral either way. Only with `compare: true` |
| `field` | string | — | — | `property`, `prop` | numeric frontmatter property, or a checkbox (ticked counts as 1, unticked as 0), dotted for a nested one like `health.sleep`; required for everything but count, streak and current_streak. A field missing from the whole selection, or holding text rather than a number, shows a dash and a warning naming it; count text instead with `where: "field contains ..."` and `agg: count`. A duration string like `5h 58min`, `1h30m`, `45m`, `90 min` or `7:30` counts as minutes, and `sum`, `avg`, `min`, `max` or `latest` over a field of durations shows `5h 58m`. When every value of the field across the selected notes carries seconds, like `2:16:32` or `2h 16m 32s`, the card shows a clock to the second instead: `2:16:32`, `0:18:51`, and so does a `compare` delta. `H:MM` is always hours and minutes, never a time of day or minutes and seconds: a 5 km time written `18:51` reads as 18 hours, so write race times as `0:18:51`. A field mixing durations and plain numbers counts both as minutes, shows a plain number and warns naming a note of each kind |
| `agg` | string | — | `count` | `aggregate` | count sum avg min max latest streak current_streak |
| `at_least` | number\|string | — | — | — | with `agg: streak` or `current_streak` only: a day counts only once its notes' `field` values, summed for that day, reach this, like `at_least: 5000` steps; combine with `at_most` for a range. Needs `field`; ignored on any other aggregate. Takes a duration like `7h` or `7:30` too, read as minutes; a plain number against a field of durations means minutes |
| `at_most` | number\|string | — | — | — | with `agg: streak` or `current_streak` only: a day counts only while its notes' `field` values, summed for that day, stay at or under this, like `at_most: 5` cigarettes; combine with `at_least` for a range. Needs `field`; ignored on any other aggregate. Takes a duration like `7h` or `7:30` too, read as minutes; a plain number against a field of durations means minutes |
| `days` | string | — | `all` | — | with `agg: streak` or `current_streak` only: `weekdays` makes Saturday and Sunday transparent, so they neither break the run nor add to it, whatever they hold; `all`, the default, counts every day. Ignored on any other aggregate |
| `skip_field` | string | — | — | — | with `agg: streak` or `current_streak` only: a property marking a day special, like `vacation: true` or `sick: flu`; a day is special once any note landing on it sets the property to anything other than `false`, a blank string, `0` or absent. A special day neither breaks the run nor adds to it, whatever `field` holds, the same way `days: weekdays` treats a weekend, and the two combine. Ignored on any other aggregate |
| `unit` | string | — | — | — | a suffix after the number: km, %, d. Ignored, with a warning, on a value shown as a duration, which carries its own units. |
| `precision` | number | — | — | — | decimal places, 0 to 6; by default a whole number stays whole and a fraction gets one decimal; no effect on a value shown as a duration |
| `trend` | string\|number | — | — | — | sketch the last N days ending today: `30d`. Needs `field`. Its own trailing window, independent of `period` |
| `icon` | string | — | — | `emoji` | emoji |
| `sub` | string | — | — | — | small caption under the title |

**Example**

````markdown
```stats
columns: 3
source: Diary
items:
  - { label: Notes, source: 01-Areas, agg: count }
  - { label: Sleep, field: sleep_score, agg: avg, precision: 1, trend: 30d }
  - { label: Best streak, field: sleep_score, agg: streak }
  - { label: Gym this week, field: gym, agg: sum, period: week, compare: true, better: up }
```
````

- `streak` counts the longest run of consecutive days and `latest` takes the value from the newest note, a tie on the same date broken by path. Both resolve a note's date the same way `period` does, below, and two or more notes landing on the same day count as one day. With a `field:` set, `streak` is a field aggregate like `sum` or `avg`: nothing to count shows a dash, even over an empty selection. Without a `field:` it counts every selected note's own date instead, and reads a plain `0` when there is nothing, the same as `count`. `streak` is the best run on record: label the card "Best streak" or "Longest streak". `current_streak` is the run going on now, counted back from today by the same rules: label the card "Current streak" or "Days in a row". Today never breaks it: a day not filled yet leaves the run counted up to yesterday, and only a gap on yesterday or earlier resets it to `0`. It counts within the selection after `period`, `where`, `tag` and `source`, so `period: month` stops it at the first of the month.
- `count` over nothing reads a plain `0`, the number of notes found; every other aggregate, and `streak` or `current_streak` with a `field` set, shows a dash instead: "no data" and "zero" are different answers.
- `trend` sketches the days of a trailing window ending today, scaled between the smallest and largest value in that window rather than from zero. A day without a note is left out, not drawn as a zero, and two or more notes on the same day are summed into that one day's bar.
- `period` narrows to a calendar week, month, year or a rolling `Nd`, always ending today. A note's date is its name, as long as it starts with `YYYY-MM-DD` (`2026-03-02 Monday` counts, `2026-03-021` does not), unless `date_field` names a property instead; a note with no date under either rule is left out before counting.
- `compare` needs a note in both windows; when either the current or the previous stretch has none at all, the card shows its number alone with no delta. `streak` and `current_streak` have no value of their own to compare and refuse `compare` outright, the way `trend` refuses `count`.
- `at_least`/`at_most` turn `streak` into a threshold: a day counts only when its notes' `field` values, summed for that day, satisfy the bound, `at_least: 5000` on steps for example. `days: weekdays` makes Saturday and Sunday transparent for `streak` and `current_streak`: they neither break the run nor extend it, whatever they hold, so a Friday followed by a Monday is a run of two. `skip_field` does the same for a day any note marks special, `vacation: true` or `sick: flu` for example, and combines with `days: weekdays`. All three keys apply to `agg: streak` and `agg: current_streak` only and are ignored on every other aggregate.
- `source`, `tag`, `where`, `period` and `date_field` written at the block root, next to `items:`, apply to every card, so a folder shared by the whole block is written once. A card's own `source`, `tag`, `period` or `date_field` replaces the root's for that card; `where` is the exception: the root's conditions and the card's own both hold. A root folder that does not exist, a root `where` or `period` that cannot be read, a blank root `source` or `tag`, or a root `date_field` that no note selected under `period` has a date in is reported once for the block, not once per card. A card's own `source:` or `tag:` left empty still replaces the root's, so the card reads the whole vault or drops the tag filter, and it warns: to inherit the root's value, remove the key. Without `items:` the block is a single card and these keys are simply its own.
- `layout: inline` draws every card as one item of a single line, its number first and its label after, joined by a middle dot: `items: [{ label: notes, agg: count }, { label: journal entries, source: Journal, agg: count }]` with `layout: inline` reads `1001 notes · 188 journal entries`, so a lowercase label reads best there. A `compare` delta follows the label, coloured the way it is on a card. A narrow pane wraps the line between items, never inside one. A card whose number cannot be computed shows a dash in its place and the rest of the line still draws.

### `progress`

Bars towards a goal: how far a number has come against a target.

**Block root**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `columns` | number | — | `1` | — | columns in the grid, 1 to 4; without it every bar is its own row |
| `items` | list | yes | — | — | the list of bars |
| `source` | string | — | — | `folder`, `from` | folder for every bar that names none of its own; includes nested ones. A bar's own `source` replaces it |
| `tag` | string | — | — | — | tag for every bar that names none of its own, with or without the hash. A bar's own `tag` replaces it |
| `where` | string\|list | — | — | — | conditions every bar must meet, written like a bar's `where`. A bar's own `where` does not replace it but narrows further: both must hold |
| `period` | string\|number | — | — | — | window for every bar that sets none of its own, written like a bar's `period`. A bar's own `period` replaces it |
| `date_field` | string | — | — | — | date property for every bar that sets none of its own, written like a bar's `date_field`. A bar's own `date_field` replaces it |

**List item**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `label` | string | yes | — | `title`, `name` | caption above the bar |
| `goal` | number\|string | yes | — | `target` | the target to fill towards; must be above zero; a duration like `8h` or `7:30` works too, read as minutes, and a plain number against a field of durations means minutes |
| `source` | string | — | — | `folder`, `from` | folder; includes nested ones |
| `tag` | string | — | — | — | tag, with or without the hash |
| `where` | string\|list | — | — | — | a condition like `year = 2026`, `rating >= 4`, `tags contains books`, or several that must all hold: joined with `and` (`year = 2026 and rating >= 4`) or written as a list (`[year = 2026, "rating >= 4"]`). The field name may be a dotted path into a nested property, like `health.sleep > 70`. `or` is not supported; quote a value holding the word `and` or `or`. One unreadable condition drops the whole filter with a warning, and the numbers are drawn unfiltered |
| `period` | string\|number | — | — | — | narrow to a window ending today: `week`, `month`, `year` (the current calendar one) or a rolling count of days like `30d`. The goal is measured against the period's value; notes without a date are left out first. A week starts on the first day of the interface language, Dashy's own when one is picked in its settings, otherwise Obsidian's: Sunday in English, Monday in most European languages |
| `date_field` | string | — | — | — | a date frontmatter property to read instead of the note name: `2026-03-02` or `2026-03-02T10:30`, or a dotted path into a nested property like `meta.date`. Feeds `period`'s window and the `streak`, `current_streak` and `latest` readings; has no effect on `count`, `sum`, `avg`, `min` or `max` without `period` |
| `field` | string | — | — | `property`, `prop` | numeric frontmatter property, or a checkbox (ticked counts as 1, unticked as 0), dotted for a nested one like `health.sleep`; required for everything but count, streak and current_streak. A field missing from the whole selection, or holding text rather than a number, shows a dash and a warning naming it; count text instead with `where: "field contains ..."` and `agg: count`. A duration string like `5h 58min`, `1h30m`, `45m`, `90 min` or `7:30` counts as minutes, and `sum`, `avg`, `min`, `max` or `latest` over a field of durations shows `5h 58m`. When every value of the field across the selected notes carries seconds, like `2:16:32` or `2h 16m 32s`, the card shows a clock to the second instead: `2:16:32`, `0:18:51`, and so does the goal. `H:MM` is always hours and minutes, never a time of day or minutes and seconds: a 5 km time written `18:51` reads as 18 hours, so write race times as `0:18:51`. A field mixing durations and plain numbers counts both as minutes, shows a plain number and warns naming a note of each kind |
| `agg` | string | — | `count` | `aggregate` | count sum avg min max latest streak current_streak |
| `at_least` | number\|string | — | — | — | with `agg: streak` or `current_streak` only: a day counts only once its notes' `field` values, summed for that day, reach this, like `at_least: 5000` steps; combine with `at_most` for a range. Needs `field`; ignored on any other aggregate. Takes a duration like `7h` or `7:30` too, read as minutes; a plain number against a field of durations means minutes |
| `at_most` | number\|string | — | — | — | with `agg: streak` or `current_streak` only: a day counts only while its notes' `field` values, summed for that day, stay at or under this, like `at_most: 5` cigarettes; combine with `at_least` for a range. Needs `field`; ignored on any other aggregate. Takes a duration like `7h` or `7:30` too, read as minutes; a plain number against a field of durations means minutes |
| `days` | string | — | `all` | — | with `agg: streak` or `current_streak` only: `weekdays` makes Saturday and Sunday transparent, so they neither break the run nor add to it, whatever they hold; `all`, the default, counts every day. Ignored on any other aggregate |
| `skip_field` | string | — | — | — | with `agg: streak` or `current_streak` only: a property marking a day special, like `vacation: true` or `sick: flu`; a day is special once any note landing on it sets the property to anything other than `false`, a blank string, `0` or absent. A special day neither breaks the run nor adds to it, whatever `field` holds, the same way `days: weekdays` treats a weekend, and the two combine. Ignored on any other aggregate |
| `unit` | string | — | — | — | a suffix after the numbers: km, %, d. Ignored, with a warning, on a value shown as a duration, which carries its own units. |
| `precision` | number | — | — | — | decimal places, 0 to 6; by default a whole number stays whole and a fraction gets one decimal; no effect on a value shown as a duration |
| `icon` | string | — | — | `emoji` | emoji |
| `sub` | string | — | — | — | small caption under the bar |

**Example**

````markdown
```progress
items:
  - { label: Days logged this year, source: Diary, agg: count, period: year, goal: 365 }
  - { label: Running volume, source: Diary, field: distance_km, agg: sum, goal: 200, unit: km }
```
````

- Going past the goal is shown as it is, 125% stays 125%; only the bar itself stops at full.
- `count` over nothing reads a plain `0` and an empty bar; every other aggregate, and `streak` or `current_streak` with a `field` set, shows a dash instead: "no data" and "zero" are different answers.
- `streak` counts the longest run of consecutive days on record; label the bar "Best streak" or "Longest streak". `current_streak` counts the run going on now, label it "Current streak" or "Days in a row": today never breaks it, a day not filled yet leaves the run counted up to yesterday, and only a gap on yesterday or earlier resets it. It counts within the selection after `period`, `where`, `tag` and `source`, so `period: month` stops it at the first of the month.
- `period` narrows to a calendar week, month, year or a rolling `Nd`, always ending today. A note's date is its name, as long as it starts with `YYYY-MM-DD` (`2026-03-02 Monday` counts, `2026-03-021` does not), unless `date_field` names a property instead; a note with no date under either rule is left out before counting.
- `at_least`/`at_most` turn `streak` into a threshold: a day counts only when its notes' `field` values, summed for that day, satisfy the bound, `at_least: 5000` on steps for example. `days: weekdays` makes Saturday and Sunday transparent for `streak` and `current_streak`: they neither break the run nor extend it, whatever they hold, so a Friday followed by a Monday is a run of two. `skip_field` does the same for a day any note marks special, `vacation: true` or `sick: flu` for example, and combines with `days: weekdays`. All three keys apply to `agg: streak` and `agg: current_streak` only and are ignored on every other aggregate.
- `source`, `tag`, `where`, `period` and `date_field` written at the block root, next to `items:`, apply to every bar, so a folder shared by the whole block is written once. A bar's own `source`, `tag`, `period` or `date_field` replaces the root's for that bar; `where` is the exception: the root's conditions and the bar's own both hold. A root folder that does not exist, a root `where` or `period` that cannot be read, a blank root `source` or `tag`, or a root `date_field` that no note selected under `period` has a date in is reported once for the block, not once per bar. A bar's own `source:` or `tag:` left empty still replaces the root's, so the bar reads the whole vault or drops the tag filter, and it warns: to inherit the root's value, remove the key. Without `items:` the block is a single bar and these keys are simply its own.

### `today`

A day row: today's date, an optional live clock, and links to the daily, weekly and monthly notes.

**Block root**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `daily` | boolean | — | `true` | — | link to the daily note |
| `weekly` | boolean | — | `false` | — | link to the weekly note |
| `monthly` | boolean | — | `false` | — | link to the monthly note |
| `title` | string | — | — | — | a custom heading instead of today's date |
| `clock` | boolean\|string | — | `false` | — | a live clock above the date: `true` or `minutes` for hours and minutes, `seconds` to add the seconds. A 12 or 24 hour clock follows the language, the same as the date. Any other value warns and shows no clock |

**Example**

````markdown
```today
clock: true
daily: true
weekly: true
monthly: true
```
````

- Takes the folder and the name format from the Periodic Notes plugin when installed; for the day it also picks up the core "Daily notes". A folder set in the Dashy settings wins over both.
- With none of `daily`, `weekly` and `monthly` given, only the daily note is shown. With at least one given, exactly those apply.
- The clock only changes its own digits, on the minute (or the second), and does not reread the vault. The date under it changes when the day does, at the hour set by "New day starts at" in the Dashy settings: with the day starting at 4:00, a clock that reads 01:30 still sits above yesterday's date.
- If the note does not exist yet the link is still drawn, dimmed: clicking it creates the note.

### `countdown`

Cards counting the days to a date.

**Block root**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `columns` | number | — | `3` | — | columns in the grid, 1 to 6 |
| `items` | list | yes | — | — | the list of dates |

**List item**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `label` | string | yes | — | `title`, `name` | what the date is |
| `date` | string | — | — | — | the date itself, YYYY-MM-DD. Required unless `field` is set, and not allowed together with it: exactly one of the two |
| `field` | string | — | — | `property`, `prop` | a date property to read the date from instead of writing it: `2026-03-02`, with or without a time after it, or an Obsidian date property; dotted for a nested one like `meta.expires`. Read from the newest note in the selection that has it filled in, the way `agg: latest` picks one: by the date in the note's name, and a note without one, like `Passport.md`, after every dated note. A value that is not a date, or no note having the property at all, is an error on the card that names it |
| `source` | string | — | — | `folder`, `from` | with `field` only: folder to look for the note in; includes nested ones. Without it, the whole vault |
| `tag` | string | — | — | — | with `field` only: tag the note carries, with or without the hash |
| `where` | string\|list | — | — | — | with `field` only: a condition the note must meet, like `type = passport`, or several joined with `and` or written as a list, the same language as on a `stats` card |
| `repeat` | string | — | — | — | `yearly` counts to the next time the date's month and day come round, today included, for a birthday or an anniversary, and shows how many years that one is: `37 years`. 29 February falls on the 28th in a year without one. A date still ahead counts to itself, with no years shown. Works with `date` and `field` alike; any other value is an error |
| `icon` | string | — | — | `emoji` | emoji |
| `sub` | string | — | — | — | small caption under the label; with `repeat: yearly` it comes before the years |

**Example**

````markdown
```countdown
columns: 3
items:
  - { label: IRONMAN 70.3, date: 2026-11-15, icon: 🏊 }
  - { label: Holiday, date: 2026-12-20, icon: 🏖, sub: two weeks off }
  - { label: Birthday, date: 1990-05-12, repeat: yearly, icon: 🎂 }
```
````

- A date that has passed is shown too, counting up instead of down. What happened yesterday is still worth seeing.
- The day count is whole days, so a daylight saving switch cannot shift it.
- A birthday or an anniversary repeats with `repeat: yearly`. A date kept in a note, like a passport's expiry, is read with `field` and stays current when the note changes: `{ label: Passport, field: expires, where: "type = passport" }`.

### `heatmap`

A year by days: one cell per day, coloured by a number from frontmatter.

**Block root**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `source` | string | — | — | `folder`, `from` | folder; includes nested ones |
| `tag` | string | — | — | — | tag, with or without the hash |
| `where` | string\|list | — | — | — | a condition like `year = 2026`, `rating >= 4`, `tags contains books`, or several that must all hold: joined with `and` (`year = 2026 and rating >= 4`) or written as a list (`[year = 2026, "rating >= 4"]`). The field name may be a dotted path into a nested property, like `health.sleep > 70`. `or` is not supported; quote a value holding the word `and` or `or`. One unreadable condition drops the whole filter with a warning, and the grid is drawn unfiltered |
| `field` | string\|list | — | — | `property`, `prop` | required unless `layers` is set, and not allowed together with it: exactly one of the two. A numeric frontmatter property, or a checkbox: ticked days are painted, unticked stay empty; dotted for a nested one like `health.sleep`. Also takes a list, like `[mood_am, mood_pm]`, to collapse several properties from the same note into one day with `per_day`. A list of checkboxes, like `[gym, read]`, counts the ticked ones, a box missing from a note counting as unticked: with two, a day with both is full colour and a day with one is paler. A number in any of them turns the count off and warns. A field missing from the selection, or holding text rather than a number, errors and says which; count text elsewhere with a stats card's `where: "field contains ..."` and `agg: count`. A duration string like `5h 58min` or `7:30` counts as minutes, and tooltips, the caption's average and the legend then read `5h 58m`. When every value of the field across the selected notes carries seconds, like `2:16:32`, tooltips and the average read as a clock to the second; the legend stays `2h 15m`. `H:MM` is always hours and minutes, never a time of day or minutes and seconds: a 5 km time written `18:51` reads as 18 hours, so write race times as `0:18:51`. A field mixing durations and plain numbers counts both as minutes, shows plain numbers and warns |
| `per_day` | string | — | `sum` | — | how several values landing on one day combine: sum, avg or max. Several values happen either from two or more notes on the same day, or from a `field` list on one note, or both at once. An unrecognised value warns and falls back to sum. With `layers`, it applies to each layer's own field(s) separately |
| `date_field` | string | — | — | — | a date frontmatter property to read instead of the note name: `2026-03-02` or `2026-03-02T10:30`, or a dotted path into a nested property like `meta.date` |
| `skip_field` | string | — | — | — | a property marking a day special, like `vacation: true` or `sick: flu`; a day is special once any note landing on it sets the property to anything other than `false`, a blank string, `0` or absent. Its cell gets a hatched overlay, on top of its painted colour when it has one. Works with `layers` too |
| `color` | string | — | `blue` | `colour` | blue green cyan purple pink orange red gray, or #rrggbb. Ignored, with a warning, when `layers` is set: each layer carries its own colour instead |
| `layers` | list | — | — | — | several activities on one grid, each in its own colour, instead of one `field`: `[{field, color, label}]`. Not used together with the block's own `field`. The first layer painted on a day colours that cell and supplies its value and link; the tooltip lists every layer with a value that day, in list order. The caption then counts days where any layer painted and drops the average, since averaging different fields together says nothing useful |
| `bands` | list | — | — | — | thresholds from the top down: [90, 80, 60] or [{min, alpha, label}]; anything below the lowest falls into the bottom band. Without `bands`, each grid (a calendar year, or the one `range` window) shades itself by its own minimum and maximum: a single checkbox field or a grid where every painted value is the same still paints one flat colour instead. A list of checkboxes is shaded by how many are ticked, with all of them ticked as the top even before any day reaches it; with `per_day: avg` by the share of the listed boxes ticked, and with `per_day: max` it stays flat. Two notes on the same day add their ticks up, so such a day can go past the top. A threshold may be a duration, `[8h, 7h]` or `{min: 7h}`, read as minutes; a plain number against a field of durations means minutes, and the legend reads as durations |
| `link` | boolean | — | `true` | — | clicking a cell opens that day's note |
| `range` | string\|number | — | — | — | one grid over a window ending today, instead of a grid per calendar year: `week`, `month`, `year` (1 January of the current year to today) or a rolling count of days like `365d`. Columns still align to the week the same way; a day outside the window is neither drawn nor counted. An unrecognised value warns and falls back to a grid per year |
| `title` | string | — | — | — | a custom heading instead of the automatic one |

**List item**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `field` | string\|list | yes | — | `property`, `prop` | this layer's own numeric frontmatter property, or a checkbox; dotted for a nested one, or a list to collapse several properties into this layer's day. Same shapes as the block's own `field`, durations included |
| `color` | string | — | — | `colour` | blue green cyan purple pink orange red gray, or #rrggbb. Without one, the next free colour from the palette, skipping colours other layers already claimed |
| `label` | string | — | — | `title`, `name` | name shown in the legend and the cell tooltip. Defaults to the field name(s) |

**Example**

````markdown
```heatmap
source: 01-Areas/Personal/Diary
field: sleep_score
color: purple
bands: [90, 80, 60]
```
````

- A note's date is its name, as long as it starts with `YYYY-MM-DD` (`2026-01-05 Monday` counts, `2026-01-051` does not), unless `date_field` names a property instead. That is how the block knows which cell it belongs to.
- Two or more notes landing on the same day paint one cell, and so does a `field` list on one note: `per_day` (default sum) says how the day's values combine, and a ticked or numeric contributor always outweighs a false one on the same day.
- Years are taken from the data, newest first, but never one later than today: a note dated in the future draws nothing extra and counts nowhere in the grid. If every dated note turns out to be in the future, the current year is still drawn, empty.
- `layers` replaces `field` for tracking several activities on one grid, each its own colour: `layers: [{field: gym, color: blue}, {field: run, color: green, label: Running}]`. When two layers land on the same day, the first one in the list colours the cell; the tooltip still lists every layer that has a value that day.
- `skip_field` marks special days, vacation or sick for example: they still show a hatched cell, keeping any painted colour underneath, and their count in the caption is unchanged (a special day with no value is still not present).
- `range` draws one grid over a window ending today instead of a grid per year: `range: 365d` is a rolling year that crosses 1 January in a single grid rather than splitting into two. Everything else works the same over that one grid: bands, layers, skip_field and its legend row, the caption's count and average, tooltips and links.

### `chart`

A number over time: a line or bars per day, week, month or year, for one property or a few side by side.

**Block root**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `source` | string | — | — | `folder`, `from` | folder; includes nested ones |
| `tag` | string | — | — | — | tag, with or without the hash |
| `where` | string\|list | — | — | — | a condition like `year = 2026`, `rating >= 4`, `tags contains books`, or several that must all hold: joined with `and` (`year = 2026 and rating >= 4`) or written as a list (`[year = 2026, "rating >= 4"]`). The field name may be a dotted path into a nested property, like `health.sleep > 70`. `or` is not supported; quote a value holding the word `and` or `or`. One unreadable condition drops the whole filter with a warning, and the chart is drawn unfiltered |
| `date_field` | string | — | — | — | a date frontmatter property to read instead of the note name: `2026-03-02` or `2026-03-02T10:30`, or a dotted path into a nested property like `meta.date` |
| `field` | string | — | — | `property`, `prop` | required unless `series` is set or `agg` is `count`, and not allowed together with `series`. One numeric frontmatter property, or a checkbox (ticked is 1, unticked 0); dotted for a nested one like `health.sleep`. A duration string like `5h 58min` or `7:30` counts as minutes, and tooltips, the y axis and the goal label then read `5h 58m`. When every value of the field across the selected notes carries seconds, like `2:16:32`, tooltips read as a clock to the second; the axis and the goal label stay `2h 15m`. `H:MM` is always hours and minutes, so write a 5 km time as `0:18:51`, not `18:51`; a field mixing durations and plain numbers counts both as minutes, shows plain numbers and warns. One property only: a list here is an error, write `series` for several lines, or `series: [{field: [a, b]}]` to fold several properties into one line. A field missing from the selection, holding text rather than a number, or holding numbers only on undated notes errors and says which |
| `series` | list | — | — | — | several lines, or groups of bars, instead of one `field`: `[{field, agg, label, color}]`, at most 4. Not used together with the block's own `field`. Every series is its own line, or its own bar beside the others, never stacked, and all of them share one y axis |
| `agg` | string | — | `sum` | `aggregate` | how the values landing in one bucket collapse into one number: sum avg min max count. A bucket's values are every value the field(s) hold on every note dated in it, so two notes on one day both count and `avg` is over values, not days: the same number a stats card over that week shows. `sum` of a checkbox is the number of ticked days. `count` needs no `field` and counts the dated notes in the bucket; next to a `field` it warns and ignores it. With `series`, each entry may override it. An unknown value is an error |
| `bucket` | string | — | `day` | — | `day`, `week`, `month` or `year`. A week starts on the first day of the interface language, Dashy's own when one is picked in its settings, otherwise Obsidian's: Sunday in English, Monday in most European languages; a month starts on the 1st, a year on 1 January. A year is labelled with the year alone, like `2024`. An unrecognised value warns and falls back to day |
| `range` | string\|number | — | — | — | the window, ending today: `week`, `month`, `year` (1 January of the current year to today) or a rolling count of days like `90d`. Defaults to `30d` for `day`, `182d` for `week`, `365d` for `month` and `3650d` for `year`. The window's start moves back to the start of the bucket it falls in, so only the last bucket can be partial. Above 400 buckets only the most recent 400 are drawn, and a window of a single bucket is drawn too; both warn. An unrecognised value warns and falls back to the default |
| `type` | string | — | `line` | — | `line` or `bar`, for the whole block. Bars always start at zero and hang below it for negative values; a line runs from its data's own minimum to its maximum. An unrecognised value warns and falls back to line |
| `label` | string | — | — | `name` | the single series' name, in the caption and the tooltip; defaults to the field name. With `series`, each entry carries its own, and this one warns |
| `color` | string | — | `blue` | `colour` | blue green cyan purple pink orange red gray, or #rrggbb. Ignored, with a warning, when `series` is set: each series carries its own colour instead |
| `unit` | string | — | — | — | a suffix in the tooltip, the goal label and the top y axis label: km, %, steps. Ignored, with a warning, for a series of durations, which carry their own units |
| `precision` | number | — | — | — | decimal places in the tooltip, the goal label and the y axis labels, 0 to 6; by default a whole number stays whole and a fraction gets one decimal; no effect on durations |
| `goal` | number\|string | — | — | `target` | a dashed horizontal reference line with its value, also named in the legend; the y axis always stretches to show it. A duration like `8h` or `7:30` works too, read as minutes, and a plain number against durations means minutes. Anything else warns and is ignored |
| `link` | boolean | — | `true` | — | clicking a `day` bucket opens that day's note, the first by path when there are several. No effect on `week`, `month` and `year` buckets |
| `title` | string | — | — | — | a custom heading instead of the automatic one |

**List item**

| key | type | required | default | synonyms | what it does |
|---|---|---|---|---|---|
| `field` | string\|list | yes | — | `property`, `prop` | this series' numeric frontmatter property, or a checkbox; dotted for a nested one. A list, like `[mood_am, mood_pm]`, folds several properties into this one series. Durations count as minutes, the same as the block's own `field`. Not needed with `agg: count` |
| `agg` | string | — | — | `aggregate` | this series' own aggregate, overriding the block's `agg`: sum avg min max count |
| `label` | string | — | — | `title`, `name` | name shown in the legend and the tooltip. Defaults to the field name(s), or `notes` for `count` |
| `color` | string | — | — | `colour` | blue green cyan purple pink orange red gray, or #rrggbb. Without one, the next free colour from the palette, skipping colours other series already claimed |

**Keys from other blocks and what they are here**

- `layers` is `series` here
- `per_day` is `agg` here
- `period` is `range` here
- `trend` is `range` here

**Example**

````markdown
```chart
source: 01-Areas/Personal/Diary
field: sleep_score
agg: avg
```
````

- With the Obsidian Charts plugin enabled, write the block as `dashy-chart`: Dashy then leaves the `chart` language to Charts, so a `chart` block is drawn by Charts. `dashy-chart` takes the same keys and always works. Turned Charts on while Obsidian was open? Restart Obsidian once.
- A note's date is its name, as long as it starts with `YYYY-MM-DD`, unless `date_field` names a property instead. Notes without a date are left out, and a selection where none has one warns. Notes dated after today are never drawn.
- A week starts on the locale's first day, the same day `period: week` and the heatmap grid use, and a week's tooltip names it: `Week of Sun Sep 27, 2026`.
- A bucket with no data is a gap in the line and no bar, never a zero: a missing day is not a day of zero. An unticked checkbox (`false`) is a real 0, and `count` over an empty bucket is a plain 0.
- `avg` is over values, not days: two notes on one day both count, so a week's average matches a stats card with `agg: avg` and `period: week`. `sum` of a checkbox counts the ticked days.
- The last bucket is usually still running (this week, this month, this year): it is drawn lighter, or as a hollow point on a line, and its tooltip ends with `so far`.
- A list in the block's own `field` is an error rather than a guess: write `series:` for several lines, or `series: [{field: [a, b]}]` to fold several properties into one.
- Not in this block, on purpose: pie, doughnut, radar and scatter charts, stacked bars, cumulative sums, a second y axis, smoothing and trend lines, zoom, tick and axis settings, annotations, and a height key (the height is the `--dashy-chart-height` CSS variable, which a CSS snippet can change). Steps and sleep on one chart are two chart blocks.

## What the plugin does NOT do

Do not invent blocks that do not exist. If asked for something on this list,
say what actually does the job.

- **table** — That is Obsidian Bases. Link to a base view from a tile instead: `path: Vault.base#My view`.
- **pie** — Pie, doughnut, radar and scatter charts are the Obsidian Charts plugin. Dashy's `chart` draws lines and bars of a number over time only.
- **kanban** — That is the Kanban plugin.
- **tasks** — That are the Tasks or Dataview plugins.

## General rules

- Quote values containing a colon, a comma or a hash: `label: "Home: entry"`.
- The key synonyms in the tables above are recognised, but write the canonical key in new configs.
- An unknown key does not break the block — a warning is drawn instead. Still, stray keys do not belong there.
- A block prints its own config errors straight into the note. If the user pastes an error, read it literally: it carries the line number.

The plugin speaks the language of the Obsidian interface. These blocks and keys
are the same in every language.
