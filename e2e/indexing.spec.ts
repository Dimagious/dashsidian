import type { App } from "obsidian";
import { test, expect, READING_VIEW } from "./fixtures";

/**
 * B-179: a block drawn while Obsidian is still parsing the vault counted
 * notes with empty frontmatter and warned "no note in the selection has ..."
 * for a field every note has. It now waits on a quiet line instead.
 *
 * A real cold index is over in well under a second on the test vault, too
 * fast to catch. So the spec holds the metadata cache's private queue
 * counter up by hand, reloads the plugin and reopens the note so its blocks
 * are drawn fresh against it, then lets the queue drain the way Obsidian
 * does at the end of indexing.
 */

const WAITING = "Obsidian is still indexing the vault. The block will appear when it is done.";

/** The private parts of Obsidian this spec holds by hand: the metadata cache's queue counter and its event. */
type IndexingApp = App & {
    metadataCache: { inProgressTaskCount: number; trigger(name: string): void };
    plugins: { disablePlugin(id: string): Promise<unknown>; enablePlugin(id: string): Promise<unknown> };
};

test("a block drawn mid-index waits, then draws the real numbers", async ({ win, obsidian }) => {
    const view = win.locator(READING_VIEW);
    const days = view.locator(".dashy-stat-value").first();
    await expect(days).toHaveText("10");

    await obsidian.evaluate(async (app: IndexingApp) => {
        await app.plugins.disablePlugin("dashsidian");
        app.metadataCache.inProgressTaskCount += 1;
        await app.plugins.enablePlugin("dashsidian");
        // Whether enabling re-renders the open note is Obsidian's call; a
        // note opened afresh is drawn by the new plugin either way.
        const path = app.workspace.getActiveFile()?.path ?? "Dashboard.md";
        const preview = { state: { mode: "preview", source: false } };
        const journal = app.vault.getFileByPath("Journal.md");
        const back = app.vault.getFileByPath(path);
        if (!journal || !back) throw new Error("the notes to reopen are missing");
        await app.workspace.getLeaf(false).openFile(journal, preview);
        await app.workspace.getLeaf(false).openFile(back, preview);
    });

    await expect(view.locator(".dashy-notice").filter({ hasText: WAITING }).first()).toBeVisible();
    await expect(view.locator(".dashy-diag-warning"), "no warning drawn from a half-read vault").toHaveCount(0);
    await expect(view.locator(".dashy-stat-value")).toHaveCount(0);

    await obsidian.evaluate((app: IndexingApp) => {
        app.metadataCache.inProgressTaskCount = Math.max(0, app.metadataCache.inProgressTaskCount - 1);
        // What Obsidian fires when its parse queue empties; the clean-cache
        // callbacks the plugin waits on run from it.
        app.metadataCache.trigger("finished");
    });

    await expect(days).toHaveText("10");
    await expect(view.locator(".dashy-notice").filter({ hasText: WAITING })).toHaveCount(0);
});
