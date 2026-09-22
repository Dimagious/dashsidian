/**
 * Периодические заметки: какая папка, какой формат имени, какой путь.
 * Чистый слой — ни Obsidian, ни moment.
 *
 * Форматирование даты сюда не входит: строки формата задаются в moment-нотации,
 * а сам moment живёт внутри Obsidian и поставляется через adapters/periodic.ts.
 */

import type { Diagnostic } from "../shared/parse";

export const PERIODS = ["daily", "weekly", "monthly"] as const;
export type Period = (typeof PERIODS)[number];

/** Папка и формат имени заметки. Формат — в нотации moment. */
export interface PeriodConfig {
    folder: string;
    format: string;
}

/**
 * Умолчания на случай, когда ни Periodic Notes, ни ядровые Daily notes
 * не установлены. Совпадают с умолчаниями Periodic Notes.
 */
export const DEFAULT_FORMATS: Record<Period, string> = {
    daily: "YYYY-MM-DD",
    weekly: "gggg-[W]ww",
    monthly: "YYYY-MM",
};

/** Папка без ведущих и хвостовых слэшей; корень хранилища — пустая строка. */
export function normalizeFolder(folder: string): string {
    return folder.trim().replace(/^\/+|\/+$/g, "");
}

/** Путь заметки от корня хранилища, с расширением. */
export function notePath(folder: string, basename: string): string {
    const f = normalizeFolder(folder);
    return f ? `${f}/${basename}.md` : `${basename}.md`;
}

/**
 * Откуда берём папку и формат.
 *
 * Настройка Dashy главнее найденного у соседей: если человек вписал папку
 * руками, это осознанный выбор, и молча перебивать его чужим плагином нельзя.
 * Так же обещает текст в настройках — «leave empty to follow Periodic Notes».
 *
 * Формат из настроек Dashy не берётся: там только папки.
 */
export function resolveConfig(
    period: Period,
    dashyFolder: string,
    discovered: Partial<PeriodConfig> | undefined,
): PeriodConfig {
    const own = normalizeFolder(dashyFolder ?? "");
    const found = normalizeFolder(discovered?.folder ?? "");
    const format = discovered?.format?.trim();
    return {
        folder: own || found,
        format: format || DEFAULT_FORMATS[period],
    };
}

export interface TodaySpec {
    /** что показывать, в порядке daily → weekly → monthly */
    periods: Period[];
    /** свой заголовок вместо сегодняшней даты */
    title?: string;
}

export interface TodayOutcome {
    spec: TodaySpec | null;
    diagnostics: Diagnostic[];
}

/**
 * Разбирает конфиг блока `today`.
 *
 * Ни один из ключей не указан — показываем заметку дня: это то, чего человек
 * ждёт от блока с таким именем. Но стоит указать хоть один — работают только
 * указанные, иначе `weekly: true` молча притащил бы ещё и день.
 */
export function readToday(value: Record<string, unknown>): TodayOutcome {
    const diagnostics: Diagnostic[] = [];
    const mentioned = PERIODS.filter((p) => value[p] !== undefined);

    for (const p of mentioned) {
        if (typeof value[p] !== "boolean") {
            diagnostics.push({
                level: "warning",
                message: `\`${p}\` ожидает true или false, получено «${String(value[p])}» — считаю за ${truthy(value[p]) ? "true" : "false"}.`,
            });
        }
    }

    const periods = mentioned.length === 0
        ? (["daily"] as Period[])
        : mentioned.filter((p) => truthy(value[p]));

    if (!periods.length) {
        diagnostics.push({
            level: "error",
            message: "Нечего показывать: включи `daily`, `weekly` или `monthly`.",
        });
        return { spec: null, diagnostics };
    }

    const spec: TodaySpec = { periods };
    if (typeof value.title === "string" && value.title.trim()) spec.title = value.title.trim();
    return { spec, diagnostics };
}

/** YAML уже разобрал true/false; строки вроде "yes" приходят от моделей. */
function truthy(v: unknown): boolean {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return !["false", "no", "0", "off", "нет"].includes(v.trim().toLowerCase());
    if (typeof v === "number") return v !== 0;
    return v !== null && v !== undefined;
}
