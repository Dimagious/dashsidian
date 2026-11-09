/**
 * Lengths of time written as text: `5h 58min`, `7:30`, `0:51:20`, `PT1H45M`. Pure layer.
 *
 * A sleep tracker or a watch export writes `sleep_duration: 5h 58min`, which
 * is neither a number nor a numeric string, so without this the field read as
 * text and every card over it showed a dash. The base unit is minutes: a
 * duration string becomes minutes wherever a number is read (`numberAt`,
 * core/aggregate.ts), and fractional minutes carry the seconds.
 *
 * Only the forms below are accepted, the whole value and nothing else, so a
 * Garmin `running: "10 km · 51min"` stays text exactly as before:
 *   - clock form, `H:MM` or `H:MM:SS`, hours unbounded (`25:10` is fine).
 *     `H:MM` is always a duration here, never a time of day.
 *   - unit form, `h`, `m`/`min`, `s`/`sec`, each at most once, in that
 *     order, spaces optional, a decimal allowed (`1.5h`).
 *   - ISO 8601 duration, `PnWnDTnHnMnS`, any subset in that order, no spaces,
 *     case-insensitive (`PT1H45M`, `PT90S`, `P1DT2H`, `P2W`); a decimal, with
 *     a point or a comma, only on the last unit (`PT0.5H`). A week is 7 days
 *     and a day 24 hours. Years and months (`P1Y`, `P1M`) are not durations
 *     here, their length varies; `PT1M` is a minute.
 * Localized units (`ч`, `мин`) and negatives are not.
 */

import { t } from "../i18n";

/**
 * The longest text worth trying: `10.25 h 30.5 min 15.75 sec` is 26
 * characters. Anything longer is refused before a regex sees it, so a value
 * padded with thousands of spaces cannot make the unit pattern's optional
 * groups backtrack for seconds on every redraw.
 */
const MAX_LENGTH = 32;

const CLOCK = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/;
const NUMBER = String.raw`(\d+(?:\.\d+)?)`;
const UNITS = new RegExp(
    String.raw`^(?:${NUMBER}\s*h)?\s*(?:${NUMBER}\s*(?:min|m))?\s*(?:${NUMBER}\s*(?:sec|s))?$`,
    "i",
);
const ISO_NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const ISO = new RegExp(
    String.raw`^P(?:${ISO_NUMBER}W)?(?:${ISO_NUMBER}D)?(T(?:${ISO_NUMBER}H)?(?:${ISO_NUMBER}M)?(?:${ISO_NUMBER}S)?)?$`,
    "i",
);
const WEEK_MINUTES = 7 * 24 * 60;
const DAY_MINUTES = 24 * 60;

/** A duration string read: its length in minutes, and whether it was written down to the second. */
export interface ReadDuration {
    minutes: number;
    /** true when the text carries its own seconds: `2:16:32`, `0:18:00`, `2h 16m 32s`, `45s` */
    seconds: boolean;
}

/** A duration string in minutes, or null when the text is not one of the accepted forms. */
export function parseDuration(text: string): number | null {
    return readDuration(text)?.minutes ?? null;
}

/**
 * `parseDuration`, also saying whether the seconds were written. A race time
 * is (`2:16:32`), a night of sleep is not (`7:30`, `7h 30m`); a fraction
 * that happens to land between minutes (`1.5 min`) is not written seconds.
 */
export function readDuration(text: string): ReadDuration | null {
    const s = text.trim();
    if (!s || s.length > MAX_LENGTH) return null;

    const clock = CLOCK.exec(s);
    if (clock) {
        return {
            minutes: Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3] ?? 0) / 60,
            seconds: clock[3] !== undefined,
        };
    }

    if (s[0] === "P" || s[0] === "p") return readIsoDuration(s);

    const units = UNITS.exec(s);
    if (!units) return null;
    // Every group is optional, but `s` is trimmed and non-empty, and each
    // group needs its own digits, so a match always captured at least one.
    const [, h, m, sec] = units;
    return {
        minutes: Number(h ?? 0) * 60 + Number(m ?? 0) + Number(sec ?? 0) / 60,
        seconds: sec !== undefined,
    };
}

/**
 * An ISO 8601 duration (`PT1H45M`, `P1DT2H`, `P2W`) in minutes, or null. A
 * bare `P`, a `T` with no time unit after it (`P1DT`) and a decimal on any
 * unit but the last one written (`PT1.5H30M`) are refused, as ISO does.
 */
