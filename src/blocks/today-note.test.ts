import { describe, it, expect, afterEach, vi } from "vitest";
import { moment } from "obsidian";
import { renderToday } from "./today";
import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import { setLocale } from "../i18n";
import { applyLocale } from "../adapters/locale";
import { RenameTrail } from "../app/renames";
import { mockContext, host, texts, nodes, diagnostics, type FakeVault } from "../test/vault";

/**
 * `today` with `date: note` (B-210): the day of the daily note the block
 * sits in, its week and month, the day before and after. Nothing here reads
 * the wall clock: the day comes from the note's name.
 */

afterEach(() => {
    // moment first: applyLocale("") copies moment's global locale, and a test
    // that set German would otherwise leave the i18n layer German.
    moment.locale("en");
    setLocale("en");
    applyLocale("");
    vi.useRealTimers();
});

const DIARY: DashySettings = { ...DEFAULT_SETTINGS, dailyFolder: "Diary" };

const draw = (config: string, sourcePath: string | undefined, vault: FakeVault = {}, settings = DIARY): HTMLElement => {
    const el = host();
    const ctx = mockContext(vault, settings);
    renderToday(sourcePath === undefined ? ctx : { ...ctx, sourcePath }, config, el);
    return el;
};

const hrefs = (el: HTMLElement, selector: string): string[] =>
    nodes(el, selector).map((n) => n.getAttribute("data-href") ?? "");

const WEEK_AND_MONTH = "date: note\nweekly: true\nmonthly: true";

