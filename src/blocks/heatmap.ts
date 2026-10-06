import type { BlockContext } from "./context";
import {
    weekdayNamesShort, monthNamesShort, monthYearShort, monthYearLong, firstDayOfWeek, formatDayMedium,
} from "../adapters/datetime";
import { isMobile } from "../adapters/platform";
import { selectNotes, readSource, unmatchedSource, type NoteRecord } from "../core/source";
import { classifyField, classifyValues } from "../core/aggregate";
import {
    readFields, readPerDay, dayValues, unusedFields, heatmapDurationDiagnostics, checkboxCount, paintedNotesPerDay,
    type DayMark, type DayNote,
} from "../core/day-values";
import { formatDuration } from "../core/duration";
import { readLayers, readPick, combineLayers, type Layer } from "../core/layers";
import { readDateField } from "../core/note-date";
import { specialDays } from "../core/special-days";
import { formatValue, roundedValue } from "../core/stat";
import {
    layoutYear, layoutRange, eachDay, eachDayBetween, yearsOf, rotateWeekdays, weekdayRow, dateKey, parseDateKey,
    type MonthLabel,
} from "../core/calendar";
import { parsePeriod, periodWindow, type Period, type DateWindow } from "../core/period";
import { readLayout, calendarWindow, calendarMonths, layoutCalendar, noteDots, layerDots } from "../core/month-calendar";
import { toRgb, rgba, DEFAULT_COLOR, PALETTE, type Rgb } from "../core/palette";
import { readBands, bandFor, autoBands, durationThresholdIn, type Band } from "../core/bands";
import { scrollEdges, resolveScrollRestore, isEndClamp, type ScrollSnapshot } from "../core/scroll";
import { parseConfig, isRecord, unknownKeys, describeValue, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, internalLink } from "../shared/render";
import { t, tPlural } from "../i18n";
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
    if (!hasLayers && value.pick !== undefined) {
        // `pick` only chooses between layers; with a single `field` there
        // is nothing to choose between, so say so rather than drop it quietly.
        diags.push({ level: "warning", message: t("heatmap.pickWithoutLayers") });
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
    const linkable = value.link !== false;
    const dateField = readDateField(value);
    const skipField = readSkipField(value, diags);
    const range = readRange(value, diags);
    const { layout, diagnostics: layoutDiags } = readLayout(value, range);
    diags.push(...layoutDiags);
    const { perDay, diagnostics: perDayDiags } = readPerDay(value);
    diags.push(...perDayDiags);

    const notes = selectConfiguredNotes(ctx, value, diags);
    // B-121: every value the field(s) hold across the selection being a
    // duration string is what turns tooltips, the caption's average and the
    // legend into `7h 30m`; a mix of both is counted in minutes and warned.
    const kinds = classifyValues(notes, fields);
    const duration = kinds.kind === "duration";
    // B-145: race times written to the second read `2:16:32` in tooltips and
    // the caption's average. The legend keeps `2h 15m`: its thresholds are
    // round steps of the scale, not readings.
    const clock = duration && kinds.clock === true;
    // `undefined` — never `readBands(undefined)`'s own flat default — is
    // what tells `drawYears`/`drawRangeGrid` a scale is theirs to fit per
    // grid (B-116, `resolveGridBands`); written explicitly, it always wins
    // outright and the same bands cover every grid this block draws.
    const explicitBands = value.bands !== undefined ? readBands(value.bands, duration) : undefined;

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
    diags.push(...heatmapDurationDiagnostics(kinds, fieldLabel, value.bands));
    // B-138: a list made only of checkboxes counts the ticked ones (or, with
    // `per_day: avg`, the share of them), shaded against every listed box
    // ticked; `undefined` keeps a checkbox day flat, as a single checkbox
    // field always was.
    const { count, diagnostics: countDiags } = checkboxCount(notes, fields, perDay, marks, dateField);
    diags.push(...countDiags);
    const checkboxBands = count?.bands;

    renderDiagnostics(el, "heatmap", diags);

    const firstDay = firstDayOfWeek();
    // B-133: a calendar day shows a dot per note that painted it, which
    // `marks` (one collapsed value per day) no longer knows.
    const dots: CalendarDots | undefined = layout === "calendar"
        ? { kind: "notes", counts: paintedNotesPerDay(notes, fields, dateField) }
        : undefined;
    return drawHeatmap(el, ctx, count?.marks ?? marks, {
        color, explicitBands, checkboxBands, field: fieldLabel, linkable, title: value.title, firstDay, special, duration, clock,
    }, restoreByKey, range, dots);
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

    const linkable = value.link !== false;
    const dateField = readDateField(value);
    const skipField = readSkipField(value, diags);
    const range = readRange(value, diags);
    const { layout, diagnostics: layoutDiags } = readLayout(value, range);
    diags.push(...layoutDiags);
    const { perDay, diagnostics: perDayDiags } = readPerDay(value);
    diags.push(...perDayDiags);
    const { pick, diagnostics: pickDiags } = readPick(value);
    diags.push(...pickDiags);

    const notes = selectConfiguredNotes(ctx, value, diags);

    // B-121: each layer decides its own tooltip part; the shared scale and
    // its legend read as durations only once every layer with data holds
    // durations, since `bands` scores whichever layer wins a cell.
    const layerKinds = layers.map((layer) => classifyValues(notes, layer.fields));
    const layerDurations = layerKinds.map((k) => k.kind === "duration");
    // B-145: per layer too, a layer of race times written to the second reads `2:16:32`.
    const layerClocks = layerKinds.map((k) => k.kind === "duration" && k.clock === true);
    const duration = layerDurations.some(Boolean)
        && layerKinds.every((k) => k.kind === "duration" || k.kind === "none");
    // `undefined` here, same as the plain `field` path, means each grid
    // fits its own scale to the winning layer's own values (B-116,
    // `resolveGridBands`); the bands legend row only earns its place next
    // to the layers row once there is an actual scale to show, fitted or
    // written (`resolveGridBands` again) — `readBands([])`'s own "has data"
    // default would otherwise sit there saying nothing a layer's own
    // colour did not already say.
    // Written bands read as durations too once they are written that way and
    // some layer holds durations: a checkbox layer beside a sleep layer
    // should not turn `bands: [8h, 7h]` back into `480+`.
    const bandsAsDurations = duration
        || (durationThresholdIn(value.bands) !== undefined && layerDurations.some(Boolean));
    const explicitBands = value.bands !== undefined ? readBands(value.bands, bandsAsDurations) : undefined;

    const perLayerMarks = layers.map((layer) => dayValues(notes, layer.fields, perDay, dateField));
    const marks = combineLayers(perLayerMarks, layers.map((l) => l.label), pick);
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
    // A mix within one layer is that layer's own problem; two layers of
    // different kinds are not a mix at all, only different fields. A
    // duration threshold is worth a warning once no layer holds durations.
    layers.forEach((layer, i) => {
        const kind = layerKinds[i];
        if (kind) diags.push(...heatmapDurationDiagnostics(kind, layer.fieldLabel, undefined));
    });
    const allKinds = classifyValues(notes, layers.flatMap((l) => l.fields));
    if (allKinds.kind === "plain") {
        diags.push(...heatmapDurationDiagnostics(allKinds, layers.map((l) => l.fieldLabel).join(", "), value.bands));
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
        explicitBands,
        field: layers.map((l) => l.label).join(", "),
        linkable,
        title: value.title,
        firstDay,
        special,
        duration,
        layerDurations,
        layerClocks,
        // B-133: every layer painted that day gets its own dot, whichever
        // one `pick` let win the cell.
    }, restoreByKey, range, layout === "calendar" ? { kind: "layers", perLayer: perLayerMarks } : undefined);
}

