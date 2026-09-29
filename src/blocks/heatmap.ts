import type { BlockContext } from "./context";
import { weekdayNamesShort, monthNamesShort, monthYearShort, firstDayOfWeek } from "../adapters/datetime";
import { selectNotes, readSource, unmatchedSource, type NoteRecord } from "../core/source";
import { classifyField } from "../core/aggregate";
import { readFields, readPerDay, dayValues, unusedFields } from "../core/day-values";
import { readLayers, combineLayers, type Layer } from "../core/layers";
import { readDateField } from "../core/note-date";
import { specialDays } from "../core/special-days";
import { formatValue, roundedValue } from "../core/stat";
import {
    layoutYear, layoutRange, eachDay, eachDayBetween, yearsOf, rotateWeekdays, weekdayRow,
    type MonthLabel,
} from "../core/calendar";
import { parsePeriod, periodWindow, type Period } from "../core/period";
import { toRgb, rgba, DEFAULT_COLOR, PALETTE, type Rgb } from "../core/palette";
import { readBands, bandFor, type Band } from "../core/bands";
import { scrollEdges, resolveScrollRestore, type ScrollSnapshot } from "../core/scroll";
import { parseConfig, isRecord, unknownKeys, describeValue, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, internalLink } from "../shared/render";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN = Object.keys(schema.blocks.heatmap.root);
/** A `layers` entry's own keys — separate from `KNOWN` the same way a stats card's are (ADR 0004). */
const KNOWN_ITEM = Object.keys(schema.blocks.heatmap.item);

/**
 * One `ResizeObserver` per grid drawn into a block's element (one per year,
 * or the single one a `range` config draws), so the next redraw can
 * disconnect them before making new ones. `clearBlock` empties
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

/**
 * A reader who has scrolled a grid by hand should not find it jumped back to
 * the end on the next vault event: every redraw clears the element and
 * rebuilds it from scratch (`clearBlock`, `drawGrid`), so nothing about
 * where a scroller sat survives on its own unless it is read out of the DOM
 * first. One snapshot per grid, `data-grid-key` on `.dashy-hm-scroll` saying
 * which — a calendar year as a string with a plain `field`/`layers` config,
 * or `RANGE_GRID_KEY` for the single grid a `range` config draws (B-093), so
 * the two never collide even though a vault could plausibly have both kinds
 * of key show up in the same page across separate heatmap blocks. A key
 * missing from the new draw is simply absent from the map `renderHeatmap`
 * looks it up in.
 *
 * Reads `dataset` only, never live `scrollLeft`/`clientWidth`/`scrollWidth`:
 * a redraw can land while the pane is not the active tab, where Obsidian
 * lays it out at `display: none` and every live metric reads 0. Measured
 * live, that 0/0/0 reads as "at the end" (nothing to scroll right to) and
 * the real position is lost the moment the reader switches tabs, edits
 * something, and switches back. `dataset.scrollLeft`/`dataset.atEnd` are
 * instead kept up to date by the scroller itself, in `drawGrid`, only while
 * it actually has a box to measure (`recordPosition`), so what is read here
 * is always the last *real* position, however long ago that was.
 *
 * Two sources, not one, because they answer different questions. `settled`
 * is written only by `settle()`: this scroller, in its own lifetime,
 * actually reached that state (`scrollLeft`/`atEnd` are kept current by
 * `recordPosition` from a few places, but mean nothing until `settled`
 * says so). `pendingSettled`/`pendingScrollLeft`/`pendingAtEnd` are what
 * this scroller was merely seeded with at creation, from the *previous*
 * draw's snapshot, in case a further redraw lands before this one ever
 * settles anything of its own. A real, achieved state always wins over a
 * carried-forward one: folding them into a single pair of keys let a seed
 * masquerade as an achieved settle, which hid a missing `settle()` call in
 * the restore path behind the very seed it should have overwritten.
 */
function captureScrollState(el: HTMLElement): Map<string, ScrollSnapshot> {
    const saved = new Map<string, ScrollSnapshot>();
    for (const scroll of Array.from(el.querySelectorAll<HTMLElement>(".dashy-hm-scroll"))) {
        const key = scroll.dataset.gridKey;
        if (!key) continue;

        if (scroll.dataset.settled === "true") {
            const scrollLeft = Number(scroll.dataset.scrollLeft);
            if (Number.isFinite(scrollLeft)) {
                saved.set(key, { settled: true, scrollLeft, atEnd: scroll.dataset.atEnd === "true" });
                continue;
            }
        }

        // Nothing achieved of its own yet: fall back to whatever it was
        // seeded with, so a redraw before any tick still carries the
        // previous draw's snapshot forward instead of losing it.
        const pendingScrollLeft = Number(scroll.dataset.pendingScrollLeft);
        if (Number.isFinite(pendingScrollLeft)) {
            saved.set(key, {
                settled: scroll.dataset.pendingSettled === "true",
                scrollLeft: pendingScrollLeft,
                atEnd: scroll.dataset.pendingAtEnd === "true",
            });
        }
    }
    return saved;
}

