import { describe, it, expect, afterEach, vi } from "vitest";
import { Platform, type App } from "obsidian";
import { snapshot, noteExists, VaultSnapshot, pathKind, revealFolder } from "./vault";
import { discoverPeriodics, dailyNoteFormat, noteDateFormats, periodNameFormats, periodContext } from "./periodic";
import {
    formatDate, currentLocale, weekdayNamesShort, monthNamesShort, firstDayOfWeek, monthYearShort, formatDayMedium,
    formatYear, timeFormats, parseDateWithFormat, parsePeriodStart,
} from "./datetime";
import { applyObsidianLocale, applyLocale } from "./locale";
import { isMobile } from "./platform";
import { isPluginEnabled } from "./plugins";
import { setLocale, getLocale } from "../i18n";
import { mockApp, countingContext, diary } from "../test/vault";
import { readPeriodName } from "../core/period-name";

afterEach(() => {
    applyLocale("");
    Platform.isMobile = false;
});

describe("isMobile", () => {
    it("reads Platform.isMobile", () => {
        expect(isMobile()).toBe(false);
        Platform.isMobile = true;
        expect(isMobile()).toBe(true);
    });
});

describe("isPluginEnabled", () => {
    const appWith = (host: unknown): App => host as App;

    it("finds an enabled plugin by id", () => {
        const app = appWith({ plugins: { enabledPlugins: new Set(["obsidian-charts"]), manifests: { "obsidian-charts": {} } } });
        expect(isPluginEnabled(app, "obsidian-charts")).toBe(true);
        expect(isPluginEnabled(app, "dataview")).toBe(false);
    });

    it("says no for a plugin listed as enabled whose folder is gone", () => {
        const app = appWith({ plugins: { enabledPlugins: new Set(["obsidian-charts"]), manifests: {} } });
        expect(isPluginEnabled(app, "obsidian-charts")).toBe(false);
    });

    it("says no for an installed plugin that is switched off", () => {
        const app = appWith({ plugins: { enabledPlugins: new Set<string>(), manifests: { "obsidian-charts": {} } } });
        expect(isPluginEnabled(app, "obsidian-charts")).toBe(false);
    });

    it("says no when the private plugin registry is missing or not a set", () => {
        expect(isPluginEnabled(appWith({}), "obsidian-charts")).toBe(false);
        expect(isPluginEnabled(appWith({ plugins: {} }), "obsidian-charts")).toBe(false);
        expect(isPluginEnabled(appWith({ plugins: { enabledPlugins: ["obsidian-charts"] } }), "obsidian-charts")).toBe(false);
    });
});

describe("vault snapshot", () => {
    it("turns files into records the pure layer can read", () => {
        const app = mockApp({ notes: [{ path: "01-Areas/Sport/run.md", frontmatter: { km: 5 } }] });
        expect(snapshot(app)).toEqual([{
            path: "01-Areas/Sport/run.md",
            name: "run",
            folder: "01-Areas/Sport",
            tags: [],
            frontmatter: { km: 5 },
        }]);
    });

    it("a note in the vault root has an empty folder, not a slash", () => {
        expect(snapshot(mockApp({ notes: [{ path: "top.md" }] }))[0]?.folder).toBe("");
    });

    it("missing frontmatter becomes an empty object, never undefined", () => {
        expect(snapshot(mockApp({ notes: [{ path: "a.md" }] }))[0]?.frontmatter).toEqual({});
    });

    it("tags from the body arrive without their hash", () => {
        const app = mockApp({ notes: [{ path: "a.md", tags: ["#sport", "tech"] }] });
        expect(snapshot(app)[0]?.tags).toEqual(["sport", "tech"]);
    });

    it("frontmatter tags are picked up as a list and as a string", () => {
        const asList = mockApp({ notes: [{ path: "a.md", frontmatter: { tags: ["one", "#two"] } }] });
        const asText = mockApp({ notes: [{ path: "a.md", frontmatter: { tags: "one, #two" } }] });
        expect(snapshot(asList)[0]?.tags).toEqual(["one", "two"]);
        expect(snapshot(asText)[0]?.tags).toEqual(["one", "two"]);
    });

    it("the same tag from body and frontmatter is not counted twice", () => {
        const app = mockApp({ notes: [{ path: "a.md", tags: ["sport"], frontmatter: { tags: ["sport"] } }] });
        expect(snapshot(app)[0]?.tags).toEqual(["sport"]);
    });

    it("noteExists answers for a real path and for one that is not there", () => {
        const app = mockApp({ notes: [{ path: "a.md" }] });
        expect(noteExists(app, "a.md")).toBe(true);
        expect(noteExists(app, "b.md")).toBe(false);
    });
});

