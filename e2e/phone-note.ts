import type { Page } from "@playwright/test";
import type { ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import type { App } from "obsidian";
import { demoToday } from "./demo-day";

/** The note the phone film and the listing pictures are taken from: a week's cards, a heatmap and a chart. */
export const PHONE_NOTE = "Sleep on my phone";
export const PHONE_NOTE_BODY = [
    "```stats", "source: Diary", "columns: 2", "items:",
    "  - { label: Sleep score, field: sleep_score, agg: avg, period: week }",
    "  - { label: Gym this week, field: gym, agg: sum, period: week }",
    "```", "",
    "```heatmap", "source: Diary", "field: sleep_score", "color: green", "title: Sleep score", "range: 120d", "```", "",
    "```chart", "source: Diary", "field: sleep_score", "title: Last two weeks", "range: 14d", "type: line", "```", "",
].join("\n");

/**
 * A day to tap in the demo vault, whose diary ends on the demo day: three weeks back is on screen in a phone-wide
 * heatmap, which opens scrolled to its end, and is a day the generated diary has a note for.
 */
export function tapDay(today = demoToday()): string {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 21);
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** Writes the phone note into the vault once Obsidian has read the rest of it, and opens it in reading view. */
export async function openPhoneNote(obsidian: ObsidianHelpers): Promise<void> {
    await obsidian.waitForMetadataCache();
    await obsidian.evaluate(async (app: App, arg: { name: string; body: string }) => {
        await app.vault.create(`${arg.name}.md`, arg.body);
    }, { name: PHONE_NOTE, body: PHONE_NOTE_BODY });
    await obsidian.openFile(`${PHONE_NOTE}.md`, { mode: "preview" });
}

/** The heatmap cell of a day in the note that is open, the one a finger taps. */
export const dayCell = (win: Page, day: string): ReturnType<Page["locator"]> =>
    win.locator(`.workspace-leaf.mod-active .markdown-reading-view a.dashy-hm-cell[data-href$="${day}.md"]`);
