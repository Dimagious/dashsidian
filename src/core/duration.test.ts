import { describe, it, expect, afterEach } from "vitest";
import { parseDuration, readDuration, formatDuration, roundedDuration, readThreshold, durationFloor } from "./duration";
import { setLocale } from "../i18n";

afterEach(() => setLocale("en"));

describe("parseDuration — accepted forms, in minutes", () => {
    it.each([
        ["7:30", 450],
        ["25:10", 1510],
        ["0:05", 5],
        ["0:51:20", 51 + 20 / 60],
        ["1:00:00", 60],
        ["5h 58min", 358],
        ["5h58min", 358],
        ["5 h 58 min", 358],
        ["1h30m", 90],
        ["45m", 45],
        ["90 min", 90],
        ["1.5h", 90],
        ["30s", 0.5],
        ["30 sec", 0.5],
        ["1h 5m 10s", 65 + 10 / 60],
        ["2h", 120],
        ["0h", 0],
        ["5H 58MIN", 358],
        ["  7:30  ", 450],
        ["1h 10s", 60 + 10 / 60],
        ["10.25 h 30.5 min 15.75 sec", 615 + 30.5 + 15.75 / 60],
    ])("%s is %d minutes", (text, minutes) => {
        expect(parseDuration(text)).toBeCloseTo(minutes, 10);
    });
});

describe("parseDuration — rejected", () => {
    it.each([
        ["", "empty"],
        ["   ", "blank"],
        ["5 ч 58 мин", "localized units"],
        ["45 мин", "localized minutes"],
        ["PT1H30M", "ISO 8601"],
        ["-5m", "negative"],
        ["-1:30", "negative clock"],
        ["10 km · 51min", "text around it"],
        ["slept 7h", "a word before it"],
        ["7h zzz", "a word after it"],
        ["1m 2h", "units out of order"],
        ["5m 3m", "a unit twice"],
        ["1h 2h", "hours twice"],
        ["90", "a bare number, which is a plain number instead"],
        ["7:5", "one-digit minutes"],
        ["7:60", "minutes past 59"],
        ["7:30:75", "seconds past 59"],
        ["1h30", "a trailing number with no unit"],
        [".5h", "no leading digit"],
        ["1,5h", "a decimal comma"],
        ["5hours", "a spelled-out unit"],
        ["h", "a unit with no number"],
        ["1h" + " ".repeat(10000) + "x", "a value padded far past any real duration"],
        ["1h" + " ".repeat(40) + "5m", "spaces past the length cut-off"],
    ])("%s (%s)", (text) => {
        expect(parseDuration(text)).toBeNull();
    });
});

describe("formatDuration — display rules", () => {
    it.each([
        [358, "5h 58m"],
        [45, "45m"],
        [480, "8h"],
        [51 + 20 / 60, "51m 20s"],
        [2690, "44h 50m"],
        [0, "0m"],
        [0.5, "30s"],
        [60, "1h"],
        [1500, "25h"],
        [61, "1h 1m"],
    ])("%d minutes read %s", (minutes, text) => {
        expect(formatDuration(minutes)).toBe(text);
    });

    it("rounds to the nearest second under an hour", () => {
        expect(formatDuration(51 + 20.4 / 60)).toBe("51m 20s");
        expect(formatDuration(51 + 20.6 / 60)).toBe("51m 21s");
        expect(formatDuration(0.2 / 60)).toBe("0m");
    });

    it("59m 59.6s rounds up to exactly one hour, not 59m 60s", () => {
        expect(formatDuration(59 + 59.6 / 60)).toBe("1h");
        expect(formatDuration(59 + 59.4 / 60)).toBe("59m 59s");
    });

    it("rounds to the nearest minute from an hour on, dropping seconds", () => {
        expect(formatDuration(60 + 29 / 60)).toBe("1h");
        expect(formatDuration(60 + 31 / 60)).toBe("1h 1m");
        expect(formatDuration(119.5)).toBe("2h");
        // An average of 7h 12m 29s over a week of sleep.
        expect(formatDuration(432 + 29 / 60)).toBe("7h 12m");
    });

    it("null and non-finite values are a dash, not a zero", () => {
        expect(formatDuration(null)).toBe("—");
        expect(formatDuration(Number.NaN)).toBe("—");
        expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("—");
    });

    it("a negative value keeps its sign, and one that rounds to nothing does not", () => {
        expect(formatDuration(-32)).toBe("-32m");
        expect(formatDuration(-0.001)).toBe("0m");
    });

    it("unit abbreviations come from the catalog: Russian, with a no-break space", () => {
        setLocale("ru");
        expect(formatDuration(358)).toBe("5 ч 58 мин");
        expect(formatDuration(51 + 20 / 60)).toBe("51 мин 20 с");
        expect(formatDuration(480)).toBe("8 ч");
    });

    it("German, French and Spanish use h/min/s", () => {
        for (const locale of ["de", "fr", "es"]) {
            setLocale(locale);
            expect(formatDuration(358)).toBe("5 h 58 min");
            expect(formatDuration(0.5)).toBe("30 s");
        }
    });
});