/** `data-grid-key` for the single grid a `range` config draws (B-093), as opposed to a calendar year's own year number. */
const RANGE_GRID_KEY = "range";

export function renderHeatmap(ctx: BlockContext, source: string, el: HTMLElement): void | (() => void) {
    const restoreByKey = captureScrollState(el);
    clearBlock(el);
    disconnectObservers(el);

    // `item: KNOWN_ITEM` matters even though a plain, `layers`-less config
    // never has a list of maps to canonicalize: without it, a `layers` entry
    // written as `title:` (a documented synonym of `label`) would fall back
    // to the empty item set and lose its own key set's protection the same
    // way heatmap's own `title` once did before ADR 0004.
    const { value, diagnostics } = parseConfig(source, { root: KNOWN, item: KNOWN_ITEM });
    const diags: Diagnostic[] = [...diagnostics];

    if (!isRecord(value)) {
        renderDiagnostics(el, "heatmap", diags.length ? diags : [{ level: "error", message: t("heatmap.expectFields") }]);
        return;
    }
    diags.push(...unknownKeys(value, KNOWN));

    const hasLayers = value.layers !== undefined;
    if (hasLayers && value.field !== undefined) {
        // The two ways of colouring a cell contradict each other; nothing
        // else about the config is worth reporting until the reader picks
        // one and tries again.
        diags.push({ level: "error", message: t("heatmap.layersAndField") });
        renderDiagnostics(el, "heatmap", diags);
        return;
    }
    if (hasLayers && value.color !== undefined) {
        diags.push({ level: "warning", message: t("heatmap.layersColorIgnored") });
    }
    if (hasLayers) return renderLayeredHeatmap(ctx, value, diags, el, restoreByKey);

    const { fields, diagnostics: fieldDiags } = readFields(value);
    diags.push(...fieldDiags);
    if (!fields) {
        // `readFields` already reported a malformed `field` (an empty or
        // invalid list, or a value of the wrong shape entirely) with its own
        // error; `field` simply absent is the one case it stays silent
        // about, left to the plain "no field given" here.
        if (!fieldDiags.length) diags.push({ level: "error", message: t("heatmap.fieldRequired") });
        renderDiagnostics(el, "heatmap", diags);
        return;
    }
    // Shown wherever a field name is shown to a reader — the caption, a
    // cell's tooltip — so two fields read as "mood_am, mood_pm" rather than
    // only the first one silently standing in for both.
    const fieldLabel = fields.join(", ");

    const color = toRgb(value.color);
    const bands = readBands(value.bands);
    const linkable = value.link !== false;
    const dateField = readDateField(value);
    const skipField = readSkipField(value, diags);
    const range = readRange(value, diags);
    const { perDay, diagnostics: perDayDiags } = readPerDay(value);
    diags.push(...perDayDiags);

    const notes = selectConfiguredNotes(ctx, value, diags);

    // One entry per day any of `fields` resolved on at all — see
    // `core/day-values.ts` for how a day's contributors (two notes, two
    // fields in one note, or both at once) collapse into its one value.
    const marks = dayValues(notes, fields, perDay, dateField);
    // Every note in the selection, not only the ones that ended up in
    // `marks`: a vacation day with nothing painted still has to hatch.
    const special = skipField ? specialDays(notes, skipField, dateField) : new Set<string>();

    if (!marks.size) {
        // Reported per field, not lumped together: a typo in one entry of a
        // `field` list should read as "this one is wrong", not "nothing
        // works". Distinguishes "nobody ever wrote this key" from "somebody
        // did, but as text" from the residual case where the field is
        // genuinely fine somewhere in the selection and the real problem is
        // dates (kept as the original, more general message): a typo in
        // `field` and a Garmin `running: "10 km · 51min"` both used to read
        // as the same generic "no data", which sent a reader with the right
        // `source` chasing the wrong fix (B-112).
        for (const field of fields) {
            const status = classifyField(notes, field);
            const message = status === "missing"
                ? t("heatmap.fieldMissing", { field })
                : status === "not-numeric"
                    ? t("heatmap.fieldNotNumeric", { field })
                    : t("heatmap.noData", { field });
            diags.push({ level: "error", message });
        }
        renderDiagnostics(el, "heatmap", diags);
        return;
    }

    // At least one field carried the day; a sibling entry that never
    // contributed anywhere in the selection is most likely a typo, not a
    // deliberate no-op — worth a warning, not silence. A single `field` is
    // never checked here: if it were unused, `marks` would still be empty
    // and the block would already have returned above.
    if (fields.length > 1) {
        for (const field of unusedFields(notes, fields)) {
            diags.push({ level: "warning", message: t("heatmap.fieldUnused", { field }) });
        }
    }

    renderDiagnostics(el, "heatmap", diags);

    const firstDay = firstDayOfWeek();
    return drawHeatmap(el, ctx, marks, {
        color, bands, field: fieldLabel, linkable, title: value.title, firstDay,
        showBandsLegend: true, special,
    }, restoreByKey, range);
}

