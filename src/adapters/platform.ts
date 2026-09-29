import { Platform } from "obsidian";

/**
 * Whether Dashy is running on Obsidian's phone or tablet build (B-092).
 *
 * The heatmap's own tap-to-read, tap-to-open cell interaction only kicks in
 * here: a phone has no hover, so a cell's `title` tooltip would otherwise
 * never be seen at all. Wrapped the same way every other Obsidian-only read
 * is, so a block never imports `obsidian` itself.
 */
export function isMobile(): boolean {
    return Platform.isMobile;
}
