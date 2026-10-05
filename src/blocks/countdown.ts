import type { BlockContext } from "./context";
import { formatDate } from "../adapters/datetime";
import { readCountdown, daysUntil, countdownTarget, type CountdownSpec } from "../core/countdown";
import { dateKey } from "../core/calendar";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics, internalLink } from "../shared/render";
import { t, tPlural } from "../i18n";
import schema from "./schema.json";

/** Keys come from schema.json — the same source the agent skill is built from. */
const KNOWN_ITEM = Object.keys(schema.blocks.countdown.item);
const KNOWN_ROOT = Object.keys(schema.blocks.countdown.root);

interface Card {
    label: string;
    /** the big line: a day count, or the word for today */
    value: string;
    /** the noun under it, empty on the day itself */
    unit: string;
    /** the date as the language writes it */
    when: string;
    state: "ahead" | "today" | "past" | "broken";
    icon?: string;
    sub?: string;
    /** the anniversary `repeat: yearly` lands on, drawn apart from its noun */
    years?: { count: string; unit: string };
    /** the note a `field` date was read from, for the label to link to */
    note?: string;
}

export function renderCountdown(ctx: BlockContext, source: string, el: HTMLElement): void {
    // The vault is read only for a card with `field:`; a block of written
    // dates draws from the config and today's date alone.

    clearBlock(el);
    const { value, diagnostics } = parseConfig(source, { root: KNOWN_ROOT, item: KNOWN_ITEM, bareItem: true });
    const diags: Diagnostic[] = [...diagnostics];
    const items = asItems(value);

    if (!items.length) {
        // A parse failure already said what was wrong; adding "the list is
        // empty" on top of "the block is empty" is noise, and the two read as
        // two separate problems.
        if (value !== null) diags.push({ level: "error", message: t("countdown.empty") });
        renderDiagnostics(el, "countdown", diags);
        return;
    }
    if (isRecord(value) && Array.isArray(value.items)) diags.push(...unknownKeys(value, KNOWN_ROOT));

    const columns = isRecord(value) && typeof value.columns === "number" ? value.columns : 3;
    const today = dateKey(ctx.today());
    const cards: Card[] = [];

    for (const item of items) {
        diags.push(...unknownKeys(item, KNOWN_ITEM));

        const label = typeof item.label === "string" ? item.label : "";
        const { spec, diagnostics: cardDiags } = readCountdown(item, label, () => ctx.notes());
        diags.push(...cardDiags);

        cards.push(toCard(item, spec, label, today));
    }

    // Diagnostics before the cards: an error must be seen before a dash.
    renderDiagnostics(el, "countdown", diags);

    const grid = el.createDiv({ cls: "dashy-countdown" });
    grid.style.setProperty("--dashy-countdown-columns", String(Math.max(1, Math.min(6, columns))));

    for (const card of cards) {
        const box = grid.createDiv({ cls: `dashy-countdown-card is-${card.state}` });
        if (card.icon) box.createSpan({ cls: "dashy-countdown-icon", text: card.icon });

        box.createDiv({ cls: "dashy-countdown-value", text: card.value });
        if (card.unit) box.createDiv({ cls: "dashy-countdown-unit", text: card.unit });
        if (card.label) {
            const labelEl = box.createDiv({ cls: "dashy-countdown-label" });
            if (card.note) internalLink(labelEl, card.note, "dashy-countdown-link").setText(card.label);
            else labelEl.setText(card.label);
        }
        if (card.when) box.createDiv({ cls: "dashy-countdown-date", text: card.when });
        // The user's own caption first, then the anniversary.
        if (card.sub) box.createDiv({ cls: "dashy-countdown-sub", text: card.sub });
        if (card.years) {
            const years = box.createDiv({ cls: "dashy-countdown-sub dashy-countdown-years" });
            years.createSpan({ cls: "dashy-countdown-years-count", text: card.years.count });
            years.appendText(" ");
            years.createSpan({ cls: "dashy-countdown-years-unit", text: card.years.unit });
        }
    }
}

function toCard(
    item: Record<string, unknown>,
    spec: CountdownSpec | null,
    label: string,
    today: string,
): Card {
    const card: Card = { label, value: "—", unit: "", when: "", state: "broken" };
    if (typeof item.icon === "string") card.icon = item.icon;
    if (typeof item.sub === "string") card.sub = item.sub;
    if (!spec) return card;
    if (spec.note) card.note = spec.note;

    // `repeat: yearly` moves the date to its next occurrence; without it the
    // target is the date as written.
    const target = countdownTarget(spec, today);
    if (target.years >= 1) {
        card.years = { count: String(target.years), unit: tPlural("countdown.years", target.years) };
    }

    // Parsed back from its own parts, never from Date.parse: that reads the key
    // as UTC and lands on the previous day east of it.
    const [y, m, d] = target.date.split("-").map(Number) as [number, number, number];
    card.when = formatDate(new Date(y, m - 1, d), "LL");

    const left = daysUntil(target.date, today);
    if (left === 0) {
        card.state = "today";
        card.value = t("countdown.today");
        return card;
    }

    // A date that has passed keeps counting, upwards: what happened yesterday
    // is still worth seeing on a dashboard.
    const ahead = left > 0;
    card.state = ahead ? "ahead" : "past";
    card.value = String(Math.abs(left));
    card.unit = tPlural(ahead ? "countdown.daysLeft" : "countdown.daysAgo", Math.abs(left));
    return card;
}
