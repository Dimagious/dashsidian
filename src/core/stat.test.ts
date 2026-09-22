import { describe, it, expect } from "vitest";
import { readStat, formatValue } from "./stat";

describe("readStat — счастливый путь", () => {
    it("без agg считает заметки", () => {
        const { spec, diagnostics } = readStat({ label: "Заметок", source: "01-Areas" }, "Заметок");
        expect(spec).toEqual({ agg: "count" });
        expect(diagnostics).toEqual([]);
    });

    it("агрегат по полю несёт поле дальше", () => {
        const { spec, diagnostics } = readStat({ agg: "avg", field: "sleep_score" }, "Сон");
        expect(spec).toEqual({ agg: "avg", field: "sleep_score" });
        expect(diagnostics).toEqual([]);
    });

    it("берёт unit и precision", () => {
        const { spec } = readStat({ agg: "sum", field: "distance_km", unit: "км", precision: 2 }, "Бег");
        expect(spec).toMatchObject({ unit: "км", precision: 2 });
    });

    it("streak обходится без поля", () => {
        const { spec, diagnostics } = readStat({ agg: "streak" }, "Подряд");
        expect(spec).toEqual({ agg: "streak" });
        expect(diagnostics).toEqual([]);
    });

    it("streak с полем поле сохраняет — цепочка считается по дням с этим числом", () => {
        const { spec } = readStat({ agg: "streak", field: "sleep_score" }, "Подряд");
        expect(spec).toEqual({ agg: "streak", field: "sleep_score" });
    });
});

describe("readStat — края", () => {
    it("пустое и пробельное поле считается незаданным", () => {
        for (const field of ["", "   "]) {
            expect(readStat({ agg: "avg", field }, "X").spec).toBeNull();
            expect(readStat({ agg: "count", field }, "X").spec).toEqual({ agg: "count" });
        }
    });

    it("обрезает пробелы вокруг поля и приписки", () => {
        const { spec } = readStat({ agg: "max", field: "  steps  ", unit: " шаг " }, "Шаги");
        expect(spec).toEqual({ agg: "max", field: "steps", unit: "шаг" });
    });

    it("пустая приписка не попадает в spec", () => {
        expect(readStat({ agg: "count", unit: "  " }, "X").spec).toEqual({ agg: "count" });
    });

    it("precision 0 — допустимое значение, а не «не задано»", () => {
        expect(readStat({ agg: "avg", field: "x", precision: 0 }, "X").spec?.precision).toBe(0);
    });

    it("карточка без подписи всё равно называет себя в сообщении", () => {
        const { diagnostics } = readStat({ agg: "avg" }, "");
        expect(diagnostics[0]?.message).toContain("карточка без подписи");
    });
});

describe("readStat — ошибки конфига", () => {
    it("агрегату по числам без field — ошибка, а не тихий ноль", () => {
        for (const agg of ["sum", "avg", "min", "max", "latest"]) {
            const { spec, diagnostics } = readStat({ agg }, "Сон");
            expect(spec).toBeNull();
            expect(diagnostics[0]?.level).toBe("error");
            expect(diagnostics[0]?.message).toContain("field");
        }
    });

    it("опечатка в agg подсказывает верный вариант", () => {
        const { spec, diagnostics } = readStat({ agg: "avgg", field: "x" }, "Сон");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("«avg»");
    });

    it("совсем не агрегат — ошибка со списком доступных", () => {
        const { spec, diagnostics } = readStat({ agg: "медиана", field: "x" }, "Сон");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.message).toContain("count");
    });

    it("agg не строкой не роняет разбор", () => {
        const { spec, diagnostics } = readStat({ agg: 42 }, "Сон");
        expect(spec).toBeNull();
        expect(diagnostics[0]?.level).toBe("error");
    });

    it("негодный precision — предупреждение, карточка всё равно рисуется", () => {
        for (const precision of [-1, 7, 1.5, "два", null]) {
            const { spec, diagnostics } = readStat({ agg: "count", precision }, "X");
            expect(spec).toEqual({ agg: "count" });
            expect(diagnostics[0]?.level).toBe("warning");
        }
    });
});

describe("formatValue", () => {
    it("нечего считать — прочерк, а не ноль", () => {
        expect(formatValue(null)).toBe("—");
    });

    it("ноль остаётся нулём", () => {
        expect(formatValue(0)).toBe("0");
    });

    it("целое выводится как есть", () => {
        expect(formatValue(212)).toBe("212");
    });

    it("дробное по умолчанию округляется до одного знака", () => {
        expect(formatValue(72.83333333333333)).toBe("72.8");
    });

    it("precision задаёт число знаков и добивает нулями", () => {
        expect(formatValue(72.8, 3)).toBe("72.800");
        expect(formatValue(72.83, 0)).toBe("73");
    });

    it("отрицательные и крошечные значения не дают «-0»", () => {
        expect(formatValue(-0.02)).toBe("0");
        expect(formatValue(-4.26)).toBe("-4.3");
    });

    it("бесконечность и NaN — прочерк", () => {
        expect(formatValue(Infinity)).toBe("—");
        expect(formatValue(NaN)).toBe("—");
    });
});

const NBSP = "\u202F";

describe("formatValue — разряды", () => {
    it("длинное число разбивается по три цифры", () => {
        expect(formatValue(1138758)).toBe(`1${NBSP}138${NBSP}758`);
    });

    it("год и четырёхзначный счётчик остаются слитными", () => {
        expect(formatValue(2026)).toBe("2026");
        expect(formatValue(9999)).toBe("9999");
    });

    it("разбивать начинаем с пяти цифр", () => {
        expect(formatValue(10000)).toBe(`10${NBSP}000`);
    });

    it("дробная часть не разбивается", () => {
        expect(formatValue(1234567.89, 2)).toBe(`1${NBSP}234${NBSP}567.89`);
    });

    it("минус остаётся при числе", () => {
        expect(formatValue(-1138758)).toBe(`-1${NBSP}138${NBSP}758`);
    });

    it("разделитель неразрывный — иначе число переносится по строкам", () => {
        expect(formatValue(1138758)).not.toContain(" ");
    });
});
