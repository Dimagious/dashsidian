import type { BlockContext } from "./context";
import { weekdayNamesShort, monthNamesShort, firstDayOfWeek } from "../adapters/datetime";
import { selectNotes, readSource, unmatchedSource } from "../core/source";
import { numberAt, isFalseMark, isBooleanMark } from "../core/aggregate";
import { readDateField, resolveNoteDate } from "../core/note-date";
import { formatValue } from "../core/stat";
import { layoutYear, dateKey, eachDay, yearsOf, rotateWeekdays, weekdayRow } from "../core/calendar";
import { toRgb, rgba, type Rgb } from "../core/palette";
import { readBands, bandFor, type Band } from "../core/bands";
import { scrollEdges } from "../core/scroll";
import { parseConfig, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, internalLink } from "../shared/render";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN = Object.keys(schema.blocks.heatmap.root);

/**
 * One `ResizeObserver` per year grid drawn into a block's element, so the
 * next redraw can disconnect them before making new ones. `clearBlock` empties
 * the element but does not touch a `ResizeObserver`: it keeps observing a
 * detached node forever unless told to stop, and every redraw would leak one
 * more. Keyed by the element rather than held in a closure because the block
 * is a plain draw function called fresh each time, with nowhere else to keep
 * state between calls.
 */
const observers = new WeakMap<HTMLElement, ResizeObserver[]>();

/** Disconnects and forgets whatever is currently tracked for `el`, if anything. */
function disconnectObservers(el: HTMLElement): void {
    for (const observer of observers.get(el) ?? []) observer.disconnect();
    observers.delete(el);
}

export function renderHeatmap(ctx: BlockContext, source: string, el: HTMLElement): void | (() => void) {
    clearBlock(el);
    disconnectObservers(el);

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
    const dateField = readDateField(value);

    const { spec: selection, diagnostics: sourceDiags } = readSource(value);
    diags.push(...sourceDiags);
    const missing = unmatchedSource(ctx.notes(), selection);
    if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });
    const notes = selectNotes(ctx.notes(), selection);

    // One entry per day the field resolved on at all. Two or more notes
    // landing on the same day (`date_field`, or names like "2026-01-02" and
    // "2026-01-02 Monday" in different folders) are one cell, not two: its
    // value is their sum (steps logged in two notes add up), and it counts
    // as painted the moment any of them is — a boolean `false` never hides a
    // number or a ticked `true` on the same day, only outweighs a day where
    // every contributing note is `false`. A `false`-only day still lands
    // here, with `painted: false`: that day still tells the block the field
    // exists, it just does not get coloured. Without the distinction, a
    // field that is `false` on every day looked identical to a field nothing
    // ever set, and a stats `avg` over the same field would silently disagree
    // with the heatmap's own caption about what the average is.
    const groups = new Map<string, DayGroup>();
    for (const n of notes) {
        const day = resolveNoteDate(n, dateField);
        if (day === null) continue;
        const v = numberAt(n, field);
        if (v === null) continue;
        const painted = !isFalseMark(n, field);
        const g = groups.get(day) ?? { sum: 0, paintedPath: null, allBool: true };
        g.sum += v;
        g.allBool = g.allBool && isBooleanMark(n, field);
        // The cell links to one note deterministically: the first by path
        // among the notes that contributed a painted value, regardless of
        // the order the vault happened to hand the notes in.
        if (painted && (g.paintedPath === null || n.path < g.paintedPath)) g.paintedPath = n.path;
        groups.set(day, g);
    }
    const marks = new Map<string, DayMark>();
    for (const [day, g] of groups) {
        marks.set(day, { value: g.sum, path: g.paintedPath ?? "", isBool: g.allBool, painted: g.paintedPath !== null });
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
    const drawn: ResizeObserver[] = [];
    for (const year of years) {
        const observer = drawYear(el, year, today, marks, {
            color, bands, field, linkable, title: value.title, firstDay,
            severalYears: years.length > 1,
        });
        if (observer) drawn.push(observer);
    }
    if (drawn.length) {
        observers.set(el, drawn);
        // Redraws clean up after themselves (the `disconnectObservers` call
        // above), but the block being removed from the note entirely never
        // redraws again; this is what `DashyBlock.onunload` (plugin.ts)
        // calls for that case. It reads `observers` fresh rather than
        // closing over `drawn`, so it stays correct across any further
        // redraw between now and unload.
        return () => disconnectObservers(el);
    }
}

/** A day the field resolved on. `painted` is false only for a boolean `false`. */
interface DayMark {
    value: number;
    path: string;
    isBool: boolean;
    painted: boolean;
}