// B-145: a race time is written down to the second, and that is what makes a card read as a clock.
describe("readDuration: whether the seconds were written", () => {
    it.each([
        ["2:16:32", 136 + 32 / 60],
        ["0:18:00", 18],
        ["2h 16m 32s", 136 + 32 / 60],
        ["45s", 0.75],
        ["1h 0m 0s", 60],
        ["1h 30s", 60.5],
    ])("%s carries seconds", (text, minutes) => {
        const read = readDuration(text);
        expect(read?.seconds).toBe(true);
        expect(read?.minutes).toBeCloseTo(minutes, 10);
    });

    it.each([["7:30"], ["18:51"], ["7h 30m"], ["1.5 min"], ["2h"]])("%s does not", (text) => {
        expect(readDuration(text)?.seconds).toBe(false);
    });

    it("text that is not a duration is null, the same as parseDuration", () => {
        expect(readDuration("10 km · 51min")).toBeNull();
        expect(readDuration("2:16:75")).toBeNull();
    });
});

describe("formatDuration: as a clock (B-145)", () => {
    it.each([
        [136 + 32 / 60, "2:16:32"],
        [18 + 51 / 60, "0:18:51"],
        [302 + 17 / 60, "5:02:17"],
        [723 + 45 / 60, "12:03:45"],
        [1510 + 5 / 60, "25:10:05"],
        [0.75, "0:00:45"],
        [60, "1:00:00"],
        [0, "0:00:00"],
    ])("%d minutes read %s", (minutes, text) => {
        expect(formatDuration(minutes, true)).toBe(text);
    });

    it("keeps the seconds past an hour, where the unit form drops them", () => {
        expect(formatDuration(136 + 32 / 60)).toBe("2h 17m");
        expect(formatDuration(136 + 32 / 60, true)).toBe("2:16:32");
    });

    it("rounds to the nearest second, carrying into the minute and the hour", () => {
        expect(formatDuration(18 + 51.4 / 60, true)).toBe("0:18:51");
        expect(formatDuration(18 + 51.6 / 60, true)).toBe("0:18:52");
        expect(formatDuration(59 + 59.6 / 60, true)).toBe("1:00:00");
        expect(formatDuration(119 + 59.5 / 60, true)).toBe("2:00:00");
    });

    it("a negative value keeps its sign, one that rounds to nothing does not; null is a dash", () => {
        expect(formatDuration(-(1 + 12 / 60), true)).toBe("-0:01:12");
        expect(formatDuration(-0.2 / 60, true)).toBe("0:00:00");
        expect(formatDuration(null, true)).toBe("—");
    });

    it("is the same in every language: digits and colons, no catalog units", () => {
        setLocale("ru");
        expect(formatDuration(302 + 17 / 60, true)).toBe("5:02:17");
    });
});

describe("roundedDuration", () => {
    it("with clock: the nearest second, past an hour too", () => {
        expect(roundedDuration(136 + 32.4 / 60, true)).toBeCloseTo(136 + 32 / 60, 10);
        expect(roundedDuration(-(90 + 0.6 / 60), true)).toBeCloseTo(-(90 + 1 / 60), 10);
        expect(roundedDuration(-0.2 / 60, true)).toBe(0);
    });

    it("is the displayed value in minutes: seconds under an hour, minutes above", () => {
        expect(roundedDuration(51 + 20.4 / 60)).toBeCloseTo(51 + 20 / 60, 10);
        expect(roundedDuration(432 + 29 / 60)).toBe(432);
        expect(roundedDuration(59 + 59.6 / 60)).toBe(60);
        expect(roundedDuration(-90.4)).toBe(-90);
        expect(roundedDuration(-0.001)).toBe(0);
    });
});

describe("readThreshold", () => {
    it("a YAML number is a plain threshold", () => {
        expect(readThreshold(420)).toEqual({ value: 420, duration: false });
    });

    it("a duration string is minutes, flagged as written as a duration", () => {
        expect(readThreshold("7h")).toEqual({ value: 420, duration: true });
        expect(readThreshold("7:30")).toEqual({ value: 450, duration: true });
    });

    it("anything else is null: text, a numeric string, a boolean, a non-finite number", () => {
        expect(readThreshold("seven")).toBeNull();
        expect(readThreshold("420")).toBeNull();
        expect(readThreshold(true)).toBeNull();
        expect(readThreshold(Number.NaN)).toBeNull();
        expect(readThreshold(undefined)).toBeNull();
    });
});

describe("durationFloor", () => {
    it("half a minute under a threshold past an hour, half a second up to one", () => {
        expect(durationFloor(480)).toBe(479.5);
        expect(durationFloor(45)).toBeCloseTo(45 - 0.5 / 60, 10);
        expect(durationFloor(60)).toBeCloseTo(60 - 0.5 / 60, 10);
    });
});
