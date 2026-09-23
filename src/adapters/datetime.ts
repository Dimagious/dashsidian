import { moment } from "obsidian";

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

/** Short month names, January first. */
export function monthNamesShort(): string[] {
    return data().monthsShort();
}
