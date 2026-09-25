import { describe, it, expect } from "vitest";
import { mergeSettings } from "./settings";
import { DEFAULT_SETTINGS } from "../types";

describe("mergeSettings", () => {
    it("nothing stored yet: every default, including startDayHour 0", () => {
        expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
        expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    });

    it("a valid stored hour is kept as-is", () => {
        expect(mergeSettings({ startDayHour: 4 }).startDayHour).toBe(4);
    });

    it("a stored hour written as a string falls back to 0", () => {
        expect(mergeSettings({ startDayHour: "4" }).startDayHour).toBe(0);
    });

    it("a stored hour out of the 0..6 range falls back to 0", () => {
        expect(mergeSettings({ startDayHour: 9 }).startDayHour).toBe(0);
    });

    it("startDayHour missing from an otherwise valid stored object falls back to 0", () => {
        expect(mergeSettings({ dailyFolder: "Diary" }).startDayHour).toBe(0);
    });

    it("a stored startDayHour of null falls back to 0", () => {
        expect(mergeSettings({ startDayHour: null }).startDayHour).toBe(0);
    });

    it("keeps every other stored field untouched", () => {
        const merged = mergeSettings({ dailyFolder: "Diary", startDayHour: 4 });
        expect(merged.dailyFolder).toBe("Diary");
        expect(merged.startDayHour).toBe(4);
        expect(merged.weeklyFolder).toBe(DEFAULT_SETTINGS.weeklyFolder);
        expect(merged.language).toBe(DEFAULT_SETTINGS.language);
    });

    it("a non-object stored value (garbage data.json) falls back to every default", () => {
        for (const bad of ["nonsense", 42, [], true]) {
            expect(mergeSettings(bad)).toEqual(DEFAULT_SETTINGS);
        }
    });
});
