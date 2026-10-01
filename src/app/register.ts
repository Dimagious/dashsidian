/**
 * Extra code block names a block answers to. `chart` is also the language of
 * the Obsidian Charts plugin, and Obsidian refuses a second processor for a
 * language: whoever loads first owns it. `dashy-chart` is always ours.
 */
export const BLOCK_ALIASES: Record<string, readonly string[]> = {
    chart: ["dashy-chart"],
};

/**
 * Block names Dashy leaves to another plugin when that plugin is enabled
 * (B-137). Taking `chart` first is not harmless: Obsidian then throws inside
 * Charts' own `onload`, and Charts fails to load at all. Only the plain name
 * yields; the aliases above stay registered.
 */
export const BLOCK_YIELDS: Record<string, string> = {
    chart: "obsidian-charts",
};

export interface Registration {
    /** names another plugin already held when Dashy tried to register them */
    taken: string[];
    /** names Dashy did not try, because the plugin they belong to is enabled */
    yielded: string[];
}

/**
 * Registers every block under its name and its aliases. A name another plugin
 * already holds throws in Obsidian; that must cost only that name, never the
 * rest of `onload` (the stylesheet, the commands, the vault watcher).
 */
export function registerBlocks<T>(
    blocks: Record<string, T>,
    register: (name: string, block: T) => void,
    isEnabled: (pluginId: string) => boolean = () => false,
): Registration {
    const taken: string[] = [];
    const yielded: string[] = [];
    for (const [name, block] of Object.entries(blocks)) {
        const owner = BLOCK_YIELDS[name];
        const yields = owner !== undefined && isEnabled(owner);
        if (yields) yielded.push(name);
        for (const alias of [...(yields ? [] : [name]), ...(BLOCK_ALIASES[name] ?? [])]) {
            try {
                register(alias, block);
            } catch {
                taken.push(alias);
            }
        }
    }
    return { taken, yielded };
}

/**
 * The code block name to write for a block: its own name, or its first alias
 * when the own name was left to another plugin. Used by "Insert block", which
 * would otherwise paste a ```chart that Obsidian Charts then draws.
 */
export function fenceName(name: string, yielded: readonly string[]): string {
    return yielded.includes(name) ? BLOCK_ALIASES[name]?.[0] ?? name : name;
}
