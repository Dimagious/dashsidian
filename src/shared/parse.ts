/**
 * Разбор YAML-конфига блока.
 *
 * Автор конфига часто не человек, а языковая модель: она пишет файл и уходит,
 * отрисовку не видит. Поэтому парсер прощает — принимает синонимы ключей,
 * не падает на лишнем поле, а про сомнительное сообщает предупреждением.
 * Жёстко валимся только там, где без значения рисовать нечего.
 */

import { parse as parseYaml } from "yaml";

export interface Diagnostic {
    level: "error" | "warning";
    message: string;
    /** 1-based номер строки внутри блока, если удалось определить */
    line?: number;
}

export interface ParseOutcome<T> {
    value: T | null;
    diagnostics: Diagnostic[];
}

/** Канонический ключ ← его синонимы. */
export const KEY_ALIASES: Record<string, string> = {
    folder: "source",
    from: "source",
    path: "path",
    title: "label",
    name: "label",
    emoji: "icon",
    property: "field",
    prop: "field",
    aggregate: "agg",
    target: "goal",
    colour: "color",
};

/** Приводит ключи объекта к каноническим именам, рекурсивно. */
export function canonicalize(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (input === null || typeof input !== "object") return input;

    const out: Record<string, unknown> = {};
    for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
        const key = KEY_ALIASES[rawKey] ?? rawKey;
        out[key] = canonicalize(value);
    }
    return out;
}

/**
 * YAML → объект. Ошибка синтаксиса не бросается наверх, а возвращается
 * диагностикой с номером строки.
 */
export function parseConfig(source: string): ParseOutcome<unknown> {
    const text = source.trim();
    if (!text) {
        return { value: null, diagnostics: [{ level: "error", message: "Блок пустой." }] };
    }
    try {
        return { value: canonicalize(parseYaml(text)), diagnostics: [] };
    } catch (e) {
        const err = e as { message?: string; linePos?: { line: number }[] };
        return {
            value: null,
            diagnostics: [{
                level: "error",
                message: `Не разобрать YAML: ${err.message ?? String(e)}`,
                line: err.linePos?.[0]?.line,
            }],
        };
    }
}

/**
 * Список элементов. Принимает и голый массив, и объект с `items:` —
 * обе формы встречаются в том, что пишут модели.
 */
export function asItems(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value) && Array.isArray(value.items)) return value.items.filter(isRecord);
    if (isRecord(value)) return [value];
    return [];
}

export function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Предупреждение про ключи, которых мы не знаем — с подсказкой. */
export function unknownKeys(
    obj: Record<string, unknown>,
    known: readonly string[],
): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const key of Object.keys(obj)) {
        if (known.includes(key)) continue;
        const guess = nearest(key, known);
        out.push({
            level: "warning",
            message: guess
                ? `Ключ «${key}» неизвестен. Возможно, имелся в виду «${guess}».`
                : `Ключ «${key}» неизвестен и пропущен.`,
        });
    }
    return out;
}

/** Ближайший по расстоянию Левенштейна, если он достаточно близок. */
export function nearest(word: string, options: readonly string[]): string | null {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const o of options) {
        const d = distance(word, o);
        if (d < bestScore) {
            bestScore = d;
            best = o;
        }
    }
    return best !== null && bestScore <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

function distance(a: string, b: string): number {
    const prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let carry = prev[0] ?? 0;
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const temp = prev[j] ?? 0;
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            prev[j] = Math.min((prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + 1, carry + cost);
            carry = temp;
        }
    }
    return prev[b.length] ?? 0;
}
