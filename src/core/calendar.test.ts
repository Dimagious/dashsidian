import { describe, it, expect } from "vitest";
import {
    dateKey,
    daysBetween,
    layoutYear,
    eachDay,
    longestStreak,
    currentStreak,
    yearsOf,
} from "./calendar";

describe("dateKey", () => {
    it("формирует YYYY-MM-DD из локальной даты", () => {
        expect(dateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
        expect(dateKey(new Date(2026, 8, 22))).toBe("2026-09-22");
    });

    it("не уезжает на сутки назад, как это делает toISOString в UTC+", () => {
        // Локальная полночь в плюсовом поясе — это предыдущий день по UTC.
        // Именно на этом разъезжалась вся сетка в первой версии.
        const midnight = new Date(2026, 2, 29, 0, 0, 0);
        expect(dateKey(midnight)).toBe("2026-03-29");
    });
});

describe("daysBetween", () => {
    it("считает целые сутки", () => {
        expect(daysBetween("2026-01-01", "2026-01-02")).toBe(1);
        expect(daysBetween("2026-01-01", "2026-02-01")).toBe(31);
        expect(daysBetween("2026-01-02", "2026-01-01")).toBe(-1);
    });

    it("переживает переход на летнее время", () => {
        expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
        expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    });
});

describe("layoutYear", () => {
    it("ставит 1 января 2026 в четверг: смещение 3", () => {
        const l = layoutYear(2026, new Date(2026, 8, 22));
        expect(l.offset).toBe(3);
    });

    it("текущий год обрезает по сегодня", () => {
        const l = layoutYear(2026, new Date(2026, 8, 22));
        expect(l.total).toBe(265); // 1 января → 22 сентября
        expect(l.columns).toBe(39);
    });

    it("прошедший год берёт целиком", () => {
        const l = layoutYear(2025, new Date(2026, 8, 22));
        expect(l.total).toBe(365);
    });

    it("високосный год — 366 дней", () => {
        const l = layoutYear(2024, new Date(2026, 8, 22));
        expect(l.total).toBe(366);
    });

    it("каждая клетка попадает в свою строку недели", () => {
        const l = layoutYear(2026, new Date(2026, 11, 31));
        for (let i = 0; i < l.total; i++) {
            const row = (i + l.offset) % 7;
            const weekday = (new Date(2026, 0, 1 + i).getDay() + 6) % 7;
            expect(row).toBe(weekday);
        }
    });

    it("подписи месяцев не выходят за пределы сетки", () => {
        const l = layoutYear(2026, new Date(2026, 8, 22));
        expect(l.months).toHaveLength(9); // январь…сентябрь
        expect(l.months[0]).toEqual({ month: 0, column: 1 });
        for (const m of l.months) expect(m.column).toBeLessThanOrEqual(l.columns);
    });
});

describe("eachDay", () => {
    it("отдаёт ключи по возрастанию", () => {
        const days = eachDay(2026, 3);
        expect(days).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    });
});

describe("longestStreak", () => {
    it("находит самую длинную цепочку", () => {
        expect(longestStreak(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05"])).toBe(3);
    });

    it("не зависит от порядка на входе", () => {
        expect(longestStreak(["2026-01-05", "2026-01-02", "2026-01-01", "2026-01-03"])).toBe(3);
    });

    it("пустой набор — ноль", () => {
        expect(longestStreak([])).toBe(0);
    });

    it("одиночный день — единица", () => {
        expect(longestStreak(["2026-01-01"])).toBe(1);
    });
});

describe("currentStreak", () => {
    it("считает цепочку, доходящую до сегодня", () => {
        const dates = ["2026-09-20", "2026-09-21", "2026-09-22"];
        expect(currentStreak(dates, "2026-09-22")).toBe(3);
    });

    it("если сегодня пропущено — цепочка нулевая", () => {
        expect(currentStreak(["2026-09-20", "2026-09-21"], "2026-09-22")).toBe(0);
    });

    it("считает через границу месяца", () => {
        expect(currentStreak(["2026-08-31", "2026-09-01"], "2026-09-01")).toBe(2);
    });
});

describe("yearsOf", () => {
    it("отдаёт годы от новых к старым без повторов", () => {
        expect(yearsOf(["2025-01-01", "2026-05-05", "2026-01-01"])).toEqual([2026, 2025]);
    });
});
