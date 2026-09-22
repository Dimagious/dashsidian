import { describe, it, expect, afterEach } from "vitest";
import { snapshot, noteExists } from "./vault";
import { discoverPeriodics } from "./periodic";
import { formatDate, currentLocale, weekdayNamesShort, monthNamesShort, firstDayOfWeek } from "./datetime";
import { applyObsidianLocale } from "./locale";
import { setLocale, getLocale } from "../i18n";
import { mockApp } from "../test/vault";

afterEach(() => setLocale("en"));

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
});
