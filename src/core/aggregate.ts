/**
 * Сведение выборки в одно число. Чистый слой.
 */

import type { NoteRecord } from "./source";
import { longestStreak } from "./calendar";

export const AGGS = ["count", "sum", "avg", "min", "max", "latest", "streak"] as const;
export type Agg = (typeof AGGS)[number];

export function isAgg(v: unknown): v is Agg {
    return typeof v === "string" && (AGGS as readonly string[]).includes(v);
}

/** Число из frontmatter; всё, что не приводится к конечному числу — null. */
export function numberAt(note: NoteRecord, field: string): number | null {
    const raw = note.frontmatter[field];
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw === "string" && raw.trim() !== "") {
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

export interface AggregateSpec {
    agg: Agg;
    /** обязателен для всего, кроме count и streak */
    field?: string;
}

/**
 * `count` считает заметки. `streak` считает самую длинную цепочку подряд
 * идущих дней среди заметок, у которых поле заполнено (а без поля — среди
 * всех отобранных); имя заметки при этом должно быть датой YYYY-MM-DD.
 * Остальные агрегаты работают по числам поля.
 *
 * Возвращает null, когда считать нечего — вызывающий покажет прочерк.
 */
export function aggregate(notes: readonly NoteRecord[], spec: AggregateSpec): number | null {
    if (spec.agg === "count") return notes.length;

    if (spec.agg === "streak") {
        const dates = notes
            .filter((n) => (spec.field ? numberAt(n, spec.field) !== null : true))
            .map((n) => n.name)
            .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name));
        return longestStreak(dates);
    }

    if (!spec.field) return null;

    if (spec.agg === "latest") {
        const sorted = [...notes].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
        for (const n of sorted) {
            const v = numberAt(n, spec.field);
            if (v !== null) return v;
        }
        return null;
    }

    const values: number[] = [];
    for (const n of notes) {
        const v = numberAt(n, spec.field);
        if (v !== null) values.push(v);
    }
    if (!values.length) return null;

    switch (spec.agg) {
        case "sum":
            return values.reduce((a, b) => a + b, 0);
        case "avg":
            return values.reduce((a, b) => a + b, 0) / values.length;
        case "min":
            return Math.min(...values);
        case "max":
            return Math.max(...values);
        default:
            return null;
    }
}

/** Ряд значений по дням для спарклайна: последние `days` заметок-дат. */
export function series(notes: readonly NoteRecord[], field: string, days: number): number[] {
    return [...notes]
        .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n.name))
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .slice(-days)
        .map((n) => numberAt(n, field))
        .filter((v): v is number => v !== null);
}