describe("folder lookups (B-144)", () => {
    function explorer(reveal: (file: { path: string }) => void, enabled: unknown = true): unknown {
        return { enabled, instance: { revealInFolder: reveal } };
    }

    it("pathKind tells a file, a folder and nothing apart", () => {
        const app = mockApp({ notes: [{ path: "A/B/c.md" }] });
        expect(pathKind(app, "A/B/c.md")).toBe("file");
        expect(pathKind(app, "A/B")).toBe("folder");
        expect(pathKind(app, "A")).toBe("folder");
        expect(pathKind(app, "A/B/d.md")).toBeNull();
    });

    it("revealFolder hands the folder itself to the file explorer", () => {
        const revealed: string[] = [];
        const app = mockApp({ notes: [{ path: "A/B/c.md" }], fileExplorer: explorer((f) => revealed.push(f.path)) });
        expect(revealFolder(app, "A/B")).toBe(true);
        expect(revealed).toEqual(["A/B"]);
    });

    it("revealFolder refuses a file and a path that is not there", () => {
        const revealed: string[] = [];
        const app = mockApp({ notes: [{ path: "A/c.md" }], fileExplorer: explorer((f) => revealed.push(f.path)) });
        expect(revealFolder(app, "A/c.md")).toBe(false);
        expect(revealFolder(app, "Nowhere")).toBe(false);
        expect(revealed).toEqual([]);
    });

    it("revealFolder does nothing when the explorer is off, missing or not the expected shape", () => {
        const notes = [{ path: "A/c.md" }];
        const reveal = vi.fn();
        for (const fileExplorer of [
            explorer(reveal, false), explorer(reveal, "yes"), undefined, null, "file-explorer",
            { enabled: true }, { enabled: true, instance: { revealInFolder: "no" } },
        ]) {
            expect(revealFolder(mockApp({ notes, fileExplorer }), "A")).toBe(false);
        }
        expect(revealFolder(mockApp({ notes, fileExplorer: explorer(reveal) }), "A")).toBe(true);
        expect(reveal).toHaveBeenCalledTimes(1);
    });

    it("revealFolder reports an explorer that throws instead of passing it on", () => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const app = mockApp({ notes: [{ path: "A/c.md" }], fileExplorer: explorer(() => { throw new Error("boom"); }) });
        expect(revealFolder(app, "A")).toBe(false);
        expect(logged).toHaveBeenCalledTimes(1);
        expect(logged.mock.calls[0]?.[0]).toBe('[dashy] could not reveal the folder "A" in the file explorer');
        logged.mockRestore();
    });
});

