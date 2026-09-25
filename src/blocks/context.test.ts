import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { buildContext } from "./context";
import { DEFAULT_SETTINGS } from "../types";

/** `today` never touches `app`; a bare cast stands in for the real thing. */
const fakeApp = {} as unknown as App;

describe("buildContext — today reads the configured hour, not a hardcoded one", () => {
    it("uses settings.startDayHour rather than always midnight", () => {
        const ctx = buildContext({
            app: fakeApp,
            notes: () => [],
            settings: { ...DEFAULT_SETTINGS, startDayHour: 4 },
            now: () => new Date(2026, 5, 15, 2, 0),
        });
        const d = ctx.today();
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 14]);
    });

    it("the default setting (0) behaves exactly like plain midnight", () => {
        const ctx = buildContext({
            app: fakeApp,
            notes: () => [],
            settings: DEFAULT_SETTINGS,
            now: () => new Date(2026, 5, 15, 2, 0),
        });
        const d = ctx.today();
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 15]);
    });

    it("reads the setting fresh on every call, from the same object the plugin mutates in place", () => {
        const settings = { ...DEFAULT_SETTINGS, startDayHour: 0 };
        const ctx = buildContext({
            app: fakeApp,
            notes: () => [],
            settings,
            now: () => new Date(2026, 5, 15, 2, 0),
        });

        const before = ctx.today();
        expect([before.getFullYear(), before.getMonth(), before.getDate()]).toEqual([2026, 5, 15]);

        settings.startDayHour = 4;
        const after = ctx.today();
        expect([after.getFullYear(), after.getMonth(), after.getDate()]).toEqual([2026, 5, 14]);
    });
});
