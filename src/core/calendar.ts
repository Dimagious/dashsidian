/**
 * Раскладка года в сетку «колонка = неделя, строка = день недели».
 *
 * Чистый модуль: ни Obsidian, ни DOM. Всё, что рисует, лежит в blocks/heatmap.ts.
 */

/** Ключ дня в формате YYYY-MM-DD. */
export function dateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

const DAY_MS = 86_400_000;

/** Разница в целых днях между двумя ключами YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

export interface MonthLabel {
    /** индекс месяца, 0 = январь */
    month: number;
    /** колонка сетки, 1-based — годится прямо в grid-column-start */
    column: number;
}

export interface YearLayout {
    year: number;
    /**
     * Сколько пустых клеток идёт перед 1 января, чтобы первая строка сетки
     * была понедельником. Считается как (день недели 1 января + 6) % 7.
     */
    offset: number;
    /** Сколько дней года попадает в сетку: весь год, а для текущего — по сегодня. */
    total: number;
    /** Сколько колонок-недель занимает сетка. */
    columns: number;
    /** Подписи месяцев с колонками, в которых они начинаются. */
    months: MonthLabel[];
}

/**
 * Считает раскладку года.
 *
 * `today` передаётся явно, а не берётся из `new Date()`, чтобы тесты не
 * зависели от дня прогона.
 */
export function layoutYear(year: number, today: Date): YearLayout {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = year === cutoff.getFullYear() && cutoff < dec31 ? cutoff : dec31;

    const offset = (jan1.getDay() + 6) % 7;
    const total = Math.round((end.getTime() - jan1.getTime()) / DAY_MS) + 1;
    const columns = Math.ceil((total + offset) / 7);

    const months: MonthLabel[] = [];
    for (let m = 0; m < 12; m++) {
        const first = new Date(year, m, 1);
        if (first > end) break;
        const dayIndex = Math.round((first.getTime() - jan1.getTime()) / DAY_MS);
        months.push({ month: m, column: Math.floor((dayIndex + offset) / 7) + 1 });
    }

    return { year, offset, total, columns, months };
}

/** Ключи всех дней года, попадающих в сетку, по возрастанию. */
export function eachDay(year: number, total: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < total; i++) out.push(dateKey(new Date(year, 0, 1 + i)));
    return out;
}

/** Самая длинная цепочка подряд идущих дней. Вход — произвольный набор ключей. */
export function longestStreak(dates: readonly string[]): number {
    const sorted = [...dates].sort();
    let best = 0;
    let run = 0;
    let prev: string | null = null;
    for (const d of sorted) {
        run = prev !== null && daysBetween(prev, d) === 1 ? run + 1 : 1;
        if (run > best) best = run;
        prev = d;
    }
    return best;
}

/**
 * Длина цепочки, которая тянется до `today` включительно.
 * Если сегодняшнего дня в наборе нет — цепочка считается прерванной и равна 0.
 */
export function currentStreak(dates: readonly string[], today: string): number {
    const set = new Set(dates);
    if (!set.has(today)) return 0;
    let run = 0;
    const cursor = new Date(`${today}T00:00:00`);
    for (;;) {
        const key = dateKey(cursor);
        if (!set.has(key)) break;
        run++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return run;
}

/** Годы, присутствующие в наборе ключей, от новых к старым. */
export function yearsOf(dates: readonly string[]): number[] {
    const years = new Set<number>();
    for (const d of dates) years.add(Number(d.slice(0, 4)));
    return [...years].sort((a, b) => b - a);
}
