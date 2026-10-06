import type { BlockContext } from "./context";
import { selectNotes, unmatchedSource, type NoteRecord } from "../core/source";
import {
    readBlockSelection, inheritSelection, blankSelectionDiagnostics, undatedRootDiagnostics, unmatchedRootDateFormat,
} from "../core/inherit";
import { aggregate, series, classifyField, classifyValues } from "../core/aggregate";
import { readDateField, readDateFormat, unmatchedDateFormat } from "../core/note-date";
import { sparkBars } from "../core/sparkline";
import {
    readStat, formatReading, showsDuration, showsClock, durationDiagnostics, valueLengthClass, GROUP_SEPARATOR,
} from "../core/stat";
import {
    readPeriod,
    readCompare,
    filterByPeriod,
    filterByWindow,
    previousPeriodWindow,
    usualWindow,
    usualCaption,
    formatDelta,
    deltaTone,
    compareCaption,
    dateFieldHasEffect,
    futureStart,
    windowLastDay,
    type DeltaTone,
} from "../core/period";
import { readStatsLayout, inlineLayoutDiagnostics } from "../core/stats-layout";
import { firstDayOfWeek } from "../adapters/datetime";
import { noteDateFormats, periodContext } from "../adapters/periodic";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, renderNotices } from "../shared/render";
import { notStartedNotice } from "./window";
import { t } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN_ITEM = Object.keys(schema.blocks.stats.item);
const KNOWN_ROOT = Object.keys(schema.blocks.stats.root);
/** Keys a card inherits from the block root: the ones the schema declares at both levels. */
const SHARED = KNOWN_ROOT.filter((key) => KNOWN_ITEM.includes(key));

interface Delta {
    /** decorative glyph, kept out of what a screen reader reads as meaningful */
    arrow: string;
    /** the sign-and-number part: it carries the meaning on its own */
    text: string;
    tone: DeltaTone;
    /** what the number compares with, e.g. "vs the same days last week: 1" */
    title: string;
}

interface Card {
    label: string;
    text: string;
    icon?: string;
    unit?: string;
    sub?: string;
    /** bar heights in percent, empty when no trend was asked for */
    trend: number[];
    /** unset when `compare` was not asked for, or either side had nothing to count */
    delta?: Delta;
    /** `compare: usual` with no history before the window: a muted line instead of a delta */
    deltaHint?: string;
}

