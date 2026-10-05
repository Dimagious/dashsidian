import { describe, it, expect, vi, afterEach } from "vitest";
import {
    readClock, usesTwelveHour, clockFormat, msToNextTick, startClockTicker, DRIFT_TOLERANCE_MS,
    type ClockPrecision,
} from "./clock";

afterEach(() => {
    vi.useRealTimers();
});

describe("readClock", () => {
    it("true and minutes draw hours and minutes, seconds adds the seconds", () => {
        expect(readClock(true)).toEqual({ clock: "minutes", diagnostics: [] });
        expect(readClock("minutes")).toEqual({ clock: "minutes", diagnostics: [] });
        expect(readClock("seconds")).toEqual({ clock: "seconds", diagnostics: [] });
    });

    it("reads the keyword whatever its case and surrounding spaces", () => {
        expect(readClock("  Seconds ").clock).toBe("seconds");
        expect(readClock("MINUTES").clock).toBe("minutes");
    });

    it("absent or false is no clock and no warning", () => {
        expect(readClock(undefined)).toEqual({ clock: null, diagnostics: [] });
        expect(readClock(false)).toEqual({ clock: null, diagnostics: [] });
    });

    it("anything else warns, quotes the value and shows no clock", () => {
        const cases: [unknown, string][] = [
            ["hours", "hours"], ["", ""], [1, "1"], [0, "0"], [null, "null"],
            [["seconds"], '["seconds"]'], [{ every: "minute" }, '{"every":"minute"}'],
        ];
        for (const [bad, shown] of cases) {
            const { clock, diagnostics } = readClock(bad);
            expect(clock).toBeNull();
            expect(diagnostics).toEqual([{
                level: "warning",
                message: `\`clock\` expects true, false, minutes or seconds, got "${shown}". The clock is not shown.`,
            }]);
        }
    });
});

describe("usesTwelveHour", () => {
    it("h and hh are a 12-hour dial, H, HH and k are not", () => {
        expect(usesTwelveHour("h:mm A")).toBe(true);
        expect(usesTwelveHour("A hh:mm")).toBe(true);
        expect(usesTwelveHour("HH:mm")).toBe(false);
        expect(usesTwelveHour("H:mm")).toBe(false);
        expect(usesTwelveHour("k:mm")).toBe(false);
    });

    it("a letter h inside a bracketed literal is not a token", () => {
        expect(usesTwelveHour("HH[h]mm")).toBe(false);
        expect(usesTwelveHour("[heure] h:mm")).toBe(true);
    });
});

describe("clockFormat", () => {
    const en = { short: "h:mm A", long: "h:mm:ss A" };
    const ru = { short: "H:mm", long: "H:mm:ss" };
    const ko = { short: "A h:mm", long: "A h:mm:ss" };

    it("a 12-hour locale keeps its own format, marker and all", () => {
        expect(clockFormat("minutes", en)).toBe("h:mm A");
        expect(clockFormat("seconds", en)).toBe("h:mm:ss A");
        expect(clockFormat("minutes", ko)).toBe("A h:mm");
    });

    it("a 24-hour locale gets zero-padded hours, even where its own is H:mm", () => {
        expect(clockFormat("minutes", ru)).toBe("HH:mm");
        expect(clockFormat("seconds", ru)).toBe("HH:mm:ss");
    });

    it("a 24-hour locale keeps its own separator", () => {
        const id = { short: "HH.mm", long: "HH.mm.ss" };
        expect(clockFormat("minutes", id)).toBe("HH.mm");
        expect(clockFormat("seconds", id)).toBe("HH.mm.ss");
        expect(clockFormat("minutes", { short: "H.mm", long: "H.mm.ss" })).toBe("HH.mm");
        expect(clockFormat("minutes", { short: "k:mm", long: "k:mm:ss" })).toBe("kk:mm");
    });

    it("text in square brackets is left alone", () => {
        expect(clockFormat("minutes", { short: "H[ Uhr] mm", long: "H[ Uhr] mm ss" })).toBe("HH[ Uhr] mm");
        expect(clockFormat("minutes", { short: "[kl.] H:mm", long: "[kl.] H:mm:ss" })).toBe("[kl.] HH:mm");
    });
});