describe("periodic notes discovery", () => {
    it("reads folder and format per period", () => {
        const app = mockApp({
            periodicNotes: {
                daily: { folder: "PN/Daily", format: "YYYY-MM-DD" },
                weekly: { folder: "PN/Weekly", format: "gggg-[W]ww" },
            },
        });
        expect(discoverPeriodics(app)).toEqual({
            daily: { folder: "PN/Daily", format: "YYYY-MM-DD" },
            weekly: { folder: "PN/Weekly", format: "gggg-[W]ww" },
        });
    });

    it("a period switched off still reports its folder", () => {
        const app = mockApp({ periodicNotes: { monthly: { enabled: false, folder: "M", format: "YYYY-MM" } } });
        expect(discoverPeriodics(app).monthly).toEqual({ folder: "M", format: "YYYY-MM" });
    });

    it("a period with neither folder nor format is not reported at all", () => {
        const app = mockApp({ periodicNotes: { daily: { enabled: true } } });
        expect(discoverPeriodics(app)).toEqual({});
    });

    it("no neighbours at all is an empty answer, not a crash", () => {
        expect(discoverPeriodics(mockApp())).toEqual({});
    });

    it("any shape of rubbish is survived", () => {
        for (const periodicNotes of ["text", 42, null, [], { daily: "wrong" }, { daily: null }]) {
            expect(() => discoverPeriodics(mockApp({ periodicNotes }))).not.toThrow();
        }
    });

    it("the core Daily notes plugin fills in the day when Periodic Notes has none", () => {
        const app = mockApp({ dailyNotes: { folder: "Core", format: "DD-MM-YYYY" } });
        expect(discoverPeriodics(app).daily).toEqual({ folder: "Core", format: "DD-MM-YYYY" });
    });

    it("Periodic Notes wins over the core plugin for the day", () => {
        const app = mockApp({
            periodicNotes: { daily: { folder: "PN", format: "YYYY-MM-DD" } },
            dailyNotes: { folder: "Core", format: "DD-MM-YYYY" },
        });
        expect(discoverPeriodics(app).daily?.folder).toBe("PN");
    });
});

describe("the daily note format (B-120)", () => {
    it("is the day format of Periodic Notes, trimmed", () => {
        expect(dailyNoteFormat(mockApp({ periodicNotes: { daily: { folder: "D", format: " DD.MM.YYYY " } } })))
            .toBe("DD.MM.YYYY");
    });

    it("falls back to the core Daily notes plugin", () => {
        expect(dailyNoteFormat(mockApp({ dailyNotes: { folder: "Core", format: "DD-MM-YYYY" } }))).toBe("DD-MM-YYYY");
    });

    it("is undefined when neither plugin names one", () => {
        expect(dailyNoteFormat(mockApp())).toBeUndefined();
        expect(dailyNoteFormat(mockApp({ dailyNotes: { folder: "Core", format: "" } }))).toBeUndefined();
    });

    it("noteDateFormats puts the block's own format before it", () => {
        const app = mockApp({ dailyNotes: { format: "DD.MM.YYYY" } });
        expect(noteDateFormats(app, "YYYYMMDD")?.names).toEqual(["YYYYMMDD", "DD.MM.YYYY"]);
        expect(noteDateFormats(app)?.names).toEqual(["DD.MM.YYYY"]);
        expect(noteDateFormats(mockApp())).toBeUndefined();
    });
});

describe("parseDateWithFormat (B-120)", () => {
    it.each([
        ["05.10.2026", "DD.MM.YYYY"],
        ["05-10-2026", "DD-MM-YYYY"],
        ["10/05/2026", "MM/DD/YYYY"],
        ["20261005", "YYYYMMDD"],
        ["2026-10-05-14:30", "YYYY-MM-DD-HH:mm"],
        ["5 October 2026", "D MMMM YYYY"],
        ["Monday, October 5th 2026", "dddd, MMMM Do YYYY"],
    ])("%s in %s is 5 October 2026", (text, format) => {
        expect(parseDateWithFormat(text, format)).toBe("2026-10-05");
    });

    it("is strict: a missing pad, trailing text or a day that does not exist is null", () => {
        expect(parseDateWithFormat("5.10.2026", "DD.MM.YYYY")).toBeNull();
        expect(parseDateWithFormat("05.10.2026 Monday", "DD.MM.YYYY")).toBeNull();
        expect(parseDateWithFormat("31.02.2026", "DD.MM.YYYY")).toBeNull();
        expect(parseDateWithFormat("13/05/2026", "MM/DD/YYYY")).toBeNull();
    });

    it("a weekday that does not match the date is not that date", () => {
        expect(parseDateWithFormat("Tuesday, October 5th 2026", "dddd, MMMM Do YYYY")).toBeNull();
    });

    it("an early year keeps four digits", () => {
        expect(parseDateWithFormat("05.10.0999", "DD.MM.YYYY")).toBe("0999-10-05");
    });

    it("reads month names in the language dates are drawn in, and caches per language", () => {
        expect(parseDateWithFormat("5 Oktober 2026", "D MMMM YYYY")).toBeNull();
        applyLocale("de");
        expect(parseDateWithFormat("5 Oktober 2026", "D MMMM YYYY")).toBe("2026-10-05");
        expect(parseDateWithFormat("5 October 2026", "D MMMM YYYY")).toBeNull();
        applyLocale("");
        expect(parseDateWithFormat("5 Oktober 2026", "D MMMM YYYY")).toBeNull();
        expect(parseDateWithFormat("5 October 2026", "D MMMM YYYY")).toBe("2026-10-05");
    });
});

