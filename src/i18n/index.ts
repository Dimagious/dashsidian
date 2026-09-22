/**
 * Everything the user reads goes through `t()`.
 *
 * The locale is set once, when the plugin loads — Obsidian needs a restart to
 * change its own language anyway, so there is nothing to react to at runtime.
 * Detection itself lives in `adapters/locale.ts`: this module stays pure so
 * `core/` can call it without dragging Obsidian into the tested layer.
 */

import { en, type Catalog, type MessageKey } from "./en";
import { ru } from "./ru";
import { interpolate, resolveLocale } from "./translate";

export type { MessageKey } from "./en";

/** Add a language here and it becomes selectable. Nothing else to touch. */
export const CATALOGS: Record<string, Catalog> = { en, ru };

export const FALLBACK_LOCALE = "en";

export const AVAILABLE_LOCALES = Object.keys(CATALOGS);

let current: string = FALLBACK_LOCALE;

/** Accepts anything Obsidian reports — `ru`, `pt-br`, `` — and never throws. */
export function setLocale(code: string | null | undefined): string {
    current = resolveLocale(code, AVAILABLE_LOCALES, FALLBACK_LOCALE);
    return current;
}

export function getLocale(): string {
    return current;
}

/**
 * A missing key falls back to English rather than showing the key itself:
 * a half-translated plugin should read as English, not as debug output.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
    const message = CATALOGS[current]?.[key] ?? en[key];
    return interpolate(message, params);
}