/**
 * What `drawHeatmap`/`drawYears`/`drawRangeGrid` carry down before the two
 * per-grid concerns (B-116) are settled: `DrawOptions.bands` and
 * `showBandsLegend` are dropped in favour of `explicitBands`, the reader's
 * own `bands:` when written. `undefined` says no grid has one yet — each
 * one fits its own from the values it actually paints (`resolveGridBands`);
 * an array always wins outright and every grid reuses it unchanged, the
 * same as `readBands` always behaved before B-116.
 */
type GridSharedOptions = Omit<DrawOptions, "restore" | "today" | "mobile" | "tap" | "bands" | "showBandsLegend"> & {
    explicitBands: Band[] | undefined;
};

/**
 * Dispatches to a grid per calendar year (the default, unchanged behaviour)
 * or the single `range` grid (B-093), depending on whether `range` parsed to
 * anything. The two share everything past "which days make up the grid":
 * `drawGrid` below neither knows nor cares which of them it was asked for.
 *
 * `mobile`/`tap` (B-092) are computed exactly once here, not inside
 * `drawGrid`: a multi-year heatmap calls `drawGrid` once per year, and a
 * selection or a status line owned by any one of those calls would leave
 * every other year free to have a cell of its own selected at the same
 * time. One `MobileTapState`, shared by every grid this render draws, is
 * what makes tapping a cell in one year clear the selection in another.
 */
