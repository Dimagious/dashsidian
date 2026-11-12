import { test, expect, styleOf, expectPainted, READING_VIEW } from "./fixtures";

/** Scoped to the reading view: the Live Preview copy of the note is in the DOM too. */
const view = (win: Parameters<typeof styleOf>[0]) => win.locator(READING_VIEW);

/**
 * The vault holds ten diary notes, sleep_score 70..79 and steps 1000..1900,
 * so every number below is one you can check on paper.
 *
 * Every test here only reads the same open note, and a launch of Obsidian costs about 2.5 s, so the checks are
 * `test.step`s of three tests, one per group, not one test each. A failing step is named in the report, but it stops
 * the steps after it in its group.
 */

test("blocks render in a real Obsidian", async ({ win }) => {
    await test.step("every block draws, and nothing renders as raw markdown", async () => {
        for (const selector of [
            ".dashy-tiles",
            ".dashy-stats",
            ".dashy-progress",
            ".dashy-today",
            ".dashy-countdown",
            ".dashy-hm-grid",
        ]) {
            await expect(view(win).locator(selector)).toBeVisible();
        }
    });

    await test.step("tiles count the notes that are actually there", async () => {
        await expect(view(win).locator(".dashy-tile")).toHaveCount(2);
        await expect(view(win).locator(".dashy-tile-badge").first()).toHaveText("10");
    });

    await test.step("stats compute over the vault, grouped for reading", async () => {
        const values = view(win).locator(".dashy-stat-value");
        await expect(values.nth(0)).toHaveText("10");
        await expect(values.nth(1)).toHaveText("74.5");
        // 14500 split by a narrow no-break space
        await expect(values.nth(2)).toHaveText("14 500");
    });

    await test.step("a trend over a diary that stopped months ago draws nothing", async () => {
        // The window is days ending today, not the last N notes. This vault's
        // diary is ten days in January, so a 30-day trend is empty — and the
        // average beside it still reads 74.5.
        await expect(view(win).locator(".dashy-stat-bar")).toHaveCount(0);
        await expect(view(win).locator(".dashy-stat-value").nth(1)).toHaveText("74.5");
    });

    await test.step("a progress bar is as wide as its percent says", async () => {
        await expect(view(win).locator(".dashy-progress-percent")).toHaveText("25%");
        const width = await view(win).locator(".dashy-progress-fill").first()
            .evaluate((el) => (el as HTMLElement).style.width);
        expect(width).toBe("25%");
    });

    await test.step("countdown counts both ways and names the plural form", async () => {
        const units = view(win).locator(".dashy-countdown-unit");
        await expect(units.nth(0)).toHaveText(/days left/);
        await expect(units.nth(1)).toHaveText(/days ago/);
    });

    await test.step("today links to a note that does not exist yet, and says so", async () => {
        const chip = view(win).locator(".dashy-today-chip").first();
        await expect(chip).toHaveClass(/is-missing/);
        await expect(chip).toHaveAttribute("title", /does not exist yet/);
    });

    await test.step("the heatmap colours exactly the days that have data", async () => {
        await expect(view(win).locator(".dashy-hm-cell").first()).toBeVisible();
        await expectPainted(view(win), 10);
        await expect(view(win).locator(".dashy-hm-leg")).toHaveCount(3);
    });

    await test.step("a cell links to the note of its day", async () => {
        const cell = view(win).locator("a.dashy-hm-cell").first();
        await expect(cell).toHaveAttribute("data-href", "Diary/2026-01-01.md");
    });
});

test("a broken config is reported, not swallowed", async ({ win }) => {
    await test.step("errors and warnings reach the note", async () => {
        await expect(view(win).locator(".dashy-diag-error")).toHaveCount(3);
        await expect(view(win).locator(".dashy-diag-warning"))
            .toHaveText(/Unknown key "feild". Did you mean "field"\?/);
    });

    await test.step("a broken row is marked broken rather than left looking like zero", async () => {
        await expect(view(win).locator(".dashy-progress-row.is-broken")).toHaveCount(1);
        await expect(view(win).locator(".dashy-countdown-card.is-broken")).toHaveCount(1);
    });

    await test.step("one broken block does not take the working ones down", async () => {
        // The second heatmap has no field at all; the first still drew its grid.
        await expect(view(win).locator(".dashy-hm-grid")).toHaveCount(1);
        await expect(view(win).locator(".dashy-stat")).toHaveCount(3);
    });
});

/**
 * These are the assertions jsdom cannot make. A stale stylesheet shipped two
 * blocks as unstyled stacked text while every unit test stayed green, and only
 * a real browser engine can tell us the rules actually applied.
 */
test("the stylesheet is really applied", async ({ win }) => {
    // The plugin has loaded when the test starts, its first render may not have: each lookup
    // below waits for the block to be there (an empty value is "not drawn yet", never a pass).
    await test.step("grids are grids", async () => {
        for (const selector of [".dashy-tiles", ".dashy-stats", ".dashy-countdown"]) {
            await expect.poll(() => styleOf(win, selector, "display"), { message: selector }).toBe("grid");
        }
    });

    await test.step("the progress track has a height to fill", async () => {
        await expect.poll(async () => Number.parseFloat(await styleOf(win, ".dashy-progress-track", "height"))).toBeGreaterThan(0);
    });

    await test.step("heatmap cells have a size", async () => {
        await expect.poll(async () => Number.parseFloat(await styleOf(win, ".dashy-hm-cell", "width"))).toBeGreaterThan(0);
    });

    await test.step("the plugin's own tokens resolved against the theme", async () => {
        // Declared on body, not :root — in :root the Obsidian variables do not
        // exist yet and every colour silently collapses to transparent.
        const surface = await win.evaluate(() =>
            getComputedStyle(document.body).getPropertyValue("--dashy-surface").trim());
        expect(surface).not.toBe("");
        await expect.poll(() => styleOf(win, ".dashy-stat", "background-image")).toContain("gradient");
    });
});
