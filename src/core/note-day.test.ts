import { describe, it, expect } from "vitest";
import { dayNameFormats, neighbourDays, readNoteDay } from "./note-day";
import { periodNames } from "./period-name";
import type { ParseDate } from "./note-date";
import type { PeriodContext } from "./period";
import { dateKey } from "./calendar";

/**
 * A small stand-in for moment's strict parse: the ISO day, week and month,
 * and `DD.MM.YYYY`. The week is the ISO one, so `2026-W45` starts on Monday
 * 2 November 2026; nothing else is needed here.
 */
const parse: ParseDate = (text, format) => {
    const at = (y: number, m: number, d: number): string | null => {
        const date = new Date(y, m - 1, d);
        return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? dateKey(date) : null;
    };
    let match: RegExpExecArray | null;
    switch (format) {
        case "YYYY-MM-DD":
            match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
            return match ? at(Number(match[1]), Number(match[2]), Number(match[3])) : null;
        case "DD.MM.YYYY":
            match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
            return match ? at(Number(match[3]), Number(match[2]), Number(match[1])) : null;
        case "YYYY-MM":
            match = /^(\d{4})-(\d{2})$/.exec(text);
            return match ? at(Number(match[1]), Number(match[2]), 1) : null;
        case "GGGG-[W]WW":
            return text === "2026-W45" ? "2026-11-02" : null;
        default:
            return null;
    }
};

const context = (noteName: string | undefined, extra: Partial<PeriodContext> = {}, day?: string): PeriodContext => {
    const ctx: PeriodContext = { names: periodNames(day ? { day } : {}, parse), ...extra };
    if (noteName !== undefined) ctx.noteName = noteName;
    return ctx;
};

const dayOf = (ctx: PeriodContext): string | null => {
    const reading = readNoteDay(ctx);
    return "day" in reading ? dateKey(reading.day) : null;
};

describe("readNoteDay: the day a daily note is named for (B-210)", () => {
    it("reads an ISO name, and a name going on after the day", () => {
        expect(dayOf(context("2026-11-09"))).toBe("2026-11-09");
        expect(dayOf(context("2026-11-09 Monday"))).toBe("2026-11-09");
    });

    it("reads the day format from the settings before ISO, and ISO still after it", () => {
        expect(dayOf(context("09.11.2026", {}, "DD.MM.YYYY"))).toBe("2026-11-09");
        expect(dayOf(context("2026-11-09", {}, "DD.MM.YYYY"))).toBe("2026-11-09");
        // Only the part after the last `/` names the note.
        expect(dayOf(context("09.11.2026", {}, "Diary/YYYY/DD.MM.YYYY"))).toBe("2026-11-09");
    });

    it("the day is local midnight, built from its parts", () => {
        const reading = readNoteDay(context("2027-01-01"));
        expect("day" in reading && [reading.day.getFullYear(), reading.day.getMonth(), reading.day.getDate(), reading.day.getHours()])
            .toEqual([2027, 0, 1, 0]);
    });

    it("a weekly or monthly note is no day: an error naming the day formats only", () => {
        for (const name of ["2026-W45", "2026-11"]) {
            expect(readNoteDay(context(name, {}, "DD.MM.YYYY"))).toEqual({
                problem: `\`date: note\` needs a note named for one day, and this note is "${name}". Name it in one of these formats: DD.MM.YYYY, YYYY-MM-DD.`,
            });
        }
    });

    it("a name that is no period: an error anywhere but the template folder, a hint there", () => {
        expect(readNoteDay(context("Daily template"))).toHaveProperty("problem");
        expect(readNoteDay(context("Daily template", { inTemplateFolder: true }))).toEqual({ template: true });
        // A template named for a week is plainly not a day: still an error.
        expect(readNoteDay(context("2026-W45", { inTemplateFolder: true }))).toHaveProperty("problem");
    });

    it("no note at all (a block drawn outside one) is an error, not a crash", () => {
        expect(readNoteDay(context(undefined))).toEqual({
            problem: '`date: note` needs a note named for one day, and this note is "". Name it in one of these formats: YYYY-MM-DD.',
        });
    });
});

describe("dayNameFormats", () => {
    it("lists each day format once, the settings one first", () => {
        expect(dayNameFormats(periodNames({ day: "DD.MM.YYYY", week: "gggg-[W]ww" }, parse))).toBe("DD.MM.YYYY, YYYY-MM-DD");
        expect(dayNameFormats(periodNames({ day: "YYYY-MM-DD" }, parse))).toBe("YYYY-MM-DD");
    });
});

describe("neighbourDays", () => {
    const around = (y: number, m: number, d: number): [string, string] => {
        const { previous, next } = neighbourDays(new Date(y, m, d));
        return [dateKey(previous), dateKey(next)];
    };

    it("the day before and after inside a month", () => {
        expect(around(2026, 10, 9)).toEqual(["2026-11-08", "2026-11-10"]);
    });

    it("across a month boundary, February in a leap year and not", () => {
        expect(around(2026, 9, 31)).toEqual(["2026-10-30", "2026-11-01"]);
        expect(around(2026, 2, 1)).toEqual(["2026-02-28", "2026-03-02"]);
        expect(around(2028, 2, 1)).toEqual(["2028-02-29", "2028-03-02"]);
    });

    it("across a year boundary", () => {
        expect(around(2026, 11, 31)).toEqual(["2026-12-30", "2027-01-01"]);
        expect(around(2027, 0, 1)).toEqual(["2026-12-31", "2027-01-02"]);
    });
});