describe("today, date: note: the note's day, not today (B-210)", () => {
    it("an ISO daily note: its date as the heading, its week and month, the day before and after", () => {
        const el = draw(WEEK_AND_MONTH, "Diary/2026-11-09.md");
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-today-date")).toEqual(["Monday, November 9, 2026"]);
        expect(texts(el, ".dashy-today-label")).toEqual(["Week", "Month"]);
        // The default weekly format is the locale week, Sunday first in English: 8 to 14 November.
        expect(texts(el, ".dashy-today-name")).toEqual(["2026-W46", "2026-11"]);
        expect(texts(el, ".dashy-today-nav-name")).toEqual(["2026-11-08", "2026-11-10"]);
        expect(hrefs(el, "a.dashy-today-nav-link")).toEqual(["Diary/2026-11-08.md", "Diary/2026-11-10.md"]);
        expect(nodes(el, ".dashy-today-nav")[0]?.textContent).toBe("←2026-11-08·2026-11-10→");
        expect(nodes(el, ".dashy-today-clock")).toHaveLength(0);
    });

    it("a daily format from Daily notes: the note's name read in it, the neighbours named in it", () => {
        const vault: FakeVault = { dailyNotes: { folder: "Journal", format: "DD.MM.YYYY" } };
        const el = draw("date: note\nmonthly: true", "Journal/09.11.2026.md", vault, DEFAULT_SETTINGS);
        expect(texts(el, ".dashy-today-date")).toEqual(["Monday, November 9, 2026"]);
        expect(texts(el, ".dashy-today-name")).toEqual(["2026-11"]);
        expect(texts(el, ".dashy-today-nav-name")).toEqual(["08.11.2026", "10.11.2026"]);
        expect(hrefs(el, "a.dashy-today-nav-link")).toEqual(["Journal/08.11.2026.md", "Journal/10.11.2026.md"]);
    });

    it("a name going on after the day is read like `period: note` reads it", () => {
        const el = draw(WEEK_AND_MONTH, "Diary/2026-11-09 Monday.md");
        expect(texts(el, ".dashy-today-date")).toEqual(["Monday, November 9, 2026"]);
        expect(diagnostics(el, "error")).toEqual([]);
    });

    it("a weekly note is an error naming the day formats, and nothing else is drawn", () => {
        const el = draw(WEEK_AND_MONTH, "Weekly/2026-W45.md");
        expect(diagnostics(el, "error")).toEqual([
            '⛔ today: `date: note` needs a note named for one day, and this note is "2026-W45". Name it in one of these formats: YYYY-MM-DD.',
        ]);
        expect(nodes(el, ".dashy-today")).toHaveLength(0);
    });

    it("the error lists the day format from the settings too", () => {
        const el = draw("date: note", "Home.md", { dailyNotes: { folder: "", format: "DD.MM.YYYY" } });
        expect(diagnostics(el, "error")[0]).toContain("Name it in one of these formats: DD.MM.YYYY, YYYY-MM-DD.");
    });

    it("drawn outside a note (no path) is the same error, not a crash", () => {
        const el = draw("date: note", undefined);
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(nodes(el, ".dashy-today")).toHaveLength(0);
    });

    it("in the template folder a name that is no day is a hint, not an error, under any other problem", () => {
        for (const vault of [{ templates: { folder: "Templates" } }, { templater: { templates_folder: "Templates" } }]) {
            const el = draw(`${WEEK_AND_MONTH}\nclock: true`, "Templates/Daily.md", vault);
            expect(diagnostics(el, "error")).toEqual([]);
            expect(diagnostics(el, "warning")).toHaveLength(1);
            expect(texts(el, ".dashy-notice")).toEqual([
                "This note is a template, so it has no day yet. A daily note made from it shows its own day.",
            ]);
            expect(nodes(el, ".dashy-today")).toHaveLength(0);
        }
        // Outside the template folder the same name is an error.
        expect(diagnostics(draw(WEEK_AND_MONTH, "Notes/Daily.md", { templates: { folder: "Templates" } }), "error")).toHaveLength(1);
    });

    it("the day before and after cross a month and a year", () => {
        expect(texts(draw("date: note", "Diary/2026-10-31.md"), ".dashy-today-nav-name")).toEqual(["2026-10-30", "2026-11-01"]);
        expect(texts(draw("date: note", "Diary/2026-03-01.md"), ".dashy-today-nav-name")).toEqual(["2026-02-28", "2026-03-02"]);
        expect(texts(draw("date: note", "Diary/2027-01-01.md"), ".dashy-today-nav-name")).toEqual(["2026-12-31", "2027-01-02"]);
        expect(texts(draw("date: note", "Diary/2026-12-31.md"), ".dashy-today-nav-name")).toEqual(["2026-12-30", "2027-01-01"]);
    });

    it("nav: false hides the day before and after", () => {
        const el = draw(`${WEEK_AND_MONTH}\nnav: false`, "Diary/2026-11-09.md");
        expect(nodes(el, ".dashy-today-nav")).toHaveLength(0);
        expect(texts(el, ".dashy-today-name")).toEqual(["2026-W46", "2026-11"]);
    });

    it("a neighbour that exists is a plain link; one that does not is dimmed and says a click creates it", () => {
        const el = draw("date: note", "Diary/2026-11-09.md", { alsoExists: ["Diary/2026-11-08.md"] });
        const [before, after] = nodes(el, "a.dashy-today-nav-link");
        expect(before?.className).toBe("dashy-today-nav-link is-previous internal-link");
        expect(before?.getAttribute("title")).toBe("Diary/2026-11-08.md");
        expect(after?.className).toBe("dashy-today-nav-link is-next is-missing internal-link");
        expect(after?.getAttribute("title")).toBe("Diary/2026-11-10.md: the note does not exist yet, clicking creates it");
    });

    it("a clock with date: note warns, is not drawn, and starts no timer", () => {
        vi.useFakeTimers();
        const el = host();
        const stop = renderToday({ ...mockContext({}, DIARY), sourcePath: "Diary/2026-11-09.md" }, "date: note\nclock: seconds", el);
        expect(diagnostics(el, "warning")).toEqual([
            "⚠️ today: `clock` is not shown with `date: note`: the time now means nothing in a note about one day. Remove `clock`.",
        ]);
        expect(nodes(el, ".dashy-today-clock")).toHaveLength(0);
        expect(texts(el, ".dashy-today-date")).toEqual(["Monday, November 9, 2026"]);
        expect(vi.getTimerCount()).toBe(0);
        expect(stop).toBeUndefined();
    });

    it("title still replaces the heading", () => {
        expect(texts(draw("date: note\ntitle: Diary", "Diary/2026-11-09.md"), ".dashy-today-date")).toEqual(["Diary"]);
    });

    it("any other date value warns and the block shows today", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 5, 12));
        const el = draw("date: tomorrow", "Diary/2026-11-09.md");
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ today: `date` takes only `note`, the day of the note this block sits in, got "tomorrow". Showing today.',
        ]);
        expect(texts(el, ".dashy-today-date")).toEqual(["Monday, October 5, 2026"]);
        expect(texts(el, ".dashy-today-label")).toEqual(["Today"]);
        expect(nodes(el, ".dashy-today-nav")).toHaveLength(0);
    });

    it("nav without date: note warns and draws no neighbours", () => {
        const el = draw("nav: true", "Diary/2026-11-09.md");
        expect(diagnostics(el, "warning")).toEqual(["⚠️ today: `nav` works only with `date: note`, ignored."]);
        expect(nodes(el, ".dashy-today-nav")).toHaveLength(0);
    });
});

