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
const PRISTINE = path.join(ROOT, "e2e-vault.pristine");

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
        fs.rmSync(dir, { recursive: true, force: true });
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
        fs.rmSync(userDataDir, { recursive: true, force: true });
    },

    win: async ({ app }, use) => {
        const win = await app.firstWindow();
        await win.waitForLoadState("domcontentloaded");

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
