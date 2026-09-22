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
 * Short weekday names, Monday first.
 *
 * moment lists them Sunday first regardless of locale, while the heatmap grid
 * starts its weeks on Monday (see core/calendar.ts), so the list is rotated.
 */
export function weekdayNamesShort(): string[] {
    const names = moment.weekdaysShort();
    return [...names.slice(1), ...names.slice(0, 1)];
}

/** Short month names, January first. */
export function monthNamesShort(): string[] {
    return moment.monthsShort();
}