/** `readSource` + `unmatchedSource` + `selectNotes`, in the order every block runs them. */
function selectConfiguredNotes(
    ctx: BlockContext,
    value: Record<string, unknown>,
    diags: Diagnostic[],
): NoteRecord[] {
    const { spec: selection, diagnostics: sourceDiags } = readSource(value);
    diags.push(...sourceDiags);
    const missing = unmatchedSource(ctx.notes(), selection);
    if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });
    return selectNotes(ctx.notes(), selection);
}

/**
 * Reads `skip_field` off the block's root config (B-095): a property marking
 * a day special, vacation or sick for example. Absent is silent; present but
 * not a usable property name warns and is dropped, the same shape `field`
 * itself is validated by (`readFields`, core/day-values.ts). Block-wide, not
 * per-layer: a special day hatches every cell for that day regardless of
 * which layer, if any, painted it.
 */
function readSkipField(value: Record<string, unknown>, diags: Diagnostic[]): string | undefined {
    const raw = value.skip_field;
    if (raw === undefined) return undefined;
    if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
    diags.push({ level: "warning", message: t("heatmap.skipFieldInvalid", { value: describeValue(raw) }) });
    return undefined;
}

/**
 * Reads `range` off the block's root config (B-093): a window ending today
 * — `week`, `month`, `year`, or a rolling `Nd` — that draws one grid instead
 * of the default grid per calendar year. Exactly stats' `period` vocabulary
 * (`core/period.ts#parsePeriod`), reused rather than reinvented so an agent
 * that already knows `period: 30d` on a stats card does not have to learn a
 * second spelling here. Absent is silent; present but unreadable warns and
 * falls back to the per-year grids, the same "keep drawing something
 * sensible" shape every other malformed key in this block already takes.
 */
function readRange(value: Record<string, unknown>, diags: Diagnostic[]): Period | undefined {
    const raw = value.range;
    if (raw === undefined) return undefined;
    const period = parsePeriod(raw);
    if (!period) {
        diags.push({ level: "warning", message: t("heatmap.rangeInvalid", { value: describeValue(raw) }) });
        return undefined;
    }
    return period;
}

/**
 * `layers:` (B-096): several activities on one grid, each in its own colour,
 * in place of a single `field`. Mirrors the plain `field` path above —
 * source selection, the "nothing resolves anywhere" error, the "this one
 * never contributed" warning — except each layer collapses its own field(s)
 * into a day's mark on its own (`dayValues`, once per layer, still sharing
 * `per_day`/`date_field`), and `combineLayers` (core/layers.ts) then decides,
 * per day, which layer's mark actually colours the cell.
 */
