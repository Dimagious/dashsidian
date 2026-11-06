import fs from "node:fs";
import path from "node:path";
import { test, expect } from "./fixtures";

/**
 * The phone film, shot from the running plugin: real Obsidian with its own
 * mobile interface switched on (`app.emulateMobile`) in a phone-sized window.
 * It is not a device, so the top of the frame, where a system status bar would
 * sit, is cropped off. Run on demand: `node scripts/film-phone.cjs`.
 */

const OUT = path.resolve(".capture/frames/phone");
const WIDTH = 390;
const HEIGHT = 780;
const TOP = 44;
const NOTE = "Sleep on my phone";
const BODY = [
    "```stats",
    "source: Diary",
    "columns: 2",
    "items:",
    "  - { label: Sleep score, field: sleep_score, agg: avg, period: week }",
    "  - { label: Gym this week, field: gym, agg: sum, period: week }",
    "```",
    "",
    "```heatmap",
    "source: Diary",
    "field: sleep_score",
    "color: green",
    "title: Sleep score",
    "range: 120d",
    "```",
    "",
    "```chart",
    "source: Diary",
    "field: sleep_score",
    "title: Last two weeks",
    "range: 14d",
    "type: line",
    "```",
    "",
].join("\n");

/** One still and how long it stays, in 15 fps frames. `beat` picks the caption. */
interface Shot { file: string; frames: number; beat: number }

test.skip(!process.env.FILM, "film run only");

test("phone", async ({ win }) => {
    test.setTimeout(180_000);
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });

    // Switching reloads the window, so the call never returns.
    await win.evaluate(() => (globalThis as any).app.emulateMobile(true)).catch(() => undefined);
    await win.waitForLoadState("domcontentloaded");
    await expect.poll(() => win.evaluate(() => {
        const a = (globalThis as any).app;
        return Boolean(a?.workspace?.layoutReady && a?.plugins?.plugins?.dashsidian);
    }).catch(() => false), { timeout: 60_000 }).toBe(true);

    await win.setViewportSize({ width: WIDTH, height: HEIGHT });
    const cdp = await win.context().newCDPSession(win);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false });

    await win.evaluate(async ({ name, body }) => {
        const a = (globalThis as any).app;
        a.changeTheme("moonstone");
        await new Promise((resolve) => {
            const files = a.vault.getMarkdownFiles();
            const poll = () => files.every((f: unknown) => a.metadataCache.getFileCache(f)) ? resolve(null) : setTimeout(poll, 200);
            poll();
        });
        await a.vault.create(`${name}.md`, body);
        await a.workspace.openLinkText(name, "", false, { state: { mode: "preview" } });
    }, { name: NOTE, body: BODY });

    const active = ".workspace-leaf.mod-active .markdown-reading-view";
    const cell = win.locator(`${active} a.dashy-hm-cell[data-href$="2026-10-06.md"]`);
    await expect(cell).toHaveCount(1, { timeout: 60_000 });
    await win.waitForTimeout(2_500);
    await win.evaluate(() => { for (const n of Array.from(document.querySelectorAll(".notice"))) n.remove(); });

    // Once there and back before the first frame: the navigation bar's arrows
    // then read the same on the first frame and the last, and the loop closes.
    await cell.click();
    await cell.click();
    await expect(win.locator(".workspace-leaf.mod-active .inline-title").first()).toContainText("2026-10-06", { timeout: 10_000 });
    await win.locator(".mobile-navbar-actions .mobile-navbar-action").first().click();
    await expect(cell).toHaveCount(1, { timeout: 10_000 });
    await win.waitForTimeout(800);

    const shots: Shot[] = [];
    let n = 0;
    const shoot = async (frames: number, beat: number): Promise<void> => {
        const file = `${String(n++).padStart(3, "0")}.png`;
        await win.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: TOP, width: WIDTH, height: HEIGHT - TOP } });
        shots.push({ file, frames, beat });
    };
    /** A touch mark, since a screenshot shows no finger. Drawn over the page, never part of it. */
    const touch = async (x: number, y: number, size: number, alpha: number): Promise<void> => {
        await win.evaluate(({ x, y, size, alpha }) => {
            let dot = document.getElementById("film-touch");
            if (!dot) {
                dot = document.createElement("div");
                dot.id = "film-touch";
                dot.style.cssText = "position:fixed;z-index:999999;pointer-events:none;border-radius:50%;background:rgba(40,40,50,.28);border:1.5px solid rgba(40,40,50,.35)";
                document.body.appendChild(dot);
            }
            dot.style.left = `${x - size / 2}px`;
            dot.style.top = `${y - size / 2}px`;
            dot.style.width = dot.style.height = `${size}px`;
            dot.style.opacity = String(alpha);
        }, { x, y, size, alpha });
    };
    const tap = async (x: number, y: number, beat: number, act: () => Promise<void>): Promise<void> => {
        await touch(x, y, 44, 0.5); await shoot(1, beat);
        await touch(x, y, 36, 1); await shoot(2, beat);
        await act();
        await win.waitForTimeout(450);
        await touch(x, y, 44, 0.45); await shoot(1, beat + 1);
        await touch(x, y, 0, 0);
    };
    const centre = async (locator: typeof cell): Promise<{ x: number; y: number }> => {
        const box = await locator.boundingBox();
        if (!box) throw new Error("no box to tap");
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    await shoot(20, 0);

    let at = await centre(cell);
    await tap(at.x, at.y, 0, async () => { await win.mouse.click(at.x, at.y); });
    await expect(win.locator(`${active} .dashy-hm-cell.is-selected`)).toHaveCount(1);
    await win.waitForTimeout(150);
    await shoot(32, 1);

    await tap(at.x, at.y, 1, async () => { await win.mouse.click(at.x, at.y); });
    await expect(win.locator(".workspace-leaf.mod-active .view-header-title, .workspace-leaf.mod-active .inline-title").first()).toContainText("2026-10-06", { timeout: 10_000 });
    await win.waitForTimeout(500);
    await shoot(30, 2);

    const back = win.locator(".mobile-navbar-actions .mobile-navbar-action").first();
    at = await centre(back);
    await tap(at.x, at.y, 2, async () => { await back.click(); });
    await expect(win.locator(`${active} a.dashy-hm-cell[data-href$="2026-10-06.md"]`)).toHaveCount(1, { timeout: 10_000 });
    await win.waitForTimeout(500);
    await shoot(10, 0);

    fs.writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(shots, null, 2));
});
