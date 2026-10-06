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
    "parse.unknownKeyHint": "Unknown key \"{key}\". In this block it is called \"{hint}\".",

    "render.line": "line {line}",

    "bands.hasData": "has data",
    "bands.from": "from {min}",

    "duration.hours": "{value}h",
    "duration.minutes": "{value}m",
    "duration.seconds": "{value}s",

    "where.noSuchFolder": "Nothing is filed under `{folder}`. The numbers below count nothing. Point `source` at a folder of your own.",
    "where.unreadable":
        "`where: {where}` could not be read and was ignored. The numbers below are unfiltered. Expected something like `year = 2026`, `rating >= 4` or `tags contains books`.",
    "where.conjunction":
        "`where: {where}` uses `or`, which is not supported. The filter was ignored and the numbers below are unfiltered. To require every condition, join them with `and` or list them, like `[year = 2026, rating >= 4]`; quote the value if the word is part of it.",
    "where.badCondition":
        "`{condition}` in `where` could not be read, so the whole filter was ignored. The numbers below are unfiltered. Each condition looks like `year = 2026`, `rating >= 4` or `tags contains books`.",
    "where.badItem":
        "`where` lists `{value}`, which is not a condition, so the whole filter was ignored. The numbers below are unfiltered. Each item is one condition like `year = 2026`.",
    "where.emptyList":
        "`where` is an empty list, so the filter was ignored and the numbers below are unfiltered. List conditions like `[year = 2026, rating >= 4]`, or remove the key.",
    "where.sourceNumber":
        "`source` must be a folder name in text, got `{value}`, so it was ignored and the whole vault is read. Put the folder name in quotes, as written: `source: \"2024\"`.",
    "where.sourceNotText":
        "`source` must be one folder name in text, got `{value}`, so it was ignored and the whole vault is read. Name one folder, like `source: Journal`.",
    "where.tagNumber":
        "`tag` must be a tag name in text, got `{value}`, so it was ignored and the tag filter is dropped. Put the tag name in quotes, as written: `tag: \"2024\"`.",
    "where.tagNotText":
        "`tag` must be one tag name in text, got `{value}`, so it was ignored and the tag filter is dropped. Name one tag, like `tag: book`.",

    "inherit.rootPeriodInvalid":
        "`period` at the block root expects week, month, year, a rolling window such as 30d, note, a period such as 2026-W40, or from and to dates, got \"{value}\". Everything that inherits it is drawn unfiltered.",
    "inherit.rootDateFieldUndated":
        "`date_field` at the block root: none of the notes selected for {cards} has a date in \"{field}\".",
    "inherit.blankSourceRoot":
        "`source` at the block root is empty, so the whole vault is read. Name a folder, or remove the key if the whole vault is meant.",
    "inherit.blankTagRoot":
        "`tag` at the block root is empty, so no tag filter applies. Name a tag, or remove the key if no tag filter is meant.",
    "inherit.blankSource":
        "{card}: `source` is empty, so it reads the whole vault instead of the folder at the block root. Remove the key to inherit that folder.",
    "inherit.blankTag":
        "{card}: `tag` is empty, so it has no tag filter instead of the tag at the block root. Remove the key to inherit that tag.",
    "inherit.blankSourceNoRoot":
        "{card}: `source` is empty, so it reads the whole vault. Name a folder, or remove the key if the whole vault is meant.",
    "inherit.blankTagNoRoot":
        "{card}: `tag` is empty, so no tag filter applies. Name a tag, or remove the key if no tag filter is meant.",

    "tiles.empty": "No tiles to draw. Expected `items:` or a list.",
    "tiles.dateFieldUnused": "{card}: `date_field` has no effect without `period`.",
    "tiles.dateFormatUnused": "{card}: `date_format` has no effect without `period`.",
    "tiles.selectionUnused": "{card}: `tag`, `where`, `period`, `date_field` and `date_format` only apply to `badge: count`.",
    "tiles.imageMissing": "{card}: image \"{path}\" was not found.",
    "tiles.imageUnsupported":
        "{card}: `image` expects a vault path, a `[[wikilink]]`, or an `https://` URL, got \"{value}\".",
    "tiles.pathNumber":
        "{card}: `path` must be a note or folder name in text, got `{value}`, so it was ignored: the tile links nowhere and a `badge: count` on it is not drawn. Put the name in quotes, as written: `path: \"2024\"`.",
    "tiles.pathNotText":
        "{card}: `path` must be one note or folder name in text, got `{value}`, so it was ignored: the tile links nowhere and a `badge: count` on it is not drawn. Name one note or folder, like `path: Journal`.",

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
        "{card}: \"{field}\" holds text or another value that is not a number, a duration like `7h 30m` or a checkbox. Use `where: \"{field} contains ...\"` with `agg: count` to count it instead.",
    "stats.badPrecision":
        "{card}: `precision` expects a whole number from 0 to {max}, got \"{value}\". Rounding the default way.",
    "stats.streakKeysIgnored":
        "{card}: `at_least`, `at_most`, `days` and `skip_field` only apply to `agg: streak` and `agg: current_streak`, ignored.",
    "stats.streakThresholdNeedsField":
        "{card}: `at_least` and `at_most` need a `field:` to sum against. Ignored.",
    "stats.streakThresholdInvalid": "{card}: `{key}` expects a number or a duration like `7h 30m`, got \"{value}\". Ignored.",
    "stats.streakThresholdImpossible":
        "{card}: `at_least` is above `at_most`, so no day can satisfy both. The streak is 0.",
    "stats.streakDaysInvalid": "{card}: `days` expects `all` or `weekdays`, got \"{value}\". Using `all`.",
    "stats.skipFieldInvalid": "{card}: `skip_field` expects a property name, got \"{value}\". Ignored.",
    "stats.durationMixed": "{card}: \"{field}\" mixes durations (\"{durationNote}\") and plain numbers (\"{plainNote}\"). All of them are counted as minutes and shown as a plain number.",
    "stats.durationUnitIgnored": "{card}: `unit: {unit}` is ignored. \"{field}\" holds durations, which already carry their own units.",
    "stats.durationThresholdOnPlain": "{card}: `{key}: {value}` is a duration, but \"{field}\" holds plain numbers. It is applied as minutes.",
    "stats.layoutInvalid": "`layout` expects cards or inline, got \"{value}\". Drawing cards.",
    "stats.inlineColumnsIgnored": "`columns` has no effect with `layout: inline`, which draws one line.",
    "stats.inlineTrendHidden": "`trend` is not drawn with `layout: inline`: {cards}. Use `layout: cards` to see it.",
    "stats.inlineSubHidden": "`sub` is not shown with `layout: inline`: {cards}. Use `layout: cards` to see it.",

    "progress.empty": "No bars to draw. Expected `items:` or a list.",
    "progress.goalRequired": "{card}: `goal:` needs a number or a duration like `7h 30m`. There is nothing to measure against.",
    "progress.goalNotPositive": "{card}: a goal of {goal} leaves nothing to fill. It must be above zero.",
    "progress.goalDurationOnCount": "{card}: `goal: {value}` is a duration, but `agg: {agg}` counts days or notes, not time. It is applied as minutes.",

    "stats.trendNeedsField": "{card}: `trend` needs a `field:` to plot. Counting notes has no shape.",
    "stats.trendInvalid": "{card}: `trend` expects a number of days such as 30d, got \"{value}\".",

    "dateFormat.invalid": "`date_format` expects a date format such as DD.MM.YYYY, got \"{value}\". Ignored.",
    "dateFormat.notADay":
        "`date_format: {format}` has no year, month and day in it, so it cannot name a day. Ignored. Write it like DD.MM.YYYY.",
    "dateFormat.unmatched":
        "`date_format: {format}` fits none of the selected notes: \"{example}\", for one, is not written that way.",

    "period.invalid":
        "{card}: `period` expects week, month, year, a rolling window such as 30d, note, a period such as 2026-W40, or from and to dates, got \"{value}\". Drawn unfiltered.",
    "period.noDatedNotes":
        "{card}: none of the selected notes has a name starting with a date like YYYY-MM-DD. Set `date_format:` if the names write it another way, like DD.MM.YYYY, or add `date_field:` if the date lives in a property instead.",
    "period.noDatedNotesField": "{card}: none of the selected notes has a date in \"{field}\".",
    "period.dateFieldUnused":
        "{card}: `date_field` has no effect here. It only steers `period`, `streak`, `current_streak`, `latest` and `trend`.",
    "period.noteNotAPeriod": "`{key}: note` needs a note named like a day, week, month, quarter or year, and this note is \"{name}\". Name it in one of these formats: {formats}.",
    "period.boundsInvalid": "`{key}` as a map takes `from` and `to`, each a date like 2026-09-01, got \"{value}\".",
    "period.boundsNoFrom": "`{key}` has `to` but no `from`. A window needs a start: add `from:` with a date like 2026-09-01.",
    "period.boundsOrder": "`{key}` starts after it ends: `from: {from}` is later than `to: {to}`. Swap them.",
    "period.atCard": "{card}: {message}",
    "period.noteFuture": "This window starts on {date}, so there is nothing to count yet.",
    "period.windowSpan": "{from} to {to}",

    "compare.notBoolean": "{card}: `compare` expects true, false or usual, got \"{value}\". Comparison skipped.",
    "compare.needsPeriod": "{card}: `compare` needs `period` set. There is nothing to compare against.",
    "compare.streakUnsupported":
        "{card}: `compare` does not work with `streak` or `current_streak`. There is no separate value from the previous period to compare a streak against.",
    "compare.betterUnused": "{card}: `better` has no effect without `compare: true`.",
    "compare.badBetter": "{card}: `better` expects `up` or `down`, got \"{value}\". The delta stays neutral.",
    "compare.vsWeek": "vs the same days last week: {value}",
    "compare.vsMonth": "vs the same days last month: {value}",
    "compare.vsYear": "vs the same days last year: {value}",
    "compare.vsQuarter": "vs the same days last quarter: {value}",
    "compare.vsPreviousDay": "vs the day before: {value}",
    "compare.vsPreviousWeek": "vs the week before: {value}",
    "compare.vsPreviousMonth": "vs the month before: {value}",
    "compare.vsPreviousQuarter": "vs the quarter before: {value}",
    "compare.vsPreviousYear": "vs the year before: {value}",
    "compare.vsDays.one": "vs the day before: {value}",
    "compare.vsDays.few": "vs the {count} days before: {value}",
    "compare.vsDays.many": "vs the {count} days before: {value}",
    "compare.vsDays.other": "vs the {count} days before: {value}",
    "compare.usualNeedsAvg": "{card}: `compare: usual` works only with `agg: avg`. The usual level is an average, so no delta is drawn.",
    "compare.vsUsual": "vs usual: {value}",
    "compare.noHistory": "no history before this period",

    "countdown.empty": "No dates to draw. Expected `items:` or a list.",
    "countdown.dateRequired": "{card}: neither `date:` nor `field:` is set. There is nothing to count down to.",
    "countdown.dateInvalid": "{card}: \"{date}\" is not a date. Expected YYYY-MM-DD.",
    "countdown.dateAndField": "{card}: both `date:` and `field:` are set. Keep one of them: a date written here, or a property read from a note.",
    "countdown.fieldInvalid": "{card}: `field` expects a property name, got \"{value}\".",
    "countdown.fieldMissing": "{card}: no note in the selection has \"{field}\" filled in. Check the name, `source`, `tag` and `where`.",
    "countdown.fieldNotDate": "{card}: \"{field}\" in \"{note}\" is \"{value}\", not a date. Expected YYYY-MM-DD, or another format named with `date_format:` next to `items:`.",
    "countdown.repeatInvalid": "{card}: `repeat` expects `yearly`, got \"{value}\".",
    "countdown.selectionUnused": "{card}: `source`, `tag` and `where` only choose the note `field` is read from. With `date:` they are ignored.",
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
    // The anniversary a `repeat: yearly` card lands on, under its date: the
    // number is drawn apart, so this is the noun alone. "years" rather than
    // "turns": it reads right under a birthday and a wedding date alike.
    "countdown.years.one": "year",
    "countdown.years.few": "years",
    "countdown.years.many": "years",
    "countdown.years.other": "years",

    "today.expectFields": "Expected a set of fields, for example `daily: true`.",
    "today.nothingToShow": "Nothing to show: enable `daily`, `weekly` or `monthly`.",
    "today.notBoolean": "`{key}` expects true or false, got \"{value}\". Reading it as {read}.",
    "today.badClock": "`clock` expects true, false, minutes or seconds, got \"{value}\". The clock is not shown.",
    "today.daily": "Today",
    "today.weekly": "This week",
    "today.monthly": "This month",
    "today.missingNote": "{path}: the note does not exist yet, clicking creates it",

    "heatmap.expectFields": "Expected a set of fields, for example `source:` and `field:`.",
    "heatmap.fieldRequired": "No `field` given. There is no number to colour by.",
    "heatmap.noData":
        "No notes with a resolvable date and a number, a duration like `7h 30m` or a checkbox in \"{field}\". Check `source`, `date_format` if the names write dates another way, like DD.MM.YYYY, or `date_field` if the date lives in a property.",
    "heatmap.fieldMissing":
        "No note in the selection has \"{field}\". Check the name and `source`.",
    "heatmap.fieldNotNumeric":
        "\"{field}\" holds text or another value that is not a number, a duration like `7h 30m` or a checkbox. Use `where: \"{field} contains ...\"` with `agg: count` in a stats card to count it instead.",
    "heatmap.fieldInvalid": "`field` expects a property name or a list of them, got \"{value}\".",
    "heatmap.fieldListEmpty": "`field` is an empty list. Add at least one property name.",
    "heatmap.fieldListInvalid": "`field` list items must be plain property names, got \"{value}\".",
    "heatmap.perDayInvalid": "`per_day` expects sum, avg or max, got \"{value}\". Using sum.",
    "heatmap.skipFieldInvalid": "`skip_field` expects a property name, got \"{value}\". Ignored.",
    "heatmap.fieldUnused":
        "\"{field}\" never contributed a value here. Check the name, or that it actually holds a number, a duration like `7h 30m` or a checkbox.",
    "heatmap.layersAndField": "`layers` and `field` are both set. Use one or the other: `layers` for several colours, `field` for one.",
    "heatmap.layersColorIgnored": "`color` is ignored: each entry in `layers` carries its own colour instead.",
    "heatmap.layersInvalid": "`layers` expects a list of maps, got \"{value}\".",
    "heatmap.layersEmpty": "`layers` is an empty list. Add at least one layer.",
    "heatmap.layerNotMap": "Layer {position} must be a map with a `field`, got \"{value}\".",
    "heatmap.layerLabelInvalid": "Layer {position}: `label` expects a name, got \"{value}\".",
    "heatmap.layerAt": "Layer {position}: {message}",
    "heatmap.pickInvalid": "`pick` expects first or max, got \"{value}\". Using first.",
    "heatmap.pickWithoutLayers": "`pick` is ignored: it only chooses between `layers`, and this block has a single `field`.",
    "heatmap.rangeInvalid":
        "`range` expects week, month, year, a rolling window such as 30d, note, a period such as 2026-W40, or from and to dates, got \"{value}\". Drawing a grid per year instead.",
    "heatmap.layoutInvalid": "`layout` expects grid or calendar, got \"{value}\". Using grid.",
    "heatmap.calendarNeedsRange": "`layout: calendar` needs a month or a week: `range: month`, `range: week`, or one month or week such as `range: 2026-10` or `range: note` in a weekly note. Drawing the grid instead.",
    "heatmap.calendarBandsIgnored": "`bands` is ignored with `layout: calendar`: a day shows dots, not a shade.",
    "heatmap.calendarSpan": "{from} to {to}",
    "heatmap.caption": "{year}, {field}: average {average}, {present} of {total} days",
    "heatmap.captionMarks": "{year}, {field}: {present} of {total} days",
    "heatmap.captionRange": "{field}: average {average}, {present} of {total} days",
    "heatmap.captionRangeMarks": "{field}: {present} of {total} days",
    "heatmap.titleYear": "{title} ({year})",
    "heatmap.cell": "{date}: {field} {value}",
    "heatmap.cellLayers": "{date}: {parts}",
    "heatmap.cellPart": "{label} {value}",
    "heatmap.cellWithNote": "{cell} ({note})",
    // The count is merged into one sentence rather than drawn apart, unlike
    // `countdown.daysLeft`: this text lives inside a `title` attribute and a
    // single status line, neither of which can hold a separate large number.
    // The "one" form is never actually reached (a single note names itself
    // instead, see heatmap.ts), kept filled for the languages that need it.
    "heatmap.notesCount.one": "{count} note",
    "heatmap.notesCount.few": "{count} notes",
    "heatmap.notesCount.many": "{count} notes",
    "heatmap.notesCount.other": "{count} notes",
    "heatmap.cellEmpty": "{date}: no data",
    "heatmap.cellSkipped": "{cell}, day off",
    "heatmap.cellEmptySkipped": "{date}: day off",
    "heatmap.cellToday": "{cell}, today",
    "heatmap.legendSkipped": "Day off",
    "heatmap.durationMixed": "\"{field}\" mixes durations (\"{durationNote}\") and plain numbers (\"{plainNote}\"). All of them are counted as minutes and shown as plain numbers.",
    "heatmap.checkboxListNumber": "\"{field}\" holds a number in \"{note}\", so the checkboxes in this list are not counted per day: a day with only ticks paints at full colour.",
    "heatmap.durationThresholdOnPlain": "`bands` threshold \"{value}\" is a duration, but \"{field}\" holds plain numbers. It is applied as minutes.",

    "chart.expectFields": "Expected a set of fields, for example `source:` and `field:`.",
    "chart.fieldRequired": "No `field` or `series` given. There is no number to plot. Add `field:`, or `agg: count` to count notes.",
    "chart.fieldInvalid": "`field` expects a property name, got \"{value}\".",
    "chart.seriesAndField": "`series` and `field` are both set. Use one: `field` for one line, `series` for several.",
    "chart.fieldListAtRoot": "`field` takes one property here. Use `series:` for several lines, or `series: [{field: [a, b]}]` to fold them into one.",
    "chart.seriesInvalid": "`series` expects a list of maps, got \"{value}\".",
    "chart.seriesEmpty": "`series` is an empty list. Add at least one series.",
    "chart.seriesTooMany": "`series` has {count} entries, and at most {max} fit one chart. Split them into two blocks.",
    "chart.seriesNotMap": "Series {position} must be a map with a `field`, got \"{value}\".",
    "chart.seriesAt": "Series {position}: {message}",
    "chart.seriesFieldRequired": "No `field` given. There is no number to plot.",
    "chart.labelInvalid": "`label` expects a name, got \"{value}\".",
    "chart.labelIgnored": "`label` is ignored: each entry in `series` carries its own label instead.",
    "chart.colorIgnored": "`color` is ignored: each entry in `series` carries its own colour instead.",
    "chart.typeInvalid": "`type` expects line or bar, got \"{value}\". Drawing a line.",
    "chart.bucketInvalid": "`bucket` expects day, week, month or year, got \"{value}\". Using day.",
    "chart.aggInvalid": "Unknown aggregate \"{value}\". Available: {available}.",
    "chart.aggInvalidGuess": "Unknown aggregate \"{value}\". Did you mean \"{guess}\"? Available: {available}.",
    "chart.countIgnoresField": "`agg: count` counts dated notes and reads no `field`. The field is ignored.",
    "chart.countLabel": "notes",
    "chart.rangeInvalid": "`range` expects week, month, year, a rolling window such as 30d, note, a period such as 2026-W40, or from and to dates, got \"{value}\". Using the default for the bucket.",
    "chart.tooManyBuckets": "The window holds more than {max} buckets, so only the most recent {max} are drawn. Try `bucket: {next}`.",
    "chart.rangeShorterThanBucket": "The window is no longer than one `bucket`, so there is no trend to see. Widen `range` or pick a smaller `bucket`.",
    "chart.goalInvalid": "`goal` expects a number or a duration like `7h 30m`, got \"{value}\". Ignored.",
    "chart.goalDurationOnPlain": "`goal: {value}` is a duration, but the chart holds plain numbers. It is applied as minutes.",
    "chart.unitInvalid": "`unit` expects text, got \"{value}\". Ignored.",
    "chart.badPrecision": "`precision` expects a whole number from 0 to {max}, got \"{value}\". Rounding the default way.",
    "chart.durationUnitIgnored": "`unit: {unit}` is ignored for \"{field}\", which holds durations that already carry their own units.",
    "chart.durationMixed": "\"{field}\" mixes durations (\"{durationNote}\") and plain numbers (\"{plainNote}\"). All of them are counted as minutes and shown as plain numbers.",
    "chart.fieldMissing": "No note in the selection has \"{field}\". Check the name and `source`.",
    "chart.fieldNotNumeric": "\"{field}\" holds text or another value that is not a number, a duration like `7h 30m` or a checkbox, so there is nothing to plot.",
    "chart.noData": "\"{field}\" holds numbers only on notes without a date. Name daily notes YYYY-MM-DD, set `date_format:` if they are named another way, like DD.MM.YYYY, or add `date_field:` if the date lives in a property.",
    "chart.fieldUnused": "\"{field}\" never contributed a value here. Check the name, or that it actually holds a number, a duration like `7h 30m` or a checkbox.",
    "chart.noDatedNotes": "None of the selected notes has a name starting with a date like YYYY-MM-DD. Set `date_format:` if the names write it another way, like DD.MM.YYYY, or add `date_field:` if the date lives in a property instead.",
    "chart.noDatedNotesField": "None of the selected notes has a date in \"{field}\".",
    "chart.caption": "{label}: {agg} {per}, {span}",
    "chart.captionMixed": "{label}: {per}, {span}",
    "chart.aggSum": "sum",
    "chart.aggAvg": "average",
    "chart.aggMin": "minimum",
    "chart.aggMax": "maximum",
    "chart.aggCount": "count",
    "chart.perDay": "per day",
    "chart.perWeek": "per week",
    "chart.perMonth": "per month",
    "chart.perYear": "per year",
    "chart.days.one": "last {count} day",
    "chart.days.few": "last {count} days",
    "chart.days.many": "last {count} days",
    "chart.days.other": "last {count} days",
    "chart.weeks.one": "last {count} week",
    "chart.weeks.few": "last {count} weeks",
    "chart.weeks.many": "last {count} weeks",
    "chart.weeks.other": "last {count} weeks",
    "chart.months.one": "last {count} month",
    "chart.months.few": "last {count} months",
    "chart.months.many": "last {count} months",
    "chart.months.other": "last {count} months",
    "chart.years.one": "last {count} year",
    "chart.years.few": "last {count} years",
    "chart.years.many": "last {count} years",
    "chart.years.other": "last {count} years",
    "chart.notesCount.one": "{count} note",
    "chart.notesCount.few": "{count} notes",
    "chart.notesCount.many": "{count} notes",
    "chart.notesCount.other": "{count} notes",
    "chart.point": "{date}: {series} {value}",
    "chart.pointParts": "{date}: {parts}",
    "chart.pointPart": "{label} {value}",
    "chart.pointNoData": "{date}: no data",
    "chart.pointWithNote": "{point} ({note})",
    "chart.soFar": "{point}, so far",
    "chart.weekOf": "Week of {date}",
    "chart.goalLabel": "goal {value}",
    "chart.emptyRange": "No data in the {span}",
    "chart.emptyWindow": "No data for {window}",
    "chart.kindLine": "Line chart",
    "chart.kindBar": "Bar chart",
    "chart.summary": "{kind}: {series}, {span}",
    "chart.valueWithUnit": "{value} {unit}",

    "insert.name": "Insert block",
    "insert.placeholder": "Which block?",
    "block.tiles": "Navigation tiles with folder counts",
    "block.stats": "Number cards over a selection of notes",
    "block.progress": "Bars towards a goal",
    "block.today": "Today's date and the periodic notes",
    "block.countdown": "Days until a date",
    "block.heatmap": "A year of days, coloured by a number",
    "block.chart": "Lines or bars of a number over days, weeks or months",

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