function drawHeatmap(
    el: HTMLElement,
    ctx: BlockContext,
    marks: ReadonlyMap<string, Paintable>,
    opts: GridSharedOptions,
    restoreByKey: Map<string, ScrollSnapshot>,
    range: Period | undefined,
    dots: CalendarDots | undefined,
): void | (() => void) {
    const full: GridSharedOptions & Pick<DrawOptions, "mobile" | "tap"> = {
        ...opts,
        mobile: isMobile(),
        tap: { selectedCell: null, selectedDate: null, status: undefined },
    };
    // `dots` is only ever set once `readLayout` has settled on a calendar,
    // which it does only for `range: month` or `range: week`.
    if (range && dots) {
        const bounds = calendarWindow(range, ctx.today(), opts.firstDay);
        if (bounds) {
            drawCalendar(el, ctx, marks, bounds, dots, full);
            return;
        }
    }
    return range
        ? drawRangeGrid(el, ctx, marks, range, full, restoreByKey)
        : drawYears(el, ctx, marks, full, restoreByKey);
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
    opts: Pick<DrawOptions, "layers" | "duration" | "checkboxBands" | "clock">,
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
    const mean = dayMarks.length ? dayMarks.reduce((s, m) => s + m.value, 0) / dayMarks.length : 0;
    const average = opts.duration ? formatDuration(mean, opts.clock) : formatValue(mean);

    // Every painted day of an all-boolean field can only ever be 1: "average 1"
    // states the obvious rather than informing, so the caption drops it. A
    // list of checkboxes counted per day (B-138, `checkboxBands`) is the
    // exception: its average is how many boxes a day gets ticked, and stays.
    // With `layers`, several different fields are being folded into one
    // grid; averaging them together would not be "the average of a field",
    // it would be a number about nothing in particular, so it is dropped
    // unconditionally rather than only when every layer happens to be
    // boolean.
    const booleanOnly = !opts.layers && dayMarks.length > 0 && dayMarks.every((m) => m.isBool);
    const showAverage = !opts.layers && (!booleanOnly || opts.checkboxBands !== undefined);

    return { average, present, total: dayKeys.length, showAverage };
}

/** One grid's own `bands`, and whether a legend row is worth drawing for them (B-116). */
interface GridBands {
    bands: Band[];
    showLegend: boolean;
}

/**
 * A grid's own colour scale (B-116): the reader's own `explicit` bands when
 * there are any — reused unchanged, the same as before this block ever
 * fitted anything itself — or, failing that, `autoBands` fitted to only the
 * values THIS grid paints, never another year's or the whole block's.
 *
 * Fitted only from the NON-boolean painted cells (checker round 1): a
 * checkbox winner is always exactly 1, and folding that 1 in among a
 * `layers` grid's numeric winners (a checkbox habit next to a step count,
 * say) let a ticked day become the scale's own minimum and paint at the
 * weakest alpha instead of solid — `drawGrid` below separately makes sure
 * every boolean-winning cell paints at full alpha regardless of what this
 * returns, but the scale itself should never have been stretched to fit a
 * value that was never really "how much", only "did it happen". No
 * non-boolean cells at all (a plain checkbox field or `layers` list) is
 * exactly `autoBands`' own `allBool` case, flat as before.
 *
 * A `field` list made only of checkboxes (B-138) is the one exception to
 * "flat": its `checkbox` scale, built once for the whole block against
 * every listed box ticked, is used as-is by every grid, unless `explicit`
 * bands were written, which still win.
 *
 * `layered` decides what "nothing to show" looks like once no scale was
 * built. A plain `field` grid still draws its one flat "has data" row even
 * then, unchanged from before B-116 (`readBands(undefined)`'s own single
 * band); a `layers` grid stays exactly as quiet as it always was without
 * `bands:` — no row at all — because a scale nobody asked for and that
 * turned out flat has even less to say next to a legend that already has a
 * swatch per layer.
 */
