import { describe, it, expect, afterEach } from "vitest";
import { interpolate, resolveLocale, pluralCategory } from "./translate";
import { t, tPlural, setLocale, getLocale, AVAILABLE_LOCALES, FALLBACK_LOCALE, CATALOGS } from "./index";
import { en, type MessageKey } from "./en";
import { ru } from "./ru";

afterEach(() => setLocale(FALLBACK_LOCALE));

describe("interpolate", () => {
    it("fills a slot", () => {
        expect(interpolate("Unknown key \"{key}\".", { key: "feild" }))
            .toBe("Unknown key \"feild\".");
    });

    it("fills every occurrence of every slot", () => {
        expect(interpolate("{a}-{b}-{a}", { a: "x", b: "y" })).toBe("x-y-x");
    });

    it("accepts numbers", () => {
        expect(interpolate("line {line}", { line: 3 })).toBe("line 3");
    });

    it("leaves an unknown slot alone instead of printing undefined", () => {
        expect(interpolate("{a} {b}", { a: "x" })).toBe("x {b}");
    });

    it("no params — template as is", () => {
        expect(interpolate("plain text")).toBe("plain text");
    });

    it("zero is a value, not a missing param", () => {
        expect(interpolate("{n} left", { n: 0 })).toBe("0 left");
    });
});

describe("resolveLocale", () => {
    const available = ["en", "ru"];

    it("exact match wins", () => {
        expect(resolveLocale("ru", available, "en")).toBe("ru");
    });

    it("regional code falls back to its language", () => {
        expect(resolveLocale("ru-RU", available, "en")).toBe("ru");
        expect(resolveLocale("ru_RU", available, "en")).toBe("ru");
    });

    it("case and spaces do not matter", () => {
        expect(resolveLocale("  RU  ", available, "en")).toBe("ru");
    });

    it("unknown language falls back", () => {
        expect(resolveLocale("zh-cn", available, "en")).toBe("en");
    });

    it("empty, null and undefined fall back", () => {
        for (const code of ["", "   ", null, undefined]) {
            expect(resolveLocale(code, available, "en")).toBe("en");
        }
    });
});

describe("t", () => {
    it("English by default", () => {
        expect(t("today.daily")).toBe("Today");
    });

    it("switches language", () => {
        setLocale("ru");
        expect(t("today.daily")).toBe("Сегодня");
    });

    it("passes params through", () => {
        setLocale("ru");
        expect(t("render.line", { line: 7 })).toBe("строка 7");
    });

    it("unknown locale falls back to English and reports what was chosen", () => {
        expect(setLocale("klingon")).toBe("en");
        expect(getLocale()).toBe("en");
        expect(t("today.daily")).toBe("Today");
    });

    it("a key missing from a catalog falls back to English, not to the key itself", () => {
        const incomplete = { en, xx: {} };
        const saved = CATALOGS.xx;
        CATALOGS.xx = incomplete.xx;
        try {
            setLocale("xx");
            expect(t("today.daily")).toBe("Today");
        } finally {
            if (saved === undefined) delete CATALOGS.xx;
        }
    });
});

describe("catalogs", () => {
    it("English is the fallback and is registered", () => {
        expect(AVAILABLE_LOCALES).toContain(FALLBACK_LOCALE);
    });

    it("Russian is complete — every English key is translated", () => {
        const missing = (Object.keys(en) as MessageKey[]).filter((k) => ru[k] === undefined);
        expect(missing).toEqual([]);
    });

    it("no catalog invents keys English does not have", () => {
        for (const [code, catalog] of Object.entries(CATALOGS)) {
            const extra = Object.keys(catalog).filter((k) => !(k in en));
            expect(extra, `catalog ${code}`).toEqual([]);
        }
    });

    it("every slot used by a translation exists in the English template", () => {
        const slots = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
        for (const [code, catalog] of Object.entries(CATALOGS)) {
            for (const [key, value] of Object.entries(catalog)) {
                expect(slots(value), `${code} / ${key}`).toEqual(slots(en[key as MessageKey]));
            }
        }
    });
});

describe("tPlural", () => {
    it("English splits one from the rest", () => {
        expect(tPlural("countdown.daysLeft", 1)).toBe("day left");
        expect(tPlural("countdown.daysLeft", 5)).toBe("days left");
    });

    it("Russian picks all three forms", () => {
        setLocale("ru");
        expect(tPlural("countdown.daysLeft", 1)).toBe("день остался");
        expect(tPlural("countdown.daysLeft", 3)).toBe("дня осталось");
        expect(tPlural("countdown.daysLeft", 11)).toBe("дней осталось");
        expect(tPlural("countdown.daysLeft", 21)).toBe("день остался");
    });

    it("the past tense family works the same way", () => {
        setLocale("ru");
        expect(tPlural("countdown.daysAgo", 2)).toBe("дня назад");
    });

    it("zero takes the many form in Russian, the plural in English", () => {
        expect(tPlural("countdown.daysLeft", 0)).toBe("days left");
        setLocale("ru");
        expect(tPlural("countdown.daysLeft", 0)).toBe("дней осталось");
    });
});

describe("pluralCategory", () => {
    it("knows English", () => {
        expect(pluralCategory("en", 1)).toBe("one");
        expect(pluralCategory("en", 2)).toBe("other");
    });

    it("knows Russian", () => {
        expect(pluralCategory("ru", 1)).toBe("one");
        expect(pluralCategory("ru", 2)).toBe("few");
        expect(pluralCategory("ru", 5)).toBe("many");
    });

    it("a category we do not carry falls back instead of failing", () => {
        // Arabic has zero/two; we carry neither.
        expect(["one", "few", "many", "other"]).toContain(pluralCategory("ar", 2));
    });

    it("a nonsense locale does not throw", () => {
        expect(pluralCategory("not a locale", 1)).toBe("other");
    });
});
