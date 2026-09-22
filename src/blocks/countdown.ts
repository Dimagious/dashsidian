import type { BlockContext } from "./context";
import { formatDate } from "../adapters/datetime";
import { readCountdown, daysUntil } from "../core/countdown";
import { dateKey } from "../core/calendar";
import { parseConfig, asItems, isRecord, unknownKeys, type Diagnostic } from "../shared/parse";
import { clearBlock, renderDiagnostics } from "../shared/render";
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
}

export function renderCountdown(_ctx: BlockContext, source: string, el: HTMLElement): void {
    // No vault data is read here: only the config and today's date.

    clearBlock(el);
    const { value, diagnostics } = parseConfig(source, { root: KNOWN_ROOT, item: KNOWN_ITEM });
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
    const today = dateKey(new Date());
    const cards: Card[] = [];

    for (const item of items) {
        diags.push(...unknownKeys(item, KNOWN_ITEM));

        const label = typeof item.label === "string" ? item.label : "";
        const { spec, diagnostics: cardDiags } = readCountdown(item, label);
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
        if (card.label) box.createDiv({ cls: "dashy-countdown-label", text: card.label });
        if (card.when) box.createDiv({ cls: "dashy-countdown-date", text: card.when });
        if (card.sub) box.createDiv({ cls: "dashy-countdown-sub", text: card.sub });
    }
}

function toCard(
    item: Record<string, unknown>,
    spec: { date: string } | null,
    label: string,
    today: string,
): Card {
    const card: Card = { label, value: "—", unit: "", when: "", state: "broken" };
    if (typeof item.icon === "string") card.icon = item.icon;
    if (typeof item.sub === "string") card.sub = item.sub;
    if (!spec) return card;

    // Parsed back from its own parts, never from Date.parse: that reads the key
    // as UTC and lands on the previous day east of it.
    const [y, m, d] = spec.date.split("-").map(Number) as [number, number, number];
    card.when = formatDate(new Date(y, m - 1, d), "LL");

    const left = daysUntil(spec.date, today);
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
