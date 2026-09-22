import { moment, type App } from "obsidian";
import { PERIODS, type Period, type PeriodConfig } from "../core/periodic";
import { isRecord } from "../shared/parse";

/**
 * Где лежат периодические заметки — по данным соседних плагинов.
 *
 * Официального API у Periodic Notes нет, и тянуть `obsidian-daily-notes-interface`
 * ради трёх полей — это зависимость (см. ADR 0001, тот же довод, что про Dataview).
 * Поэтому читаем настройки напрямую и защищаемся от любого их вида: соседа может
 * не быть вовсе, он может обновиться и переехать. Ничего не нашли — вернём пусто,
 * и core/periodic.ts подставит умолчания.
 */
export type Discovered = Partial<Record<Period, Partial<PeriodConfig>>>;

/** Приватная часть App: в публичных типах её нет, но она стабильна годами. */
interface PluginHost {
    plugins?: { plugins?: Record<string, unknown> };
    internalPlugins?: { plugins?: Record<string, unknown> };
}

export function discoverPeriodics(app: App): Discovered {
    const host = app as unknown as PluginHost;
    const out: Discovered = {};

    const periodic = host.plugins?.plugins?.["periodic-notes"];
    const settings = isRecord(periodic) ? periodic.settings : undefined;
    if (isRecord(settings)) {
        for (const period of PERIODS) {
            const cfg = settings[period];
            // `enabled` сознательно игнорируем: даже выключенный у соседа период
            // хранит настроенную папку, а это лучшая догадка, чем корень хранилища.
            // Раз блок просит `monthly: true`, заметка нужна именно там.
            if (!isRecord(cfg)) continue;
            const found = pick(cfg);
            if (found) out[period] = found;
        }
    }

    // Ядровой «Daily notes» знает только про день и уступает Periodic Notes.
    if (!out.daily) {
        const core = host.internalPlugins?.plugins?.["daily-notes"];
        const instance = isRecord(core) ? core.instance : undefined;
        const options = isRecord(instance) ? instance.options : undefined;
        if (isRecord(options)) {
            const found = pick(options);
            if (found) out.daily = found;
        }
    }

    return out;
}

function pick(cfg: Record<string, unknown>): Partial<PeriodConfig> | null {
    const folder = typeof cfg.folder === "string" ? cfg.folder : "";
    const format = typeof cfg.format === "string" ? cfg.format : "";
    return folder || format ? { folder, format } : null;
}

/**
 * Дата в имя заметки по формату moment.
 *
 * `moment` берём из Obsidian, а не из npm: он там уже есть, настроен на язык
 * приложения и форматы Periodic Notes записаны в той же нотации.
 */
export function formatDate(date: Date, format: string): string {
    return moment(date).format(format);
}