export function renderStats(ctx: BlockContext, source: string, el: HTMLElement): void {
    clearBlock(el);
    const { value, diagnostics } = parseConfig(source, { root: KNOWN_ROOT, item: KNOWN_ITEM, bareItem: true });
    const diags: Diagnostic[] = [...diagnostics];
    const items = asItems(value);

    if (!items.length) {
        // A parse failure already said what was wrong; adding "the list is
        // empty" on top of "the block is empty" is noise, and the two read as
        // two separate problems.
        if (value !== null) diags.push({ level: "error", message: t("stats.empty") });
        renderDiagnostics(el, "stats", diags);
        return;
    }
    // Root keys are only checked for the `items:` shape — otherwise a single
    // card written as an object would get warnings about its own keys.
    const root = isRecord(value) && Array.isArray(value.items) ? value : null;
    if (root) diags.push(...unknownKeys(root, KNOWN_ROOT));

    const columns = isRecord(value) && typeof value.columns === "number" ? value.columns : 3;
    const { layout, diagnostics: layoutDiags } = readStatsLayout(root);
    diags.push(...layoutDiags, ...inlineLayoutDiagnostics(layout, root, items));

    // One snapshot for the whole page, taken by the context.
    const notes = ctx.notes();
    // Taken once, so every card on the page measures the same window.
    const today = ctx.today();
    const firstDay = firstDayOfWeek();
    // B-129: how `period: note`, `2026-W40` and `from`/`to` are read.
    const periodCtx = periodContext(ctx.app, ctx.sourcePath);
    const cards: Card[] = [];
    // A window that has not started yet is not a mistake, only nothing to count.
    const notices: string[] = [];
    let notStarted = 0;

    // A selection at the block root is read, and its problems reported, once
    // for the whole block rather than once per card that inherits it.
    const block = readBlockSelection(value, SHARED, periodCtx);
    diags.push(...block.diagnostics);
    const rootMissing = unmatchedSource(notes, block.source);
    if (rootMissing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: rootMissing }) });

    // A root `date_format` that does not read is reported once, not per card.
    const rootFormat = readDateFormat(block.defaults);
    diags.push(...rootFormat.diagnostics);

    // Cards whose inherited `date_field` found no dated note, named in one warning.
    const undatedCards: string[] = [];
    // What the cards inheriting the root's `date_format` select, judged together once.
    const rootFormatted: { notes: readonly NoteRecord[]; dateField?: string }[] = [];
    for (const own of items) {
        diags.push(...unknownKeys(own, KNOWN_ITEM));
        const { item, source, diagnostics: sourceDiags, inherited } = inheritSelection(own, block);

        const label = typeof item.label === "string" ? item.label : "";
        const cardLabel = label ? `"${label}"` : t("stats.unlabeledCard");
        const { spec, diagnostics: statDiags } = readStat(item, label);
        diags.push(...statDiags);

        diags.push(...sourceDiags, ...blankSelectionDiagnostics(own, block, cardLabel));
        // An inherited folder was checked above; only the card's own is checked here.
        const missing = own.source !== undefined ? unmatchedSource(notes, source) : null;
        if (missing) diags.push({ level: "warning", message: t("where.noSuchFolder", { folder: missing }) });
        const selected = selectNotes(notes, source);

        // A typo in `field` and a text field like Garmin's `running: "10 km"`
        // both aggregate to "nothing to count", indistinguishable from an
        // honest zero without this. Checked against the selection before
        // `period` narrows it: a field that is fine elsewhere but simply has
        // no data in this window is B-079's plain, unwarned zero/dash, not
        // this (B-111). `count` never reads a field and `streak` only when
        // given one, so both are naturally skipped by `spec?.field`.
        if (spec?.field && selected.length) {
            const fieldStatus = classifyField(selected, spec.field);
            if (fieldStatus !== "ok") {
                diags.push({
                    level: "warning",
                    message: fieldStatus === "missing"
                        ? t("stats.fieldMissing", { card: cardLabel, field: spec.field })
                        : t("stats.fieldNotNumeric", { card: cardLabel, field: spec.field }),
                });
            }
        }

        // Durations (B-121): judged over the whole selection, before `period`
        // narrows it, the same way as above, so the card, its delta and the
        // previous window's tooltip all share one format.
        const kinds = spec?.field ? classifyValues(selected, [spec.field]) : { kind: "none" as const };
        const duration = spec ? showsDuration(spec.agg, kinds.kind) : false;
        // B-145: race times written to the second read as `2:16:32`.
        const clock = spec ? showsClock(spec.agg, kinds) : false;
        if (spec) diags.push(...durationDiagnostics(spec, kinds, cardLabel));

        // `date_field` steers every reader of a note's date on this card:
        // `period`'s window below, and `streak`/`latest`/`trend` inside
        // `aggregate`/`series`, whether or not `period` is even set.
        const dateField = readDateField(item);
        // B-120: a format other than ISO for the same readings, and the
        // Daily notes day format after it. A root `date_format` is checked
        // against its cards' notes once, after the loop.
        const { format: dateFormat, diagnostics: formatDiags } = readDateFormat(item);
        // An inherited one that does not read was reported once at the root.
        if (!inherited.has("date_format")) diags.push(...formatDiags);
        const formats = noteDateFormats(ctx.app, dateFormat);
        if (inherited.has("date_format")) rootFormatted.push({ notes: selected, dateField });
        else diags.push(...unmatchedDateFormat(selected, dateField, formats));

        // `trend` keeps its own trailing window and reads `selected`
        // unfiltered — `period` narrows only what the number itself counts.
        const { spec: periodSpec, diagnostics: periodDiags, broken } = readPeriod(item, label, dateField, periodCtx);
        // An inherited `period` that does not read was reported once at the root.
        if (!inherited.has("period")) diags.push(...periodDiags);
        // B-129: a window ahead of today draws a dash and says when it starts;
        // a closed one counts `current_streak` and `trend` up to its last day.
        const startsOn = periodSpec ? futureStart(periodSpec.period, today) : null;
        const future = startsOn !== null;
        if (startsOn !== null) {
            notices.push(notStartedNotice(startsOn));
            notStarted++;
        }
        const lastDay = windowLastDay(periodSpec?.period, today);
        // A window that cannot be built counts nothing rather than everything.
        let counted = broken ? [] : selected;
        if (periodSpec) {
            const windowed = filterByPeriod(selected, periodSpec.period, today, firstDay, periodSpec.dateField, formats);
            // An inherited `date_field` is reported once for the block, below.
            const rootDateField = periodSpec.dateField !== undefined && inherited.has("date_field");
            if (selected.length && !windowed.anyDated && rootDateField) {
                undatedCards.push(cardLabel);
            } else if (selected.length && !windowed.anyDated) {
                diags.push({
                    level: "warning",
                    message: periodSpec.dateField
                        ? t("period.noDatedNotesField", { card: cardLabel, field: periodSpec.dateField })
                        : t("period.noDatedNotes", { card: cardLabel }),
                });
            }
            counted = windowed.notes;
        }

        // A `date_field` that feeds nothing on this card — no `period`, an
        // aggregate that never reads a date, and no `trend` — is a no-op the
        // config author cannot see without being told. Judged by what the
        // config *asked for* (`item.period`/`item.trend` written at all),
        // not by whether it parsed: an unreadable `period` or `trend` has
        // already earned its own diagnostic above, and this one would only
        // double up on the same mistake. Skipped entirely when `agg` itself
        // failed to parse: that too already has its own diagnostic. Only a
        // card's own `date_field` is judged: one set at the block root serves
        // the cards that read dates and is simply not needed by the rest.
        if (dateField && spec && readDateField(own)
            && !dateFieldHasEffect(item.period !== undefined, spec.agg, item.trend !== undefined)) {
            diags.push({ level: "warning", message: t("period.dateFieldUnused", { card: cardLabel }) });
        }

        const { spec: compareSpec, diagnostics: compareDiags } =
            readCompare(item, label, periodSpec !== null, spec?.agg);
        // An inherited root `period` that could not be read is already one
        // warning for the block; "`compare` needs `period`" on every card
        // would contradict it, since a period was written (B-153).
        const needsPeriod = t("compare.needsPeriod", { card: cardLabel });
        // The same for a window that cannot be built (B-129): its error already says why.
        diags.push(...((inherited.has("period") || broken) && periodSpec === null
            ? compareDiags.filter((d) => d.message !== needsPeriod)
            : compareDiags));

        const current = spec && !broken && !future
            ? aggregate(counted, {
                agg: spec.agg,
                field: spec.field,
                dateField,
                formats,
                atLeast: spec.atLeast,
                atMost: spec.atMost,
                days: spec.days,
                skipField: spec.skipField,
                today: lastDay,
            })
            : null;

        const card: Card = {
            label: label || spec?.field || "",
            text: formatReading(current, spec?.precision, duration, clock),
            trend: layout === "cards" && spec?.trend && spec.field && !broken && !future
                ? sparkBars(series(selected, spec.field, spec.trend, lastDay, dateField, formats))
                : [],
        };
        if (typeof item.icon === "string") card.icon = item.icon;
        // A duration already carries its units (`durationDiagnostics` warned).
        if (spec?.unit && !duration) card.unit = spec.unit;
        if (typeof item.sub === "string") card.sub = item.sub;

        // Compared to the same stretch of the previous period, on the same
        // selection and the same aggregate. `count` and `streak` never
        // return null even over an empty window, so "nothing to count" is
        // decided from the window itself (no notes at all) rather than from
        // the aggregate — a phantom delta against a made-up 0 is worse than
        // no delta. `current !== null` still covers a field aggregate whose
        // window has notes but none carrying the field.
        //
        // `compare: usual` (B-135) takes the same aggregate over everything
        // in the selection dated before the window instead: the card's
        // history, without the window it is measured against.
        if (compareSpec && periodSpec && spec && counted.length && current !== null) {
            const usual = compareSpec.against === "usual";
            const previousBounds = usual
                ? usualWindow(periodSpec.period, today, firstDay)
                : previousPeriodWindow(periodSpec.period, today, firstDay);
            const previousFiltered = filterByWindow(selected, previousBounds, periodSpec.dateField, formats);
            const previous = previousFiltered.notes.length
                ? aggregate(previousFiltered.notes, { agg: spec.agg, field: spec.field, dateField, formats })
                : null;
            if (previous !== null) {
                const format = formatDelta(current, previous, spec.precision, duration, clock);
                const previousText = formatReading(previous, spec.precision, duration, clock);
                card.delta = {
                    arrow: format.arrow,
                    text: format.text,
                    tone: deltaTone(format.direction, compareSpec.better),
                    title: usual ? usualCaption(previousText) : compareCaption(periodSpec.period, previousText, today),
                };
            } else if (usual) {
                // No history yet is not a mistake, only nothing to compare with.
                card.deltaHint = t("compare.noHistory");
            }
        }

        cards.push(card);
    }

    diags.push(...undatedRootDiagnostics(block, undatedCards));
    diags.push(...unmatchedRootDateFormat(rootFormatted, noteDateFormats(ctx.app, rootFormat.format)));

    // Diagnostics before the cards: an error must be seen before a dash is.
    renderDiagnostics(el, "stats", diags);
    renderNotices(el, notices);
    // Every card waiting for its window: the notice says it all, a row of dashes would not.
    if (notStarted === cards.length) return;

    if (layout === "inline") {
        renderInline(el, cards);
        return;
    }

    const grid = el.createDiv({ cls: "dashy-stats" });
    grid.style.setProperty("--dashy-stat-columns", String(Math.max(1, Math.min(6, columns))));

    for (const card of cards) {
        const box = grid.createDiv({ cls: "dashy-stat" });
        if (card.icon) box.createSpan({ cls: "dashy-stat-icon", text: card.icon });

        const isEmpty = card.text === "—";
        const cls = ["dashy-stat-value"];
        if (isEmpty) cls.push("is-empty");
        else {
            const lengthClass = valueLengthClass(card.text);
            if (lengthClass) cls.push(lengthClass);
        }
        const valueEl = box.createDiv({ cls: cls.join(" ") });
        renderGroupedValue(valueEl, card.text);
        if (card.unit && !isEmpty) {
            // A real space for the same reason as in progress: "14 500st" is
            // what a screen reader would otherwise say.
            valueEl.appendText(" ");
            valueEl.createSpan({ cls: "dashy-stat-unit", text: card.unit });
        }

        if (card.delta) {
            const deltaEl = box.createDiv({
                cls: `dashy-stat-delta dashy-stat-delta-${card.delta.tone}`,
                title: card.delta.title,
            });
            // The arrow is decorative; the sign on the number already carries
            // the meaning, so a screen reader loses nothing by skipping it.
            deltaEl.createSpan({ cls: "dashy-stat-delta-arrow", attr: { "aria-hidden": "true" }, text: card.delta.arrow });
            deltaEl.appendText(` ${card.delta.text}`);
        } else if (card.deltaHint) {
            box.createDiv({ cls: "dashy-stat-delta dashy-stat-delta-hint", text: card.deltaHint });
        }

        if (card.trend.length) {
            const spark = box.createDiv({ cls: "dashy-stat-trend" });
            for (const height of card.trend) {
                spark.createSpan({ cls: "dashy-stat-bar" }).style.height = `${height}%`;
            }
        }

        if (card.label) box.createDiv({ cls: "dashy-stat-label", text: card.label });
        if (card.sub) box.createDiv({ cls: "dashy-stat-sub", text: card.sub });
    }
}

