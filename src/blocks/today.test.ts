import { describe, it, expect, afterEach, vi } from "vitest";
import { renderToday } from "./today";
import { DEFAULT_SETTINGS } from "../types";
import { setLocale } from "../i18n";
import { applyLocale } from "../adapters/locale";
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

    it("a synonym of a key today does not have is reported as written (B-125)", () => {
        // `folder` means `source` elsewhere; today has no `source`, so the
        // warning must not name a key the author never wrote.
        const el = row("daily: true\nfolder: Diary");
        expect(diagnostics(el, "warning")).toEqual(['⚠️ today: Unknown key "folder", ignored.']);
        expect(nodes(el, ".dashy-today-chip")).toHaveLength(1);
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

describe("today — the clock (B-151)", () => {
    afterEach(() => {
        vi.useRealTimers();
        applyLocale("");
    });

    /** 5 October 2026, a Monday, 09:05:40.500 local time. */
    const MORNING = new Date(2026, 9, 5, 9, 5, 40, 500);

    const clockAt = (at: Date, config: string): HTMLElement => {
        vi.useFakeTimers();
        vi.setSystemTime(at);
        return row(config);
    };

    it("clock: true draws hours and minutes above the date, 12-hour in English", () => {
        const el = clockAt(MORNING, "clock: true");
        expect(texts(el, ".dashy-today-clock")).toEqual(["9:05 AM"]);
        expect(texts(el, ".dashy-today-date")).toEqual(["Monday, October 5, 2026"]);
        const wrap = nodes(el, ".dashy-today")[0];
        expect(wrap?.firstElementChild?.className).toBe("dashy-today-clock");
        expect(wrap?.children[1]?.className).toBe("dashy-today-date");
    });

    it("clock: minutes is the same as true, seconds adds the seconds", () => {
        expect(texts(clockAt(MORNING, "clock: minutes"), ".dashy-today-clock")).toEqual(["9:05 AM"]);
        expect(texts(clockAt(MORNING, "clock: seconds"), ".dashy-today-clock")).toEqual(["9:05:40 AM"]);
    });

    it("a 24-hour language gets zero-padded 24-hour time", () => {
        applyLocale("de");
        expect(texts(clockAt(MORNING, "clock: true"), ".dashy-today-clock")).toEqual(["09:05"]);
        expect(texts(clockAt(new Date(2026, 9, 5, 21, 5, 7), "clock: seconds"), ".dashy-today-clock"))
            .toEqual(["21:05:07"]);
    });

    it("turns over on the minute, not a minute after the block was drawn", () => {
        const el = clockAt(MORNING, "clock: true");
        vi.advanceTimersByTime(19_499);
        expect(texts(el, ".dashy-today-clock")).toEqual(["9:05 AM"]);
        vi.advanceTimersByTime(1);
        expect(texts(el, ".dashy-today-clock")).toEqual(["9:06 AM"]);
        vi.advanceTimersByTime(60_000 * 54);
        expect(texts(el, ".dashy-today-clock")).toEqual(["10:00 AM"]);
    });

    it("seconds tick every second", () => {
        const el = clockAt(MORNING, "clock: seconds");
        vi.advanceTimersByTime(500);
        expect(texts(el, ".dashy-today-clock")).toEqual(["9:05:41 AM"]);
        vi.advanceTimersByTime(19_000);
        expect(texts(el, ".dashy-today-clock")).toEqual(["9:06:00 AM"]);
    });

    it("a tick changes only the clock's text: no redraw, no vault, no new date", () => {
        vi.useFakeTimers();
        vi.setSystemTime(MORNING);
        const base = mockContext();
        let notes = 0;
        let today = 0;
        const ctx = {
            ...base,
            notes: () => { notes += 1; return base.notes(); },
            today: () => { today += 1; return base.today(); },
        };
        const el = host();
        renderToday(ctx, "clock: true\nweekly: true", el);
        const [clock] = nodes(el, ".dashy-today-clock");
        const [date] = nodes(el, ".dashy-today-date");
        const [chip] = nodes(el, ".dashy-today-chip");
        const readsAfterDraw = { notes, today };

        vi.advanceTimersByTime(60_000 * 3);
        expect(clock?.textContent).toBe("9:08 AM");
        expect(nodes(el, ".dashy-today-clock")[0]).toBe(clock);
        expect(nodes(el, ".dashy-today-date")[0]).toBe(date);
        expect(nodes(el, ".dashy-today-chip")[0]).toBe(chip);
        expect({ notes, today }).toEqual(readsAfterDraw);
    });

    it("is not an aria-live region", () => {
        const el = clockAt(MORNING, "clock: seconds");
        const clock = nodes(el, ".dashy-today-clock")[0];
        expect(clock?.hasAttribute("aria-live")).toBe(false);
        expect(clock?.hasAttribute("role")).toBe(false);
        expect(el.querySelector("[aria-live]")).toBeNull();
    });

    it("no clock key, or clock: false, draws no clock and starts no timer", () => {
        for (const config of ["daily: true", "clock: false"]) {
            const el = clockAt(MORNING, config);
            expect(nodes(el, ".dashy-today-clock")).toHaveLength(0);
            expect(nodes(el, ".dashy-today-chip")).toHaveLength(1);
            expect(vi.getTimerCount()).toBe(0);
        }
    });

    it("a value it cannot read warns, shows no clock and still draws the rest", () => {
        const el = clockAt(MORNING, "clock: hours");
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ today: `clock` expects true, false, minutes or seconds, got "hours". The clock is not shown.',
        ]);
        expect(nodes(el, ".dashy-today-clock")).toHaveLength(0);
        expect(texts(el, ".dashy-today-date")).toEqual(["Monday, October 5, 2026"]);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("the warning follows the language", () => {
        setLocale("ru");
        const el = clockAt(MORNING, "clock: 5");
        expect(diagnostics(el, "warning")[0]).toContain("Часы не показаны");
    });

    it("a custom title keeps the clock above it", () => {
        const el = clockAt(MORNING, "clock: true\ntitle: Home");
        expect(texts(el, ".dashy-today-clock")).toEqual(["9:05 AM"]);
        expect(texts(el, ".dashy-today-date")).toEqual(["Home"]);
    });

    it("a redraw stops the previous clock: one timer however often it is drawn", () => {
        vi.useFakeTimers();
        vi.setSystemTime(MORNING);
        const ctx = mockContext();
        const el = host();
        renderToday(ctx, "clock: seconds", el);
        vi.advanceTimersByTime(1_000); // past the aligning timeout, onto the interval
        renderToday(ctx, "clock: seconds", el);
        vi.advanceTimersByTime(1_000);
        renderToday(ctx, "clock: seconds", el);
        expect(vi.getTimerCount()).toBe(1);
        expect(nodes(el, ".dashy-today-clock")).toHaveLength(1);

        vi.advanceTimersByTime(5_000);
        expect(texts(el, ".dashy-today-clock")).toEqual(["9:05:47 AM"]);
        expect(vi.getTimerCount()).toBe(1);
    });

    it("a redraw into a broken config or without the clock stops it too", () => {
        vi.useFakeTimers();
        vi.setSystemTime(MORNING);
        const ctx = mockContext();
        const el = host();
        renderToday(ctx, "clock: true", el);
        expect(vi.getTimerCount()).toBe(1);
        renderToday(ctx, "- not a map", el);
        expect(vi.getTimerCount()).toBe(0);

        renderToday(ctx, "clock: true", el);
        renderToday(ctx, "daily: true", el);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("hands back a disposer that stops the clock; none without a clock", () => {
        vi.useFakeTimers();
        vi.setSystemTime(MORNING);
        const ctx = mockContext();
        const el = host();
        const dispose = renderToday(ctx, "clock: true", el);
        expect(typeof dispose).toBe("function");
        dispose?.();
        expect(vi.getTimerCount()).toBe(0);

        expect(renderToday(ctx, "daily: true", host())).toBeUndefined();
    });

    it("two blocks keep two clocks, and stopping one leaves the other", () => {
        vi.useFakeTimers();
        vi.setSystemTime(MORNING);
        const ctx = mockContext();
        const a = host();
        const b = host();
        const stopA = renderToday(ctx, "clock: true", a);
        renderToday(ctx, "clock: seconds", b);
        expect(vi.getTimerCount()).toBe(2);
        stopA?.();
        vi.advanceTimersByTime(20_000);
        expect(texts(a, ".dashy-today-clock")).toEqual(["9:05 AM"]);
        expect(texts(b, ".dashy-today-clock")).toEqual(["9:06:00 AM"]);
    });

    it("past midnight the clock turns over and the next draw brings the new date", () => {
        // The date line is redrawn by the plugin's day-rollover timer, which
        // calls the same draw again; between the two the clock keeps going.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 30));
        const ctx = mockContext();
        const el = host();
        renderToday(ctx, "clock: true", el);
        vi.advanceTimersByTime(30_000);
        expect(texts(el, ".dashy-today-clock")).toEqual(["12:00 AM"]);

        renderToday(ctx, "clock: true", el);
        expect(texts(el, ".dashy-today-date")).toEqual(["Tuesday, October 6, 2026"]);
        expect(texts(el, ".dashy-today-clock")).toEqual(["12:00 AM"]);
        expect(vi.getTimerCount()).toBe(1);
    });
});
