/**
 * "Today", by the hour the "New day starts at" setting names.
 *
 * Someone who writes their daily note after midnight still wants Dashy's
 * blocks to treat that moment as yesterday — the forum request this exists
 * for. This changes what the blocks call today, not a note's own date: that
 * still comes from its name or `date_field` (`core/note-date.ts`), untouched
 * by this setting. Pure module: no Obsidian, no DOM, `now` is always passed
 * in rather than read from `new Date()`, so a test can put it anywhere it
 * likes.
 */

/** The setting is a dropdown of these seven hours; midnight is the default. */
export const MIN_START_HOUR = 0;
export const MAX_START_HOUR = 6;

/**
 * Falls back to midnight for anything that is not a whole hour in
 * `[0, 6]`: a stored setting from before this feature existed, a value
 * written by a future version this one does not understand, or plain
 * corruption of `data.json`.
 */
export function normalizeStartHour(value: unknown): number {
    return typeof value === "number"
        && Number.isInteger(value)
        && value >= MIN_START_HOUR
        && value <= MAX_START_HOUR
        ? value
        : 0;
}

/**
 * The effective calendar day, as local midnight of it.
 *
 * Compared by wall-clock hour (`now.getHours()`), never by subtracting
 * `startHour` hours in milliseconds: a millisecond shift crosses a
 * daylight-saving change at the wrong offset and can misjudge which side of
 * the boundary a moment falls on. `getHours()` always reads the hour a clock
 * on the wall would show, DST included.
 *
 * Built from `getFullYear`/`getMonth`/`getDate`, the same way every other
 * date in this codebase is: `toISOString` shifts local midnight back a day
 * east of UTC.
 */
export function effectiveToday(now: Date, startHour: unknown): Date {
    const hour = normalizeStartHour(startHour);
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    // `Date` normalises `d - 1` across a month or year boundary on its own:
    // day 0 of January is 31 December of the previous year.
    return now.getHours() < hour ? new Date(y, m, d - 1) : new Date(y, m, d);
}

/**
 * The next moment the effective day rolls over: the next local `startHour:00`
 * strictly after `now`. Used to arm a single timer that redraws the
 * dashboard when the day changes with no vault activity to trigger it.
 *
 * Built the same calendar-component way as `effectiveToday`, for the same
 * reason: a `now.getTime() + 24h` step would land an hour off on the day a
 * daylight-saving change falls on.
 */
export function nextEffectiveDayBoundary(now: Date, startHour: unknown): Date {
    const hour = normalizeStartHour(startHour);
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const todayBoundary = new Date(y, m, d, hour, 0, 0, 0);
    return todayBoundary.getTime() > now.getTime() ? todayBoundary : new Date(y, m, d + 1, hour, 0, 0, 0);
}

/**
 * Builds the `today()` a `BlockContext` hands to every block.
 *
 * `getStartHour` and `now` are both read fresh on every call, never captured
 * once at construction: the setting can change after the plugin loads
 * (`ui/settings.ts`), and every render needs the actual current moment, not
 * whatever it was when the context was built. A factory rather than inlining
 * `() => effectiveToday(new Date(), settings.startDayHour)` at the call
 * site, so "does this actually read the configured hour, or does it quietly
 * always mean midnight" is something a test can ask directly — that call
 * site (`blocks/context.ts#buildContext`) has nowhere else to hide it.
 */
export function makeToday(getStartHour: () => unknown, now: () => Date = () => new Date()): () => Date {
    return () => effectiveToday(now(), getStartHour());
}
