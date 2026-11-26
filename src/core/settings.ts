/**
 * Turning whatever `loadData()` handed back into a complete, valid
 * `DashySettings`. Pure module: no Obsidian.
 */

import { DEFAULT_SETTINGS, type DashySettings } from "../types";
import { normalizeStartHour } from "./today";

/** The days a week can start on: Sunday, Monday, Saturday. The one list the setting, the adapter and the dropdown share. */
export const WEEK_STARTS: readonly number[] = [0, 1, 6];

/** A stored week start is one of 0, 1 or 6; anything else (garbage, a future value) means "follow the language". */
export function normalizeWeekStart(value: unknown): number | null {
    return typeof value === "number" && WEEK_STARTS.includes(value) ? value : null;
}

/** A plain object is the only shape `loadData()` can sensibly mean as settings. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Fills in every default for whatever is missing, then re-validates the one
 * field that is not simply "present or not": a stored `startDayHour` from
 * before this setting existed, one written by a future version this one
 * does not understand, or plain corruption of `data.json`, must fall back to
 * midnight rather than silently moving where every block's day boundary
 * sits.
 */
export function mergeSettings(stored: unknown): DashySettings {
    const partial: Partial<DashySettings> = isRecord(stored) ? stored : {};
    return {
        ...DEFAULT_SETTINGS,
        ...partial,
        startDayHour: normalizeStartHour(partial.startDayHour),
        weekStart: normalizeWeekStart(partial.weekStart),
    };
}
