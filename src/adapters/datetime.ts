import { moment } from "obsidian";

/**
 * Dates and locale, all in one place.
 *
 * `moment` comes from Obsidian rather than npm: it is already there, already
 * set to the application language, and Periodic Notes writes its formats in
 * the same notation. It never reaches the bundle — esbuild treats `obsidian`
 * as external.
 */

/** A date rendered with a moment format string, e.g. `gggg-[W]ww`. */
export function formatDate(date: Date, format: string): string {
    return moment(date).format(format);
}

/** What language Obsidian speaks, as a locale code: `en`, `ru`, `zh-cn`. */
export function currentLocale(): string {
    return moment.locale();
}

/**
 * Short weekday names, Sunday first — moment's own order, whatever the locale.
 * Lining them up with the grid is core/calendar.ts#rotateWeekdays' job.
 */
export function weekdayNamesShort(): string[] {
    return moment.weekdaysShort();
}

/** Which day the locale starts its week on: 0 is Sunday, 1 is Monday. */
export function firstDayOfWeek(): number {
    return moment.localeData().firstDayOfWeek();
}

/** Short month names, January first. */
export function monthNamesShort(): string[] {
    return moment.monthsShort();
}