function renderLayeredHeatmap(
    ctx: BlockContext,
    value: Record<string, unknown>,
    diags: Diagnostic[],
    el: HTMLElement,
    restoreByKey: Map<string, ScrollSnapshot>,
): void | (() => void) {
    const { layers, diagnostics: layersDiags } = readLayers(value, KNOWN_ITEM);
    diags.push(...layersDiags);
    if (!layers) {
        renderDiagnostics(el, "heatmap", diags);
        return;
    }

    // The bands legend row is only worth showing alongside the layers row
    // when the reader actually asked for a scale: `readBands([])`'s own
    // "has data" default would otherwise sit next to every layer's swatch,
    // saying nothing a layer's own colour did not already say.
    const bandsGiven = value.bands !== undefined;
    const bands = readBands(value.bands);
    const linkable = value.link !== false;
    const dateField = readDateField(value);
    const skipField = readSkipField(value, diags);
    const range = readRange(value, diags);
    const { perDay, diagnostics: perDayDiags } = readPerDay(value);
    diags.push(...perDayDiags);

    const notes = selectConfiguredNotes(ctx, value, diags);

    const perLayerMarks = layers.map((layer) => dayValues(notes, layer.fields, perDay, dateField));
    const marks = combineLayers(perLayerMarks, layers.map((l) => l.label));
    // Block-wide, the same as the plain `field` path: a special day hatches
    // regardless of which layer, if any, painted it.
    const special = skipField ? specialDays(notes, skipField, dateField) : new Set<string>();

    if (!marks.size) {
        // The same per-field reporting as the plain `field` path (B-112),
        // just over every layer's fields flattened into one list: a typo in
        // one layer's `field` should read as "this one is wrong", not
        // "nothing works".
        for (const field of layers.flatMap((l) => l.fields)) {
            const status = classifyField(notes, field);
            const message = status === "missing"
                ? t("heatmap.fieldMissing", { field })
                : status === "not-numeric"
                    ? t("heatmap.fieldNotNumeric", { field })
                    : t("heatmap.noData", { field });
            diags.push({ level: "error", message });
        }
        renderDiagnostics(el, "heatmap", diags);
        return;
    }

    // Checked per layer regardless of how many there are: unlike a plain
    // `field` list (only checked once there are several, because a single
    // unused field would already have emptied `marks` above), a single dead
    // layer among several live ones never empties the combined `marks` at
    // all, so it needs its own warning here.
    for (const layer of layers) {
        for (const field of unusedFields(notes, layer.fields)) {
            diags.push({ level: "warning", message: t("heatmap.fieldUnused", { field }) });
        }
    }

    renderDiagnostics(el, "heatmap", diags);

    const firstDay = firstDayOfWeek();
    return drawHeatmap(el, ctx, marks, {
        // Defensive filler only, never any one layer's colour: a cell reads
        // its colour from `layers[mark.layer]` (see `drawGrid`), and the
        // bands legend row paints in a neutral `PALETTE.gray` in `layers`
        // mode instead of this, precisely so the scale does not read as
        // belonging to whichever layer happens to be first. Kept because
        // `DrawOptions.color` is otherwise required.
        color: DEFAULT_COLOR,
        layers,
        bands,
        field: layers.map((l) => l.label).join(", "),
        linkable,
        title: value.title,
        firstDay,
        showBandsLegend: bandsGiven,
        special,
    }, restoreByKey, range);
}

/**
 * Dispatches to a grid per calendar year (the default, unchanged behaviour)
 * or the single `range` grid (B-093), depending on whether `range` parsed to
 * anything. The two share everything past "which days make up the grid":
 * `drawGrid` below neither knows nor cares which of them it was asked for.
 */
function drawHeatmap(
    el: HTMLElement,
    ctx: BlockContext,
    marks: ReadonlyMap<string, Paintable>,
    opts: Omit<DrawOptions, "restore">,
    restoreByKey: Map<string, ScrollSnapshot>,
    range: Period | undefined,
): void | (() => void) {
    return range
        ? drawRangeGrid(el, ctx, marks, range, opts, restoreByKey)
        : drawYears(el, ctx, marks, opts, restoreByKey);
}

/**
 * How many days a grid's `dayKeys` actually carry a mark, and their average —
 * shared by the per-year caption and the `range` caption (B-093), which
 * otherwise differ only in whether a year number is worth saying.
 */
interface CaptionStats {
    /** already formatted, `formatValue`'s own rounding */
    average: string;
    present: number;
    total: number;
    /** false for an all-boolean field (see the caption itself) or with `layers` */
    showAverage: boolean;
}

function captionStats(
    dayKeys: readonly string[],
    marks: ReadonlyMap<string, Paintable>,
    opts: Pick<DrawOptions, "layers">,
): CaptionStats {
    const dayMarks = dayKeys
        .map((k) => marks.get(k))
        .filter((v): v is Paintable => v !== undefined);
    const present = dayMarks.filter((m) => m.painted).length;

    // The average counts every recognised day, a `false` one included as 0 —
    // the same sum a stats `avg` card over this field would show. Counting
    // only the painted days used to read "average 1" for an all-boolean field
    // no matter how many days were actually unticked, which is not the rate
    // anyone reading a habit tracker would call "average".
    const average = formatValue(
        dayMarks.length ? dayMarks.reduce((s, m) => s + m.value, 0) / dayMarks.length : 0,
    );

    // Every painted day of an all-boolean field can only ever be 1: "average 1"
    // states the obvious rather than informing, so the caption drops it.
    // With `layers`, several different fields are being folded into one
    // grid; averaging them together would not be "the average of a field",
    // it would be a number about nothing in particular, so it is dropped
    // unconditionally rather than only when every layer happens to be
    // boolean.
    const booleanOnly = !opts.layers && dayMarks.length > 0 && dayMarks.every((m) => m.isBool);
    const showAverage = !opts.layers && !booleanOnly;

    return { average, present, total: dayKeys.length, showAverage };
}

