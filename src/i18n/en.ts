/**
 * English catalog. This is the source of truth: every key lives here first,
 * and `MessageKey` is derived from it, so a typo in a key fails the build.
 *
 * Adding a language: copy this file, translate the values, keep the keys,
 * register it in `index.ts`. Missing keys fall back to English, so a partial
 * translation is a valid translation.
 *
 * Weekday and month names are deliberately absent — they come from Obsidian's
 * own `moment`, which already knows every locale it ships.
 */
export const en = {
    "parse.emptyBlock": "The block is empty.",
    "parse.yamlError": "Could not parse YAML: {message}",
    "parse.unknownKey": "Unknown key \"{key}\", ignored.",
    "parse.unknownKeyGuess": "Unknown key \"{key}\". Did you mean \"{guess}\"?",

    "render.line": "line {line}",

    "bands.hasData": "has data",
    "bands.from": "from {min}",

    "where.noSuchFolder": "Nothing is filed under `{folder}`. The numbers below count nothing. Point `source` at a folder of your own.",
    "where.unreadable":
        "`where: {where}` could not be read and was ignored. The numbers below are unfiltered. Expected something like `year = 2026`, `rating >= 4` or `tags contains books`.",
    "where.conjunction":
        "`where: {where}` holds more than one condition, and only one is supported. The filter was ignored. Narrow with `source` or `tag`, or quote the value if the word is part of it.",

    "tiles.empty": "No tiles to draw. Expected `items:` or a list.",
    "tiles.dateFieldUnused": "{card}: `date_field` has no effect without `period`.",
    "tiles.selectionUnused": "{card}: `tag`, `where`, `period` and `date_field` only narrow `badge: count`.",

    "stats.empty": "No cards to draw. Expected `items:` or a list.",
    "stats.unlabeledCard": "a card with no label",
    "stats.unknownAgg": "{card}: unknown aggregate \"{agg}\". Available: {available}.",
    "stats.unknownAggGuess":
        "{card}: unknown aggregate \"{agg}\". Did you mean \"{guess}\"? Available: {available}.",
    "stats.fieldRequired":
        "{card}: the \"{agg}\" aggregate needs a number. Add `field:` with a frontmatter property.",
    "stats.fieldMissing":
        "{card}: no note in the selection has \"{field}\". Check the name and `source`.",
    "stats.fieldNotNumeric":
        "{card}: \"{field}\" holds text or another value that is not a number or a checkbox. Use `where: \"{field} contains ...\"` with `agg: count` to count it instead.",
    "stats.badPrecision":
        "{card}: `precision` expects a whole number from 0 to {max}, got \"{value}\". Rounding the default way.",

    "progress.empty": "No bars to draw. Expected `items:` or a list.",
    "progress.goalRequired": "{card}: `goal:` needs a number. There is nothing to measure against.",
    "progress.goalNotPositive": "{card}: a goal of {goal} leaves nothing to fill. It must be above zero.",

    "stats.trendNeedsField": "{card}: `trend` needs a `field:` to plot. Counting notes has no shape.",
    "stats.trendInvalid": "{card}: `trend` expects a number of days such as 30d, got \"{value}\".",

    "period.invalid":
        "{card}: `period` expects week, month, year or a rolling window such as 30d, got \"{value}\". Drawn unfiltered.",
    "period.noDatedNotes":
        "{card}: none of the selected notes has a name starting with a date like YYYY-MM-DD. Add `date_field:` if the date lives in a property instead.",
    "period.noDatedNotesField": "{card}: none of the selected notes has a date in \"{field}\".",
    "period.dateFieldUnused":
        "{card}: `date_field` has no effect here. It only steers `period`, `streak`, `latest` and `trend`.",

    "compare.notBoolean": "{card}: `compare` expects true or false, got \"{value}\". Comparison skipped.",
    "compare.needsPeriod": "{card}: `compare` needs `period` set. There is nothing to compare against.",
    "compare.streakUnsupported":
        "{card}: `compare` does not work with `streak`. There is no separate value from the previous period to compare a streak against.",
    "compare.betterUnused": "{card}: `better` has no effect without `compare: true`.",
    "compare.badBetter": "{card}: `better` expects `up` or `down`, got \"{value}\". The delta stays neutral.",
    "compare.vsWeek": "vs the same days last week: {value}",
    "compare.vsMonth": "vs the same days last month: {value}",
    "compare.vsYear": "vs the same days last year: {value}",
    "compare.vsDays.one": "vs the day before: {value}",
    "compare.vsDays.few": "vs the {count} days before: {value}",
    "compare.vsDays.many": "vs the {count} days before: {value}",
    "compare.vsDays.other": "vs the {count} days before: {value}",

    "countdown.empty": "No dates to draw. Expected `items:` or a list.",
    "countdown.dateRequired": "{card}: `date:` is missing. There is nothing to count down to.",
    "countdown.dateInvalid": "{card}: \"{date}\" is not a date. Expected YYYY-MM-DD.",
    "countdown.today": "Today",
    // The count is drawn separately, in large type, so these carry the noun
    // alone and must read naturally under a number. English splits one from the
    // rest; the other slots repeat it so that every language has a key to
    // translate. See tPlural in ./index.ts.
    "countdown.daysLeft.one": "day left",
    "countdown.daysLeft.few": "days left",
    "countdown.daysLeft.many": "days left",
    "countdown.daysLeft.other": "days left",
    "countdown.daysAgo.one": "day ago",
    "countdown.daysAgo.few": "days ago",
    "countdown.daysAgo.many": "days ago",
    "countdown.daysAgo.other": "days ago",

    "today.expectFields": "Expected a set of fields, for example `daily: true`.",
    "today.nothingToShow": "Nothing to show: enable `daily`, `weekly` or `monthly`.",
    "today.notBoolean": "`{key}` expects true or false, got \"{value}\". Reading it as {read}.",
    "today.daily": "Today",
    "today.weekly": "This week",
    "today.monthly": "This month",
    "today.missingNote": "{path}: the note does not exist yet, clicking creates it",

    "heatmap.expectFields": "Expected a set of fields, for example `source:` and `field:`.",
    "heatmap.fieldRequired": "No `field` given. There is no number to colour by.",
    "heatmap.noData":
        "No notes with a resolvable date and a number or a checkbox in \"{field}\". Check `source`, or `date_field` if the date lives in a property.",
    "heatmap.fieldMissing":
        "No note in the selection has \"{field}\". Check the name and `source`.",
    "heatmap.fieldNotNumeric":
        "\"{field}\" holds text or another value that is not a number or a checkbox. Use `where: \"{field} contains ...\"` with `agg: count` in a stats card to count it instead.",
    "heatmap.caption": "{year}, {field}: average {average}, {present} of {total} days",
    "heatmap.captionMarks": "{year}, {field}: {present} of {total} days",
    "heatmap.titleYear": "{title} ({year})",
    "heatmap.cell": "{date}: {field} {value}",
    "heatmap.cellEmpty": "{date}: no data",

    "insert.name": "Insert block",
    "insert.placeholder": "Which block?",
    "block.tiles": "Navigation tiles with folder counts",
    "block.stats": "Number cards over a selection of notes",
    "block.progress": "Bars towards a goal",
    "block.today": "Today's date and the periodic notes",
    "block.countdown": "Days until a date",
    "block.heatmap": "A year of days, coloured by a number",

    "about.heading": "About",
    "about.bug": "Report a bug",
    "about.bugDesc": "Opens GitHub with the versions already filled in.",
    "about.feature": "Suggest a feature",
    "about.featureDesc": "Tell me what you tried to build and could not.",
    "about.docs": "Documentation",
    "about.docsDesc": "Every block, every key, with examples.",
    "about.funding": "Buy me a coffee",
    "about.fundingDesc": "The plugin is free and stays free. This is only if you feel like it.",
    "about.open": "Open",

    "settings.languageHeading": "Language",
    "settings.language": "Plugin language",
    "settings.languageDesc": "What the blocks say. Follows Obsidian unless you pick another one.",
    "settings.languageAuto": "Follow Obsidian",

    "settings.periodicHeading": "Periodic notes",
    "settings.dailyFolder": "Daily notes folder",
    "settings.dailyFolderDesc": "Leave empty to use the Periodic Notes plugin settings when it is installed.",
    "settings.weeklyFolder": "Weekly notes folder",
    "settings.monthlyFolder": "Monthly notes folder",
    "settings.followPeriodic": "Used by the today block. Leave empty to follow Periodic Notes.",

    "settings.startDayHeading": "New day",
    "settings.startDayHour": "New day starts at",
    "settings.startDayHourDesc":
        "What every block calls today: which note the today block links, and where period, compare and trend windows end. Midnight keeps today's behaviour; it never changes which day a note itself falls on.",

    "settings.skillHeading": "AI agent skill",
    "settings.skillName": "Skill file in this vault",
    "settings.skillNotInstalled":
        "Writes {path} so an agent (Claude Code, Cursor) can write these blocks for you.",
    "settings.skillCurrent": "Installed, version {version}. Nothing to do.",
    "settings.skillOutdated": "Installed version {installed}, available {available}.",
    "settings.agentsName": "AGENTS.md in the vault root",
    "settings.agentsNotInstalled":
        "Writes {path} for agents that do not read Claude skills: Cursor, Codex and the rest. Only the fenced section is ours; anything else in the file is left alone.",
    "settings.agentsCurrent": "Written, version {version}. Nothing to do.",
    "settings.agentsOutdated": "Written at version {installed}, available {available}.",
    "settings.agentsUntouched":
        "{path} has a half-written Dashy section and was left as it is. Remove the stray marker and try again.",

    "settings.install": "Install",
    "settings.update": "Update",
    "settings.copyMarkdown": "Copy markdown",
    "settings.copied": "Skill markdown copied.",
    "settings.written": "Skill written to {path}",
    "settings.writeFailed": "Could not write the skill: {message}",
    "settings.copyFailed": "Could not copy: {message}. Use Install instead.",
} as const;

export type MessageKey = keyof typeof en;
export type Catalog = Partial<Record<MessageKey, string>>;
