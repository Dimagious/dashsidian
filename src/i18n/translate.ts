/**
 * Translation primitives. Pure layer: no Obsidian, no DOM, no module state.
 *
 * Messages are plain strings with `{placeholder}` slots rather than functions,
 * so adding a language means copying `en.ts` and translating the values —
 * no TypeScript knowledge required from a translator.
 */

/** Replaces every `{name}` with `params.name`. Unknown slots are left as-is. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const value = params[name];
        return value === undefined ? whole : String(value);
    });
}

/**
 * Picks the catalog to use.
 *
 * Obsidian reports locales like `ru`, `pt-br`, `zh-cn`. We match the full code
 * first, then the language part, and fall back to English — a half-matched
 * language beats no translation at all.
 */
export function resolveLocale(
    code: string | null | undefined,
    available: readonly string[],
    fallback: string,
): string {
    const wanted = (code ?? "").trim().toLowerCase();
    if (!wanted) return fallback;
    if (available.includes(wanted)) return wanted;
    const language = wanted.split(/[-_]/)[0] ?? "";
    if (language && available.includes(language)) return language;
    return fallback;
}
