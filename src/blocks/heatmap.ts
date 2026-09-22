import type { BlockContext } from "./context";
import { weekdayNamesShort, monthNamesShort, firstDayOfWeek } from "../adapters/datetime";
import { selectNotes, readSource, unmatchedSource } from "../core/source";
import { numberAt } from "../core/aggregate";
import { formatValue } from "../core/stat";
import { layoutYear, dateKey, eachDay, yearsOf, rotateWeekdays, weekdayRow } from "../core/calendar";
import { toRgb, rgba, type Rgb } from "../core/palette";
import { readBands, bandFor, type Band } from "../core/bands";
import { parseConfig, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, internalLink } from "../shared/render";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN = Object.keys(schema.blocks.heatmap.root);

export function renderHeatmap(ctx: BlockContext, source: string, el: HTMLElement): void {
    clearBlock(el);
    const { value, diagnostics } = parseConfig(source, { root: KNOWN });
    const diags: Diagnostic[] = [...diagnostics];

    if (!isRecord(value)) {
        renderDiagnostics(el, "heatmap", diags.length ? diags : [{ level: "error", message: t("heatmap.expectFields") }]);
        return;
    }
    diags.push(...unknownKeys(value, KNOWN));

    const field = typeof value.field === "string" ? value.field : null;
    if (!field) {
        diags.push({ level: "error", message: t("heatmap.fieldRequired") });
        renderDiagnostics(el, "heatmap", diags);
        return;
    }

    const color = toRgb(value.color);
    const bands = readBands(value.bands);
    const linkable = value.link !== false;

    const { spec: selection, diagnostics: sourceDiags } = readSource(value);
    diags.push(...sourceDiags);
    const missing = unmatchedSource(ctx.notes(), selection);
    if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });
    const notes = selectNotes(ctx.notes(), selection);

    const byDate = new Map<string, { value: number; path: string }>();
    for (const n of notes) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(n.name)) continue;
        const v = numberAt(n, field);
        if (v === null) continue;
        byDate.set(n.name, { value: v, path: n.path });
    }

    if (!byDate.size) {
        diags.push({ level: "error", message: t("heatmap.noData", { field }) });
        renderDiagnostics(el, "heatmap", diags);
        return;
    }

    renderDiagnostics(el, "heatmap", diags);

    const today = new Date();
    const firstDay = firstDayOfWeek();
    for (const year of yearsOf([...byDate.keys()])) {
        drawYear(el, year, today, byDate, { color, bands, field, linkable, title: value.title, firstDay });
    }
}

interface DrawOptions {
    color: Rgb;
    bands: Band[];
    field: string;
    linkable: boolean;
    title: unknown;
    /** 0 is Sunday, 1 is Monday — whatever the locale says */
    firstDay: number;
}

function drawYear(
    el: HTMLElement,
    year: number,
    today: Date,
    byDate: Map<string, { value: number; path: string }>,
    opts: DrawOptions,
): void {
    const layout = layoutYear(year, today, opts.firstDay);
    const wrap = el.createDiv({ cls: "dashy-hm-wrap" });

    const present = eachDay(year, layout.total)
        .map((k) => byDate.get(k))
        .filter((v): v is { value: number; path: string } => v !== undefined);

    // Formatted the way a stat card formats it: the same data read "average 5"
    // here and "4.6" on a card, and both are presented as facts.
    const average = formatValue(
        present.length ? present.reduce((s, d) => s + d.value, 0) / present.length : 0,
    );
    const caption = typeof opts.title === "string"
        ? opts.title
        : t("heatmap.caption", {
            year,
            field: opts.field,
            average,
            present: present.length,
            total: layout.total,
        });
    wrap.createDiv({ cls: "dashy-hm-title", text: caption });

    const body = wrap.createDiv({ cls: "dashy-hm-body" });

    const side = body.createDiv({ cls: "dashy-hm-side" });
    // Every other row carries a name, and the run starts at Monday wherever it
    // has landed: Mon/Wed/Fri reads as a week to everyone, Tue/Thu/Sat does not.
    const mondayRow = weekdayRow(1, opts.firstDay);
    rotateWeekdays(weekdayNamesShort(), opts.firstDay)
        .forEach((w, i) => side.createDiv({
            cls: "dashy-hm-wd",
            text: i % 2 === mondayRow % 2 ? w : "",
        }));

    const main = body.createDiv({ cls: "dashy-hm-main" });
    const months = monthNamesShort();

    const monthRow = main.createDiv({ cls: "dashy-hm-months" });
    monthRow.style.gridTemplateColumns = `repeat(${layout.columns}, var(--dashy-cell))`;
    for (const m of layout.months) {
        const label = monthRow.createDiv({ cls: "dashy-hm-mon", text: months[m.month] ?? "" });
        label.style.gridColumnStart = String(m.column);
    }

    // grid-auto-flow: column over 7 rows — cells are added in order, so the
    // year starts with `offset` empty ones.
    const grid = main.createDiv({ cls: "dashy-hm-grid" });
    for (let i = 0; i < layout.offset; i++) grid.createDiv({ cls: "dashy-hm-cell dashy-hm-pad" });

    for (let i = 0; i < layout.total; i++) {
        const date = dateKey(new Date(year, 0, 1 + i));
        const hit = byDate.get(date);
        const cell = hit && opts.linkable
            ? internalLink(grid, hit.path, "dashy-hm-cell")
            : grid.createDiv({ cls: "dashy-hm-cell" });
        if (hit) {
            const band = bandFor(opts.bands, hit.value);
            const tooltip = t("heatmap.cell", { date, field: opts.field, value: hit.value });
            cell.style.backgroundColor = rgba(opts.color, band?.alpha ?? 1);
            cell.setAttr("aria-label", tooltip);
            cell.setAttr("title", tooltip);
        } else {
            cell.setAttr("title", t("heatmap.cellEmpty", { date }));
        }
    }

    const legend = wrap.createDiv({ cls: "dashy-hm-legend" });
    for (const b of opts.bands) {
        const row = legend.createDiv({ cls: "dashy-hm-leg" });
        row.createDiv({ cls: "dashy-hm-swatch" }).style.backgroundColor = rgba(opts.color, b.alpha);
        row.createSpan({ text: b.label });
    }
}
