/**
 * Extra code block names a block answers to. `chart` is also the language of
 * the Obsidian Charts plugin, and Obsidian refuses a second processor for a
 * language: whoever loads first owns it. `dashy-chart` is always ours.
 */
export const BLOCK_ALIASES: Record<string, readonly string[]> = {
    chart: ["dashy-chart"],
};

/**
 * Registers every block under its name and its aliases. A name another plugin
 * already holds throws in Obsidian; that must cost only that name, never the
 * rest of `onload` (the stylesheet, the commands, the vault watcher).
 * Returns the names that could not be registered.
 */
export function registerBlocks<T>(
    blocks: Record<string, T>,
    register: (name: string, block: T) => void,
): string[] {
    const taken: string[] = [];
    for (const [name, block] of Object.entries(blocks)) {
        for (const alias of [name, ...(BLOCK_ALIASES[name] ?? [])]) {
            try {
                register(alias, block);
            } catch {
                taken.push(alias);
            }
        }
    }
    return taken;
}