/**
 * One grid per calendar year, never one later than today's: a note dated
 * next year (or, with `startDayHour` set, a real-date note just after
 * midnight before the day has effectively turned over) used to draw a full,
 * empty grid above the real data (B-113). That note still counts nowhere in
 * the heatmap; if every dated note turns out to be in the future, the
 * current year is drawn anyway, empty, rather than showing nothing at all.
 */
function drawYears(
    el: HTMLElement,
    ctx: BlockContext,
    marks: ReadonlyMap<string, Paintable>,
    opts: Omit<DrawOptions, "restore">,
    restoreByKey: Map<string, ScrollSnapshot>,
): void | (() => void) {
    const today = ctx.today();
    const years = yearsOf([...marks.keys()]).filter((y) => y <= today.getFullYear());
    const yearsToDraw = years.length ? years : [today.getFullYear()];
    const severalYears = yearsToDraw.length > 1;
    const drawn: ResizeObserver[] = [];
    for (const year of yearsToDraw) {
        const layout = layoutYear(year, today, opts.firstDay);
        const dayKeys = eachDay(year, layout.total);
        const stats = captionStats(dayKeys, marks, opts);
        // With more than one grid, each has to say which year it is —
        // otherwise two grids under the same custom title read as the same
        // thing drawn twice, which is exactly how it was first reported.
        const caption = typeof opts.title === "string"
            ? (severalYears ? t("heatmap.titleYear", { title: opts.title, year }) : opts.title)
            : stats.showAverage
                ? t("heatmap.caption", {
                    year, field: opts.field, average: stats.average, present: stats.present, total: stats.total,
                })
                : t("heatmap.captionMarks", { year, field: opts.field, present: stats.present, total: stats.total });

        const observer = drawGrid(el, {
            key: String(year), dayKeys, offset: layout.offset, columns: layout.columns, months: layout.months,
        }, caption, marks, { ...opts, restore: restoreByKey.get(String(year)) });
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

/**
 * The single grid a `range` config draws (B-093): one window ending today,
 * `week`/`month`/`year`/a rolling `Nd`, instead of a grid per calendar year.
 * `range: year` and the default per-year grid look similar for the current
 * year (both start 1 January) but are not the same thing: the default can
 * draw one grid per year that has data, `range: year` always draws exactly
 * one, the current year, whether or not it has any. A title, when given,
 * never gets a year suffix here — there being only one grid is the whole
 * point of asking for a range.
 */
function drawRangeGrid(
    el: HTMLElement,
    ctx: BlockContext,
    marks: ReadonlyMap<string, Paintable>,
    period: Period,
    opts: Omit<DrawOptions, "restore">,
    restoreByKey: Map<string, ScrollSnapshot>,
): void | (() => void) {
    const today = ctx.today();
    // Not called `window`: that shadows the DOM global and is exactly the
    // trap `core/period.ts#DateWindow` already warns about — the scorecard
    // scanner and a reader both take `window.` for a call on it.
    const dateWindow = periodWindow(period, today, opts.firstDay);
    const layout = layoutRange(dateWindow.start, dateWindow.end, opts.firstDay);
    const dayKeys = eachDayBetween(dateWindow.start, dateWindow.end);
    const stats = captionStats(dayKeys, marks, opts);

    const caption = typeof opts.title === "string"
        ? opts.title
        : stats.showAverage
            ? t("heatmap.captionRange", { field: opts.field, average: stats.average, present: stats.present, total: stats.total })
            : t("heatmap.captionRangeMarks", { field: opts.field, present: stats.present, total: stats.total });

    const observer = drawGrid(el, {
        key: RANGE_GRID_KEY, dayKeys, offset: layout.offset, columns: layout.columns, months: layout.months,
    }, caption, marks, { ...opts, restore: restoreByKey.get(RANGE_GRID_KEY) });
    if (observer) {
        observers.set(el, [observer]);
        return () => disconnectObservers(el);
    }
}

/**
 * What a cell needs in order to paint itself — the shape a plain `DayMark`
 * and a layered `LayeredMark` (core/layers.ts) have in common, once a day's
 * contributors have already been collapsed into "the one mark a cell shows".
 * `isBool`, `layer` and `parts` are only ever set by one side or the other:
 * `isBool` by a plain `DayMark` (a real field's own booleanness), `layer`/
 * `parts` by a `LayeredMark` (which layer won, and every layer with a value
 * that day). Neither side has to know the other exists.
 */
interface Paintable {
    value: number;
    path: string;
    painted: boolean;
    isBool?: boolean;
    layer?: number;
    parts?: readonly { label: string; value: number }[];
}

interface DrawOptions {
    /** the single field's colour; with `layers` set, filler that no cell actually reads (see `layer` on `Paintable`) */
    color: Rgb;
    /** set only in `layers` mode: a cell's own colour comes from `layers[mark.layer]`, and each gets a legend row */
    layers?: readonly Layer[];
    bands: Band[];
    /** whether the bands legend row(s) draw at all: always without `layers`, only when `bands` was written with them */
    showBandsLegend: boolean;
    /** already the display form: one field name, several joined with ", ", or every layer's own label joined the same way */
    field: string;
    linkable: boolean;
    title: unknown;
    /** days (B-095) any note in the selection marked special; hatched regardless of `layers` or of which one painted */
    special: ReadonlySet<string>;
    /** 0 is Sunday, 1 is Monday — whatever the locale says */
    firstDay: number;
    /** Where this grid's scroller sat before this redraw, if anywhere worth restoring. */
    restore: ScrollSnapshot | undefined;
}

/**
 * What `drawGrid` needs of a grid's shape, computed by its caller from
 * either `layoutYear` or `layoutRange` (B-093): the two already share this
 * exact shape, `RangeMonthLabel`'s extra `year` field simply along for the
 * ride and never read here. `key` is the `data-grid-key` bookkeeping
 * `captureScrollState` reads back on the next redraw — a year as a string,
 * or `RANGE_GRID_KEY` for the one grid a `range` config draws.
 */
/**
 * A month label `drawGrid` can place, optionally carrying which calendar
 * year it falls in — set only by `layoutRange` (a `range` grid's window can
 * cross a year boundary or, with a multi-year `Nd`, repeat a month), never
 * by `layoutYear` (its own months are always the same, current, year).
 */
interface GridMonthLabel extends MonthLabel {
    year?: number;
}

interface GridLayout {
    key: string;
    /** ascending, exactly the cells this grid draws, one per column-then-row position after `offset` pad cells */
    dayKeys: readonly string[];
    offset: number;
    columns: number;
    months: readonly GridMonthLabel[];
}

function drawGrid(
    el: HTMLElement,
    layout: GridLayout,
    caption: string,
    marks: ReadonlyMap<string, Paintable>,
    opts: DrawOptions,
): ResizeObserver | null {
    const wrap = el.createDiv({ cls: "dashy-hm-wrap" });

    // Whether this grid has at least one hatched cell, painted or not: the
    // legend only earns its extra row when there is something on this
    // particular grid for it to explain.
    const specialInGrid = layout.dayKeys.some((k) => opts.special.has(k));

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
    // Read back by `captureScrollState` on the next redraw, before this
    // element is torn down; not translated, never shown, just bookkeeping.
    scroll.dataset.gridKey = layout.key;
    // Seeded from the previous draw's own snapshot immediately, not only
    // once a real width tick lands: a second redraw can happen before this
    // scroller ever measures anything of its own (two vault events close
    // together), and without this the snapshot it would have captured is
    // simply gone. Kept under `pending*` keys, not `settled`/`scrollLeft`/
    // `atEnd`: those are written only by `settle()` once this scroller has
    // actually reached that state, and seeding them here would let a mere
    // carry-forward masquerade as one, hiding a broken `settle()` call
    // behind the very seed it should have overwritten (`captureScrollState`
    // above prefers the achieved pair when both exist).
    if (opts.restore) {
        scroll.dataset.pendingSettled = String(opts.restore.settled);
        scroll.dataset.pendingScrollLeft = String(opts.restore.scrollLeft);
        scroll.dataset.pendingAtEnd = String(opts.restore.atEnd);
    }
    const months = monthNamesShort();
    // A range grid's window can cross a year boundary; a per-year grid's
    // months never carry a `year` at all (`GridMonthLabel.year` is only
    // ever set by `layoutRange`), so this is always false there.
    const spansYears = new Set(layout.months.map((m) => m.year).filter((y): y is number => y !== undefined)).size > 1;

    const monthRow = scroll.createDiv({ cls: "dashy-hm-months" });
    monthRow.style.gridTemplateColumns = `repeat(${layout.columns}, var(--dashy-cell))`;
    layout.months.forEach((m, i) => {
        const year = m.year;
        // Every January says which year once the grid spans more than one —
        // otherwise two Januaries a year apart both just read "Jan". The
        // grid's own first label gets the same treatment when it is not
        // January either, so a range grid that does not start in January
        // still tells the reader straight away which year it opens on.
        const withYear = spansYears && year !== undefined && (i === 0 || m.month === 0);
        const text = withYear && year !== undefined ? monthYearShort(new Date(year, m.month, 1)) : (months[m.month] ?? "");
        const label = monthRow.createDiv({ cls: "dashy-hm-mon", text });
        label.style.gridColumnStart = String(m.column);
    });

    // grid-auto-flow: column over 7 rows — cells are added in order, so the
    // grid starts with `offset` empty ones.
    const grid = scroll.createDiv({ cls: "dashy-hm-grid" });
    for (let i = 0; i < layout.offset; i++) grid.createDiv({ cls: "dashy-hm-cell dashy-hm-pad" });

    for (const date of layout.dayKeys) {
        const hit = marks.get(date);
        const paintable = hit?.painted ? hit : undefined;
        const special = opts.special.has(date);
        const cell = paintable && opts.linkable
            ? internalLink(grid, paintable.path, "dashy-hm-cell")
            : grid.createDiv({ cls: "dashy-hm-cell" });
        // A special day (B-095) hatches whether or not it also painted: the
        // class carries no meaning about the value, only about the day.
        cell.classList.toggle("is-skipped", special);
        if (paintable) {
            const band = bandFor(opts.bands, paintable.value);
            // The winning layer's own colour, when there is one — set only
            // by a `LayeredMark`, and only ever `undefined` on one once no
            // layer painted that day, which is exactly when `paintable`
            // itself is `undefined` above. Falls back to `opts.color`
            // otherwise, which is what every plain, `layers`-less mark uses.
            const rgb = opts.layers && paintable.layer !== undefined
                ? (opts.layers[paintable.layer]?.color ?? opts.color)
                : opts.color;
            // Rounded the same way a card would (`roundedValue`, not
            // `formatValue`): an integer stays exactly as is (a sum of
            // whole numbers reads "8000", not "8 000"), and a fraction from
            // `per_day: avg` gets one decimal instead of the sixteen a raw
            // JS float division produces. `formatValue`'s own digit
            // grouping is left out on purpose — its narrow no-break space
            // has no business inside a `title` attribute.
            const baseTooltip = paintable.parts
                ? t("heatmap.cellLayers", {
                    date,
                    // Each layer's own "label value" piece goes through
                    // `t()` on its own (`heatmap.cellPart`), same as any
                    // other user-facing text; only the plain ", " between
                    // them is bare punctuation, the same list separator
                    // `fieldLabel`/`fields.join(", ")` already uses above.
                    parts: paintable.parts
                        .map((p) => t("heatmap.cellPart", { label: p.label, value: roundedValue(p.value) }))
                        .join(", "),
                })
                : t("heatmap.cell", { date, field: opts.field, value: roundedValue(paintable.value) });
            const tooltip = special ? t("heatmap.cellSkipped", { cell: baseTooltip }) : baseTooltip;
            cell.style.backgroundColor = rgba(rgb, band?.alpha ?? 1);
            cell.setAttr("aria-label", tooltip);
            cell.setAttr("title", tooltip);
        } else {
            cell.setAttr("title", special ? t("heatmap.cellEmptySkipped", { date }) : t("heatmap.cellEmpty", { date }));
        }
    }

    const legend = wrap.createDiv({ cls: "dashy-hm-legend" });
    if (opts.layers) {
        for (const layer of opts.layers) {
            const row = legend.createDiv({ cls: "dashy-hm-leg" });
            row.createDiv({ cls: "dashy-hm-swatch" }).style.backgroundColor = rgba(layer.color, 1);
            row.createSpan({ text: layer.label });
        }
    }
    if (opts.showBandsLegend) {
        // In `layers` mode `bands` scores whichever layer happens to win
        // each cell, not any one layer in particular — painting this row in
        // that layer's colour (or, worse, always the first layer's) would
        // claim an ownership the scale does not have. `PALETTE.gray`
        // instead reads as "strength", the same neutral role alpha alone
        // already plays on every cell.
        const legendColor = opts.layers ? (PALETTE.gray ?? DEFAULT_COLOR) : opts.color;
        for (const b of opts.bands) {
            const row = legend.createDiv({ cls: "dashy-hm-leg" });
            row.createDiv({ cls: "dashy-hm-swatch" }).style.backgroundColor = rgba(legendColor, b.alpha);
            row.createSpan({ text: b.label });
        }
    }
    // Only earns its row on a grid that actually has a hatched cell: a
    // `skip_field` set but never triggered anywhere in this grid's window
    // would otherwise add a swatch nothing on the grid explains.
    if (specialInGrid) {
        const row = legend.createDiv({ cls: "dashy-hm-leg" });
        row.createDiv({ cls: "dashy-hm-swatch is-skipped" });
        row.createSpan({ text: t("heatmap.legendSkipped") });
    }

    // Where the grid does not fit, open it at the most recent day rather than
    // at its start (9f3db44): on a phone the visible third of a past year is
    // empty, which reads as a broken grid; its data is at the end. `layout`
    // (`layoutYear`/`layoutRange`, core/calendar.ts) already stops at the
    // most recent day the grid draws — today for the current year or a
    // `range` window, 31 December for a past one — so "scroll to the end"
    // and "scroll to the data" are the same target here.
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
    //
    // A restored position (below) flips the same flag: once applied, this
    // scroller should stop re-asserting anything on its own, exactly like a
    // reader's own scroll would. `dataset.settled` mirrors it onto the
    // element itself, because `captureScrollState` on the next redraw has
    // nothing else to read this closure's `settled` from.
    let settled = false;
    let lastAssignedScrollLeft: number | null = null;

    // Mirrors the scroller's real position onto its own element, so a later
    // redraw's `captureScrollState` can read it back without asking the DOM
    // for live metrics. Only overwrites while there is a real box to
    // measure: an inactive tab in Obsidian lays its pane out at
    // `display: none`, where `clientWidth`/`scrollWidth` read 0/0 and would
    // otherwise overwrite a real position with "nothing to scroll, at the
    // end" the moment the reader switches away.
    const recordPosition = (): void => {
        if (scroll.clientWidth <= 0) return;
        scroll.dataset.scrollLeft = String(scroll.scrollLeft);
        scroll.dataset.atEnd =
            String(!scrollEdges(scroll.scrollLeft, scroll.clientWidth, scroll.scrollWidth).canScrollRight);
    };

    const settle = (): void => {
        settled = true;
        scroll.dataset.settled = "true";
        recordPosition();
    };

    // `scroll` is the element that actually scrolls (see `.dashy-hm-scroll`
    // in blocks.css, which also carries the fade mask), not `wrap`: `wrap`
    // also holds the title and the weekday column, neither of which should
    // ever move or fade.
    const updateScrollState = (): void => {
        if (!settled) {
            // `resolveScrollRestore` also guards the unstyled
            // `scrollWidth === clientWidth` reading (see above): with
            // nothing to scroll to yet it answers "pending" rather than
            // "default", so a saved position is not spent on that
            // meaningless first tick and gets its turn once a later resize
            // reports the real, narrower pair.
            const outcome = resolveScrollRestore(opts.restore, scroll.clientWidth, scroll.scrollWidth);
            if (outcome.kind === "restore") {
                scroll.scrollLeft = outcome.scrollLeft;
                lastAssignedScrollLeft = scroll.scrollLeft;
                settle();
            } else if (outcome.kind === "default" && scroll.scrollWidth > scroll.clientWidth) {
                scroll.scrollLeft = scroll.scrollWidth;
                lastAssignedScrollLeft = scroll.scrollLeft;
            }
        }
        const { canScrollLeft, canScrollRight } =
            scrollEdges(scroll.scrollLeft, scroll.clientWidth, scroll.scrollWidth);
        scroll.classList.toggle("can-scroll-left", canScrollLeft);
        scroll.classList.toggle("can-scroll-right", canScrollRight);
        // A resize can change `atEnd` with no `scroll` event at all (the
        // pane narrows or widens under an unmoved `scrollLeft`), and
        // `onScroll` alone would leave the recorded position stale from
        // whatever it was when this scroller last settled. Guarded the same
        // way `recordPosition` always is: a hidden pane's 0x0 tick must not
        // overwrite a real position with a false "at the end".
        recordPosition();
    };
    updateScrollState();

    for (const type of ["wheel", "touchstart", "pointerdown", "keydown"] as const) {
        scroll.addEventListener(type, settle, { passive: true });
    }
    // A `scrollLeft` write fires its own `scroll` event; comparing against
    // `lastAssignedScrollLeft` rather than the event's timing is what tells
    // that apart from an actual drag. Every scroll event records the
    // position, settled or not: an unsettled scroller being pinned to a
    // moving end (below) still has a real position worth knowing, even
    // though it is not yet one `resolveScrollRestore` will act on.
    const onScroll = (): void => {
        recordPosition();
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