function resolveGridBands(
    dayKeys: readonly string[],
    marks: ReadonlyMap<string, Paintable>,
    explicit: Band[] | undefined,
    checkbox: Band[] | undefined,
    layered: boolean,
    duration: boolean,
): GridBands {
    if (explicit) return { bands: explicit, showLegend: true };
    if (checkbox) return { bands: checkbox, showLegend: true };

    const painted = dayKeys
        .map((k) => marks.get(k))
        .filter((m): m is Paintable => m !== undefined && m.painted);
    const numeric = painted.filter((m) => m.isBool !== true);
    const values = numeric.map((m) => m.value);
    const allBool = numeric.length === 0;

    const fitted = autoBands(values, allBool, duration);
    if (fitted) return { bands: fitted, showLegend: true };

    return { bands: readBands(undefined), showLegend: !layered };
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
    opts: GridSharedOptions & Pick<DrawOptions, "mobile" | "tap">,
    restoreByKey: Map<string, ScrollSnapshot>,
): void | (() => void) {
    const today = ctx.today();
    // A year grid's `dayKeys` only ever cover that one calendar year, so
    // comparing every grid's cells against the same `todayKey` already rings
    // at most one cell across every grid drawn here, on whichever year today
    // actually falls in, with no separate "is this the current year" check.
    const todayKey = dateKey(today);
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

        // B-116: this year's own scale, fitted to only the values it
        // itself paints — a second year with a narrower or wider spread
        // gets its own bands, not whatever the first year happened to fit.
        const { bands, showLegend } = resolveGridBands(dayKeys, marks, opts.explicitBands, opts.checkboxBands, !!opts.layers, opts.duration);

        const observer = drawGrid(el, {
            key: String(year), dayKeys, offset: layout.offset, columns: layout.columns, months: layout.months,
        }, caption, marks, {
            ...opts, bands, showBandsLegend: showLegend, restore: restoreByKey.get(String(year)), today: todayKey,
        });
        if (observer) drawn.push(observer);
    }
    // B-092: one status line for the whole block, after the last grid —
    // not one per year, which is what having `drawGrid` build its own used
    // to draw.
    attachStatusLine(el, opts);
    if (drawn.length) {
        observers.set(el, drawn);
        // Redraws clean up after themselves (the `disconnectObservers` call
        // above), but the block being removed from the note entirely never
        // redraws again; this is what `DashyBlock.onunload` (app/block.ts)
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
    opts: GridSharedOptions & Pick<DrawOptions, "mobile" | "tap">,
    restoreByKey: Map<string, ScrollSnapshot>,
): void | (() => void) {
    const today = ctx.today();
    const todayKey = dateKey(today);
    // Not called `window`: that shadows the DOM global and is exactly the
    // trap `core/period.ts#DateWindow` already warns about — the scorecard
    // scanner and a reader both take `window.` for a call on it.
    const dateWindow = periodWindow(period, today, opts.firstDay);
    const layout = layoutRange(dateWindow.start, dateWindow.end, opts.firstDay);
    const dayKeys = eachDayBetween(dateWindow.start, dateWindow.end);
    const stats = captionStats(dayKeys, marks, opts);

    const caption = rangeCaption(opts, stats);

    // B-116: the one grid this draws gets its own scale, fitted only to
    // what it itself paints — the same rule a per-year grid follows.
    const { bands, showLegend } = resolveGridBands(dayKeys, marks, opts.explicitBands, opts.checkboxBands, !!opts.layers, opts.duration);

    const observer = drawGrid(el, {
        key: RANGE_GRID_KEY, dayKeys, offset: layout.offset, columns: layout.columns, months: layout.months,
    }, caption, marks, {
        ...opts, bands, showBandsLegend: showLegend, restore: restoreByKey.get(RANGE_GRID_KEY), today: todayKey,
    });
    // B-092: only ever one grid here, but the status line still lives
    // outside `drawGrid` itself — the same single funnel `drawYears` uses.
    attachStatusLine(el, opts);
    if (observer) {
        observers.set(el, [observer]);
        return () => disconnectObservers(el);
    }
}

/**
 * A `range` window's caption, the grid's (B-093) and the calendar's (B-133)
 * alike: the reader's own `title` when given, never with a year suffix,
 * otherwise the field with its count of days and, where it says something,
 * the average.
 */
function rangeCaption(opts: Pick<DrawOptions, "title" | "field">, stats: CaptionStats): string {
    if (typeof opts.title === "string") return opts.title;
    return stats.showAverage
        ? t("heatmap.captionRange", { field: opts.field, average: stats.average, present: stats.present, total: stats.total })
        : t("heatmap.captionRangeMarks", { field: opts.field, present: stats.present, total: stats.total });
}

/**
 * What a calendar day's dots are counted from (B-133): how many notes
 * painted each day with a single `field`, or each layer's own marks with
 * `layers`, so every layer painted that day shows, not only the one that
 * won the cell.
 */
type CalendarDots =
    | { kind: "notes"; counts: ReadonlyMap<string, number> }
    | { kind: "layers"; perLayer: readonly ReadonlyMap<string, DayMark>[] };

