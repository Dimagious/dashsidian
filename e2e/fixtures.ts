import { createObsidianTest, type ObsidianHelpers } from "obsidian-plugin-dev-kit/e2e";
import type { Locator, Page } from "@playwright/test";
import type { App } from "obsidian";

/**
 * The kit launches Obsidian's own app.asar through the project-local electron (the bundled binary rejects the
 * debugging port since the 2024 fuse change), copies this vault for every test, installs the built plugin into the
 * copy, trusts it and waits for it to load. `OPDK_E2E_VAULT` replaces the vault for a run (see `npm run firstrun`).
 *
 * The first render of a block is not waited for here: on a cold start Obsidian lists the files long before it parses
 * their frontmatter, so the first render sees a half-read vault. The plugin must catch up on its own; if it ever stops
 * doing that, these specs go red instead of quietly measuring the wrong thing.
 */
export const { test, expect, onlyWhen } = createObsidianTest({
    seedVault: "e2e-vault.pristine",
});

/** The part of the plugin object the specs read. */
export interface DashyPlugin {
    settings: { dailyFolder: string; startDayHour: number };
}

/** `app` as the specs see it: Obsidian's own type plus the plugin registry, which the public typings leave out. */
export type DashyApp = App & {
    plugins: { plugins: Record<string, unknown> & { dashsidian?: DashyPlugin } };
};

/** What Dashy keeps in its settings, read from the running plugin. */
export const pluginSettings = (obsidian: ObsidianHelpers): Promise<DashyPlugin["settings"] | null> =>
    obsidian.evaluate((app: DashyApp) => app.plugins.plugins.dashsidian?.settings ?? null);

/**
 * The reading view of the open note.
 *
 * Obsidian keeps both renderings of a note in the DOM at once — the Live
 * Preview editor and the reading view — so a block runs twice and both copies
 * are present. The editor copy is hidden, which also makes it useless to assert
 * visibility against. Every assertion scopes to one view.
 */
export const READING_VIEW = ".markdown-reading-view";

/** The computed value of a CSS property — what jsdom can never tell us. */
export async function styleOf(win: Page, selector: string, property: string): Promise<string> {
    return win.evaluate(
        ([sel, prop]) => {
            const el = document.querySelector(sel as string);
            return el ? getComputedStyle(el).getPropertyValue(prop as string) : "";
        },
        [`${READING_VIEW} ${selector}`, property],
    );
}

/** How many heatmap cells under `scope` carry a colour right now; an unpainted cell has no inline background. */
export const paintedCells = (scope: Locator): Promise<number> =>
    scope.locator(".dashy-hm-cell").evaluateAll(
        (cells) => cells.filter((c) => (c as HTMLElement).style.backgroundColor !== "").length,
    );

/**
 * Waits for the painted-cell count to reach `expected`. Always a poll: the heatmap redraws on its own pass, so a
 * single read right after a stat changed can see the old grid.
 */
export const expectPainted = (scope: Locator, expected: number, options?: { timeout?: number }): Promise<void> =>
    expect.poll(() => paintedCells(scope), options).toBe(expected);
