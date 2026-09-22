import { test as base, _electron, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Launching Obsidian for real.
 *
 * The bundled Obsidian binary cannot be driven: the 2024 Electron fuse change
 * turned off EnableNodeCliInspectArguments, so it rejects the remote debugging
 * port and Playwright waits forever. We run Obsidian's own app.asar through the
 * project-local electron instead, which still has the fuse on.
 */

// The package is ESM, so there is no __dirname to lean on.
const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const APP_ASAR = "/Applications/Obsidian.app/Contents/Resources/app.asar";
/** The capture run points this at a generated demo vault instead. */
const PRISTINE = process.env.DASHY_VAULT
    ? path.resolve(ROOT, process.env.DASHY_VAULT)
    : path.join(ROOT, "e2e-vault.pristine");

/**
 * Obsidian keeps writing while it shuts down — the config, the workspace, its
 * own caches — so a plain remove races it and throws ENOTEMPTY, failing a test
 * whose assertions already passed. Retry instead of guessing how long to wait.
 */
function removeTree(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

interface Fixtures {
    vaultPath: string;
    app: ElectronApplication;
    win: Page;
}

export const test = base.extend<Fixtures>({
    /**
     * A throwaway copy of the committed vault. Obsidian rewrites workspace.json
     * and friends on every run, and the pristine one has to stay pristine.
     * Symlinks are dereferenced so the copy carries the built plugin.
     */
    // eslint-disable-next-line no-empty-pattern
    vaultPath: async ({}, use) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashy-e2e-vault-"));
        const vault = path.join(dir, "vault");
        fs.cpSync(PRISTINE, vault, { recursive: true, dereference: true });
        await use(vault);
        removeTree(dir);
    },

    app: async ({ vaultPath }, use) => {
        // A user-data-dir per test: sharing the real one leaks state between
        // specs and, worse, into the developer's own Obsidian.
        const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashy-e2e-userdata-"));
        fs.writeFileSync(
            path.join(userDataDir, "obsidian.json"),
            JSON.stringify({ vaults: { "dashy-e2e": { path: vaultPath, ts: Date.now(), open: true } } }),
        );

        // ELECTRON_RUN_AS_NODE forces Electron into plain Node and makes it
        // reject every Chromium flag, including the debugging port.
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;

        const app = await _electron.launch({
            args: [APP_ASAR, `--user-data-dir=${userDataDir}`],
            env: env as Record<string, string>,
            // The capture run needs a window of a known size and a video of it.
            ...(process.env.DASHY_VIDEO ? { recordVideo: { dir: process.env.DASHY_VIDEO } } : {}),
        });

        await use(app);

        // Obsidian's shutdown sometimes never resolves; do not hang the suite.
        await Promise.race([
            app.close().catch(() => undefined),
            new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
        ]);
        try {
            const proc = app.process();
            if (!proc.killed) proc.kill("SIGKILL");
        } catch {
            // already gone
        }
        removeTree(userDataDir);
    },

    win: async ({ app }, use) => {
        const win = await app.firstWindow();
        await win.waitForLoadState("domcontentloaded");

        // A dialog blocks every further command on the page, and Electron
        // raises one on shutdown when a note was edited during the test. The
        // failure surfaces as "No dialog is showing" from the teardown, which
        // points nowhere near the test that caused it.
        win.on("dialog", (dialog) => {
            void dialog.dismiss().catch(() => undefined);
        });

        // The trust dialog blocks plugin loading. Do not press its button: it
        // opens Settings afterwards, which is awkward to close from a test.
        try {
            await win
                .getByRole("button", { name: "Trust author and enable plugins" })
                .waitFor({ state: "visible", timeout: 5_000 });
            await win.keyboard.press("Escape");
        } catch {
            // No dialog — the vault was trusted already.
        }

        // Deliberately NOT waiting for the metadata cache here. On a cold
        // start Obsidian lists the files long before it parses their
        // frontmatter, so the first render sees a half-read vault. The plugin
        // must catch up on its own; if it ever stops doing that, these specs
        // go red instead of quietly measuring the wrong thing.
        // Enable plugins through the same API the button uses.
        await win
            .evaluate(async () => {
                const a = (globalThis as unknown as {
                    app?: { plugins?: { setEnable?: (on: boolean) => Promise<void> } };
                }).app;
                await a?.plugins?.setEnable?.(true);
            })
            .catch(() => undefined);

        await win.waitForTimeout(1_500); // onload and the first render are async
        await use(win);
    },
});

export { expect } from "@playwright/test";

/**
 * Opens the settings tab and returns the window it was drawn in.
 *
 * Obsidian 1.13 renders settings in a popout window of its own, so the main
 * window's document holds none of it. Older builds drew it in place, and the
 * search below covers both rather than pinning the suite to one of them.
 */
export async function openSettings(app: ElectronApplication, win: Page): Promise<Page> {
    await win.evaluate(() => {
        const a = (globalThis as unknown as { app?: { setting?: { open?: () => void } } }).app;
        a?.setting?.open?.();
    });
    await win.waitForTimeout(400);
    await win.evaluate(() => {
        const a = (globalThis as unknown as {
            app?: { setting?: { openTabById?: (id: string) => void } };
        }).app;
        a?.setting?.openTabById?.("dashsidian");
    });

    for (let attempt = 0; attempt < 25; attempt += 1) {
        for (const page of app.windows()) {
            const drawn = await page.locator(".modal.mod-settings").count().catch(() => 0);
            if (drawn) return page;
        }
        await win.waitForTimeout(200);
    }
    throw new Error("the settings tab did not appear in any window");
}

export async function closeSettings(win: Page): Promise<void> {
    await win.evaluate(() => {
        const a = (globalThis as unknown as { app?: { setting?: { close?: () => void } } }).app;
        a?.setting?.close?.();
    });
}

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
