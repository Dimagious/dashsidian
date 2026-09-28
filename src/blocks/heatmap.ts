import type { BlockContext } from "./context";
import { weekdayNamesShort, monthNamesShort, firstDayOfWeek } from "../adapters/datetime";
import { selectNotes, readSource, unmatchedSource } from "../core/source";
import { classifyField } from "../core/aggregate";
import { readFields, readPerDay, dayValues, unusedFields, type DayMark } from "../core/day-values";
import { readDateField } from "../core/note-date";
import { formatValue, roundedValue } from "../core/stat";
import { layoutYear, dateKey, eachDay, yearsOf, rotateWeekdays, weekdayRow } from "../core/calendar";
import { toRgb, rgba, type Rgb } from "../core/palette";
import { readBands, bandFor, type Band } from "../core/bands";
import { scrollEdges, resolveScrollRestore, type ScrollSnapshot } from "../core/scroll";
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

/**
 * A reader who has scrolled a year's grid by hand should not find it jumped
 * back to the end on the next vault event: every redraw clears the element
 * and rebuilds it from scratch (`clearBlock`, `drawYear`), so nothing about
 * where a scroller sat survives on its own unless it is read out of the DOM
 * first. One snapshot per year, `data-year` on `.dashy-hm-scroll` saying
 * which; a year missing from the new draw is simply absent from the map
 * `renderHeatmap` looks it up in.
 *
 * Reads `dataset` only, never live `scrollLeft`/`clientWidth`/`scrollWidth`:
 * a redraw can land while the pane is not the active tab, where Obsidian
 * lays it out at `display: none` and every live metric reads 0. Measured
 * live, that 0/0/0 reads as "at the end" (nothing to scroll right to) and
 * the real position is lost the moment the reader switches tabs, edits
 * something, and switches back. `dataset.scrollLeft`/`dataset.atEnd` are
 * instead kept up to date by the scroller itself, in `drawYear`, only while
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
function captureScrollState(el: HTMLElement): Map<number, ScrollSnapshot> {
    const saved = new Map<number, ScrollSnapshot>();
    for (const scroll of Array.from(el.querySelectorAll<HTMLElement>(".dashy-hm-scroll"))) {
        const year = Number(scroll.dataset.year);
        if (!Number.isInteger(year)) continue;

        if (scroll.dataset.settled === "true") {
            const scrollLeft = Number(scroll.dataset.scrollLeft);
            if (Number.isFinite(scrollLeft)) {
                saved.set(year, { settled: true, scrollLeft, atEnd: scroll.dataset.atEnd === "true" });
                continue;
            }
        }

        // Nothing achieved of its own yet: fall back to whatever it was
        // seeded with, so a redraw before any tick still carries the
        // previous draw's snapshot forward instead of losing it.
        const pendingScrollLeft = Number(scroll.dataset.pendingScrollLeft);
        if (Number.isFinite(pendingScrollLeft)) {
            saved.set(year, {
                settled: scroll.dataset.pendingSettled === "true",
                scrollLeft: pendingScrollLeft,
                atEnd: scroll.dataset.pendingAtEnd === "true",
            });
        }
    }
    return saved;
}

export function renderHeatmap(ctx: BlockContext, source: string, el: HTMLElement): void | (() => void) {
    const restoreByYear = captureScrollState(el);
    clearBlock(el);
    disconnectObservers(el);

    const { value, diagnostics } = parseConfig(source, { root: KNOWN });
    const diags: Diagnostic[] = [...diagnostics];

    if (!isRecord(value)) {
        renderDiagnostics(el, "heatmap", diags.length ? diags : [{ level: "error", message: t("heatmap.expectFields") }]);
        return;
    }
    diags.push(...unknownKeys(value, KNOWN));

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
    const { perDay, diagnostics: perDayDiags } = readPerDay(value);
    diags.push(...perDayDiags);

    const { spec: selection, diagnostics: sourceDiags } = readSource(value);
    diags.push(...sourceDiags);
    const missing = unmatchedSource(ctx.notes(), selection);
    if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });
    const notes = selectNotes(ctx.notes(), selection);

    // One entry per day any of `fields` resolved on at all — see
    // `core/day-values.ts` for how a day's contributors (two notes, two
    // fields in one note, or both at once) collapse into its one value.
    const marks = dayValues(notes, fields, perDay, dateField);

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

    const today = ctx.today();
    const firstDay = firstDayOfWeek();
    // One grid per calendar year, never one later than today's: a note
    // dated next year (or, with `startDayHour` set, a real-date note just
    // after midnight before the day has effectively turned over) used to
    // draw a full, empty grid above the real data (B-113). That note still
    // counts nowhere in the heatmap; if every dated note turns out to be in
    // the future, the current year is drawn anyway, empty, rather than
    // showing nothing at all.
    const years = yearsOf([...marks.keys()]).filter((y) => y <= today.getFullYear());
    const yearsToDraw = years.length ? years : [today.getFullYear()];
    const drawn: ResizeObserver[] = [];
    for (const year of yearsToDraw) {
        // With more than one grid, each has to say which year it is —
        // otherwise two grids under the same custom title read as the same
        // thing drawn twice, which is exactly how it was first reported.
        const observer = drawYear(el, year, today, marks, {
            color, bands, field: fieldLabel, linkable, title: value.title, firstDay,
            severalYears: yearsToDraw.length > 1,
            restore: restoreByYear.get(year),
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

interface DrawOptions {
    color: Rgb;
    bands: Band[];
    /** already the display form: one field name, or several joined with ", " */
    field: string;
    linkable: boolean;
    title: unknown;
    /** 0 is Sunday, 1 is Monday — whatever the locale says */
    firstDay: number;
    /** Whether this grid is one of several, and so has to name its year. */
    severalYears: boolean;
    /** Where this year's scroller sat before this redraw, if anywhere worth restoring. */
    restore: ScrollSnapshot | undefined;
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
    // Read back by `captureScrollState` on the next redraw, before this
    // element is torn down; not translated, never shown, just bookkeeping.
    scroll.dataset.year = String(year);
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
            // Rounded the same way a card would (`roundedValue`, not
            // `formatValue`): an integer stays exactly as is (a sum of
            // whole numbers reads "8000", not "8 000"), and a fraction from
            // `per_day: avg` gets one decimal instead of the sixteen a raw
            // JS float division produces. `formatValue`'s own digit
            // grouping is left out on purpose — its narrow no-break space
            // has no business inside a `title` attribute.
            const tooltip = t("heatmap.cell", { date, field: opts.field, value: roundedValue(paintable.value) });
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