/**
 * `layout: inline` (B-150): every card as one item of a single line of text,
 * "1001 notes · 188 journal entries · 14 open tasks", for a home page header.
 * The value stays its own element, drawn apart from the label, and keeps
 * the unit, the icon before it and the `compare` delta after the label.
 * `trend` and `sub` are not drawn; `inlineLayoutDiagnostics` already said so.
 *
 * Each item is `white-space: nowrap`, so a narrow pane wraps between items,
 * never inside "14 open tasks". The separator hangs off the item before it
 * with a no-break space, so a wrapped line never starts with a dot.
 */
function renderInline(el: HTMLElement, cards: readonly Card[]): void {
    const line = el.createDiv({ cls: "dashy-stats-inline" });
    cards.forEach((card, i) => {
        if (i > 0) {
            line.createSpan({ cls: "dashy-stats-inline-sep", attr: { "aria-hidden": "true" }, text: "\u00A0·" });
            line.appendText(" ");
        }
        const item = line.createSpan({ cls: "dashy-stat-inline" });
        if (card.icon) {
            item.createSpan({ cls: "dashy-stat-inline-icon", text: card.icon });
            item.appendText(" ");
        }
        const isEmpty = card.text === "—";
        const valueEl = item.createSpan({ cls: isEmpty ? "dashy-stat-inline-value is-empty" : "dashy-stat-inline-value" });
        // A visible hint would overflow a nowrap item in a narrow pane; here it is a tooltip.
        if (card.deltaHint) valueEl.setAttribute("title", card.deltaHint);
        // Plain text, not renderGroupedValue: its <wbr> stays a break point even
        // under nowrap in Chromium, which would tear "14 500" from its label.
        valueEl.appendText(card.text);
        if (card.unit && !isEmpty) {
            valueEl.appendText(" ");
            valueEl.createSpan({ cls: "dashy-stat-inline-unit", text: card.unit });
        }
        if (card.label) {
            item.appendText(" ");
            item.createSpan({ cls: "dashy-stat-inline-label", text: card.label });
        }
        if (card.delta) {
            item.appendText(" ");
            const deltaEl = item.createSpan({
                cls: `dashy-stat-delta dashy-stat-delta-${card.delta.tone}`,
                title: card.delta.title,
            });
            deltaEl.createSpan({ cls: "dashy-stat-delta-arrow", attr: { "aria-hidden": "true" }, text: card.delta.arrow });
            deltaEl.appendText(` ${card.delta.text}`);
        }
    });
}

/**
 * Draws a formatted number so a browser may only break it between digit
 * groups, never inside one. `overflow-wrap: anywhere` on the card used to let
 * a value a hair too wide split mid-digit ("3 307 95" / "2 steps"), which
 * defeats the whole point of `formatValue` grouping the digits.
 *
 * A `<wbr>` right after each group separator gives the browser that one
 * legal break point, without touching the text: `textContent` comes out
 * identical to `text`, so copy-paste and screen readers still read the plain
 * number. A value with no separator (a dash, or up to four digits) goes
 * through the same loop and simply appends once, with no `<wbr>` at all.
 */
function renderGroupedValue(el: HTMLElement, text: string): void {
    const groups = text.split(GROUP_SEPARATOR);
    groups.forEach((piece, i) => {
        if (i > 0) {
            el.appendText(GROUP_SEPARATOR);
            el.createEl("wbr");
        }
        el.appendText(piece);
    });
}