function readIsoDuration(s: string): ReadDuration | null {
    const iso = ISO.exec(s);
    if (!iso) return null;
    const [, w, d, time, h, m, sec] = iso;
    const values = [w, d, h, m, sec];
    const written = values.filter((v): v is string => v !== undefined);
    if (written.length === 0) return null;
    if (time !== undefined && h === undefined && m === undefined && sec === undefined) return null;
    if (written.slice(0, -1).some((v) => /[.,]/.test(v))) return null;
    const n = (v: string | undefined): number => (v === undefined ? 0 : Number(v.replace(",", ".")));
    return {
        minutes: n(w) * WEEK_MINUTES + n(d) * DAY_MINUTES + n(h) * 60 + n(m) + n(sec) / 60,
        seconds: sec !== undefined,
    };
}

/** Seconds in an hour: below it a duration shows seconds, from it on only hours and minutes. */
const HOUR_SECONDS = 3600;

/**
 * The duration as it will be displayed, in minutes: rounded to the nearest
 * second under an hour, to the nearest minute from an hour on. The same
 * rounding `formatDuration` applies, exposed as a number so a `compare` delta
 * can be built from what the reader sees (core/period.ts#formatDelta), the
 * way `roundedValue` does for a plain number. With `clock`, always to the
 * nearest second, the grain `formatDuration` keeps then.
 */
export function roundedDuration(minutes: number, clock = false): number {
    const abs = Math.abs(minutes);
    const seconds = Math.round(abs * 60);
    const rounded = clock || seconds < HOUR_SECONDS ? seconds / 60 : Math.round(abs);
    return minutes < 0 && rounded !== 0 ? -rounded : rounded;
}

/**
 * Minutes turned into card text: `5h 58m`, `45m`, `8h`, `51m 20s`, `44h 50m`.
 * Hours are left out when there are none and minutes when there are none
 * past a whole hour; seconds show only under an hour, and only when there
 * are any. No days: a week of sleep reads `52h 10m`, which is what a sum is.
 * `precision` plays no part here, the units already fix the grain.
 *
 * With `clock` (every value the reading came from was written with seconds,
 * B-145), the same minutes read as a race clock instead: `2:16:32`,
 * `0:18:51`, `12:03:45`, always with hours so `0:18:51` is never taken for
 * eighteen hours, and rounded to the nearest second.
 *
 * A dash for null, the same "nothing to count" answer `formatValue` gives.
 */
export function formatDuration(minutes: number | null, clock = false): string {
    if (minutes === null || !Number.isFinite(minutes)) return "—";
    const rounded = roundedDuration(minutes, clock);
    const sign = rounded < 0 ? "-" : "";
    const abs = Math.abs(rounded);
    if (clock) return sign + formatClock(abs);
    const parts: string[] = [];

    const seconds = Math.round(abs * 60);
    if (seconds < HOUR_SECONDS) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (m > 0 || s === 0) parts.push(t("duration.minutes", { value: m }));
        if (s > 0) parts.push(t("duration.seconds", { value: s }));
    } else {
        const h = Math.floor(abs / 60);
        const m = abs % 60;
        parts.push(t("duration.hours", { value: h }));
        if (m > 0) parts.push(t("duration.minutes", { value: m }));
    }
    return sign + parts.join(" ");
}

/** Non-negative minutes, already whole seconds, as `H:MM:SS`; hours unbounded (`25:10:05`). */
function formatClock(minutes: number): string {
    const total = Math.round(minutes * 60);
    const h = Math.floor(total / HOUR_SECONDS);
    const m = Math.floor((total % HOUR_SECONDS) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The smallest value that displays as at least `minutes`: half a second
 * under it up to an hour, half a minute under it past one, matching the
 * rounding of `formatDuration`. A band starting at `8h` then takes a night
 * of 7h 59m 40s, which its tooltip reads as `8h`, instead of the band below.
 */
export function durationFloor(minutes: number): number {
    return minutes - (minutes > 60 ? 0.5 : 0.5 / 60);
}

/** A threshold as written: a plain number (minutes, when compared with durations) or a duration string. */
export interface Threshold {
    value: number;
    /** true when it was written as a duration string rather than a plain number */
    duration: boolean;
}

/**
 * `goal`, `at_least`/`at_most` and a `bands` threshold take a number or a
 * duration string. Only a real YAML number counts as a plain one here, the
 * rule `at_least` always had; `goal` additionally keeps its own numeric
 * strings (core/progress.ts). Anything else is null and the caller keeps its
 * own "expects a number" message.
 */
export function readThreshold(raw: unknown): Threshold | null {
    if (typeof raw === "number") return Number.isFinite(raw) ? { value: raw, duration: false } : null;
    if (typeof raw === "string") {
        const minutes = parseDuration(raw);
        return minutes === null ? null : { value: minutes, duration: true };
    }
    return null;
}
