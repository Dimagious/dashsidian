import { moment } from "obsidian";
import type { LocaleTimeFormats } from "../core/clock";

/**
 * Dates and locale, all in one place.
 *
 * `moment` comes from Obsidian rather than npm: it is already there, already
 * set to the application language, and Periodic Notes writes its formats in
 * the same notation. It never reaches the bundle — esbuild treats `obsidian`
 * as external.
 */

/**
 * What this adapter needs from moment, spelled out.
 *
 * `obsidian` declares `moment` as `typeof import("moment")`, so the types are
 * only as good as moment's own resolution. Where that package is not on the
 * path — the catalogue's reviewer lints in such an environment — the whole
 * import degrades to `any`, and every call through it is reported as an unsafe
 * call, member access and return. One cast at the boundary, which is what an
 * adapter is for, makes the calls typed wherever they are read from.
 */
interface MomentDate {
    format(format: string): string;
    locale(code: string): MomentDate;
}

interface MomentLocaleData {
    firstDayOfWeek(): number;
    weekdaysShort(): string[];
    monthsShort(): string[];
    longDateFormat(key: string): string;
}

interface MomentStatic {
    (date: Date): MomentDate;
    locale(): string;
    localeData(code?: string): MomentLocaleData | null;
}

const m = moment as unknown as MomentStatic;

/**
 * The language the plugin was told to speak, when that is not Obsidian's own.
 *
 * Month and weekday names come from moment, so a chosen language has to reach
 * it too: otherwise the settings say German and the heatmap answers in the
 * app's language, one caption in each.
 */
let override: string | null = null;

export function setDateLocale(code: string | null): void {
    override = code && m.localeData(code) ? code : null;
}

/** moment's data for the chosen language, or the app's when there is none. */
function data(): MomentLocaleData {
    return (override ? m.localeData(override) : null) ?? (m.localeData() as MomentLocaleData);
}

/** A date rendered with a moment format string, e.g. `gggg-[W]ww`. */
export function formatDate(date: Date, format: string): string {
    const at = m(date);
    return (override ? at.locale(override) : at).format(format);
}

/** What language Obsidian speaks, as a locale code: `en`, `ru`, `zh-cn`. */
export function currentLocale(): string {
    return m.locale();
}

/**
 * Short weekday names, Sunday first — moment's own order, whatever the locale.
 * Lining them up with the grid is core/calendar.ts#rotateWeekdays' job.
 */
export function weekdayNamesShort(): string[] {
    return data().weekdaysShort();
}

/** Which day the locale starts its week on: 0 is Sunday, 1 is Monday. */
export function firstDayOfWeek(): number {
    return data().firstDayOfWeek();
}

/**
 * The locale's own time formats, moment's `LT` and `LTS`: `h:mm A` and
 * `h:mm:ss A` in English, `HH:mm` and `HH:mm:ss` in German. Whether the
 * `today` clock counts to 12 or to 24 is read from these (B-151), never
 * assumed.
 */
export function timeFormats(): LocaleTimeFormats {
    const d = data();
    return { short: d.longDateFormat("LT"), long: d.longDateFormat("LTS") };
}

/** Short month names, January first. */
export function monthNamesShort(): string[] {
    return data().monthsShort();
}

/**
 * A short month name plus its year, e.g. "Sep 2025" — for a heatmap `range`
 * grid's month label (B-093) once the window spans more than one calendar
 * year and the bare month name alone would no longer say which one. Goes
 * through `formatDate` like every other rendered date, rather than pasting
 * `monthNamesShort()[month]` next to a bare `year`: the two would drift
 * apart the moment a locale's month-year order or punctuation is not
 * "month, space, year" (moment's own `MMM YYYY` already gets this right
 * for whichever locale is active).
 */
export function monthYearShort(date: Date): string {
    return formatDate(date, "MMM YYYY");
}

/**
 * A full month name plus its year, e.g. "October 2026": the heading of a
 * heatmap drawn as a calendar (B-133, `layout: calendar`). moment's own
 * `MMMM YYYY`, so the locale decides the order and the month's form.
 */
export function monthYearLong(date: Date): string {
    return formatDate(date, "MMMM YYYY");
}

/** The year alone, e.g. "2024": a `bucket: year` chart's x label and tooltip date. */
export function formatYear(date: Date): string {
    return formatDate(date, "YYYY");
}

/**
 * A medium, locale-appropriate date: "Sep 25, 2026" in English, "25 сент.
 * 2026 г." in Russian. Used for a heatmap cell's tooltip (B-092) in place of
 * the bare `YYYY-MM-DD` key it used to show: a reader taps or hovers a cell,
 * not a machine parsing it, so the date should read the way their own
 * calendar app would show it. moment's own "ll" format, not a hand-rolled
 * one, so it already knows the ordering, punctuation and abbreviations that
 * differ from one language to the next.
 */
export function formatDayMedium(date: Date): string {
    return formatDate(date, "ll");
}

/**
 * A short day and month, "27 Sep" in English, "27 сент." in Russian: a
 * `chart`'s x labels for `day` and `week` buckets (ADR 0005), where the
 * year would only eat width the axis does not have.
 */
export function formatDayShort(date: Date): string {
    return formatDate(date, "D MMM");
}

/**
 * `formatDayShort` with the year, "27 Sep 2026": a `chart` x label where the
 * window crosses 1 January, on the first label and the first of each new
 * year, so "5 Oct ... 27 Sep" does not leave the reader guessing which years.
 */
export function formatDayShortYear(date: Date): string {
    return formatDate(date, "D MMM YYYY");
}

/**
 * The medium date with its weekday in front, "Sun Sep 27, 2026" or close
 * to it, as the locale writes it: a `chart` week's tooltip ("Week of ...",
 * ADR 0005), so the locale's first day of the week is visible the moment a
 * reader hovers, rather than assumed.
 */
export function formatDayWithWeekday(date: Date): string {
    return formatDate(date, "ddd ll");
}