/** Accumulator for one day while its contributing notes are being folded together. */
interface DayGroup {
    sum: number;
    /** the painted contributor with the smallest path so far, or null when none yet is */
    paintedPath: string | null;
    /** whether every contributing note has been a boolean mark so far */
    allBool: boolean;
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
): ResizeObserver | null {
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

    // `main` never scrolls itself, it only constrains the width; the actual
    // scrolling, and the fade mask (blocks.css), are both on `scroll`.
    const main = body.createDiv({ cls: "dashy-hm-main" });
    const scroll = main.createDiv({ cls: "dashy-hm-scroll" });
    const months = monthNamesShort();

    const monthRow = scroll.createDiv({ cls: "dashy-hm-months" });
    monthRow.style.gridTemplateColumns = `repeat(${layout.columns}, var(--dashy-cell))`;
    for (const m of layout.months) {
        const label = monthRow.createDiv({ cls: "dashy-hm-mon", text: months[m.month] ?? "" });
        label.style.gridColumnStart = String(m.column);
    }

    // grid-auto-flow: column over 7 rows — cells are added in order, so the
    // year starts with `offset` empty ones.
    const grid = scroll.createDiv({ cls: "dashy-hm-grid" });
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
    // at January (9f3db44): on a phone the visible third of a past year is
    // empty, which reads as a broken grid; its data is at the end. `total`
    // (core/calendar.ts) already stops the grid at the most recent day —
    // today for the current year, 31 December for a past one — so "scroll to
    // the end" and "scroll to the data" are the same target here.
    //
    // Getting that scroll to stick took more than "defer it until the width
    // is real": measured against a real Obsidian start, the very first
    // `ResizeObserver` callback fires before this plugin's own styles.css has
    // applied. At that moment `.dashy-hm-scroll` is still `overflow-x:
    // visible` (the browser default), so `scrollWidth` reads the same as
    // `clientWidth` — 452 and 452, not narrower — and scrolling to that is a
    // no-op the block cannot tell apart from "nothing to scroll to" without
    // also checking `clientWidth`. Committing to that unstyled reading (or
    // simply not checking it against `clientWidth`) is what "opens at
    // January instead of the end" traced back to: 20-35ms later the
    // stylesheet lands, `scrollWidth`/`clientWidth` become the real,
    // narrower pair, and the observer fires again, but a one-shot flag has
    // already spent itself on the earlier, meaningless reading.
    //
    // `settled` replaces that flag with an interaction gate instead of a
    // timer: nothing here is trusted to mean "the reader has taken over"
    // except the reader actually doing something — the first `wheel`,
    // `touchstart`, `pointerdown` or `keydown` on the scroller, or a
    // `scroll` event whose position does not match what this block itself
    // last assigned (a genuine drag, not the `scrollLeft` write below firing
    // its own `scroll` event). Until then, every real (styled) layout keeps
    // re-asserting the end, which is what survives the unstyled-then-styled
    // sequence above without needing to know its exact timing.
    let settled = false;
    let lastAssignedScrollLeft: number | null = null;

    const settle = (): void => {
        settled = true;
    };

    // `scroll` is the element that actually scrolls (see `.dashy-hm-scroll`
    // in blocks.css, which also carries the fade mask), not `wrap`: `wrap`
    // also holds the title and the weekday column, neither of which should
    // ever move or fade.
    const updateScrollState = (): void => {
        // `>`, not just truthy: an unstyled `scrollWidth === clientWidth`
        // reading (see above) has nothing to scroll to and must not be
        // mistaken for "caught up with the real layout".
        if (!settled && scroll.scrollWidth > scroll.clientWidth) {
            scroll.scrollLeft = scroll.scrollWidth;
            lastAssignedScrollLeft = scroll.scrollLeft;
        }
        const { canScrollLeft, canScrollRight } =
            scrollEdges(scroll.scrollLeft, scroll.clientWidth, scroll.scrollWidth);
        scroll.classList.toggle("can-scroll-left", canScrollLeft);
        scroll.classList.toggle("can-scroll-right", canScrollRight);
    };
    updateScrollState();

    for (const type of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
        scroll.addEventListener(type, settle, { passive: true });
    }
    // A `scrollLeft` write fires its own `scroll` event; comparing against
    // `lastAssignedScrollLeft` rather than the event's timing is what tells
    // that apart from an actual drag.
    const onScroll = (): void => {
        if (scroll.scrollLeft !== lastAssignedScrollLeft) settle();
        updateScrollState();
    };
    scroll.addEventListener("scroll", onScroll, { passive: true });

    // Obsidian's `activeWindow` is typed as a plain `Window`, unlike the
    // ambient `window` (`Window & typeof globalThis`), so it does not carry
    // `ResizeObserver` in its type even though the object behind it is a real
    // browser window and does. Popout notes make it the right one to construct
    // from regardless; a resize inside a popout is not one the main window's
    // observer would ever see.
    const win = activeWindow as unknown as typeof window;
    if (typeof win.ResizeObserver !== "function") return null;
    const observer = new win.ResizeObserver(updateScrollState);
    observer.observe(scroll);
    return observer;
}