describe("today, date: note: the daily chip of the note itself (B-210)", () => {
    it("is drawn as the current page, not as a link to itself", () => {
        const el = draw("date: note\ndaily: true\nweekly: true", "Diary/2026-11-09.md", { alsoExists: ["Diary/2026-11-09.md"] });
        const [day, week] = nodes(el, ".dashy-today-chip");
        expect(day?.tagName).toBe("DIV");
        expect(day?.className).toBe("dashy-today-chip is-current");
        expect(day?.getAttribute("aria-current")).toBe("page");
        expect(day?.getAttribute("title")).toBe("This note");
        expect(day?.hasAttribute("data-href")).toBe(false);
        expect(texts(el, ".dashy-today-label")).toEqual(["Day", "Week"]);
        expect(week?.tagName).toBe("A");
    });

    it("a daily note filed elsewhere than the daily folder links the one in the daily folder", () => {
        const el = draw("date: note\ndaily: true", "Inbox/2026-11-09.md");
        const [day] = nodes(el, ".dashy-today-chip");
        expect(day?.tagName).toBe("A");
        expect(day?.getAttribute("data-href")).toBe("Diary/2026-11-09.md");
    });
});

describe("today, date: note: the week and month of the note's day (B-210)", () => {
    const names = (path: string, vault: FakeVault = {}): string[] => texts(draw(WEEK_AND_MONTH, path, vault), ".dashy-today-name");

    it("an ISO weekly format names the days around New Year 2026-W53", () => {
        const vault: FakeVault = { periodicNotes: { weekly: { enabled: true, folder: "Weekly", format: "GGGG-[W]WW" } } };
        expect(names("Diary/2026-12-31.md", vault)).toEqual(["2026-W53", "2026-12"]);
        expect(names("Diary/2027-01-01.md", vault)).toEqual(["2026-W53", "2027-01"]);
        expect(hrefs(draw(WEEK_AND_MONTH, "Diary/2027-01-01.md", vault), "a.dashy-today-chip")[0]).toBe("Weekly/2026-W53.md");
    });

    it("the default locale week, Sunday first in English, names both days 2027-W01", () => {
        expect(names("Diary/2026-12-31.md")).toEqual(["2027-W01", "2026-12"]);
        expect(names("Diary/2027-01-01.md")).toEqual(["2027-W01", "2027-01"]);
    });

    it("a Sunday falls in the next week where weeks start on Sunday, in the same week where they start on Monday", () => {
        expect(names("Diary/2026-11-08.md")[0]).toBe("2026-W46");
        moment.locale("de");
        expect(names("Diary/2026-11-08.md")[0]).toBe("2026-W45");
    });
});

describe("today, date: note: language and renames (B-210)", () => {
    it("Russian: the labels, the heading and the errors follow the language", () => {
        applyLocale("ru");
        const el = draw("date: note\ndaily: true\nweekly: true\nmonthly: true", "Diary/2026-11-09.md");
        expect(texts(el, ".dashy-today-label")).toEqual(["День", "Неделя", "Месяц"]);
        expect(texts(el, ".dashy-today-date")).toEqual(["понедельник, 9 ноября 2026 г."]);
        expect(diagnostics(draw("date: note", "Diary/2026-W45.md"), "error")).toEqual([
            "⛔ today: `date: note` нужна заметка, названная по одному дню, а эта заметка называется «2026-W45». Назовите её в одном из форматов: YYYY-MM-DD.",
        ]);
    });

    it("after a rename the block reads the note's new name", () => {
        const trail = new RenameTrail();
        const ctx = mockContext({}, DIARY);
        const el = host();
        renderToday({ ...ctx, sourcePath: trail.current("Diary/2026-11-09.md") }, "date: note", el);
        expect(texts(el, ".dashy-today-date")).toEqual(["Monday, November 9, 2026"]);

        trail.renamed("Diary/2026-11-09.md", "Diary/2026-11-12.md");
        renderToday({ ...ctx, sourcePath: trail.current("Diary/2026-11-09.md") }, "date: note", el);
        expect(texts(el, ".dashy-today-date")).toEqual(["Thursday, November 12, 2026"]);
        expect(texts(el, ".dashy-today-nav-name")).toEqual(["2026-11-11", "2026-11-13"]);
        // One block, redrawn: not two copies.
        expect(nodes(el, ".dashy-today")).toHaveLength(1);
    });
});
