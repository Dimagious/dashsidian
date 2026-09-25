# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For this plugin a MAJOR version means one of: a settings key removed or
renamed, a block key removed or renamed, a raised `minAppVersion`, or a
removed public export.

## [Unreleased]

## [1.3.0] - 2026-09-25

### Added

- **`tiles` can count a selection, not the whole folder.** `badge: count`
  takes the same `tag`, `where`, `period` and `date_field` keys `stats`
  already has, narrowing the count the same way: a mail inbox tile that only
  counts this month's messages, a calendar tile that only counts today's
  events, both without an edit when the month turns. The tile still opens
  `path` unchanged. Asked for in #8.
- **A new day can start after midnight.** The setting **New day starts at**
  (00:00 to 06:00, midnight by default) decides what "today" means for every
  block, not which day a note itself falls on: a note's own date is still
  its name or `date_field`. `today` shows that day and links to its daily,
  weekly and monthly notes; the heatmap's grid ends there; `stats` and
  `progress` measure `period` and `compare` windows against it; `trend` ends
  there; and `countdown` counts days left or ago from it. Useful for logging
  a day's entry after midnight and still wanting `period`, `compare` and the
  heatmap to treat it as yesterday's, for the forum's night owls. Changing
  the setting redraws every open dashboard, and a dashboard left open past
  the boundary rolls over on its own, with no vault change needed to
  trigger it.
- **A note's date no longer has to be its whole name.** `2024-01-01 Monday`,
  `2024-01-01_standup` and `2024-01-01.draft` now count as dated, the single
  most common reason a daily-note query breaks according to the forum: the
  name only has to start with `YYYY-MM-DD`, with anything but another digit
  right after. `period`, `streak`, `latest`, `trend` and the heatmap all
  read a note's date through the one shared rule, so the fix applies
  everywhere at once. `date_field` now also steers `streak`, `latest` and
  `trend`, not only `period`, and the heatmap gains its own `date_field` key
  to match.
- **Two or more notes on the same day are one day, not two,** wherever days
  are counted: `streak` treats them as a single link in the run, `trend`
  sums them into one bar, and the heatmap paints one cell whose value is
  their sum (steps logged in two notes add up) and whose tooltip shows that
  total. A ticked or numeric note always outweighs a `false` one landing on
  the same day, and the cell links to the first of its contributing notes by
  path, deterministically. The heatmap's caption average was already a mean
  over days, not over notes; what changes is what a day's value is: the sum
  of its notes rather than whichever one happened to be read last, so the
  average now reflects the same totals `streak` and `trend` agree on.
  `latest` keeps its usual "newest date wins" rule, with a tie on the same
  date broken by path.
- **A project site.** `dimagious.github.io/dashsidian` shows the plugin as a
  vault: a file tree for navigation, one note per block, and every config on
  it real enough to paste into your own vault. It publishes itself from
  `site/` on every tagged release, so its version and requirements are
  always the one that actually shipped, and it carries no code of its own
  into the plugin bundle.

### Fixed

- **A note named for an impossible date, like `2026-02-30`, stops silently
  counting.** The name shape alone used to be enough; now, as with
  `date_field`, the calendar date itself has to be real.
- **`date_field` no longer accepts garbage stuck onto a valid date.** A
  string like `2026-03-02garbage` used to be trimmed down to its first ten
  characters and read as `2026-03-02`; the character right after the date
  now has to be `T` or a space, the same as a datetime property actually
  writes, or the value is not a date at all.
- **A heatmap keeps the reader's scroll position across a redraw.** Every
  vault event redraws the block, and until now that meant a year the reader
  had scrolled by hand jumped straight back to the end. A grid the reader
  had settled somewhere in the middle now reopens there instead; one they
  had scrolled to the end, or never touched at all, still opens at the end
  as before. The position also survives a redraw that lands while the note
  is not the active tab, where Obsidian lays the pane out with no size at
  all: the scroller now keeps its own last known position on itself as it
  changes, rather than asking a hidden pane what it currently measures.
- **`streak` over a field no selected note actually carries no longer shows
  a plausible zero.** A typo in `field:` used to read exactly like an honest
  streak of zero; now, with `agg: streak` and a `field:` set, it shows a
  dash and a warning naming the field, the same as `sum`, `avg`, `min`,
  `max` and `latest` already did. This also covers an empty selection, such
  as the only note landing outside a `period` window: `streak` with a
  `field:` is a field aggregate like `sum`, and now reads a dash there too,
  instead of the `0` it used to be alone in showing. A field that exists but
  only as `false` checkboxes is unaffected: a streak of zero there stays a
  plain zero, no warning. `streak` with no `field:` at all is also
  unaffected: it counts every selected note's own date, and an empty
  selection there is still a plain, honest `0`, the same as `count`.
- **`stats` and `progress` now warn when a card's `field` is missing or is
  text, not only when the card is empty.** Any aggregate that reads a
  `field` shows a dash and a warning as soon as none of the selected notes
  (before `period` narrows them) has a usable value in it. A field simply
  absent from the current `period` window, while present elsewhere in the
  selection, is unaffected and stays a plain, unwarned dash or zero.
- **The heatmap's "no data" error now says whether the field is missing or
  holds text.** "No notes with a resolvable date and a number or a checkbox
  in <field>" pointed at `source` even when `source` was correct and the
  field simply held text, like Garmin's `running: "10 km · 51min"`. The
  block now tells a field nobody wrote apart from one that is real but not
  numeric, and the second message names `where: "field contains ..."` with
  `agg: count` on a stats card as the way to count it instead.
- **A note dated next year no longer draws an empty grid above the real
  data.** The heatmap never draws a year later than today's; a future-dated
  note still counts nowhere on the grid, same as a future day within the
  current year already did. If every dated note turns out to be in the
  future, the current year is drawn anyway, empty, rather than nothing at
  all.
- **The agent skill says what a live test caught agents getting wrong.** A
  six-agent test against a real vault found the skill's wording letting `streak` read as a currently
  running streak, `period: week` reading as always starting Monday, and a
  blanket "shows a dash rather than a zero" contradicting `count`'s own
  honest `0`. `streak`'s notes now say plainly that it is the longest run on
  record, not a current one, and the schema's own `streak` example is
  relabelled "Best streak" rather than "Days in a row". `period` now says a
  week starts on the first day of Obsidian's interface language. The empty
  rule is now exact: `count` reads `0`, every other aggregate and `streak`
  with a `field` reads a dash. `countdown` now says a date does not repeat
  every year. README's matching paragraph had the same "dash rather than a
  zero" contradiction and is fixed the same way.

## [1.2.0] - 2026-09-24

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
- **A heatmap that scrolls sideways says so, and actually opens where the
  data is.** A year too wide for its note now fades whichever edge still has
  months to scroll to: the left edge once you have scrolled past the start,
  the right edge while there is more ahead, both in the middle, neither once
  the year fits. Before this, a narrow note simply cut the grid off with no
  sign there was more, and the visible third of the year read as the whole
  thing. Opening scrolled to the most recent day, added in 1.1.0, turns out
  never to have actually worked: the grid is built before it is attached to
  the note, so that scroll always landed against a width of zero and stayed
  at January. It opens at the end now.

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
