import { describe, it, expect } from "vitest";
import { normalizeFolder, notePath, resolveConfig, readToday, DEFAULT_FORMATS } from "./periodic";

describe("normalizeFolder", () => {
    it("снимает ведущие и хвостовые слэши", () => {
        expect(normalizeFolder("/Diary/")).toBe("Diary");
        expect(normalizeFolder("//a/b//")).toBe("a/b");
    });

    it("корень хранилища — пустая строка", () => {
        for (const v of ["", "   ", "/", "///"]) expect(normalizeFolder(v)).toBe("");
    });

    it("внутренние слэши не трогает", () => {
        expect(normalizeFolder("01-Areas/Personal/Дневник")).toBe("01-Areas/Personal/Дневник");
    });
});

describe("notePath", () => {
    it("склеивает папку и имя", () => {
        expect(notePath("Diary", "2026-09-22")).toBe("Diary/2026-09-22.md");
    });

    it("без папки кладёт в корень", () => {
        expect(notePath("", "2026-09-22")).toBe("2026-09-22.md");
    });

    it("грязная папка нормализуется, а не даёт двойной слэш", () => {
        expect(notePath("/Diary/", "2026-09-22")).toBe("Diary/2026-09-22.md");
    });

    it("имя с подпапкой от формата остаётся как есть", () => {
        // формат вида `YYYY/MM/YYYY-MM-DD` — легальная настройка Periodic Notes
        expect(notePath("Diary", "2026/09/2026-09-22")).toBe("Diary/2026/09/2026-09-22.md");
    });
});

describe("resolveConfig", () => {
    it("настройка Dashy главнее найденного у соседей", () => {
        const cfg = resolveConfig("daily", "Мой дневник", { folder: "Periodic/Daily", format: "DD-MM-YYYY" });
        expect(cfg.folder).toBe("Мой дневник");
        // формат всё равно берётся у соседа: в настройках Dashy форматов нет
        expect(cfg.format).toBe("DD-MM-YYYY");
    });

    it("пустая настройка уступает соседу", () => {
        expect(resolveConfig("daily", "", { folder: "Periodic/Daily", format: "DD-MM-YYYY" }))
            .toEqual({ folder: "Periodic/Daily", format: "DD-MM-YYYY" });
    });

    it("пробелы в настройке — это пустая настройка", () => {
        expect(resolveConfig("daily", "   ", { folder: "Periodic" }).folder).toBe("Periodic");
    });

    it("соседа нет — формат по умолчанию для периода", () => {
        expect(resolveConfig("daily", "", undefined).format).toBe(DEFAULT_FORMATS.daily);
        expect(resolveConfig("weekly", "", undefined).format).toBe(DEFAULT_FORMATS.weekly);
        expect(resolveConfig("monthly", "", undefined).format).toBe(DEFAULT_FORMATS.monthly);
    });

    it("ничего не известно — корень хранилища", () => {
        expect(resolveConfig("daily", "", {}).folder).toBe("");
    });

    it("пустой формат у соседа не затирает умолчание", () => {
        expect(resolveConfig("weekly", "", { folder: "W", format: "  " }).format)
            .toBe(DEFAULT_FORMATS.weekly);
    });
});

describe("readToday", () => {
    it("ни одного ключа — показываем заметку дня", () => {
        expect(readToday({}).spec?.periods).toEqual(["daily"]);
        expect(readToday({ title: "Сегодня" }).spec?.periods).toEqual(["daily"]);
    });

    it("указанный ключ отменяет умолчание", () => {
        expect(readToday({ weekly: true }).spec?.periods).toEqual(["weekly"]);
    });

    it("порядок всегда день → неделя → месяц, как бы ни написали", () => {
        const spec = readToday({ monthly: true, daily: true, weekly: true }).spec;
        expect(spec?.periods).toEqual(["daily", "weekly", "monthly"]);
    });

    it("false исключает период", () => {
        expect(readToday({ daily: true, weekly: false }).spec?.periods).toEqual(["daily"]);
    });

    it("берёт свой заголовок", () => {
        expect(readToday({ title: "  Мой день  " }).spec?.title).toBe("Мой день");
    });

    it("пустой заголовок не попадает в spec", () => {
        expect(readToday({ title: "   " }).spec?.title).toBeUndefined();
    });

    it("всё выключено — ошибка, а не пустая строка", () => {
        const { spec, diagnostics } = readToday({ daily: false, weekly: false, monthly: false });
        expect(spec).toBeNull();
        expect(diagnostics[0]?.level).toBe("error");
    });

    it("не-булево значение предупреждает, но блок рисуется", () => {
        const { spec, diagnostics } = readToday({ daily: "yes" });
        expect(spec?.periods).toEqual(["daily"]);
        expect(diagnostics[0]?.level).toBe("warning");
    });

    it("строковое отрицание понимается как false", () => {
        for (const v of ["false", "no", "0", "off", "нет", "НЕТ"]) {
            expect(readToday({ daily: v, weekly: true }).spec?.periods).toEqual(["weekly"]);
        }
    });

    it("null в значении выключает период", () => {
        const { spec } = readToday({ daily: null, weekly: true });
        expect(spec?.periods).toEqual(["weekly"]);
    });
});