describe("parsePeriodStart (B-129)", () => {
    it("returns the first day of the period a name stands for", () => {
        expect(parsePeriodStart("2026-W40", "GGGG-[W]WW")).toBe("2026-09-28");
        expect(parsePeriodStart("2026-W40", "gggg-[W]ww")).toBe("2026-09-27");
        expect(parsePeriodStart("2026-Q4", "YYYY-[Q]Q")).toBe("2026-10-01");
        expect(parsePeriodStart("2026-10", "YYYY-MM")).toBe("2026-10-01");
        expect(parsePeriodStart("2026", "YYYY")).toBe("2026-01-01");
        expect(parsePeriodStart("2026-W40 x", "GGGG-[W]WW")).toBeNull();
    });

    it("reads in the app's moment locale, not the language picked in Dashy, unlike parseDateWithFormat", () => {
        applyLocale("de");
        // German weeks start on Monday; the app's moment (English) starts them on Sunday.
        expect(firstDayOfWeek()).toBe(1);
        expect(parsePeriodStart("2026-W40", "gggg-[W]ww")).toBe("2026-09-27");
        expect(parsePeriodStart("Oktober 2026", "MMMM YYYY")).toBeNull();
        expect(parsePeriodStart("October 2026", "MMMM YYYY")).toBe("2026-10-01");
        expect(parseDateWithFormat("1 Oktober 2026", "D MMMM YYYY")).toBe("2026-10-01");
    });
});

