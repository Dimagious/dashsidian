import { currentLocale, setDateLocale } from "./datetime";
import { setLocale } from "../i18n";

/**
 * Teaches the i18n layer which language Obsidian speaks.
 *
 * Called once on load: Obsidian needs a restart to change its own language,
 * so there is nothing to react to at runtime. Detection lives here rather than
 * in src/i18n/ so that the pure layer stays free of Obsidian.
 */
export function applyObsidianLocale(): string {
    return applyLocale("");
}

/**
 * Applies the language the user chose, falling back to Obsidian's own.
 *
 * Both halves are set here: the message catalog and moment, which owns month
 * and weekday names. Splitting them is how a dashboard ends up bilingual.
 * An empty preference means "follow Obsidian", which is the default and what
 * almost everyone wants.
 */
export function applyLocale(preferred: string): string {
    const chosen = setLocale(preferred || currentLocale());
    setDateLocale(preferred ? chosen : null);
    return chosen;
}
