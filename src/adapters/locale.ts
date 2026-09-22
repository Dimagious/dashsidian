import { currentLocale } from "./datetime";
import { setLocale } from "../i18n";

/**
 * Teaches the i18n layer which language Obsidian speaks.
 *
 * Called once on load: Obsidian needs a restart to change its own language,
 * so there is nothing to react to at runtime. Detection lives here rather than
 * in src/i18n/ so that the pure layer stays free of Obsidian.
 */
export function applyObsidianLocale(): string {
    return setLocale(currentLocale());
}
