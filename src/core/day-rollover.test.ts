import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { createDayRollover } from "./day-rollover";

/** `window.setTimeout`/`clearTimeout`, typed the way the deps expect. */
const timers = {
    setTimeout: (fn: () => void, ms: number) => window.setTimeout(fn, ms) as unknown as number,
    clearTimeout: (h: number) => window.clearTimeout(h),
};

afterEach(() => {
    vi.useRealTimers();
});

describe("createDayRollover", () => {
    it("fires once at the boundary and rearms for the following day", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 15, 23, 0)); // 1h before midnight
        const onRollover = vi.fn();
        const rollover = createDayRollover({
            startHour: 0,
            now: () => new Date(),
            ...timers,
            onRollover,
        });

        vi.advanceTimersByTime(60 * 60 * 1000); // to 2026-06-16 00:00
        expect(onRollover).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(24 * 60 * 60 * 1000); // to 2026-06-17 00:00
        expect(onRollover).toHaveBeenCalledTimes(2);

        rollover.cancel();
    });

    it("rearm cancels the pending timer and fires at the new hour instead", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 15, 1, 0)); // startHour 0: boundary is 23h away
        const onRollover = vi.fn();
        const rollover = createDayRollover({
            startHour: 0,
            now: () => new Date(),
            ...timers,
            onRollover,
        });

        rollover.rearm(4); // still 01:00; the new boundary is 3h away

        vi.advanceTimersByTime(3 * 60 * 60 * 1000); // to 04:00
        expect(onRollover).toHaveBeenCalledTimes(1);

        // If the original midnight timer had survived the rearm, advancing
        // to where it was due (23h from the start) would fire it too.
        vi.advanceTimersByTime(20 * 60 * 60 * 1000); // to 2026-06-16 00:00
        expect(onRollover).toHaveBeenCalledTimes(1);

        rollover.cancel();
    });

    it("cancel stops the pending timer from ever firing", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 15, 23, 0));
        const onRollover = vi.fn();
        const rollover = createDayRollover({
            startHour: 0,
            now: () => new Date(),
            ...timers,
            onRollover,
        });

        rollover.cancel();
        vi.advanceTimersByTime(24 * 60 * 60 * 1000);
        expect(onRollover).not.toHaveBeenCalled();

        // Cancelling twice must not throw.
        expect(() => rollover.cancel()).not.toThrow();
    });

    it("a late fire, jumped to in one step, fires exactly once and rearms from the moment it actually fired", () => {
        vi.useFakeTimers();
        // 23h before the boundary: a single 26h jump crosses only this one
        // boundary, not the next one too (which sits a further 24h out).
        vi.setSystemTime(new Date(2026, 5, 15, 1, 0));
        const fires: Date[] = [];
        const rollover = createDayRollover({
            startHour: 0,
            now: () => new Date(),
            ...timers,
            onRollover: () => fires.push(new Date()),
        });

        vi.advanceTimersByTime(26 * 60 * 60 * 1000); // one jump, well past the boundary
        expect(fires).toHaveLength(1);
        expect(fires[0]?.getTime()).toBe(new Date(2026, 5, 16, 0, 0).getTime());

        // The next boundary is exactly 24h after the moment it actually
        // fired, not 24h after the stale, pre-jump schedule.
        vi.advanceTimersByTime(24 * 60 * 60 * 1000); // to 2026-06-17 00:00
        expect(fires).toHaveLength(2);
        expect(fires[1]?.getTime()).toBe(new Date(2026, 5, 17, 0, 0).getTime());

        rollover.cancel();
    });
});

describe("createDayRollover — a machine that slept through the boundary", () => {
    it("fires once on waking and arms for the next boundary counted from now, not from the missed one", () => {
        // Timers are captured by hand, so the callback runs at the moment the
        // machine woke up rather than at the instant it was scheduled for,
        // which is what fake timers would do.
        let clock = new Date(2026, 5, 15, 1, 0);
        const scheduled: { fn: () => void; ms: number }[] = [];
        const onRollover = vi.fn();
        createDayRollover({
            startHour: 0,
            now: () => clock,
            setTimeout: (fn, ms) => scheduled.push({ fn, ms }),
            clearTimeout: () => undefined,
            onRollover,
        });
        expect(scheduled[0]?.ms).toBe(23 * 60 * 60 * 1000);

        // Asleep from the 15th until the 17th at 03:00: two boundaries missed.
        clock = new Date(2026, 5, 17, 3, 0);
        scheduled[0]!.fn();

        expect(onRollover).toHaveBeenCalledTimes(1);
        // Next is the 18th at 00:00, 21h away. Anchoring on the missed
        // boundary would give the 17th at 00:00, already past, a zero delay
        // and a second redraw straight away.
        expect(scheduled).toHaveLength(2);
        expect(scheduled[1]?.ms).toBe(21 * 60 * 60 * 1000);
    });
});

describe("createDayRollover — arms the correct instant across a daylight-saving change", () => {
    const original = process.env.TZ;
    beforeAll(() => {
        process.env.TZ = "Europe/Berlin";
    });
    afterAll(() => {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
    });

    it("28 March 12:00, startHour 4: arms for 04:00 local on the 29th, not 05:00", () => {
        const now = new Date(2026, 2, 28, 12, 0);
        let capturedDelay: number | null = null;
        const rollover = createDayRollover({
            startHour: 4,
            now: () => now,
            setTimeout: (fn, ms) => {
                capturedDelay = ms;
                return 1;
            },
            clearTimeout: () => undefined,
            onRollover: () => undefined,
        });

        const expected = new Date(2026, 2, 29, 4, 0).getTime() - now.getTime();
        expect(capturedDelay).toBe(expected);
        rollover.cancel();
    });
});
