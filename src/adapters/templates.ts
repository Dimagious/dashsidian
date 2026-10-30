import type { App } from "obsidian";
import { isRecord } from "../shared/parse";

/** The private part of App: absent from the public types, but stable for years. */
interface PluginHost {
    plugins?: { plugins?: Record<string, unknown> };
    internalPlugins?: { plugins?: Record<string, unknown> };
}

const TEMPLATER = "templater-obsidian";

/**
 * The folders the vault keeps its templates in (B-190): the core Templates
 * plugin's "Template folder location" and, when Templater is loaded, its
 * "Template folder location". Read as written, unchecked, in the same
 * defensive way as `adapters/periodic.ts`: a plugin missing, a setting
 * unset or of another shape gives no folder, never an error. The core
 * plugin's setting is read whether or not it is switched on, as the daily
 * notes one is: a folder named there still holds templates.
 */
export function templateFolders(app: App): string[] {
    const host = app as unknown as PluginHost;
    const out: string[] = [];

    const core = host.internalPlugins?.plugins?.templates;
    const instance = isRecord(core) ? core.instance : undefined;
    const options = isRecord(instance) ? instance.options : undefined;
    if (isRecord(options) && typeof options.folder === "string") out.push(options.folder);

    const templater = host.plugins?.plugins?.[TEMPLATER];
    const settings = isRecord(templater) ? templater.settings : undefined;
    if (isRecord(settings) && typeof settings.templates_folder === "string") out.push(settings.templates_folder);

    return out;
}
