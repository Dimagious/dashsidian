import type { App } from "obsidian";
import { PERIODS, type Period, type PeriodConfig } from "../core/periodic";
import { dateFormats, type DateFormats } from "../core/note-date";
import { isRecord } from "../shared/parse";
import { parseDateWithFormat } from "./datetime";

/**
 * Where periodic notes live, according to the neighbouring plugins.
 *
 * Periodic Notes has no official API, and pulling in
 * `obsidian-daily-notes-interface` for three fields would be a dependency
 * (see ADR 0001, the same argument as for Dataview). So we read the settings
 * directly and defend against any shape of them: the neighbour may be absent,
 * or may update and move things around. Found nothing — return nothing, and
 * core/periodic.ts falls back to the defaults.
 */
export type Discovered = Partial<Record<Period, Partial<PeriodConfig>>>;

/** The private part of App: absent from the public types, but stable for years. */
interface PluginHost {
    plugins?: { plugins?: Record<string, unknown> };
    internalPlugins?: { plugins?: Record<string, unknown> };
}

export function discoverPeriodics(app: App): Discovered {
    const host = app as unknown as PluginHost;
    const out: Discovered = {};

    const periodic = host.plugins?.plugins?.["periodic-notes"];
    const settings = isRecord(periodic) ? periodic.settings : undefined;
    if (isRecord(settings)) {
        for (const period of PERIODS) {
            const cfg = settings[period];
            // `enabled` is ignored on purpose: even a period switched off at the
            // neighbour still holds a configured folder, and that is a better
            // guess than the vault root. If the block asks for `monthly: true`,
            // the note belongs exactly there.
            if (!isRecord(cfg)) continue;
            const found = pick(cfg);
            if (found) out[period] = found;
        }
    }

    // The core "Daily notes" only knows about the day, and yields to Periodic Notes.
    if (!out.daily) {
        const core = host.internalPlugins?.plugins?.["daily-notes"];
        const instance = isRecord(core) ? core.instance : undefined;
        const options = isRecord(instance) ? instance.options : undefined;
        if (isRecord(options)) {
            const found = pick(options);
            if (found) out.daily = found;
        }
    }

    return out;
}

function pick(cfg: Record<string, unknown>): Partial<PeriodConfig> | null {
    const folder = typeof cfg.folder === "string" ? cfg.folder : "";
    const format = typeof cfg.format === "string" ? cfg.format : "";
    return folder || format ? { folder, format } : null;
}

/**
 * The day format of the Periodic Notes or core Daily notes settings, the
 * same one `today` builds the daily note's path with, or undefined when
 * neither plugin names one. Blocks read note dates in it after ISO (B-120).
 */
export function dailyNoteFormat(app: App): string | undefined {
    return discoverPeriodics(app).daily?.format?.trim() || undefined;
}

/**
 * The formats a block reads note dates in after ISO: its own `date_format`
 * first, then `dailyNoteFormat`. Undefined when there is neither, which
 * leaves the block reading ISO dates only.
 */
export function noteDateFormats(app: App, own?: string): DateFormats | undefined {
    return dateFormats(own, dailyNoteFormat(app), parseDateWithFormat);
}
