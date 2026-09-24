# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For this plugin a MAJOR version means one of: a settings key removed or
renamed, a block key removed or renamed, a raised `minAppVersion`, or a
removed public export.

## [Unreleased]

### Added

- **Checkbox properties work as a field.** An Obsidian checkbox property
  (`gym: true` in Properties) now counts as 1 when ticked and 0 when not,
  everywhere a block reads a `field`: heatmap paints the ticked days, `sum`
  on stats and progress turns into a day count, `avg` into the share of
  ticked days (0 to 1, not a percent), and `streak` breaks on an unticked
  day the same way it breaks on a missing one. A heatmap year that is
  entirely booleans drops the average from its caption, since a checkbox is
  not a quantity to average, only a tally of ticks.
- **A time window for `stats` and `progress`.** `period: week`, `month` or
  `year` narrows a card or bar to the current calendar one, ending today;
  `period: 30d` is a rolling count of days instead. "Books this year" no
  longer needs `where: "year = 2026"`, a filter that goes stale on 1 January,
  and "gym days this week" can finally be written at all. A note's date is
  its `YYYY-MM-DD` name unless `date_field` names a frontmatter date property
  instead, and notes without a date are left out before counting, so an
  empty week is not an error: `count` reads an honest `0`, and a field
  aggregate shows its usual dash for nothing to count. `streak`, `latest`
  and `trend` are unaffected: they keep their own rules and their own
  windows.
- **`compare` on a stats card.** Next to `period`, `compare: true` adds the
  delta against the same stretch of the previous period, to date: a Thursday
  this week compares against Monday to Thursday last week, not the whole of
  last week, and 31 March compares against the last day of February. The
  delta reads as a sign and a number, up or down, never a bare minus sign
  that could pass for a hyphen, and it is computed from the same rounded
  values the card itself shows, so a card at `precision: 0` never prints "no
  change" for numbers that visibly differ. `better: up` colours a rise green
  and a fall red, `better: down` reverses that for a number where less is
  better, and with neither the delta stays a neutral colour; a change of
  zero is always neutral. `compare` without `period` warns instead of
  comparing against nothing, a `compare` that is not `true` or `false` warns
  and draws no delta instead of failing silently, `streak` refuses `compare`
  outright the way `trend` already refuses `count`, and either side of the
  comparison having no notes at all in its window means no delta rather than
  a made-up one.

### Fixed

- **A long number on a stats card no longer breaks inside its digits.** A
  4-column card with a value like `3 307 952` could wrap right through a
  digit group, printing "3 307 95" on one line and "2 steps" on the next.
  The card may now only break between groups, and a value nine characters
  or longer as displayed (a 7-digit whole number, or `12 345.67`) also gets a
  smaller type size so it fits the card in the first place.

## [1.1.0] - 2026-09-23

### Added

- **German, French and Spanish.** A missing phrase still falls back to English,
  so nothing can read as a raw key. The three were written by the author, who
  speaks none of them well enough to be sure; corrections are one file and one
  pull request away.
- **A language setting.** Leave it empty and nothing changes: the plugin follows
  Obsidian, as it always has. Pick a language and the blocks, the month names
  and the weekday labels move together, for a vault whose notes are written in
  one language while the app runs in another.

### Fixed

- **A heatmap too wide for the note opens where the data is**, and its caption
  stays on screen while the year scrolls past. A year whose months sat off the
  right edge looked like an empty copy of the year above it.
- **The periodic folder placeholders describe your vault**, not the author's.
  They show the folder Periodic Notes is configured with, which is what the
  field falls back to when you leave it empty.

## [1.0.2] - 2026-09-23

### Fixed

- **A long number keeps its digits together on a phone.** Making the cards fit
  a narrow screen let a number like `3 307 952` break in half instead; it is
  set smaller there now and stays on one line.
- **A heatmap spanning two calendar years says which year each grid is.** The
  block draws one grid per year, and a custom `title:` replaced the caption
  that named it, so a twelve-month window read as the same grid drawn twice,
  the second one apparently empty.

## [1.0.1] - 2026-09-23

### Fixed

- **The blocks now render on mobile.** Every one of them failed there, showing
  `undefined is not an object` instead of a dashboard: the bundle was built for
  Node and pulled in a copy of the YAML parser that reads `process.env`, which
  desktop Obsidian has and a phone does not. Nothing changes on the desktop.
- **Blocks stay inside the note on a narrow screen.** The number cards and the
  tiles pushed the page sideways, and a year of heatmap cells grew past the
  edge instead of scrolling. A long sparkline now thins its bars rather than
  widening its card.
- **The Copy markdown button says when it cannot copy.** The clipboard is not
  available in every context, and the failure was silent. Install writes the
  same file and needs no clipboard at all.

## [1.0.0] - 2026-09-22

The first public release. Six blocks, two languages, and a reference an AI
agent can read.

### Added

- **Six dashboard blocks**, configured in YAML inside a code block:
  `tiles` for navigation with live folder counts, `stats` for numbers computed
  over a selection, `progress` for bars towards a goal, `today` for the day row
  linking to periodic notes, `countdown` for the days to a date, and `heatmap`
  for a year coloured by a frontmatter number.
- **An `Insert block` command** in the palette: pick a block and a working
  example lands in the note, fitted to your vault rather than to the one the
  example was written in: the folder with the most notes, a number property
  that exists, and a warning when the folder in it holds nothing.
- **Sparklines in `stats`** through `trend: 30d`: the last N days ending today,
  scaled inside that window so the shape of the run is what shows.
- **Diagnostics in the note.** A block that cannot draw says why, with the line
  number, a suggestion for an unknown key, and a warning when a filter had to
  be dropped, rather than showing unfiltered numbers as if they were filtered.
- **Live redraw.** Blocks follow the vault: adding, editing or deleting a note
  updates every block on the page, and a dashboard opened before Obsidian has
  finished indexing corrects itself instead of showing a half-read vault.
- **English and Russian**, following the Obsidian interface language, with
  dates, month names, the first day of the week and plural forms taken from
  Obsidian itself.
- **A reference for AI agents**, generated from the block schema so it cannot
  drift from the code: `SKILL.md` for Claude Code, and a fenced section in
  `AGENTS.md` for everything else, both written only on a button press and
  neither touching anything else in the file.
- **Periodic note folders** read from the Periodic Notes plugin, from the core
  Daily notes plugin, or from this plugin's own settings, in that order of
  precedence.
- **An About section in settings**: report a bug, ask for a feature, open the
  docs. The issue arrives with the plugin and Obsidian versions already in it.

### Notes

- Requires Obsidian 1.13.0, which is where the settings API this plugin uses
  was introduced.
- No Dataview, no JavaScript in your notes, and not one hard-coded colour: the
  blocks take their palette from whatever theme you run.

[Unreleased]: https://github.com/Dimagious/dashsidian/compare/1.1.0...HEAD
[1.1.0]: https://github.com/Dimagious/dashsidian/releases/tag/1.1.0
[1.0.2]: https://github.com/Dimagious/dashsidian/releases/tag/1.0.2
[1.0.1]: https://github.com/Dimagious/dashsidian/releases/tag/1.0.1
[1.0.0]: https://github.com/Dimagious/dashsidian/releases/tag/1.0.0