describe("period name formats (B-129)", () => {
    it("reads every period's format from Periodic Notes, trimmed, the day falling back to Daily notes", () => {
        const app = mockApp({
            periodicNotes: {
                weekly: { folder: "W", format: " gggg-[W]ww " },
                monthly: { format: "YYYY-MM" },
                quarterly: { format: "YYYY-[Q]Q" },
                yearly: { format: "YYYY" },
            },
            dailyNotes: { folder: "Core", format: "DD.MM.YYYY" },
        });
        expect(periodNameFormats(app)).toEqual({
            day: "DD.MM.YYYY", week: "gggg-[W]ww", month: "YYYY-MM", quarter: "YYYY-[Q]Q", year: "YYYY",
        });
    });

    it("leaves out what is missing, blank or not text", () => {
        const app = mockApp({ periodicNotes: { quarterly: { format: "  " }, yearly: { format: 2026 }, weekly: "nope" } });
        expect(periodNameFormats(app)).toEqual({});
        expect(periodNameFormats(mockApp())).toEqual({});
    });

    it("a period switched on with no format saved reads in the Periodic Notes default (B-171)", () => {
        const app = mockApp({
            periodicNotes: {
                daily: { enabled: true, format: "" },
                weekly: { enabled: true, format: "" },
                monthly: { enabled: true },
                quarterly: { enabled: true, format: "  " },
                yearly: { enabled: true, format: "" },
            },
        });
        expect(periodNameFormats(app)).toEqual({
            week: "gggg-[W]ww", month: "YYYY-MM", quarter: "YYYY-[Q]Q", year: "YYYY",
        });
    });

    it("a saved format wins over the default, and a period switched off gets none (B-171)", () => {
        const app = mockApp({
            periodicNotes: {
                weekly: { enabled: true, format: "GGGG-[W]WW" },
                monthly: { enabled: false, format: "" },
                quarterly: { enabled: false, format: "YYYY-[Q]Q" },
                yearly: { enabled: "yes" },
            },
        });
        expect(periodNameFormats(app)).toEqual({ week: "GGGG-[W]WW", quarter: "YYYY-[Q]Q" });
    });

    it("an empty weekly format reads `2026-W40` as a locale week, Sunday to Saturday under English; ISO without the plugin (B-171)", () => {
        const withPlugin = periodContext(mockApp({ periodicNotes: { weekly: { enabled: true, format: "" } } }), "2026-W40.md");
        expect(readPeriodName("2026-W40", withPlugin.names)).toEqual({ unit: "week", start: "2026-09-27", end: "2026-10-03" });
        const without = periodContext(mockApp(), "2026-W40.md");
        expect(readPeriodName("2026-W40", without.names)).toEqual({ unit: "week", start: "2026-09-28", end: "2026-10-04" });
        const switchedOff = periodContext(mockApp({ periodicNotes: { weekly: { enabled: false, format: "" } } }));
        expect(readPeriodName("2026-W40", switchedOff.names)).toEqual({ unit: "week", start: "2026-09-28", end: "2026-10-04" });
    });

    it("periodContext names the note from its path, and reads a name in those formats", () => {
        const app = mockApp({ periodicNotes: { weekly: { format: "gggg-[W]ww" } } });
        const context = periodContext(app, "Periodic/2026-W40.md");
        expect(context.noteName).toBe("2026-W40");
        expect(context.names.formats.slice(1, 3).map((f) => f.format)).toEqual(["gggg-[W]ww", "GGGG-[W]WW"]);
        expect(context.names.parse("2026-W40", "gggg-[W]ww")).toBe("2026-09-27");
        expect(periodContext(app).noteName).toBeUndefined();
    });
});

describe("datetime", () => {
    it("formats a date by a moment pattern", () => {
        expect(formatDate(new Date(2026, 10, 15), "YYYY-MM-DD")).toBe("2026-11-15");
        expect(formatDate(new Date(2026, 8, 22), "gggg-[W]ww")).toBe("2026-W39");
    });

    it("gives seven weekday names, Sunday first", () => {
        const names = weekdayNamesShort();
        expect(names).toHaveLength(7);
        expect(names[0]).toBe("Sun");
    });

    it("gives twelve month names, January first", () => {
        const names = monthNamesShort();
        expect(names).toHaveLength(12);
        expect(names[0]).toBe("Jan");
    });

    it("reports which day the locale starts its week on", () => {
        expect([0, 1, 6]).toContain(firstDayOfWeek());
    });

    it("gives a short month name plus its year", () => {
        expect(monthYearShort(new Date(2025, 8, 1))).toBe("Sep 2025");
    });

    it("gives the year alone, without digit grouping, on 1 January and 31 December alike", () => {
        expect(formatYear(new Date(2024, 0, 1))).toBe("2024");
        expect(formatYear(new Date(2024, 11, 31))).toBe("2024");
    });

    it("gives a medium date for a heatmap cell's tooltip", () => {
        expect(formatDayMedium(new Date(2026, 8, 25))).toBe("Sep 25, 2026");
    });

    it("gives the locale's own time formats, 12-hour in English", () => {
        expect(timeFormats()).toEqual({ short: "h:mm A", long: "h:mm:ss A" });
    });

    it("reports a locale code", () => {
        expect(currentLocale()).toMatch(/^[a-z]{2}/);
    });
});

