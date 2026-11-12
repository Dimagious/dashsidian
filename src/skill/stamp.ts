import { PLUGIN_VERSION_TOKEN } from "./skill-content";

/**
 * The generated skill text names the plugin that wrote it (B-192), but the
 * plugin version is not baked into the generated file: a release bumps it,
 * and a baked-in copy would go stale on every tag. The generated text carries
 * a token instead, and this puts the running plugin's version in its place
 * when the text is written into a vault.
 */
export function stampPluginVersion(text: string, version: string): string {
    return text.split(PLUGIN_VERSION_TOKEN).join(version);
}