describe("msToNextTick", () => {
    it("counts to the next whole minute", () => {
        expect(msToNextTick(new Date(2026, 9, 5, 12, 0, 40, 500), "minutes")).toBe(19_500);
        expect(msToNextTick(new Date(2026, 9, 5, 12, 0, 59, 999), "minutes")).toBe(1);
    });

    it("on the boundary itself waits a whole period, never 0", () => {
        expect(msToNextTick(new Date(2026, 9, 5, 12, 1, 0, 0), "minutes")).toBe(60_000);
        expect(msToNextTick(new Date(2026, 9, 5, 12, 1, 0, 0), "seconds")).toBe(1_000);
    });

    it("counts to the next whole second", () => {
        expect(msToNextTick(new Date(2026, 9, 5, 12, 0, 40, 250), "seconds")).toBe(750);
    });
});

describe("startClockTicker", () => {
    /** A ticker on the fake timers, recording the wall time of each tick as HH:mm:ss.SSS. */
    const run = (precision: ClockPrecision): { ticks: string[]; stop: () => void } => {
        const ticks: string[] = [];
        const stop = startClockTicker({
            precision,
            now: () => new Date(),
            setTimeout: (fn, delay) => window.setTimeout(fn, delay),
            clearTimeout: (handle) => window.clearTimeout(handle),
            setInterval: (fn, delay) => window.setInterval(fn, delay),
            clearInterval: (handle) => window.clearInterval(handle),
            onTick: (now) => ticks.push(stamp(now)),
        });
        return { ticks, stop };
    };
    const stamp = (d: Date): string =>
        [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":")
        + "." + String(d.getMilliseconds()).padStart(3, "0");

    it("waits for the next whole minute, then ticks on every minute after", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 40, 500));
        const { ticks } = run("minutes");

        vi.advanceTimersByTime(19_499);
        expect(ticks).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(ticks).toEqual(["12:01:00.000"]);
        vi.advanceTimersByTime(120_000);
        expect(ticks).toEqual(["12:01:00.000", "12:02:00.000", "12:03:00.000"]);
        // one interval left running, the aligning timeout is gone
        expect(vi.getTimerCount()).toBe(1);
    });

    it("seconds tick on every whole second", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 40, 250));
        const { ticks } = run("seconds");

        vi.advanceTimersByTime(2_750);
        expect(ticks).toEqual(["12:00:41.000", "12:00:42.000", "12:00:43.000"]);
    });

    it("lines itself up again when a tick lands well past the minute", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 59, 0));
        const { ticks } = run("minutes");
        vi.advanceTimersByTime(1_000);
        expect(ticks).toEqual(["12:01:00.000"]);

        // The computer slept for 30 s: the wall clock moved, the timers did not.
        vi.setSystemTime(new Date(2026, 9, 5, 12, 1, 30, 0));
        vi.advanceTimersByTime(60_000); // the interval fires at 12:02:30
        expect(ticks).toEqual(["12:01:00.000", "12:02:30.000"]);
        // and the next tick is back on the minute, not at 12:03:30
        vi.advanceTimersByTime(30_000);
        expect(ticks).toEqual(["12:01:00.000", "12:02:30.000", "12:03:00.000"]);
        vi.advanceTimersByTime(60_000);
        expect(ticks.at(-1)).toBe("12:04:00.000");
        expect(vi.getTimerCount()).toBe(1);
    });

    it("a tick late by no more than the tolerance keeps the interval", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 59, 0));
        const { ticks } = run("minutes");
        vi.advanceTimersByTime(1_000);

        vi.setSystemTime(new Date(2026, 9, 5, 12, 1, 0, DRIFT_TOLERANCE_MS));
        vi.advanceTimersByTime(60_000);
        vi.advanceTimersByTime(60_000);
        expect(ticks).toEqual(["12:01:00.000", "12:02:00.250", "12:03:00.250"]);
    });

    it("stopping before the first tick clears the aligning timeout", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 40, 0));
        const { ticks, stop } = run("minutes");
        expect(vi.getTimerCount()).toBe(1);

        stop();
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(180_000);
        expect(ticks).toEqual([]);
    });

    it("stopping after ticks began clears the interval, and is safe twice", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 40, 0));
        const { ticks, stop } = run("seconds");
        vi.advanceTimersByTime(3_000);
        expect(ticks).toHaveLength(3);

        stop();
        stop();
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(10_000);
        expect(ticks).toHaveLength(3);
    });
});
