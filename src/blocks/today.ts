import type { App } from "obsidian";
import { noteExists } from "../adapters/vault";
import { discoverPeriodics, formatDate } from "../adapters/periodic";
import { readToday, resolveConfig, notePath, type Period } from "../core/periodic";
import { parseConfig, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { renderDiagnostics, internalLink } from "../shared/render";
import type { DashySettings } from "../types";
import schema from "./schema.json";

/** Ключи берутся из schema.json — того же источника, из которого собирается скилл. */
const KNOWN = Object.keys(schema.blocks.today.root);

/** Заголовок по умолчанию: moment внутри Obsidian уже настроен на язык приложения. */
const TITLE_FORMAT = "D MMMM YYYY, dddd";

const LABELS: Record<Period, string> = {
    daily: "Сегодня",
    weekly: "Эта неделя",
    monthly: "Этот месяц",
};

const ICONS: Record<Period, string> = {
    daily: "📔",
    weekly: "🗓",
    monthly: "📆",
};

const FOLDER_KEY: Record<Period, "dailyFolder" | "weeklyFolder" | "monthlyFolder"> = {
    daily: "dailyFolder",
    weekly: "weeklyFolder",
    monthly: "monthlyFolder",
};

export function renderToday(
    app: App,
    settings: DashySettings,
    source: string,
    el: HTMLElement,
): void {
    const { value, diagnostics } = parseConfig(source, { root: KNOWN });
    const diags: Diagnostic[] = [...diagnostics];

    if (!isRecord(value)) {
        renderDiagnostics(el, "today", diags.length ? diags : [{
            level: "error",
            message: "Ожидается набор полей, например `daily: true`.",
        }]);
        return;
    }
    diags.push(...unknownKeys(value, KNOWN));

    const { spec, diagnostics: specDiags } = readToday(value);
    diags.push(...specDiags);
    if (!spec) {
        renderDiagnostics(el, "today", diags);
        return;
    }

    renderDiagnostics(el, "today", diags);

    const now = new Date();
    const discovered = discoverPeriodics(app);

    const wrap = el.createDiv({ cls: "dashy-today" });
    wrap.createDiv({ cls: "dashy-today-date", text: spec.title ?? formatDate(now, TITLE_FORMAT) });

    const row = wrap.createDiv({ cls: "dashy-today-links" });
    for (const period of spec.periods) {
        const cfg = resolveConfig(period, settings[FOLDER_KEY[period]], discovered[period]);
        const basename = formatDate(now, cfg.format);
        const path = notePath(cfg.folder, basename);
        const exists = noteExists(app, path);

        // Ссылка рисуется и на несуществующую заметку: клик по ней её создаст.
        // Приглушаем, чтобы «ещё нет» было видно до клика.
        const chip = internalLink(row, path, exists ? "dashy-today-chip" : "dashy-today-chip is-missing");
        chip.createSpan({ cls: "dashy-today-icon", text: ICONS[period] });
        chip.createSpan({ cls: "dashy-today-label", text: LABELS[period] });
        chip.createSpan({ cls: "dashy-today-name", text: basename });
        chip.setAttr("title", exists ? path : `${path} — заметки ещё нет, клик её создаст`);
    }
}
