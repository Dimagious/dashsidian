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
    "parse.unknownKey": "Unknown key \"{key}\" — ignored.",
    "parse.unknownKeyGuess": "Unknown key \"{key}\". Did you mean \"{guess}\"?",

    "render.line": "line {line}",

    "bands.hasData": "has data",
    "bands.from": "from {min}",

    "tiles.empty": "No tiles to draw. Expected `items:` or a list.",

    "stats.empty": "No cards to draw. Expected `items:` or a list.",
    "stats.unlabeledCard": "a card with no label",
    "stats.unknownAgg": "{card}: unknown aggregate \"{agg}\". Available: {available}.",
    "stats.unknownAggGuess":
        "{card}: unknown aggregate \"{agg}\". Did you mean \"{guess}\"? Available: {available}.",
    "stats.fieldRequired":
        "{card}: the \"{agg}\" aggregate needs a number — add `field:` with a frontmatter property.",
    "stats.badPrecision":
        "{card}: `precision` expects a whole number from 0 to {max}, got \"{value}\" — rounding the default way.",

    "progress.empty": "No bars to draw. Expected `items:` or a list.",
    "progress.goalRequired": "{card}: `goal:` needs a number — there is nothing to measure against.",
    "progress.goalNotPositive": "{card}: a goal of {goal} leaves nothing to fill — it must be above zero.",

    "countdown.empty": "No dates to draw. Expected `items:` or a list.",
    "countdown.dateRequired": "{card}: `date:` is missing — there is nothing to count down to.",
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
    "today.notBoolean": "`{key}` expects true or false, got \"{value}\" — reading it as {read}.",
    "today.daily": "Today",
    "today.weekly": "This week",
    "today.monthly": "This month",
    "today.missingNote": "{path} — the note does not exist yet, clicking creates it",

    "heatmap.expectFields": "Expected a set of fields, for example `source:` and `field:`.",
    "heatmap.fieldRequired": "No `field` given — there is no number to colour by.",
    "heatmap.noData":
        "No notes with a date name and a number in \"{field}\". Check `source`.",
    "heatmap.caption": "{year} — {field}: average {average}, {present} of {total} days",
    "heatmap.cell": "{date} — {field} {value}",
    "heatmap.cellEmpty": "{date} — no data",

    "settings.periodicHeading": "Periodic notes",
    "settings.dailyFolder": "Daily notes folder",
    "settings.dailyFolderDesc": "Leave empty to use the Periodic Notes plugin settings when it is installed.",
    "settings.weeklyFolder": "Weekly notes folder",
    "settings.monthlyFolder": "Monthly notes folder",
    "settings.followPeriodic": "Used by the today block. Leave empty to follow Periodic Notes.",
    "settings.skillHeading": "AI agent skill",
    "settings.skillName": "Skill file in this vault",
    "settings.skillNotInstalled":
        "Writes {path} so an agent (Claude Code, Cursor) can write these blocks for you.",
    "settings.skillCurrent": "Installed, version {version}. Nothing to do.",
    "settings.skillOutdated": "Installed version {installed}, available {available}.",
    "settings.install": "Install",
    "settings.update": "Update",
    "settings.copyMarkdown": "Copy markdown",
    "settings.copied": "Skill markdown copied.",
    "settings.written": "Skill written to {path}",
    "settings.writeFailed": "Could not write the skill: {message}",
} as const;

export type MessageKey = keyof typeof en;
export type Catalog = Partial<Record<MessageKey, string>>;
