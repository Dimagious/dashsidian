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

interface IndexingApp {
    app?: {
        metadataCache?: { inProgressTaskCount?: number; trigger?: (name: string) => void };
        vault?: { getFileByPath?: (p: string) => unknown };
        workspace?: {
            getActiveFile?: () => { path: string } | null;
            getLeaf?: (n?: boolean) => { openFile?: (f: unknown, s?: unknown) => Promise<void> };
        };
        plugins?: {
            disablePlugin?: (id: string) => Promise<unknown>;
            enablePlugin?: (id: string) => Promise<unknown>;
        };
    };
}

test("a block drawn mid-index waits, then draws the real numbers", async ({ win }) => {
    const view = win.locator(READING_VIEW);
    const days = view.locator(".dashy-stat-value").first();
    await expect(days).toHaveText("10");

    await win.evaluate(async () => {
        const a = (globalThis as unknown as IndexingApp).app;
        await a?.plugins?.disablePlugin?.("dashsidian");
        if (a?.metadataCache) a.metadataCache.inProgressTaskCount = (a.metadataCache.inProgressTaskCount ?? 0) + 1;
        await a?.plugins?.enablePlugin?.("dashsidian");
        // Whether enabling re-renders the open note is Obsidian's call; a
        // note opened afresh is drawn by the new plugin either way.
        const path = a?.workspace?.getActiveFile?.()?.path ?? "Dashboard.md";
        const preview = { state: { mode: "preview", source: false } };
        await a?.workspace?.getLeaf?.(false)?.openFile?.(a.vault?.getFileByPath?.("Journal.md"), preview);
        await a?.workspace?.getLeaf?.(false)?.openFile?.(a.vault?.getFileByPath?.(path), preview);
    });

    await expect(view.locator(".dashy-notice").filter({ hasText: WAITING }).first()).toBeVisible();
    await expect(view.locator(".dashy-diag-warning"), "no warning drawn from a half-read vault").toHaveCount(0);
    await expect(view.locator(".dashy-stat-value")).toHaveCount(0);

    await win.evaluate(() => {
        const cache = (globalThis as unknown as IndexingApp).app?.metadataCache;
        if (!cache) return;
        cache.inProgressTaskCount = Math.max(0, (cache.inProgressTaskCount ?? 1) - 1);
        // What Obsidian fires when its parse queue empties; the clean-cache
        // callbacks the plugin waits on run from it.
        cache.trigger?.("finished");
    });

    await expect(days).toHaveText("10");
    await expect(view.locator(".dashy-notice").filter({ hasText: WAITING })).toHaveCount(0);
});
