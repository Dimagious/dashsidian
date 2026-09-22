import { test, expect, styleOf, READING_VIEW } from "./fixtures";

/** Scoped to the reading view: the Live Preview copy of the note is in the DOM too. */
const view = (win: Parameters<typeof styleOf>[0]) => win.locator(READING_VIEW);

/**
 * The vault holds ten diary notes, sleep_score 70..79 and steps 1000..1900,
 * so every number below is one you can check on paper.
 */

test.describe("blocks render in a real Obsidian", () => {
    test("every block draws, and nothing renders as raw markdown", async ({ win }) => {
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

    test("tiles count the notes that are actually there", async ({ win }) => {
        await expect(view(win).locator(".dashy-tile")).toHaveCount(2);
        await expect(view(win).locator(".dashy-tile-badge").first()).toHaveText("10");
    });

    test("stats compute over the vault, grouped for reading", async ({ win }) => {
        const values = view(win).locator(".dashy-stat-value");
        await expect(values.nth(0)).toHaveText("10");
        await expect(values.nth(1)).toHaveText("74.5");
        // 14500 split by a narrow no-break space
        await expect(values.nth(2)).toHaveText("14 500");
    });

    test("a progress bar is as wide as its percent says", async ({ win }) => {
        await expect(view(win).locator(".dashy-progress-percent")).toHaveText("25%");
        const width = await view(win).locator(".dashy-progress-fill").first()
            .evaluate((el) => (el as HTMLElement).style.width);
        expect(width).toBe("25%");
    });

    test("countdown counts both ways and names the plural form", async ({ win }) => {
        const units = view(win).locator(".dashy-countdown-unit");
        await expect(units.nth(0)).toHaveText(/days left/);
        await expect(units.nth(1)).toHaveText(/days ago/);
    });

    test("today links to a note that does not exist yet, and says so", async ({ win }) => {
        const chip = view(win).locator(".dashy-today-chip").first();
        await expect(chip).toHaveClass(/is-missing/);
        await expect(chip).toHaveAttribute("title", /does not exist yet/);
    });

    test("the heatmap colours exactly the days that have data", async ({ win }) => {
        const coloured = await view(win).locator(".dashy-hm-cell").evaluateAll(
            (cells) => cells.filter((c) => (c as HTMLElement).style.backgroundColor !== "").length,
        );
        expect(coloured).toBe(10);
        await expect(view(win).locator(".dashy-hm-leg")).toHaveCount(3);
    });

    test("a cell links to the note of its day", async ({ win }) => {
        const cell = view(win).locator("a.dashy-hm-cell").first();
        await expect(cell).toHaveAttribute("data-href", "Diary/2026-01-01.md");
    });
});

test.describe("a broken config is reported, not swallowed", () => {
    test("errors and warnings reach the note", async ({ win }) => {
        await expect(view(win).locator(".dashy-diag-error")).toHaveCount(3);
        await expect(view(win).locator(".dashy-diag-warning"))
            .toHaveText(/Unknown key "feild". Did you mean "field"\?/);
    });

    test("a broken row is marked broken rather than left looking like zero", async ({ win }) => {
        await expect(view(win).locator(".dashy-progress-row.is-broken")).toHaveCount(1);
        await expect(view(win).locator(".dashy-countdown-card.is-broken")).toHaveCount(1);
    });

    test("one broken block does not take the working ones down", async ({ win }) => {
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
test.describe("the stylesheet is really applied", () => {
    test("grids are grids", async ({ win }) => {
        expect(await styleOf(win, ".dashy-tiles", "display")).toBe("grid");
        expect(await styleOf(win, ".dashy-stats", "display")).toBe("grid");
        expect(await styleOf(win, ".dashy-countdown", "display")).toBe("grid");
    });

    test("the progress track has a height to fill", async ({ win }) => {
        const height = await styleOf(win, ".dashy-progress-track", "height");
        expect(Number.parseFloat(height)).toBeGreaterThan(0);
    });

    test("heatmap cells have a size", async ({ win }) => {
        const width = await styleOf(win, ".dashy-hm-cell", "width");
        expect(Number.parseFloat(width)).toBeGreaterThan(0);
    });

    test("the plugin's own tokens resolved against the theme", async ({ win }) => {
        // Declared on body, not :root — in :root the Obsidian variables do not
        // exist yet and every colour silently collapses to transparent.
        const surface = await win.evaluate(() =>
            getComputedStyle(document.body).getPropertyValue("--dashy-surface").trim());
        expect(surface).not.toBe("");
        const card = await styleOf(win, ".dashy-stat", "background-image");
        expect(card).toContain("gradient");
    });
});
