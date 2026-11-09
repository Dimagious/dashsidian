/**
 * The day a daily note stands for, for `today` with `date: note` (B-210).
 *
 * A `today` block in a daily note shows that note's day: its date, its week
 * and month, the day before and after. The day is read from the note's name
 * the way `period: note` reads a window (B-129, ADR 0006): the formats in
 * `context.names`, the day first, a tail after a separator allowed. Only a
 * name that stands for one day will do; a weekly note's name is a period,
 * but not a day.
 *
 * Pure module: no Obsidian, no moment. Reading a name in a moment format is
 * the injected `ParseDate` inside `context.names`.
 */

import { parseDateKey } from "./calendar";
import { readPeriodName, type PeriodNames } from "./period-name";
import type { PeriodContext } from "./period";
import { t } from "../i18n";

/**
 * What the note's name gave: its day (local midnight), or why there is
 * none. `template` is set for a note in the template folder whose name is
 * no period (B-190, `core/template-note.ts`): not a mistake, only no day
 * until a note is made from it. `problem` is an error for the block to show.
 */
export type NoteDayReading = { day: Date } | { problem: string } | { template: true };

/** The formats a day's name is read in, each once, in reading order, for an error message. */
export function dayNameFormats(names: PeriodNames): string {
    return [...new Set(names.formats.filter((f) => f.unit === "day").map((f) => f.format))].join(", ");
}

/**
 * The day the note the block sits in stands for. A name that is no period
 * at all is a template hint inside the template folder, as for `period:
 * note`; a name of a week, a month or any other period is an error
 * everywhere, a template named `2026-W40` included, since it is plainly a
 * period and plainly not a day.
 */
export function readNoteDay(context: PeriodContext): NoteDayReading {
    const name = context.noteName ?? "";
    const named = readPeriodName(name, context.names, { tail: true });
    if (named?.unit === "day") return { day: parseDateKey(named.start) };
    if (!named && context.inTemplateFolder === true) return { template: true };
    return {
        problem: t("today.noteNotADay", { name, formats: dayNameFormats(context.names) }),
    };
}

/** The day before and the day after `day`, as local midnights; `Date` carries a month or year over on its own. */
export function neighbourDays(day: Date): { previous: Date; next: Date } {
    const y = day.getFullYear();
    const m = day.getMonth();
    const d = day.getDate();
    return { previous: new Date(y, m, d - 1), next: new Date(y, m, d + 1) };
}
