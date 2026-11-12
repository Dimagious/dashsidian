import { test, expect, onlyWhen } from "./demo-fixtures";
import { dayCell, openPhoneNote, tapDay } from "./phone-note";

/**
 * The phone film, shot from the running plugin: real Obsidian with its own
 * mobile interface switched on (`obsidian.mobile()`) in a phone-sized window.
 * It is not a device, so the top of the frame, where a system status bar would
 * sit, is cropped off. `opdk demo` puts the frames beside two captions and
 * makes the MP4, the GIF and the poster. Light and dark are two films.
 * Run on demand: `npm run film:phone`.
 */

const WIDTH = 390;
const HEIGHT = 780;
const TOP = 44;
const BACK = ".mobile-navbar-actions .mobile-navbar-action";

onlyWhen("FILM");
test.setTimeout(180_000);

for (const [name, mode] of [["film-phone", "light"], ["film-phone-dark", "dark"]] as const) {
    test(`phone, ${mode}`, async ({ win, obsidian, demo }) => {
        await obsidian.mobile({ width: WIDTH, height: HEIGHT });
        await obsidian.setTheme({ mode });
        await openPhoneNote(obsidian);

        const day = tapDay();
        const cell = dayCell(win, day);
        await expect(cell).toHaveCount(1, { timeout: 60_000 });
        await obsidian.settle();
        await obsidian.clearNotices();

        // Once there and back before the first frame: the navigation bar's arrows
        // then read the same on the first frame and the last, and the loop closes.
        await cell.click();
        await cell.click();
        await expect(win.locator(".workspace-leaf.mod-active .inline-title").first()).toContainText(day, { timeout: 10_000 });
        await win.locator(BACK).first().click();
        await expect(cell).toHaveCount(1, { timeout: 10_000 });
        await obsidian.settle();

        const film = demo.film({
            name,
            kind: "phone",
            captions: ["Tap a day\nSee its value", "Tap again\nOpen its note"],
            clip: { x: 0, y: TOP, width: WIDTH, height: HEIGHT - TOP },
        });
        await film.shot({ hold: 1.3, settle: true });

        await demo.tap(cell, { whilePressed: () => film.shot({ hold: 0.15 }) });
        await expect(win.locator(".workspace-leaf.mod-active .markdown-reading-view .dashy-hm-cell.is-selected")).toHaveCount(1);
        await film.shot({ hold: 2.1, caption: 0, settle: true });

        await demo.tap(cell, { whilePressed: () => film.shot({ hold: 0.15, caption: 0 }) });
        await expect(win.locator(".workspace-leaf.mod-active .view-header-title, .workspace-leaf.mod-active .inline-title").first())
            .toContainText(day, { timeout: 10_000 });
        await film.shot({ hold: 2, caption: 1, settle: true });

        await demo.tap(win.locator(BACK).first(), { whilePressed: () => film.shot({ hold: 0.15, caption: 1 }) });
        await expect(cell).toHaveCount(1, { timeout: 10_000 });
        await film.shot({ hold: 0.7, settle: true });
    });
}
