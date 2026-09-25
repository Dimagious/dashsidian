import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { normalizeStartHour, effectiveToday, nextEffectiveDayBoundary, makeToday } from "./today";

describe("normalizeStartHour", () => {
    it("keeps a valid hour as-is, 0 through 6", () => {
        for (let h = 0; h <= 6; h++) expect(normalizeStartHour(h)).toBe(h);
    });

    it("falls back to 0 for anything outside 0..6, or not a whole number", () => {
        for (const bad of [-1, 7, 24, 3.5, NaN, Infinity]) {
            expect(normalizeStartHour(bad)).toBe(0);
        }
    });

    it("falls back to 0 for a value of the wrong type entirely", () => {
        for (const bad of ["4", null, undefined, {}, [], true]) {
            expect(normalizeStartHour(bad)).toBe(0);
        }
    });
});

describe("effectiveToday — startHour 0, today's behaviour unchanged", () => {
    it("00:00 is already today", () => {
        const d = effectiveToday(new Date(2026, 5, 15, 0, 0), 0);
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 15]);
    });

    it("23:59 is still today", () => {
        const d = effectiveToday(new Date(2026, 5, 15, 23, 59), 0);
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 15]);
    });
});

describe("effectiveToday — startHour 4", () => {
    it("03:59 is still yesterday", () => {
        const d = effectiveToday(new Date(2026, 5, 15, 3, 59), 4);
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 14]);
    });

    it("04:00 exactly is already today", () => {
        const d = effectiveToday(new Date(2026, 5, 15, 4, 0), 4);
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 15]);
    });

    it("1 January at 02:00 rolls back into 31 December of the previous year", () => {
        const d = effectiveToday(new Date(2026, 0, 1, 2, 0), 4);
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2025, 11, 31]);
    });

    it("1 March at 01:00 rolls back into the last day of February, leap year", () => {
        // 2028 is a leap year: 29 February.
        const d = effectiveToday(new Date(2028, 2, 1, 1, 0), 4);
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2028, 1, 29]);
    });

    it("1 March at 01:00 rolls back into the last day of February, non-leap year", () => {
        const d = effectiveToday(new Date(2026, 2, 1, 1, 0), 4);
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 1, 28]);
    });
});

describe("effectiveToday — invalid setting values fall back to 0 (midnight)", () => {
    it("an out-of-range hour behaves as if the setting were 0", () => {
        const at0130 = effectiveToday(new Date(2026, 5, 15, 1, 30), 9);
        expect([at0130.getFullYear(), at0130.getMonth(), at0130.getDate()]).toEqual([2026, 5, 15]);
    });

    it("a non-numeric setting behaves as if the setting were 0", () => {
        const at0130 = effectiveToday(new Date(2026, 5, 15, 1, 30), "4");
        expect([at0130.getFullYear(), at0130.getMonth(), at0130.getDate()]).toEqual([2026, 5, 15]);
    });
});

describe("effectiveToday — around a daylight-saving change", () => {
    // Node reads process.env.TZ per call, so a zone with DST can be forced
    // for just this suite without touching the machine running the tests.
    const original = process.env.TZ;
    beforeAll(() => {
        process.env.TZ = "Europe/Berlin";
    });
    afterAll(() => {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
    });

    it("spring forward: before the jump still reads as yesterday, and the clock jumping never eats a day", () => {
        // 2026-03-29, Europe/Berlin: 02:00 local jumps straight to 03:00.
        const before = effectiveToday(new Date(2026, 2, 29, 1, 30), 4);
        expect([before.getFullYear(), before.getMonth(), before.getDate()]).toEqual([2026, 2, 28]);

        const after = effectiveToday(new Date(2026, 2, 29, 23, 30), 4);
        expect([after.getFullYear(), after.getMonth(), after.getDate()]).toEqual([2026, 2, 29]);
    });

    // A millisecond-subtraction implementation (`now.getTime() - startHour *
    // 3600000`, then read the local date of that instant) gets this one
    // wrong: on the day the offset itself jumps, subtracting a fixed number
    // of milliseconds does not land four wall-clock hours earlier. At local
    // 04:30/04:59 with startHour 4, the wall clock has already reached the
    // boundary hour (`getHours() < hour` is false), so today is 29 March;
    // shifting the UTC instant back 4h instead crosses the 02:00-jumps-to-
    // 03:00 gap and lands on 28 March.
    it("spring forward: right at and just before the next hour tick, the wall clock already reads the boundary correctly", () => {
        const at0430 = effectiveToday(new Date(2026, 2, 29, 4, 30), 4);
        expect([at0430.getFullYear(), at0430.getMonth(), at0430.getDate()]).toEqual([2026, 2, 29]);

        const at0459 = effectiveToday(new Date(2026, 2, 29, 4, 59), 4);
        expect([at0459.getFullYear(), at0459.getMonth(), at0459.getDate()]).toEqual([2026, 2, 29]);
    });

    it("fall back: the repeated hour never gets read as a whole extra day", () => {
        // 2026-10-25, Europe/Berlin: 03:00 local falls back to 02:00, so
        // 02:00-02:59 happens twice.
        const d = effectiveToday(new Date(2026, 9, 25, 23, 30), 0);
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 25]);
    });

    // The same millisecond-subtraction mutant reads this one backwards too:
    // 25 October 03:30 minus 4h in milliseconds crosses the repeated hour and
    // lands on 25 October again instead of 24 October, because that stretch
    // of the day is an hour longer in real elapsed time than the wall clock
    // shows.
    it("fall back: before the boundary hour, the day still rolls back correctly across the repeated hour", () => {
        const d = effectiveToday(new Date(2026, 9, 25, 3, 30), 4);
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 24]);
    });
});

