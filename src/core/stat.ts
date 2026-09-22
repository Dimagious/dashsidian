/**
 * Карточка числа: что считать и как показать. Чистый слой.
 *
 * Разбор и форматирование живут здесь, а не в blocks/stats.ts, потому что
 * чистая функция в слое отрисовки — это функция вне гейта покрытия. Ровно так
 * в heatmap пропустили перевёрнутые подписи полос, см. core/bands.ts.
 */

import { AGGS, isAgg, type Agg } from "./aggregate";
import { nearest, type Diagnostic } from "../shared/parse";

export interface StatSpec {
    agg: Agg;
    /** обязателен для всего, кроме count и streak */
    field?: string;
    /** приписка после числа: км, %, дн. */
    unit?: string;
    /** знаков после запятой; не задано — форматируем по умолчанию */
    precision?: number;
}

/** Агрегаты, которым поле не нужно: считают заметки, а не числа в них. */
const FIELDLESS: readonly Agg[] = ["count", "streak"];

const MAX_PRECISION = 6;

export interface StatOutcome {
    /** null — считать нечем, карточка покажет прочерк */
    spec: StatSpec | null;
    diagnostics: Diagnostic[];
}

/**
 * Разбирает одну карточку. Не бросает: всё непонятное превращается
 * в диагностику, которую блок нарисует рядом с дашбордом.
 *
 * `label` нужен только для сообщений — иначе на пяти карточках не понять,
 * в какой из них ошибка.
 */
export function readStat(item: Record<string, unknown>, label: string): StatOutcome {
    const diagnostics: Diagnostic[] = [];
    const what = label ? `«${label}»` : "карточка без подписи";

    const rawAgg = item.agg ?? "count";
    if (!isAgg(rawAgg)) {
        const guess = typeof rawAgg === "string" ? nearest(rawAgg, AGGS) : null;
        diagnostics.push({
            level: "error",
            message: `${what}: агрегат «${String(rawAgg)}» неизвестен.${
                guess ? ` Возможно, «${guess}».` : ""
            } Доступны: ${AGGS.join(", ")}.`,
        });
        return { spec: null, diagnostics };
    }

    const field = typeof item.field === "string" && item.field.trim() ? item.field.trim() : undefined;
    if (!field && !FIELDLESS.includes(rawAgg)) {
        diagnostics.push({
            level: "error",
            message: `${what}: агрегату «${rawAgg}» нужно число — добавь \`field:\` с полем frontmatter.`,
        });
        return { spec: null, diagnostics };
    }

    const spec: StatSpec = { agg: rawAgg };
    if (field) spec.field = field;
    if (typeof item.unit === "string" && item.unit.trim()) spec.unit = item.unit.trim();

    if (item.precision !== undefined) {
        const p = item.precision;
        if (typeof p === "number" && Number.isInteger(p) && p >= 0 && p <= MAX_PRECISION) {
            spec.precision = p;
        } else {
            diagnostics.push({
                level: "warning",
                message: `${what}: \`precision\` ожидает целое от 0 до ${MAX_PRECISION}, получено «${String(p)}» — округляю по умолчанию.`,
            });
        }
    }

    return { spec, diagnostics };
}

/**
 * Число в текст карточки.
 *
 * Прочерк, а не ноль: «нечего считать» и «посчитали ноль» — разные ответы,
 * и подменять первый вторым значит врать о данных.
 *
 * Без `precision` целое остаётся целым, а дробное округляется до одного знака:
 * `avg` иначе выводит 72.83333333333333 и ломает вёрстку карточки.
 */
export function formatValue(value: number | null, precision?: number): string {
    if (value === null || !Number.isFinite(value)) return "—";
    if (precision !== undefined) return group(value.toFixed(precision));
    if (Number.isInteger(value)) return group(String(value));
    return group(String(Math.round(value * 10) / 10));
}

/** Узкий неразрывный пробел: разряды не должны переноситься по строкам. */
const GROUP_SEPARATOR = "\u202F";

/**
 * Разбивает целую часть по три разряда: 1138758 в карточке не читается.
 *
 * До четырёх цифр не трогаем — иначе год вроде 2026 превращается в «2 026»,
 * хотя это не величина, а номер.
 */
function group(text: string): string {
    const dot = text.indexOf(".");
    const int = dot === -1 ? text : text.slice(0, dot);
    const frac = dot === -1 ? "" : text.slice(dot);
    const sign = int.startsWith("-") ? "-" : "";
    const digits = sign ? int.slice(1) : int;
    if (digits.length <= 4) return text;
    return sign + digits.replace(/\B(?=(\d{3})+$)/g, GROUP_SEPARATOR) + frac;
}
