/** Named block colours. Everything else in the plugin comes from the theme. */
export type Rgb = readonly [number, number, number];

export const PALETTE: Record<string, Rgb> = {
    blue: [59, 130, 246],
    green: [34, 197, 94],
    cyan: [6, 182, 212],
    purple: [139, 92, 246],
    pink: [236, 72, 153],
    orange: [245, 158, 11],
    red: [239, 68, 68],
    gray: [156, 163, 175],
};

export const DEFAULT_COLOR: Rgb = PALETTE.blue as Rgb;

/** `purple` | `#8b6cef` | `[139, 92, 246]` → rgb. Anything unclear is the default. */
export function toRgb(value: unknown): Rgb {
    if (Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number")) {
        return value as unknown as Rgb;
    }
    if (typeof value === "string") {
        const named = PALETTE[value.trim().toLowerCase()];
        if (named) return named;
        const hex = /^#?([0-9a-f]{6})$/i.exec(value.trim());
        if (hex?.[1]) {
            const n = parseInt(hex[1], 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
    }
    return DEFAULT_COLOR;
}

export function rgba(c: Rgb, alpha: number): string {
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

/**
 * Assigns a colour to every entry of `explicit`, in order: an entry that
 * already names one keeps it; an entry that does not gets the next colour
 * from `PALETTE`, in the order it is declared above, skipping any colour some
 * other entry (explicit or already assigned here) is using.
 *
 * `PALETTE`'s own key order stands in for "the fixed order" (a plain
 * `Record` with string keys, so insertion order is exactly declaration
 * order): entries are taken from it one at a time and never revisited once
 * assigned, so two layers left without a `color` never collide with each
 * other. Running out of colours (more layers than the palette holds) falls
 * back to `DEFAULT_COLOR` rather than throwing — a repeated colour is a far
 * smaller problem than a heatmap that fails to render.
 */
export function assignLayerColors(explicit: readonly (Rgb | undefined)[]): Rgb[] {
    const order = Object.values(PALETTE);
    const key = (c: Rgb): string => c.join(",");
    const taken = new Set(explicit.filter((c): c is Rgb => c !== undefined).map(key));

    let cursor = 0;
    return explicit.map((c) => {
        if (c) return c;
        while (cursor < order.length && taken.has(key(order[cursor] as Rgb))) cursor++;
        const next = order[cursor] ?? DEFAULT_COLOR;
        taken.add(key(next));
        cursor++;
        return next;
    });
}