/**
 * `layout: calendar` (B-133): the whole current month, or week, as a
 * calendar. A heading with the month and year, a row of weekday names
 * starting on the locale's first day, then one cell per day with its number
 * and a dot per note (or layer) that painted it. Which day sits where, which
 * days are still ahead and how many dots each gets come from
 * `core/month-calendar.ts`; this only draws.
 *
 * A day up to today behaves as a grid cell does: the same tooltip, the same
 * link to its note, today's ring, the `skip_field` hatch. A day still ahead
 * is dimmed and stays a plain cell, no dots and no link: whatever a note
 * dated there holds has not happened yet. It still hatches, a planned day
 * off being worth seeing in advance. The caption counts only the days up to
 * today, the same window and so the same numbers a `range` grid shows.
 * There is nothing to scroll, so no scroller and no `ResizeObserver`.
 */
function drawCalendar(
    el: HTMLElement,
    ctx: BlockContext,
    marks: ReadonlyMap<string, Paintable>,
    bounds: DateWindow,
    dots: CalendarDots,
    opts: GridSharedOptions & Pick<DrawOptions, "mobile" | "tap">,
): void {
    const today = ctx.today();
    const todayKey = dateKey(today);
    const layout = layoutCalendar(bounds, today, opts.firstDay);

    const wrap = el.createDiv({ cls: "dashy-hm-wrap dashy-hm-calendar" });
    wrap.createDiv({ cls: "dashy-hm-title", text: rangeCaption(opts, captionStats(layout.pastKeys, marks, opts)) });
    const months = calendarMonths(bounds);
    wrap.createDiv({
        cls: "dashy-hm-cal-month",
        text: months.to
            ? t("heatmap.calendarSpan", { from: monthYearShort(months.from), to: monthYearShort(months.to) })
            : monthYearLong(months.from),
    });

    const grid = wrap.createDiv({ cls: "dashy-hm-cal" });
    for (const name of rotateWeekdays(weekdayNamesShort(), opts.firstDay)) {
        grid.createDiv({ cls: "dashy-hm-cal-wd", text: name });
    }

    let specialInCalendar = false;
    for (const slot of layout.weeks.flat()) {
        if (!slot) {
            grid.createDiv({ cls: "dashy-hm-cal-day dashy-hm-pad" });
            continue;
        }
        const date = slot.key;
        const hit = marks.get(date);
        const paintable = !slot.future && hit?.painted ? hit : undefined;
        const special = opts.special.has(date);
        if (special) specialInCalendar = true;
        const isToday = date === todayKey;
        const cell = paintable && opts.linkable
            ? internalLink(grid, paintable.path, "dashy-hm-cal-day")
            : grid.createDiv({ cls: "dashy-hm-cal-day" });
        cell.classList.toggle("is-skipped", special);
        cell.classList.toggle("is-today", isToday);
        cell.classList.toggle("is-future", slot.future);
        cell.createDiv({ cls: "dashy-hm-cal-num", text: String(slot.day) });

        const dotColors = dots.kind === "notes"
            ? Array.from({ length: noteDots(dots.counts.get(date) ?? 0, slot.future) }, () => opts.color)
            : layerDots(dots.perLayer, date, slot.future).map((i) => opts.layers?.[i]?.color ?? opts.color);
        const dotRow = cell.createDiv({ cls: "dashy-hm-cal-dots" });
        for (const rgb of dotColors) dotRow.createSpan({ cls: "dashy-hm-dot" }).style.backgroundColor = rgba(rgb, 1);

        // A day still ahead is not "no data": it simply has not come yet,
        // so it reads as its date alone, or as a planned day off.
        const futureLabel = formatDayMedium(parseDateKey(date));
        const tooltip = slot.future
            ? (special ? t("heatmap.cellEmptySkipped", { date: futureLabel }) : futureLabel)
            : cellTooltip(date, paintable, special, isToday, opts);
        if (paintable) cell.setAttr("aria-label", tooltip);
        cell.setAttr("title", tooltip);
        if (opts.mobile) attachTap(cell, date, tooltip, opts);
    }

    // The grid's own legend rows, less the bands: a calendar day has no
    // shade for them to explain (`readLayout` already warned about them).
    if (opts.layers || specialInCalendar) {
        const legend = wrap.createDiv({ cls: "dashy-hm-legend" });
        if (opts.layers) drawLayersLegend(legend, opts.layers);
        if (specialInCalendar) drawSkippedLegend(legend);
    }
    attachStatusLine(el, opts);
}

/**
 * What a cell needs in order to paint itself — the shape a plain `DayMark`
 * and a layered `LayeredMark` (core/layers.ts) have in common, once a day's
 * contributors have already been collapsed into "the one mark a cell shows".
 * `isBool` is carried by both (B-116): a plain `DayMark`'s own field
 * booleanness, or a `LayeredMark`'s winning layer's own. `layer`/`parts`
 * are only ever set by a `LayeredMark` (which layer won, and every layer
 * with a value that day) — neither side has to know the other exists.
 */
