/**
 * The live clock of the `today` block (B-151): what the `clock` key means,
 * which time format to draw it in, and a ticker that keeps it on time.
 *
 * Pure module: no Obsidian import, no DOM. The locale's time formats, the
 * clock and the timer functions are all passed in, so a test can drive a
 * whole hour of ticks with fake timers and a fake clock.
 */

import { describeValue, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

/** How fine the clock reads: `HH:mm` or `HH:mm:ss`. */
export type ClockPrecision = "minutes" | "seconds";

export interface ClockOutcome {
    /** null: no clock */
    clock: ClockPrecision | null;
    diagnostics: Diagnostic[];
}

/**
 * Reads the `clock` key. `true` and `minutes` draw hours and minutes,
 * `seconds` adds the seconds, absent or `false` draws no clock. Anything
 * else is a warning and no clock: the rest of the block is still worth
 * drawing. The keywords stay English, like every other config value.
 */
export function readClock(value: unknown): ClockOutcome {
    if (value === undefined || value === false) return { clock: null, diagnostics: [] };
    if (value === true) return { clock: "minutes", diagnostics: [] };
    if (typeof value === "string") {
        const word = value.trim().toLowerCase();
        if (word === "minutes" || word === "seconds") return { clock: word, diagnostics: [] };
    }
    return {
        clock: null,
        diagnostics: [{ level: "warning", message: t("today.badClock", { value: describeValue(value) }) }],
    };
}

/** The locale's own time formats, moment's `LT` and `LTS`. */
export interface LocaleTimeFormats {
    /** hours and minutes: `h:mm A` in English, `HH:mm` in German */
    short: string;
    /** the same with seconds: `h:mm:ss A`, `HH:mm:ss` */
    long: string;
}

/**
 * Whether a moment format counts hours on a 12-hour dial. `h` and `hh` are
 * the 12-hour tokens; `H`, `HH` and `k` are 24-hour. Text in square brackets
 * is a literal, not a token, so it is dropped before looking.
 */
export function usesTwelveHour(format: string): boolean {
    return /h/.test(format.replace(/\[[^\]]*\]/g, ""));
}

/**
 * The moment format to draw the clock in.
 *
 * A 24-hour locale keeps its own format with the hour zero-padded: `H:mm`
 * (Russian, Spanish) becomes `HH:mm`, so a large clock does not grow by a
 * digit at ten in the morning, while `HH.mm` (Finnish, Indonesian) keeps its
 * dot. A 12-hour locale keeps its own format as is, because only the locale
 * knows where the AM/PM marker goes and how it is written (`h:mm A` in
 * English, `A h:mm` in Korean).
 */
export function clockFormat(precision: ClockPrecision, locale: LocaleTimeFormats): string {
    const format = precision === "seconds" ? locale.long : locale.short;
    if (usesTwelveHour(locale.short)) return format;
    return padHour(format);
}

/** `H` → `HH` and `k` → `kk` outside `[...]` literals; doubled tokens stay. */
function padHour(format: string): string {
    return format
        .split(/(\[[^\]]*\])/)
        .map((part) => part.startsWith("[") ? part : part.replace(/(^|[^Hk])([Hk])(?![Hk])/g, "$1$2$2"))
        .join("");
}

const PERIOD_MS: Record<ClockPrecision, number> = {
    minutes: 60_000,
    seconds: 1_000,
};

/**
 * How late an interval tick may land past its boundary before the ticker
 * lines itself up again. An interval keeps its phase, not the wall clock's:
 * after the computer sleeps, or a timer fires early, the ticks would sit in
 * the middle of each minute and the clock would show the last minute for up
 * to a minute more.
 */
export const DRIFT_TOLERANCE_MS = 250;

/** Milliseconds from `now` to the next whole minute or second. Never 0. */
export function msToNextTick(now: Date, precision: ClockPrecision): number {
    const into = precision === "seconds"
        ? now.getMilliseconds()
        : now.getSeconds() * 1000 + now.getMilliseconds();
    return PERIOD_MS[precision] - into;
}

export interface ClockTickerDeps {
    precision: ClockPrecision;
    now: () => Date;
    setTimeout: (handler: () => void, delayMs: number) => number;
    clearTimeout: (handle: number) => void;
    setInterval: (handler: () => void, delayMs: number) => number;
    clearInterval: (handle: number) => void;
    /** called on every whole minute (or second) with the time it fired at */
    onTick: (now: Date) => void;
}

/**
 * Starts ticking and returns the function that stops it.
 *
 * The first timeout waits for the next whole minute (or second), then an
 * interval takes over: a clock that started at 12:00:40 turns to 12:01 at
 * 12:01:00, not at 12:01:40. Each tick checks how far past the boundary it
 * landed and, past `DRIFT_TOLERANCE_MS`, swaps the interval for a fresh
 * alignment. Stopping is safe to call more than once.
 */
export function startClockTicker(deps: ClockTickerDeps): () => void {
    const period = PERIOD_MS[deps.precision];
    let timeout: number | null = null;
    let interval: number | null = null;

    const align = (): void => {
        timeout = deps.setTimeout(() => {
            timeout = null;
            deps.onTick(deps.now());
            interval = deps.setInterval(onInterval, period);
        }, msToNextTick(deps.now(), deps.precision));
    };

    const onInterval = (): void => {
        const now = deps.now();
        deps.onTick(now);
        const late = period - msToNextTick(now, deps.precision);
        if (late > DRIFT_TOLERANCE_MS) {
            if (interval !== null) deps.clearInterval(interval);
            interval = null;
            align();
        }
    };

    align();

    return (): void => {
        if (timeout !== null) deps.clearTimeout(timeout);
        if (interval !== null) deps.clearInterval(interval);
        timeout = null;
        interval = null;
    };
}
