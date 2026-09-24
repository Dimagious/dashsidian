import type { BlockContext } from "./context";
import { weekdayNamesShort, monthNamesShort, firstDayOfWeek } from "../adapters/datetime";
import { selectNotes, readSource, unmatchedSource } from "../core/source";
import { numberAt, isFalseMark, isBooleanMark } from "../core/aggregate";
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

    // One entry per date the field resolved on at all — a boolean `false` is
    // in here too, with `painted: false`: that day still tells the block the
    // field exists, it just does not get coloured. Without the distinction, a
    // field that is `false` on every day looked identical to a field nothing
    // ever set, and a stats `avg` over the same field would silently disagree
    // with the heatmap's own caption about what the average is.
    const marks = new Map<string, DayMark>();
    for (const n of notes) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(n.name)) continue;
        const v = numberAt(n, field);
        if (v === null) continue;
        const painted = !isFalseMark(n, field);
        // A painted mark must never be displaced by a `false` one for the
        // same date: two notes named the same day (Personal/2026-01-02 and
        // Work/2026-01-02, one ticked and one not) used to paint or not
        // depending on which the vault happened to iterate last. `streak`
        // never had this problem — it dedupes date names after dropping
        // `false` ones, so any note that passes keeps the day regardless of
        // order — and the heatmap now agrees with it. Two painted notes for
        // the same day (true/true, or two different numbers) still resolve
        // last-write-wins, same as always: only "false vs. painted" has one
        // honest answer.
        if (!painted && marks.get(n.name)?.painted) continue;
        marks.set(n.name, { value: v, path: n.path, isBool: isBooleanMark(n, field), painted });
    }

    if (!marks.size) {
        diags.push({ level: "error", message: t("heatmap.noData", { field }) });
        renderDiagnostics(el, "heatmap", diags);
        return;
    }

    renderDiagnostics(el, "heatmap", diags);

    const today = new Date();
    const firstDay = firstDayOfWeek();
    // One grid per calendar year. With more than one, each has to say which
    // year it is — otherwise two grids under the same custom title read as the
    // same thing drawn twice, which is exactly how it was first reported.
    const years = yearsOf([...marks.keys()]);
    for (const year of years) {
        drawYear(el, year, today, marks, {
            color, bands, field, linkable, title: value.title, firstDay,
            severalYears: years.length > 1,
        });
    }
}

/** A day the field resolved on. `painted` is false only for a boolean `false`. */
interface DayMark {
    value: number;
    path: string;
    isBool: boolean;
    painted: boolean;
}

interface DrawOptions {
    color: Rgb;
    bands: Band[];
    field: string;
    linkable: boolean;
    title: unknown;
    /** 0 is Sunday, 1 is Monday — whatever the locale says */
    firstDay: number;
    /** Whether this grid is one of several, and so has to name its year. */
    severalYears: boolean;
}

function drawYear(
    el: HTMLElement,
    year: number,
    today: Date,
    marks: Map<string, DayMark>,
    opts: DrawOptions,
): void {
    const layout = layoutYear(year, today, opts.firstDay);
    const wrap = el.createDiv({ cls: "dashy-hm-wrap" });

    const yearMarks = eachDay(year, layout.total)
        .map((k) => marks.get(k))
        .filter((v): v is DayMark => v !== undefined);
    const present = yearMarks.filter((m) => m.painted);

    // The average counts every recognised day, a `false` one included as 0 —
    // the same sum a stats `avg` card over this field would show. Counting
    // only the painted days used to read "average 1" for an all-boolean field
    // no matter how many days were actually unticked, which is not the rate
    // anyone reading a habit tracker would call "average".
    const average = formatValue(
        yearMarks.length ? yearMarks.reduce((s, m) => s + m.value, 0) / yearMarks.length : 0,
    );

    // Every painted day of an all-boolean field can only ever be 1: "average 1"
    // states the obvious rather than informing, so the caption drops it.
    const booleanOnly = yearMarks.length > 0 && yearMarks.every((m) => m.isBool);

    const caption = typeof opts.title === "string"
        ? (opts.severalYears ? t("heatmap.titleYear", { title: opts.title, year }) : opts.title)
        : booleanOnly
            ? t("heatmap.captionMarks", {
                year,
                field: opts.field,
                present: present.length,
                total: layout.total,
            })
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
        const hit = marks.get(date);
        const paintable = hit?.painted ? hit : undefined;
        const cell = paintable && opts.linkable
            ? internalLink(grid, paintable.path, "dashy-hm-cell")
            : grid.createDiv({ cls: "dashy-hm-cell" });
        if (paintable) {
            const band = bandFor(opts.bands, paintable.value);
            const tooltip = t("heatmap.cell", { date, field: opts.field, value: paintable.value });
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

    // Where the year does not fit, open it at the most recent day rather than
    // at January. On a phone the visible third of a past year is empty, which
    // reads as a broken grid; its data is at the end. A grid that fits does
    // not move, because there is nowhere to scroll.
    wrap.scrollLeft = wrap.scrollWidth;
}