describe("locale wiring", () => {
    it("teaches i18n what Obsidian speaks", () => {
        setLocale("ru");
        const applied = applyObsidianLocale();
        expect(applied).toBe(getLocale());
        // moment in tests runs English, so this must land back on English.
        expect(applied).toBe("en");
    });

    it("a chosen language reaches the month names too, not just the catalog", () => {
        applyLocale("de");
        expect(getLocale()).toBe("de");
        // The catalog and moment have to agree, or one caption reads in each.
        expect(formatDate(new Date(2026, 0, 15), "MMMM")).toBe("Januar");
        expect(monthNamesShort()[0]).toBe("Jan.");
        expect(monthYearShort(new Date(2025, 0, 1))).toBe("Jan. 2025");
        expect(formatDayMedium(new Date(2026, 0, 15))).toBe("15. Jan. 2026");
        // and the clock's hours: German counts to 24
        expect(timeFormats()).toEqual({ short: "HH:mm", long: "HH:mm:ss" });
    });

    it("an empty choice follows Obsidian, which is English here", () => {
        applyLocale("de");
        applyLocale("");
        expect(getLocale()).toBe("en");
        expect(formatDate(new Date(2026, 0, 15), "MMMM")).toBe("January");
    });

    it("a language with no catalog falls back without dragging the dates along", () => {
        // `setLocale` lands on English; the dates must not be left in Japanese.
        expect(applyLocale("ja")).toBe("en");
        expect(formatDate(new Date(2026, 0, 15), "MMMM")).toBe("January");
    });
});

describe("VaultSnapshot", () => {
    it("walks the vault once, however many times it is asked", () => {
        const { ctx, walks } = countingContext({ notes: [{ path: "a.md" }] });
        ctx.notes();
        ctx.notes();
        ctx.notes();
        expect(walks()).toBe(1);
    });

    it("hands back the same records, not a fresh copy each time", () => {
        const { ctx } = countingContext({ notes: [{ path: "a.md" }] });
        expect(ctx.notes()).toBe(ctx.notes());
    });

    it("walks again once invalidated, and sees what changed", () => {
        const app = mockApp({ notes: [{ path: "a.md" }] });
        const files = [{ path: "a.md", basename: "a", parent: { path: "" }, note: { path: "a.md" } }];
        app.vault.getMarkdownFiles = (() => files) as typeof app.vault.getMarkdownFiles;
        const cache = new VaultSnapshot(app);

        expect(cache.get()).toHaveLength(1);
        files.push({ path: "b.md", basename: "b", parent: { path: "" }, note: { path: "b.md" } });
        expect(cache.get(), "still the cached answer").toHaveLength(1);

        cache.invalidate();
        expect(cache.get(), "and now the new one").toHaveLength(2);
    });

    it("invalidating twice in a row costs nothing extra", () => {
        const { ctx, walks, invalidate } = countingContext({ notes: [{ path: "a.md" }] });
        ctx.notes();
        invalidate();
        invalidate();
        ctx.notes();
        expect(walks()).toBe(2);
    });
});

describe("a page full of blocks", () => {
    it("walks the vault once between them, not once each", async () => {
        const { ctx, walks } = countingContext({
            notes: diary("Diary", "2026-01-01", 5, (i) => ({ v: i })),
        });
        const { renderTiles } = await import("../blocks/tiles");
        const { renderStats } = await import("../blocks/stats");
        const { renderProgress } = await import("../blocks/progress");
        const { renderHeatmap } = await import("../blocks/heatmap");

        const el = document.createElement("div");
        renderTiles(ctx, "items:\n  - { label: A, path: Diary, badge: count }", el);
        renderStats(ctx, "items:\n  - { label: A, source: Diary, agg: count }", document.createElement("div"));
        renderProgress(ctx, "items:\n  - { label: A, source: Diary, agg: count, goal: 10 }", document.createElement("div"));
        renderHeatmap(ctx, "source: Diary\nfield: v", document.createElement("div"));

        expect(walks()).toBe(1);
    });
});
