import type { App } from "obsidian";
import { PERIODS, resolveConfig, normalizeFolder } from "../core/periodic";
import { periodNames } from "../core/period-name";
import { dateKey } from "../core/calendar";
import type { DescribeOptions, ProfileSettings } from "../core/vault-profile-file";
import { getLocale } from "../i18n";
import type { DashySettings } from "../types";
import { currentLocale, firstDayOfWeek, parsePeriodStart } from "./datetime";
import { discoverPeriodics, noteDateFormats, periodNameFormats } from "./periodic";
import { templateFolders } from "./templates";

/**
 * What `Write vault profile` (B-168) reads from Obsidian and its neighbours,
 * handed to `core/vault-profile-file.ts` as plain data: the same readers the
 * blocks use, so the file describes what the blocks do.
 */
export function profileReading(app: App): DescribeOptions {
    const options: DescribeOptions = {
        names: periodNames(periodNameFormats(app), parsePeriodStart),
        templateFolders: templateFolders(app),
    };
    const dayFormats = noteDateFormats(app);
    if (dayFormats) options.dayFormats = dayFormats;
    return options;
}

const DASHY_FOLDER = { daily: "dailyFolder", weekly: "weeklyFolder", monthly: "monthlyFolder" } as const;

export function profileSettings(
    app: App,
    settings: DashySettings,
    versions: { plugin: string; schema: string },
    today: Date,
): ProfileSettings {
    const discovered = discoverPeriodics(app);
    return {
        pluginVersion: versions.plugin,
        schemaVersion: versions.schema,
        today: dateKey(today),
        startDayHour: settings.startDayHour,
        obsidianLanguage: currentLocale(),
        pluginLanguage: getLocale(),
        firstDayOfWeek: firstDayOfWeek(),
        periodic: PERIODS.map((period) => {
            const own = settings[DASHY_FOLDER[period]];
            const found = discovered[period];
            const config = resolveConfig(period, own, found);
            const from = normalizeFolder(own) ? "Dashy settings" : found ? "Periodic Notes or Daily notes" : "default";
            return { period, folder: config.folder, format: config.format, from };
        }),
        nameFormats: periodNameFormats(app),
        templateFolders: templateFolders(app),
    };
}
