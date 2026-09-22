# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For this plugin a MAJOR version means one of: a settings key removed or
renamed, a block key removed or renamed, a raised `minAppVersion`, or a
removed public export.

## [Unreleased]

## [1.0.0] — 2026-09-22

The first public release. Six blocks, two languages, and a reference an AI
agent can read.

### Added

- **Six dashboard blocks**, configured in YAML inside a code block:
  `tiles` for navigation with live folder counts, `stats` for numbers computed
  over a selection, `progress` for bars towards a goal, `today` for the day row
  linking to periodic notes, `countdown` for the days to a date, and `heatmap`
  for a year coloured by a frontmatter number.
- **Sparklines in `stats`** through `trend: 30d`, scaled inside their own
  window so the shape of the run is what shows.
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

### Notes

- Requires Obsidian 1.13.0, which is where the settings API this plugin uses
  was introduced.
- No Dataview, no JavaScript in your notes, and not one hard-coded colour: the
  blocks take their palette from whatever theme you run.

[Unreleased]: https://github.com/Dimagious/dashsidian/compare/1.0.0...HEAD
[1.0.0]: https://github.com/Dimagious/dashsidian/releases/tag/1.0.0
