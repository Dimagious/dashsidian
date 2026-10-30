import { describe, it, expect, afterEach } from "vitest";
import { profileReading, profileSettings } from "./profile";
import { mockApp } from "../test/vault";
import { DEFAULT_SETTINGS } from "../types";
import { setLocale, FALLBACK_LOCALE } from "../i18n";

afterEach(() => setLocale(FALLBACK_LOCALE));

const VERSIONS = { plugin: "2.1.0", schema: "1.10.0" };
const TODAY = new Date(2026, 9, 30, 12);

describe("profileSettings (B-168)", () => {
    it("the periodic folders the today block uses, and where each came from", () => {
        const app = mockApp({
            dailyNotes: { folder: "Diary", format: "DD.MM.YYYY" },
            periodicNotes: { weekly: { enabled: true, folder: "Weeks", format: "" } },
            templates: { folder: "Templates" },
        });
        const settings = profileSettings(app, { ...DEFAULT_SETTINGS, monthlyFolder: "Months", startDayHour: 4 }, VERSIONS, TODAY);
        expect(settings.periodic).toEqual([
            { period: "daily", folder: "Diary", format: "DD.MM.YYYY", from: "Periodic Notes or Daily notes" },
            { period: "weekly", folder: "Weeks", format: "gggg-[W]ww", from: "Periodic Notes or Daily notes" },
            { period: "monthly", folder: "Months", format: "YYYY-MM", from: "Dashy settings" },
        ]);
        expect(settings).toMatchObject({
            pluginVersion: "2.1.0",
            schemaVersion: "1.10.0",
            today: "2026-10-30",
            startDayHour: 4,
            nameFormats: { day: "DD.MM.YYYY", week: "gggg-[W]ww" },
            templateFolders: ["Templates"],
        });
    });

    it("with no neighbour plugins every folder is the default, and the plugin's language is the one set", () => {
        setLocale("de");
        const settings = profileSettings(mockApp(), DEFAULT_SETTINGS, VERSIONS, TODAY);
        expect(settings.periodic.map((p) => [p.period, p.folder, p.from])).toEqual([["daily", "", "default"], ["weekly", "", "default"], ["monthly", "", "default"]]);
        expect(settings.pluginLanguage).toBe("de");
        expect(settings.nameFormats).toEqual({});
        expect(settings.templateFolders).toEqual([]);
        expect([0, 1, 6]).toContain(settings.firstDayOfWeek);
    });
});

describe("profileReading (B-168)", () => {
    it("reads names, note dates and template folders the way the blocks do", () => {
        const reading = profileReading(mockApp({ dailyNotes: { folder: "Diary", format: "DD.MM.YYYY" }, templates: { folder: "Templates" } }));
        expect(reading.templateFolders).toEqual(["Templates"]);
        expect(reading.dayFormats?.names).toEqual(["DD.MM.YYYY"]);
        expect(reading.dayFormats?.parse("05.10.2026", "DD.MM.YYYY")).toBe("2026-10-05");
        expect(reading.names?.formats.map((f) => f.format)).toContain("DD.MM.YYYY");
    });

    it("an ISO-only vault has no extra day formats", () => {
        expect(profileReading(mockApp()).dayFormats).toBeUndefined();
    });
});
