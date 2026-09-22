import { isRecord } from "../shared/parse";

/** Полоса раскраски: всё, что >= min, красится своей прозрачностью. */
export interface Band {
    min: number;
    alpha: number;
    label: string;
}

/** Прозрачности по умолчанию, от верхней полосы к нижней. */
export const DEFAULT_ALPHAS = [1, 0.72, 0.46, 0.22];

function alphaFor(i: number): number {
    return DEFAULT_ALPHAS[Math.min(i, DEFAULT_ALPHAS.length - 1)] ?? 0.22;
}

/**
 * Разбирает `bands`. Две формы:
 *   [90, 80, 60]                     — только пороги, остальное подставляем
 *   [{ min, alpha, label }, …]       — полная
 *
 * Полосы всегда отдаются по убыванию min, чтобы поиск шёл первым совпадением.
 * Верхняя полоса открыта сверху («90+»), остальные ограничены предыдущей
 * («80–89»). Нижняя НЕ открыта снизу в подписи: «60–79» честнее, чем «60+»,
 * потому что значения ниже 60 попадут в неё же, но подпись про это не врёт.
 */
export function readBands(raw: unknown): Band[] {
    if (!Array.isArray(raw) || raw.length === 0) {
        return [{ min: Number.NEGATIVE_INFINITY, alpha: 1, label: "есть данные" }];
    }

    if (raw.every((v) => typeof v === "number")) {
        const nums = [...(raw as number[])].sort((a, b) => b - a);
        return nums.map((min, i) => ({
            min,
            alpha: alphaFor(i),
            label: i === 0 ? `${min}+` : `${min}–${(nums[i - 1] ?? min) - 1}`,
        }));
    }

    return raw
        .filter(isRecord)
        .map((b, i) => ({
            min: typeof b.min === "number" ? b.min : Number.NEGATIVE_INFINITY,
            alpha: typeof b.alpha === "number" ? b.alpha : alphaFor(i),
            label: typeof b.label === "string" ? b.label : `от ${String(b.min ?? "")}`,
        }))
        .sort((a, b) => b.min - a.min);
}

/** Первая полоса, в которую попадает значение. Полосы должны идти по убыванию. */
export function bandFor(bands: readonly Band[], value: number): Band | undefined {
    return bands.find((b) => value >= b.min);
}
