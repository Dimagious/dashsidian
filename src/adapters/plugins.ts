import type { App } from "obsidian";

/** The private part of App: absent from the public types, but stable for years. */
interface PluginHost {
    plugins?: { enabledPlugins?: unknown; manifests?: Record<string, unknown> };
}

/**
 * Whether another community plugin is switched on (B-137).
 *
 * Obsidian fills this set from `community-plugins.json` before it loads any
 * plugin, so it already holds a plugin that will only load after Dashy.
 * Enabled, not merely installed: a disabled plugin claims no code block, and
 * the capture vault keeps Obsidian Charts installed but off until one shot.
 * And installed too: `community-plugins.json` can name a plugin whose folder
 * is gone (a synced config without the plugins), which Obsidian then skips,
 * and yielding a block to it would leave that block to nobody.
 */
export function isPluginEnabled(app: App, id: string): boolean {
    const plugins = (app as unknown as PluginHost).plugins;
    const enabled = plugins?.enabledPlugins;
    const manifests = plugins?.manifests;
    return enabled instanceof Set && enabled.has(id)
        && manifests !== undefined && Object.prototype.hasOwnProperty.call(manifests, id);
}
