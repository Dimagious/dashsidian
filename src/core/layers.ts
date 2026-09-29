/**
 * Several fields on one heatmap grid, each painted in its own colour
 * (B-096): a gym/run tracker wants both on the same year, not two separate
 * grids. `layers:` replaces the block's own `field`, one entry per activity.
 *
 * Reading a layer list reuses `readFields` (day-values.ts) for each entry's
 * own `field` — same shapes, same dotted paths, same diagnostics, just named
 * after the entry's position instead of the block root. Combining what the
 * layers painted on a given day is a second, separate job: `dayValues` still
 * collapses one layer's own fields into one mark per day (day-values.ts is
 * unaware layers exist at all), and `combineLayers` below folds those marks
 * together, one per layer, into the single mark a cell actually paints.
 *
 * Pure module: no Obsidian, no DOM.
 */

import type { DayMark, DayNote } from "./day-values";
import { readFields } from "./day-values";
import { assignLayerColors, toRgb, type Rgb } from "./palette";
import { isRecord, describeValue, unknownKeys, type Diagnostic } from "../shared/parse";
import { t } from "../i18n";

export interface Layer {
    /** this layer's own `field`, already resolved the same way the block's `field` is */
    fields: string[];
    /** `fields` joined with ", " — the layer's label when none was written */
    fieldLabel: string;
    /** shown in the legend and the tooltip: the written `label`, or `fieldLabel` */
    label: string;
    color: Rgb;
}

export interface ReadLayersOutcome {
    /** null when `layers` is absent, or was written but unusable — the caller renders nothing else */
    layers: Layer[] | null;
    diagnostics: Diagnostic[];
}

/**
 * Reads `layers` off a heatmap config. Absent is silent (`layers: null`,
 * empty diagnostics) — the caller decides whether that is fine (plain
 * `field` heatmap) or an error (`layers` required some other way).
 *
 * Every entry is checked in turn rather than stopping at the first bad one:
 * an agent that got layer 3 wrong should not be told to guess what is wrong
 * with layer 1 as well once it fixes that. Colours are only assigned once
 * every entry parsed cleanly — `assignLayerColors` needs the whole list's
 * explicit colours up front to skip them correctly, and there is nothing
 * useful to colour when the list itself is broken.
 */
export function readLayers(
    value: Record<string, unknown>,
    itemKeys: readonly string[],
): ReadLayersOutcome {
    const raw = value.layers;
    if (raw === undefined) return { layers: null, diagnostics: [] };

    if (!Array.isArray(raw)) {
        return {
            layers: null,
            diagnostics: [{ level: "error", message: t("heatmap.layersInvalid", { value: describeValue(raw) }) }],
        };
    }
    if (raw.length === 0) {
        return { layers: null, diagnostics: [{ level: "error", message: t("heatmap.layersEmpty") }] };
    }

    const diagnostics: Diagnostic[] = [];
    interface Parsed {
        fields: string[];
        fieldLabel: string;
        label: string | undefined;
        color: Rgb | undefined;
    }
    const parsed: Parsed[] = [];
    let ok = true;

    raw.forEach((entry: unknown, i: number) => {
        const position = i + 1;
        if (!isRecord(entry)) {
            diagnostics.push({
                level: "error",
                message: t("heatmap.layerNotMap", { position, value: describeValue(entry) }),
            });
            ok = false;
            return;
        }
        diagnostics.push(...unknownKeys(entry, itemKeys));

        const { fields, diagnostics: fieldDiags } = readFields(entry);
        if (!fields) {
            const message = fieldDiags[0]?.message ?? t("heatmap.fieldRequired");
            diagnostics.push({ level: "error", message: t("heatmap.layerAt", { position, message }) });
            ok = false;
            return;
        }

        const fieldLabel = fields.join(", ");
        const rawLabel = entry.label;
        let label: string | undefined;
        if (typeof rawLabel === "string" && rawLabel.trim() !== "") {
            label = rawLabel;
        } else if (rawLabel !== undefined && typeof rawLabel !== "string") {
            // A blank string falls back the same way an absent `label` does,
            // silently — nothing was actually written wrong. A number, a
            // list or a map is a different mistake (the wrong shape
            // entirely, not an empty one) and is worth naming, the same way
            // an invalid `field` or `color` would be, rather than quietly
            // discarding whatever was there.
            diagnostics.push({
                level: "warning",
                message: t("heatmap.layerLabelInvalid", { position, value: describeValue(rawLabel) }),
            });
        }
        const color = entry.color !== undefined ? toRgb(entry.color) : undefined;
        parsed.push({ fields, fieldLabel, label, color });
    });

    if (!ok) return { layers: null, diagnostics };

    const colors = assignLayerColors(parsed.map((p) => p.color));
    const layers: Layer[] = parsed.map((p, i) => ({
        fields: p.fields,
        fieldLabel: p.fieldLabel,
        label: p.label ?? p.fieldLabel,
        color: colors[i] as Rgb,
    }));
    return { layers, diagnostics };
}

/** One day's combined reading across every layer — what a heatmap cell actually paints. */
export interface LayeredMark {
    /** the winning layer's value; meaningless (0) when nothing painted */
    value: number;
    /** the winning layer's note path; "" when nothing painted */
    path: string;
    painted: boolean;
    /** index into the `layers` list of the layer that coloured this day, only when `painted` */
    layer: number;
    /** every layer with a mark this day, in list order — the tooltip lists all of them */
    parts: readonly { label: string; value: number }[];
    /**
     * Every distinct note that contributed to ANY layer this day (B-092): the
     * union across layers, by path, not just the winning layer's own list —
     * one note logging both `gym` and `run` in a single entry still counts
     * once, the same way `dayValues` itself already dedupes a note
     * contributing through two fields.
     */
    notes: readonly DayNote[];
}

/**
 * Folds one `DayMark` map per layer (already collapsed per day by
 * `dayValues`, one call per layer, sharing `per_day`) into a single mark per
 * day: the FIRST layer in list order that is painted that day colours the
 * cell and supplies its value and link, exactly the way `dayValues` itself
 * already picks the first-by-path note among several contributing to one
 * day. A day where every contributing layer is false-only still gets an
 * entry (`painted: false`) rather than none, the same "field exists, just
 * not painted" reading `dayValues` gives a single false mark.
 *
 * `parts` carries every layer that has ANY mark that day (painted or not),
 * in list order, for the tooltip — a false-only layer still says so there,
 * the same way its own cell would if it were the only one.
 */
export function combineLayers(
    perLayerMarks: readonly ReadonlyMap<string, DayMark>[],
    labels: readonly string[],
): Map<string, LayeredMark> {
    const days = new Set<string>();
    for (const marks of perLayerMarks) for (const day of marks.keys()) days.add(day);

    const combined = new Map<string, LayeredMark>();
    for (const day of days) {
        const parts: { label: string; value: number }[] = [];
        const notes = new Map<string, DayNote>();
        let winner = -1;
        for (let i = 0; i < perLayerMarks.length; i++) {
            const mark = perLayerMarks[i]?.get(day);
            if (!mark) continue;
            parts.push({ label: labels[i] ?? "", value: mark.value });
            for (const note of mark.notes) notes.set(note.path, note);
            if (winner === -1 && mark.painted) winner = i;
        }
        const winning = winner === -1 ? undefined : perLayerMarks[winner]?.get(day);
        combined.set(day, {
            value: winning?.value ?? 0,
            path: winning?.path ?? "",
            painted: winner !== -1,
            layer: winner,
            parts,
            notes: Array.from(notes.values()),
        });
    }
    return combined;
}
