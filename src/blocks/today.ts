import type { BlockContext } from "./context";
import { noteExists } from "../adapters/vault";
import { discoverPeriodics } from "../adapters/periodic";
import { formatDate } from "../adapters/datetime";
import { readToday, resolveConfig, notePath, type Period } from "../core/periodic";
import { parseConfig, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, internalLink } from "../shared/render";
import { t, type MessageKey } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN = Object.keys(schema.blocks.today.root);

/**
 * `LL` is moment's locale-aware long date, so the parts land in the order the
 * language actually uses: "Tuesday, September 22, 2026" in English and
 * "вторник, 22 сентября 2026 г." in Russian. A fixed "D MMMM YYYY" only ever
 * looked right for languages that put the day first.
 */
const TITLE_FORMAT = "dddd, LL";

const LABEL_KEY: Record<Period, MessageKey> = {
    daily: "today.daily",
    weekly: "today.weekly",
    monthly: "today.monthly",
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

export function renderToday(ctx: BlockContext, source: string, el: HTMLElement): void {
    clearBlock(el);
    const { value, diagnostics } = parseConfig(source, { root: KNOWN });
    const diags: Diagnostic[] = [...diagnostics];

    if (!isRecord(value)) {
        renderDiagnostics(el, "today", diags.length ? diags : [{
            level: "error",
            message: t("today.expectFields"),
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
    const discovered = discoverPeriodics(ctx.app);

    const wrap = el.createDiv({ cls: "dashy-today" });
    wrap.createDiv({ cls: "dashy-today-date", text: spec.title ?? formatDate(now, TITLE_FORMAT) });

    const row = wrap.createDiv({ cls: "dashy-today-links" });
    for (const period of spec.periods) {
        const cfg = resolveConfig(period, ctx.settings[FOLDER_KEY[period]], discovered[period]);
        const basename = formatDate(now, cfg.format);
        const path = notePath(cfg.folder, basename);
        const exists = noteExists(ctx.app, path);

        // The link is drawn even for a note that does not exist: clicking it
        // creates the note. It is dimmed so that "not yet" shows before the click.
        const chip = internalLink(row, path, exists ? "dashy-today-chip" : "dashy-today-chip is-missing");
        chip.createSpan({ cls: "dashy-today-icon", text: ICONS[period] });
        chip.createSpan({ cls: "dashy-today-label", text: t(LABEL_KEY[period]) });
        chip.createSpan({ cls: "dashy-today-name", text: basename });
        chip.setAttr("title", exists ? path : t("today.missingNote", { path }));
    }
}
