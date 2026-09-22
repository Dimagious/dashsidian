import { describe, it, expect } from "vitest";
import { readCountdown, readDateKey, daysUntil } from "./countdown";

describe("readDateKey", () => {
    it("takes a YYYY-MM-DD string", () => {
        expect(readDateKey("2026-11-15")).toBe("2026-11-15");
    });

    it("trims spaces", () => {
        expect(readDateKey("  2026-11-15 ")).toBe("2026-11-15");
    });

    it("takes a Date, built from local parts", () => {
        // Local midnight east of UTC is the previous day in UTC — the reason
        // toISOString is not used anywhere in this project.
        expect(readDateKey(new Date(2026, 10, 15, 0, 0, 0))).toBe("2026-11-15");
    });

    it("rejects a date that does not exist", () => {
        expect(readDateKey("2026-02-31")).toBeNull();
        expect(readDateKey("2026-13-01")).toBeNull();
    });

    it("accepts a real leap day and rejects a fake one", () => {
        expect(readDateKey("2024-02-29")).toBe("2024-02-29");
        expect(readDateKey("2026-02-29")).toBeNull();
    });

    it("rejects other shapes rather than guessing", () => {
        for (const raw of ["15.11.2026", "2026/11/15", "tomorrow", "", 42, null, undefined, {}]) {
            expect(readDateKey(raw)).toBeNull();
        }
    });

    it("an invalid Date is null, not NaN-NaN-NaN", () => {
        expect(readDateKey(new Date("nope"))).toBeNull();
    });
});

describe("readCountdown", () => {
    it("carries the date through", () => {
        const { spec, diagnostics } = readCountdown({ label: "Race", date: "2026-11-15" }, "Race");
        expect(spec).toEqual({ date: "2026-11-15" });
        expect(diagnostics).toEqual([]);
    });

    it("a missing date is an error, not an empty card", () => {
        for (const date of [undefined, null, ""]) {
            const { spec, diagnostics } = readCountdown({ date }, "Race");
            expect(spec).toBeNull();
            expect(diagnostics[0]?.level).toBe("error");
        }
    });

    it("an unparseable date says what was expected", () => {
        const { spec, diagnostics } = readCountdown({ date: "15.11.2026" }, "Race");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("YYYY-MM-DD");
    });

    it("the message names the card, so five of them can be told apart", () => {
        expect(readCountdown({}, "Holiday").diagnostics[0]?.message).toContain("Holiday");
    });
});

describe("daysUntil", () => {
    it("counts forward", () => {
        expect(daysUntil("2026-09-25", "2026-09-22")).toBe(3);
    });

    it("today is zero", () => {
        expect(daysUntil("2026-09-22", "2026-09-22")).toBe(0);
    });

    it("a past date is negative", () => {
        expect(daysUntil("2026-09-20", "2026-09-22")).toBe(-2);
    });

    it("counts across a year boundary", () => {
        expect(daysUntil("2027-01-01", "2026-12-30")).toBe(2);
    });

    it("a daylight saving switch does not shift the count", () => {
        expect(daysUntil("2026-03-30", "2026-03-28")).toBe(2);
        expect(daysUntil("2026-10-26", "2026-10-24")).toBe(2);
    });
});