describe("nextEffectiveDayBoundary — around a daylight-saving change", () => {
    const original = process.env.TZ;
    beforeAll(() => {
        process.env.TZ = "Europe/Berlin";
    });
    afterAll(() => {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
    });

    // A `+24h` implementation (add 24 hours in milliseconds to today's
    // boundary once it is in the past, instead of building tomorrow's
    // boundary from its own calendar components) gets this wrong exactly on
    // the day the offset changes: 28 March 04:00 plus 24 real hours is 29
    // March 05:00 local (the clocks skipped an hour in between), not 04:00.
    it("spring forward: the day before, the next boundary is still 04:00 local, not 05:00", () => {
        const b = nextEffectiveDayBoundary(new Date(2026, 2, 28, 12, 0), 4);
        expect([b.getFullYear(), b.getMonth(), b.getDate(), b.getHours(), b.getMinutes()])
            .toEqual([2026, 2, 29, 4, 0]);
    });

    it("spring forward: a boundary hour that falls inside the skipped hour rolls forward to the next real minute", () => {
        // 02:00-02:59 does not exist on 2026-03-29 in Europe/Berlin; V8 rolls
        // a nonexistent local time forward across the gap on its own
        // (`new Date(2026, 2, 29, 2, 0)` reads back as 03:00), and the
        // boundary must land wherever that lands rather than somewhere else.
        const rolled = new Date(2026, 2, 29, 2, 0, 0, 0);
        expect([rolled.getHours(), rolled.getMinutes()]).toEqual([3, 0]);

        const b = nextEffectiveDayBoundary(new Date(2026, 2, 29, 1, 0), 2);
        expect([b.getFullYear(), b.getMonth(), b.getDate(), b.getHours(), b.getMinutes()])
            .toEqual([2026, 2, 29, 3, 0]);
    });
});

describe("makeToday", () => {
    it("uses the hour the getter names, not always midnight", () => {
        const today = makeToday(() => 4, () => new Date(2026, 5, 15, 2, 0));
        const d = today();
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 14]);
    });

    it("reads the hour fresh on every call, not only once at creation", () => {
        let hour: number = 0;
        const today = makeToday(() => hour, () => new Date(2026, 5, 15, 2, 0));

        expect([today().getFullYear(), today().getMonth(), today().getDate()]).toEqual([2026, 5, 15]);

        hour = 4; // same moment, later setting
        expect([today().getFullYear(), today().getMonth(), today().getDate()]).toEqual([2026, 5, 14]);
    });

    it("reads the clock fresh on every call too", () => {
        let now = new Date(2026, 5, 15, 3, 0);
        const today = makeToday(() => 4, () => now);

        expect([today().getFullYear(), today().getMonth(), today().getDate()]).toEqual([2026, 5, 14]);

        now = new Date(2026, 5, 15, 5, 0); // past the boundary
        expect([today().getFullYear(), today().getMonth(), today().getDate()]).toEqual([2026, 5, 15]);
    });

    it("defaults to the real clock when no `now` is given", () => {
        const today = makeToday(() => 0);
        const d = today();
        const real = new Date();
        expect([d.getFullYear(), d.getMonth(), d.getDate()])
            .toEqual([real.getFullYear(), real.getMonth(), real.getDate()]);
    });
});

describe("nextEffectiveDayBoundary", () => {
    it("is later today when the boundary hour has not passed yet", () => {
        const b = nextEffectiveDayBoundary(new Date(2026, 5, 15, 1, 0), 4);
        expect([b.getFullYear(), b.getMonth(), b.getDate(), b.getHours(), b.getMinutes()])
            .toEqual([2026, 5, 15, 4, 0]);
    });

    it("is tomorrow's boundary once the hour has already passed", () => {
        const b = nextEffectiveDayBoundary(new Date(2026, 5, 15, 4, 30), 4);
        expect([b.getFullYear(), b.getMonth(), b.getDate(), b.getHours(), b.getMinutes()])
            .toEqual([2026, 5, 16, 4, 0]);
    });

    it("is tomorrow's boundary exactly at the boundary itself, never zero delay forever", () => {
        const b = nextEffectiveDayBoundary(new Date(2026, 5, 15, 4, 0), 4);
        expect([b.getFullYear(), b.getMonth(), b.getDate(), b.getHours()]).toEqual([2026, 5, 16, 4]);
    });

    it("rolls the month and year over at midnight with startHour 0", () => {
        const b = nextEffectiveDayBoundary(new Date(2025, 11, 31, 12, 0), 0);
        expect([b.getFullYear(), b.getMonth(), b.getDate(), b.getHours()]).toEqual([2026, 0, 1, 0]);
    });
});