interface Paintable {
    value: number;
    path: string;
    painted: boolean;
    isBool?: boolean;
    layer?: number;
    parts?: readonly { label: string; value: number; layer: number }[];
    /** every note that contributed here (B-092) — always at least one on any mark this shape describes */
    notes: readonly DayNote[];
}

/**
 * The tap-to-read, tap-to-open state for one `renderHeatmap` call (B-092),
 * shared by every grid it draws — a multi-year heatmap is still one block
 * with one selection, not one per year. `status` starts `undefined` and is
 * filled in once, after every grid has been drawn (`drawYears`/
 * `drawRangeGrid`), by a single line placed after the last one; every
 * cell's click closure only ever reads it later, once a tap actually
 * happens, by which point the whole render has already finished building
 * the DOM top to bottom.
 */
interface MobileTapState {
    selectedCell: HTMLElement | null;
    selectedDate: string | null;
    status: HTMLElement | undefined;
}

interface DrawOptions {
    /** the single field's colour; with `layers` set, filler that no cell actually reads (see `layer` on `Paintable`) */
    color: Rgb;
    /** set only in `layers` mode: a cell's own colour comes from `layers[mark.layer]`, and each gets a legend row */
    layers?: readonly Layer[];
    /** THIS grid's own, already resolved: the reader's `bands:` reused as-is, or fitted to this grid alone (B-116, `resolveGridBands`) */
    bands: Band[];
    /** whether the bands legend row(s) draw at all for this grid — see `resolveGridBands` for exactly when (B-116) */
    showBandsLegend: boolean;
    /**
     * B-138: set only for a `field` list made only of checkboxes, where a
     * day's value is how many were ticked (`checkboxCount`). Its
     * presence is what scores a checkbox day through `bands` instead of
     * painting it flat; never set with `layers`.
     */
    checkboxBands?: Band[];
    /** already the display form: one field name, several joined with ", ", or every layer's own label joined the same way */
    field: string;
    /** B-121: values are durations in minutes, shown `7h 30m` in tooltips, the caption's average and the legend */
    duration: boolean;
    /** B-145: with `duration`, every value was written to the second; tooltips and the average read `2:16:32`, the legend does not */
    clock?: boolean;
    /** B-121, `layers` mode only: per layer, whether its tooltip part reads as a duration */
    layerDurations?: readonly boolean[];
    /** B-145, `layers` mode only: per layer, whether its tooltip part reads as a clock */
    layerClocks?: readonly boolean[];
    linkable: boolean;
    title: unknown;
    /** days (B-095) any note in the selection marked special; hatched regardless of `layers` or of which one painted */
    special: ReadonlySet<string>;
    /** 0 is Sunday, 1 is Monday — whatever the locale says */
    firstDay: number;
    /** Where this grid's scroller sat before this redraw, if anywhere worth restoring. */
    restore: ScrollSnapshot | undefined;
    /**
     * `dateKey(ctx.today())` (B-099), respecting `startDayHour` the same way
     * every other "today" in this block does. Compared against a cell's own
     * key, never against `new Date()` directly: a grid's `dayKeys` only ever
     * come from one calendar year or one `range` window, so this alone is
     * enough to ring at most one cell per grid without also checking which
     * year the grid belongs to.
     */
    today: string;
    /** B-092: whether the tap-to-read interaction runs at all — computed once per render, not per grid. */
    mobile: boolean;
    /** B-092: this render's one shared selection, across every grid `drawGrid` is called for. */
    tap: MobileTapState;
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

/**
 * The tooltip's own note part (B-092): the contributing note's name when
 * there was exactly one, or how many when several — never both a name and a
 * count. `undefined` for the empty list a truly empty cell has, so the
 * caller can tell "nothing to add" apart from "add this text".
 */
function noteSuffix(notes: readonly DayNote[]): string | undefined {
    if (notes.length === 1) return notes[0]?.name;
    if (notes.length > 1) return tPlural("heatmap.notesCount", notes.length);
    return undefined;
}

/**
 * A cell's value for its tooltip: a duration as `7h 30m` (B-121), or as
 * `2:16:32` with `clock` (B-145), a plain number through `roundedValue` as
 * before, without `formatValue`'s digit grouping, whose narrow no-break
 * space has no business in a `title`.
 */
function cellValue(value: number, duration: boolean, clock = false): string | number {
    return duration ? formatDuration(value, clock) : roundedValue(value);
}

/**
 * The block-wide status line a tap writes into (B-092): built once per
 * render, after every grid `drawYears`/`drawRangeGrid` draws — never inside
 * any one grid's own `.dashy-hm-wrap`, so a multi-year heatmap gets one line
 * after the last grid rather than one per year. A no-op on desktop, and
 * `opts.tap` (shared by every grid drawn this render) is where each grid's
 * own click handlers already expect to find the result.
 */
function attachStatusLine(el: HTMLElement, opts: Pick<DrawOptions, "mobile" | "tap">): void {
    if (!opts.mobile) return;
    const status = el.createDiv({ cls: "dashy-hm-status" });
    status.setAttr("aria-live", "polite");
    opts.tap.status = status;
}

/** What a cell's tooltip reads besides the day itself: shared by the grid and the calendar (B-133). */
type TooltipOptions = Pick<DrawOptions, "field" | "duration" | "clock" | "layerDurations" | "layerClocks">;

/**
 * A day's tooltip, the same text whether the day is a grid cell or a
 * calendar day (B-133): the locale's medium date (B-092), "Sep 25, 2026"
 * rather than the bare `YYYY-MM-DD` key, a reader taps or hovers a cell, not
 * a machine parsing it; then the value(s) and note(s) when the day painted,
 * "no data" when it did not, and the day-off and today markers.
 */
function cellTooltip(
    date: string,
    paintable: Paintable | undefined,
    special: boolean,
    isToday: boolean,
    opts: TooltipOptions,
): string {
    const dateLabel = formatDayMedium(parseDateKey(date));
    let tooltip: string;
    if (paintable) {
        // Rounded the same way a card would (`roundedValue`, not
        // `formatValue`): an integer stays exactly as is (a sum of
        // whole numbers reads "8000", not "8 000"), and a fraction from
        // `per_day: avg` gets one decimal instead of the sixteen a raw
        // JS float division produces. `formatValue`'s own digit
        // grouping is left out on purpose — its narrow no-break space
        // has no business inside a `title` attribute.
        let baseTooltip = paintable.parts
            ? t("heatmap.cellLayers", {
                date: dateLabel,
                // Each layer's own "label value" piece goes through
                // `t()` on its own (`heatmap.cellPart`), same as any
                // other user-facing text; only the plain ", " between
                // them is bare punctuation, the same list separator
                // `fieldLabel`/`fields.join(", ")` already uses above.
                parts: paintable.parts
                    .map((p) => t("heatmap.cellPart", {
                        label: p.label, value: cellValue(
                            p.value, opts.layerDurations?.[p.layer] ?? false, opts.layerClocks?.[p.layer] ?? false,
                        ),
                    }))
                    .join(", "),
            })
            : t("heatmap.cell", { date: dateLabel, field: opts.field, value: cellValue(paintable.value, opts.duration, opts.clock) });
        // B-092: which note(s) this day's value came from — its name
        // when there was exactly one, "N notes" when several. Folded
        // into `baseTooltip` itself, before the day-off/today wrapping
        // below, so it stays "date: field value (note), day off, today"
        // rather than landing after them.
        const note = noteSuffix(paintable.notes);
        if (note) baseTooltip = t("heatmap.cellWithNote", { cell: baseTooltip, note });
        // Both markers wrap the same way, applied in this fixed order:
        // "day off" (B-095) reads as a property of the day's data, the
        // more immediate fact, and "today" (B-099) as a note about the
        // day itself, so it comes last — "…, day off, today" rather than
        // the other way round.
        tooltip = special ? t("heatmap.cellSkipped", { cell: baseTooltip }) : baseTooltip;
    } else {
        tooltip = special ? t("heatmap.cellEmptySkipped", { date: dateLabel }) : t("heatmap.cellEmpty", { date: dateLabel });
    }
    if (isToday) tooltip = t("heatmap.cellToday", { cell: tooltip });
    return tooltip;
}

/**
 * B-092: on a phone there is no hover, so the same tooltip text needs a
 * tap-reachable home. The first tap on a cell shows it on the block's own
 * status line (`opts.tap`, shared by every grid this render draws — see
 * `drawHeatmap`) and marks the cell `is-selected`, intercepting the click so
 * it does not also open the note; a second tap on the SAME cell is left
 * alone, and Obsidian's own `.internal-link` handling opens it exactly as a
 * desktop click already does. Called only when `opts.mobile`: on desktop
 * nothing here runs, and the interaction is unchanged.
 */
function attachTap(cell: HTMLElement, date: string, tooltip: string, opts: Pick<DrawOptions, "tap">): void {
    cell.addEventListener("click", (evt) => {
        if (opts.tap.selectedDate === date) return;
        evt.preventDefault();
        evt.stopPropagation();
        opts.tap.selectedCell?.classList.remove("is-selected");
        cell.classList.add("is-selected");
        opts.tap.selectedCell = cell;
        opts.tap.selectedDate = date;
        opts.tap.status?.setText(tooltip);
    });
}

/** One legend row per layer, its colour and its label. */
function drawLayersLegend(legend: HTMLElement, layers: readonly Layer[]): void {
    for (const layer of layers) {
        const row = legend.createDiv({ cls: "dashy-hm-leg" });
        row.createDiv({ cls: "dashy-hm-swatch" }).style.backgroundColor = rgba(layer.color, 1);
        row.createSpan({ text: layer.label });
    }
}

/** The hatch's own legend row (B-095), for a grid or calendar that has a hatched day. */
function drawSkippedLegend(legend: HTMLElement): void {
    const row = legend.createDiv({ cls: "dashy-hm-leg" });
    row.createDiv({ cls: "dashy-hm-swatch is-skipped" });
    row.createSpan({ text: t("heatmap.legendSkipped") });
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
        // B-099: `opts.today` is already scoped to this one grid's own year
        // or window, so a plain key comparison is enough — no separate check
        // for "is this the grid the current year belongs to".
        const isToday = date === opts.today;
        const cell = paintable && opts.linkable
            ? internalLink(grid, paintable.path, "dashy-hm-cell")
            : grid.createDiv({ cls: "dashy-hm-cell" });
        // A special day (B-095) hatches whether or not it also painted: the
        // class carries no meaning about the value, only about the day.
        cell.classList.toggle("is-skipped", special);
        // Today's ring (B-099) never changes the cell's own fill, so it
        // paints or hatches exactly as any other day would; only an outline
        // class is added on top.
        cell.classList.toggle("is-today", isToday);
        // Built once, before the fill below, so the mobile tap handling
        // further down can reuse the exact text a hover already shows,
        // painted or empty.
        const tooltip = cellTooltip(date, paintable, special, isToday, opts);
        if (paintable) {
            // A checkbox winner is always exactly 1, never a real "how
            // much" (B-116, checker round 1): `opts.bands` is fitted from
            // only the non-boolean cells in this grid (`resolveGridBands`),
            // so running a boolean one through `bandFor` at all would score
            // it against a scale that was never fitted to it — full alpha,
            // the same as any boolean cell always painted before B-116,
            // without even reaching `bandFor`. Except a ticked-box count
            // (B-138, `checkboxBands`): there the value IS a "how much",
            // and `opts.bands` is its own scale or the reader's `bands:`.
            const flat = paintable.isBool && opts.checkboxBands === undefined;
            const alpha = flat ? 1 : bandFor(opts.bands, paintable.value)?.alpha ?? 1;
            // The winning layer's own colour, when there is one — set only
            // by a `LayeredMark`, and only ever `undefined` on one once no
            // layer painted that day, which is exactly when `paintable`
            // itself is `undefined` above. Falls back to `opts.color`
            // otherwise, which is what every plain, `layers`-less mark uses.
            const rgb = opts.layers && paintable.layer !== undefined
                ? (opts.layers[paintable.layer]?.color ?? opts.color)
                : opts.color;
            cell.style.backgroundColor = rgba(rgb, alpha);
            cell.setAttr("aria-label", tooltip);
        }
        cell.setAttr("title", tooltip);
        if (opts.mobile) attachTap(cell, date, tooltip, opts);
    }

    const legend = wrap.createDiv({ cls: "dashy-hm-legend" });
    if (opts.layers) drawLayersLegend(legend, opts.layers);
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
    if (specialInGrid) drawSkippedLegend(legend);

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
    //
    // A widening pane (a sidebar collapse animation) shrinks the scrollable
    // range frame by frame, and the browser clamps `scrollLeft` to the new
    // end on every frame it no longer fits, each one firing a `scroll` event
    // that does not match the one-time `lastAssignedScrollLeft` above. While
    // still unsettled, such a clamp is not the reader taking over: it only
    // catches `lastAssignedScrollLeft` up to where the browser actually put
    // it, so `updateScrollState` keeps re-pinning to the end afterwards
    // instead of the grid getting stuck wherever the animation happened to
    // leave it (B-104).
    const onScroll = (): void => {
        recordPosition();
        if (scroll.scrollLeft !== lastAssignedScrollLeft) {
            if (!settled && isEndClamp(scroll.scrollLeft, scroll.clientWidth, scroll.scrollWidth)) {
                lastAssignedScrollLeft = scroll.scrollLeft;
            } else {
                settle();
            }
        }
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
