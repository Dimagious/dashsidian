import type { BlockContext } from "./context";
import { noteExists } from "../adapters/vault";
import { discoverPeriodics, periodContext } from "../adapters/periodic";
import { formatDate, formatNoteName, timeFormats } from "../adapters/datetime";
import { clockFormat, startClockTicker, type ClockPrecision } from "../core/clock";
import { readToday, resolveConfig, notePath, type Period, type PeriodConfig } from "../core/periodic";
import { neighbourDays, readNoteDay } from "../core/note-day";
import { parseConfig, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, renderNotices, internalLink } from "../shared/render";
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

/**
 * The labels with `date: note` (B-210): "This week" over a note from last
 * year would be wrong, so the chips name the unit alone.
 */
const NOTE_LABEL_KEY: Record<Period, MessageKey> = {
    daily: "today.noteDaily",
    weekly: "today.noteWeekly",
    monthly: "today.noteMonthly",
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

/**
 * The running clock ticker of each block's element (B-151), so the next draw
 * into the same element stops it before starting another. `clearBlock` takes
 * the clock's node away but not its timer: without this every vault event
 * would leave one more interval ticking into a detached node. Keyed by the
 * element for the same reason heatmap keys its observers: the block is a
 * plain draw function with nowhere else to keep state between calls.
 */
const tickers = new WeakMap<HTMLElement, () => void>();

/** Stops and forgets the clock ticking in `el`, if there is one. */
function stopClock(el: HTMLElement): void {
    tickers.get(el)?.();
    tickers.delete(el);
}

export function renderToday(ctx: BlockContext, source: string, el: HTMLElement): void | (() => void) {
    // First, before any early return: a redraw into a now broken config
    // must not leave the previous clock ticking.
    stopClock(el);
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

    // `date: note` (B-210): the day is the note's own, read from its name
    // the way `period: note` reads a window. A name that is no day stops
    // the block; in a template it is a hint, not an error (B-190).
    let day: Date;
    if (spec.noteDate) {
        const reading = readNoteDay(periodContext(ctx.app, ctx.sourcePath));
        if ("template" in reading) {
            renderDiagnostics(el, "today", diags);
            renderNotices(el, [t("today.templateNote")]);
            return;
        }
        if ("problem" in reading) {
            diags.push({ level: "error", message: reading.problem });
            renderDiagnostics(el, "today", diags);
            return;
        }
        day = reading.day;
    } else {
        // Read once, from the context, so the title and every link below agree
        // on the same day — including a day pushed back past midnight by the
        // "New day starts at" setting.
        day = ctx.today();
    }

    renderDiagnostics(el, "today", diags);

    const discovered = discoverPeriodics(ctx.app);
    const config = (period: Period): PeriodConfig => resolveConfig(period, ctx.settings[FOLDER_KEY[period]], discovered[period]);

    const wrap = el.createDiv({ cls: "dashy-today" });
    if (spec.clock) drawClock(wrap, el, clockFormat(spec.clock, timeFormats()), spec.clock);
    wrap.createDiv({ cls: "dashy-today-date", text: spec.title ?? formatDate(day, TITLE_FORMAT) });

    const labels = spec.noteDate ? NOTE_LABEL_KEY : LABEL_KEY;
    const row = wrap.createDiv({ cls: "dashy-today-links" });
    for (const period of spec.periods) {
        const cfg = config(period);
        const basename = formatNoteName(day, cfg.format);
        const path = notePath(cfg.folder, basename);

        // With `date: note` the daily chip of the note itself would be a
        // link to the page already open: drawn as a plain chip instead.
        if (spec.noteDate && path === ctx.sourcePath) {
            const chip = row.createDiv({ cls: "dashy-today-chip is-current", attr: { "aria-current": "page", title: t("today.thisNote") } });
            fillChip(chip, period, t(labels[period]), basename);
            continue;
        }
        const exists = noteExists(ctx.app, path);

        // The link is drawn even for a note that does not exist: clicking it
        // creates the note. It is dimmed so that "not yet" shows before the click.
        const chip = internalLink(row, path, exists ? "dashy-today-chip" : "dashy-today-chip is-missing");
        fillChip(chip, period, t(labels[period]), basename);
        chip.setAttr("title", exists ? path : t("today.missingNote", { path }));
    }

    if (spec.noteDate && spec.nav) drawNav(ctx, wrap, day, config("daily"));
    // For the note closing: no redraw follows, so `DashyBlock.onunload`
    // (app/block.ts) is the only one left to stop the clock.
    if (spec.clock) return () => stopClock(el);
}

/** The icon, the label and the note's name inside a chip. */
function fillChip(chip: HTMLElement, period: Period, label: string, basename: string): void {
    chip.createSpan({ cls: "dashy-today-icon", text: ICONS[period] });
    chip.createSpan({ cls: "dashy-today-label", text: label });
    chip.createSpan({ cls: "dashy-today-name", text: basename });
}

/**
 * The day before and the day after the note's day (B-210), under the
 * chips: "← 2026-11-08 · 2026-11-10 →", named and filed the way the daily
 * chip is. A note that does not exist is linked and dimmed, as a chip is.
 */
function drawNav(ctx: BlockContext, wrap: HTMLElement, day: Date, cfg: PeriodConfig): void {
    const nav = wrap.createDiv({ cls: "dashy-today-nav" });
    const { previous, next } = neighbourDays(day);
    const link = (date: Date, side: "is-previous" | "is-next"): void => {
        const basename = formatNoteName(date, cfg.format);
        const path = notePath(cfg.folder, basename);
        const exists = noteExists(ctx.app, path);
        const a = internalLink(nav, path, `dashy-today-nav-link ${side}${exists ? "" : " is-missing"}`);
        a.setAttr("title", exists ? path : t("today.missingNote", { path }));
        const arrow = (text: string): void => {
            a.createSpan({ cls: "dashy-today-nav-arrow", text, attr: { "aria-hidden": "true" } });
        };
        if (side === "is-previous") arrow("←");
        a.createSpan({ cls: "dashy-today-nav-name", text: basename });
        if (side === "is-next") arrow("→");
    };
    link(previous, "is-previous");
    nav.createSpan({ cls: "dashy-today-nav-sep", text: "·", attr: { "aria-hidden": "true" } });
    link(next, "is-next");
}

/**
 * The clock above the date. Only its own text node changes on a tick: no
 * redraw of the block, no vault snapshot. The day rolling over is not its
 * business either: the plugin's day-rollover timer (`core/day-rollover.ts`)
 * already redraws every block at the boundary the "New day starts at"
 * setting names, which brings a new date line, new links and a new clock.
 *
 * Not an `aria-live` region on purpose: a screen reader would announce
 * every minute, or every second.
 */
function drawClock(wrap: HTMLElement, el: HTMLElement, format: string, precision: ClockPrecision): void {
    const clock = wrap.createDiv({ cls: "dashy-today-clock", text: formatDate(new Date(), format) });
    tickers.set(el, startClockTicker({
        precision,
        now: () => new Date(),
        setTimeout: (fn, delay) => window.setTimeout(fn, delay),
        clearTimeout: (handle) => window.clearTimeout(handle),
        setInterval: (fn, delay) => window.setInterval(fn, delay),
        clearInterval: (handle) => window.clearInterval(handle),
        onTick: (now) => clock.setText(formatDate(now, format)),
    }));
}
