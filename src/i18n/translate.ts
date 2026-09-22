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

/** The plural categories our catalogues carry. */
export const PLURAL_CATEGORIES = ["one", "few", "many", "other"] as const;
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/**
 * Which plural form a count takes in a language.
 *
 * Intl.PluralRules ships with the runtime and knows the CLDR rules, so we do
 * not hand-roll them: English splits 1 from everything else, Russian splits
 * 1/21/31 from 2–4 from the rest, and other languages differ again.
 *
 * A category we do not carry (`zero`, `two`) falls back to `other` rather than
 * failing — a slightly wrong plural beats a missing sentence.
 */
export function pluralCategory(locale: string, count: number): PluralCategory {
    let picked: string;
    try {
        picked = new Intl.PluralRules(locale).select(count);
    } catch {
        picked = "other";
    }
    return (PLURAL_CATEGORIES as readonly string[]).includes(picked)
        ? (picked as PluralCategory)
        : "other";
}
