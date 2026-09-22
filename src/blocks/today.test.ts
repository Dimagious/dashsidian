import { describe, it, expect, afterEach } from "vitest";
import { renderToday } from "./today";
import { DEFAULT_SETTINGS } from "../types";
import { setLocale } from "../i18n";
import { mockContext, host, texts, nodes, diagnostics } from "../test/vault";

const TODAY = new Date();
const key = (d: Date) =>
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
const TODAY_KEY = key(TODAY);

afterEach(() => setLocale("en"));

const row = (config: string, settings = DEFAULT_SETTINGS, vault = {}) => {
    const el = host();
    renderToday(mockContext(vault, settings), config, el);
    return el;
};

describe("today — the links point at real paths", () => {
    it("the daily note is named by today's date", () => {
        const el = row("daily: true", { ...DEFAULT_SETTINGS, dailyFolder: "Diary" });
        expect(nodes(el, "a.dashy-today-chip")[0]?.getAttribute("data-href"))
            .toBe(`Diary/${TODAY_KEY}.md`);
    });

    it("with no key given, only the day is shown", () => {
        const el = row("title: Anything");
        expect(nodes(el, ".dashy-today-chip")).toHaveLength(1);
        expect(texts(el, ".dashy-today-label")).toEqual(["Today"]);
    });

    it("naming one period switches the default off", () => {
        const el = row("weekly: true");
        expect(texts(el, ".dashy-today-label")).toEqual(["This week"]);
    });

    it("all three come out in day, week, month order however they are written", () => {
        const el = row("monthly: true\nweekly: true\ndaily: true");
        expect(texts(el, ".dashy-today-label")).toEqual(["Today", "This week", "This month"]);
    });

    it("a note that exists is a live link; one that does not is marked missing", () => {
        const el = row("daily: true\nweekly: true",
            { ...DEFAULT_SETTINGS, dailyFolder: "Diary" },
            { alsoExists: [`Diary/${TODAY_KEY}.md`] });
        const chips = nodes(el, ".dashy-today-chip");
        expect(chips[0]?.className).not.toContain("is-missing");
        expect(chips[1]?.className).toContain("is-missing");
    });

    it("a missing note still links, and says clicking will create it", () => {
        const el = row("daily: true");
        const chip = nodes(el, "a.dashy-today-chip")[0];
        expect(chip?.getAttribute("data-href")).toBe(`${TODAY_KEY}.md`);
        expect(chip?.getAttribute("title")).toContain("does not exist yet");
    });

    it("a custom title replaces the date and is left exactly as written", () => {
        const el = row("title: my day\ndaily: true");
        expect(texts(el, ".dashy-today-date")).toEqual(["my day"]);
    });
});

describe("today — where the folder comes from", () => {
    const periodic = {
        daily: { folder: "PN/Daily", format: "YYYY-MM-DD" },
        weekly: { folder: "PN/Weekly", format: "gggg-[W]ww" },
    };

    it("Periodic Notes is used when Dashy has nothing set", () => {
        const el = row("daily: true", DEFAULT_SETTINGS, { periodicNotes: periodic });
        expect(nodes(el, "a")[0]?.getAttribute("data-href")).toContain("PN/Daily/");
    });

    it("a folder set in Dashy wins over Periodic Notes", () => {
        const el = row("daily: true",
            { ...DEFAULT_SETTINGS, dailyFolder: "Mine" },
            { periodicNotes: periodic });
        expect(nodes(el, "a")[0]?.getAttribute("data-href")).toBe(`Mine/${TODAY_KEY}.md`);
    });

    it("a period switched off at the neighbour still lends its folder", () => {
        const el = row("monthly: true", DEFAULT_SETTINGS, {
            periodicNotes: { monthly: { enabled: false, folder: "PN/Monthly", format: "YYYY-MM" } },
        });
        expect(nodes(el, "a")[0]?.getAttribute("data-href")).toContain("PN/Monthly/");
    });

    it("the core Daily notes plugin is picked up when Periodic Notes is absent", () => {
        const el = row("daily: true", DEFAULT_SETTINGS, {
            dailyNotes: { folder: "Core", format: "DD-MM-YYYY" },
        });
        const href = nodes(el, "a")[0]?.getAttribute("data-href") ?? "";
        expect(href.startsWith("Core/")).toBe(true);
        expect(href).not.toContain(TODAY_KEY);
    });

    it("with no neighbour at all the note lands in the vault root", () => {
        const el = row("daily: true");
        expect(nodes(el, "a")[0]?.getAttribute("data-href")).toBe(`${TODAY_KEY}.md`);
    });

    it("garbage in the neighbour's settings is ignored, not crashed on", () => {
        for (const periodicNotes of ["nonsense", 42, null, { daily: "wrong" }, {}]) {
            const el = row("daily: true", DEFAULT_SETTINGS, { periodicNotes });
            expect(nodes(el, "a")).toHaveLength(1);
        }
    });
});

describe("today — edges", () => {
    it("everything switched off is an error, not an empty row", () => {
        const el = row("daily: false\nweekly: false\nmonthly: false");
        expect(diagnostics(el, "error")[0]).toContain("daily");
        expect(nodes(el, ".dashy-today")).toHaveLength(0);
    });

    it("a non-boolean warns and is read as written", () => {
        const el = row("daily: yes");
        expect(diagnostics(el, "warning")[0]).toContain("true or false");
        expect(nodes(el, ".dashy-today-chip")).toHaveLength(1);
    });

    it("a string negation switches the period off", () => {
        const el = row("daily: 'no'\nweekly: true");
        expect(texts(el, ".dashy-today-label")).toEqual(["This week"]);
    });

    it("an unknown key warns with a suggestion", () => {
        const el = row("daily: true\nweekley: true");
        expect(diagnostics(el, "warning")[0]).toContain("weekly");
    });

    it("a list where a set of fields was expected is reported", () => {
        const el = row("- daily");
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(nodes(el, ".dashy-today")).toHaveLength(0);
    });

    it("the labels follow the language", () => {
        setLocale("ru");
        const el = row("daily: true\nweekly: true");
        expect(texts(el, ".dashy-today-label")).toEqual(["Сегодня", "Эта неделя"]);
    });
});
