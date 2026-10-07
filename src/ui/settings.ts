import {
    App,
    Notice,
    Platform,
    apiVersion,
    PluginSettingTab,
    type SettingDefinitionItem,
    type SettingGroupItem,
} from "obsidian";
import type DashyPlugin from "../app/plugin";
import { discoverPeriodics } from "../adapters/periodic";
import type { Period } from "../core/periodic";
import {
    SKILL_VERSION,
    SKILL_DIR,
    COMBINED_MARKDOWN,
    AGENTS_PATH,
} from "../skill/skill-content";
import { installSkill, installAgents } from "../app/agent-files";
import { buildIssueUrl, DOCS_URL, FUNDING_URL, type IssueKind } from "../core/feedback";
import { MIN_START_HOUR, MAX_START_HOUR, normalizeStartHour } from "../core/today";
import { t, AVAILABLE_LOCALES } from "../i18n";
import { applyLocale } from "../adapters/locale";

type FolderKey = "dailyFolder" | "weeklyFolder" | "monthlyFolder";
type TextKey = FolderKey | "language";
const START_DAY_HOUR_KEY = "startDayHour";

/**
 * The dropdown's own options, `"0"` through `"6"`, each labelled a plain
 * `HH:00`: there is no locale-aware "format this hour alone" helper in
 * `adapters/datetime.ts`, and a bare hour reads the same in every language.
 */
const START_DAY_HOUR_OPTIONS: Record<string, string> = Object.fromEntries(
    Array.from(
        { length: MAX_START_HOUR - MIN_START_HOUR + 1 },
        (_, i) => MIN_START_HOUR + i,
    ).map((hour) => [String(hour), `${String(hour).padStart(2, "0")}:00`]),
);

/**
 * Languages are listed under their own names, the way every list of languages
 * is: someone looking for German is looking for "Deutsch". The empty option
 * follows Obsidian and comes first because it is the answer for almost
 * everyone.
 */
const LANGUAGE_NAMES: Record<string, string> = {
    en: "English",
    ru: "Русский",
    de: "Deutsch",
    fr: "Français",
    es: "Español",
};

/**
 * The settings tab, declared rather than drawn.
 *
 * `display()` has been deprecated since Obsidian 1.13 in favour of
 * `getSettingDefinitions()`: the tab says what its settings are, and Obsidian
 * renders, searches and persists them. Two things follow. The folder fields no
 * longer carry their own onChange, since `setControlValue` is the one place a
 * value is written; and a redraw is `update()`, not a second `display()`.
 */
export class DashySettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: DashyPlugin) {
        super(app, plugin);
    }

    override getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                type: "group",
                heading: t("settings.languageHeading"),
                items: [{
                    name: t("settings.language"),
                    desc: t("settings.languageDesc"),
                    control: {
                        type: "dropdown",
                        key: "language",
                        options: {
                            "": t("settings.languageAuto"),
                            ...Object.fromEntries(
                                AVAILABLE_LOCALES.map((code) => [code, LANGUAGE_NAMES[code] ?? code]),
                            ),
                        },
                    },
                }],
            },
            {
                type: "group",
                heading: t("settings.periodicHeading"),
                items: [
                    this.folder("dailyFolder", t("settings.dailyFolder"),
                        t("settings.dailyFolderDesc"), this.periodicHint("daily", "Journal")),
                    this.folder("weeklyFolder", t("settings.weeklyFolder"),
                        t("settings.followPeriodic"), this.periodicHint("weekly", "Journal/Weekly")),
                    this.folder("monthlyFolder", t("settings.monthlyFolder"),
                        t("settings.followPeriodic"), this.periodicHint("monthly", "Journal/Monthly")),
                ],
            },
            {
                type: "group",
                heading: t("settings.startDayHeading"),
                items: [{
                    name: t("settings.startDayHour"),
                    desc: t("settings.startDayHourDesc"),
                    control: {
                        type: "dropdown",
                        key: START_DAY_HOUR_KEY,
                        options: START_DAY_HOUR_OPTIONS,
                    },
                }],
            },
            {
                type: "group",
                heading: t("settings.skillHeading"),
                items: [this.skillRow(), this.agentsRow()],
            },
            {
                type: "group",
                heading: t("about.heading"),
                items: [
                    this.link(t("about.bug"), t("about.bugDesc"), this.issueUrl("bug")),
                    this.link(t("about.feature"), t("about.featureDesc"), this.issueUrl("feature")),
                    this.link(t("about.docs"), t("about.docsDesc"), DOCS_URL),
                    this.link(t("about.funding"), t("about.fundingDesc"), FUNDING_URL),
                ],
            },
        ];
    }

    /**
     * A row that opens something in the browser.
     *
     * The whole backlog of this plugin waits on people saying what they need,
     * and until now there was nowhere for them to say it.
     */
    private link(name: string, desc: string, href: string): SettingGroupItem {
        return {
            name,
            desc,
            render: (setting) => {
                setting.addButton((b) =>
                    b
                        .setButtonText(t("about.open"))
                        .setTooltip(name)
                        .onClick(() => {
                            window.open(href);
                        }),
                );
            },
        };
    }

    private issueUrl(kind: IssueKind): string {
        return buildIssueUrl(kind, {
            plugin: this.plugin.manifest.version,
            obsidian: apiVersion,
            platform: Platform.isMobileApp ? "mobile" : "desktop",
        });
    }

    /** Obsidian reads a control's value from here, by the key the control names. */
    override getControlValue(key: string): unknown {
        // The dropdown control only ever carries a string; the setting
        // itself is a number, so the two are converted at this boundary.
        if (key === START_DAY_HOUR_KEY) return String(this.plugin.settings.startDayHour);
        return this.plugin.settings[key as TextKey];
    }

    /** And writes it back here, which is the only place a setting is stored. */
    override async setControlValue(key: string, value: unknown): Promise<void> {
        if (typeof value !== "string") return;
        if (key === START_DAY_HOUR_KEY) {
            this.plugin.settings.startDayHour = normalizeStartHour(Number(value));
            await this.plugin.saveSettings();
            return;
        }
        this.plugin.settings[key as TextKey] = value.trim();
        if (key === "language") {
            // Ahead of the save, so the blocks that redraw on it already speak
            // the new language; then the tab redraws to translate itself.
            applyLocale(this.plugin.settings.language);
        }
        await this.plugin.saveSettings();
        if (key === "language") this.update();
    }

    /**
     * What the field would resolve to if left empty.
     *
     * The placeholders used to be the folders of the vault this plugin was
     * written in, which told a stranger nothing and read as someone else's
     * note left in the settings. Periodic Notes, or the core Daily notes
     * plugin, already says where the notes live, and that is the answer the
     * empty field gives. Where neither is installed there is nothing to read,
     * so a plain example stands in.
     */
    private periodicHint(period: Period, fallback: string): string {
        return discoverPeriodics(this.app)[period]?.folder || fallback;
    }

    private folder(key: FolderKey, name: string, desc: string, placeholder: string): SettingGroupItem {
        return { name, desc, control: { type: "text", key, placeholder } };
    }

    private skillRow(): SettingGroupItem {
        const installed = this.plugin.settings.installedSkillVersion;
        return {
            name: t("settings.skillName"),
            desc: installed === null
                ? t("settings.skillNotInstalled", { path: SKILL_DIR })
                : installed === SKILL_VERSION
                    ? t("settings.skillCurrent", { version: installed })
                    : t("settings.skillOutdated", { installed, available: SKILL_VERSION }),
            // `render`, not `action`: an action definition is a click handler
            // for the whole row, and leaves the control cell empty.
            render: (setting) => {
                setting.addButton((b) =>
                    b
                        .setButtonText(installed === null ? t("settings.install") : t("settings.update"))
                        // Two rows carry an "Install" button; without a label
                        // they are indistinguishable to a screen reader, which
                        // reads the button and not the row it sits in.
                        .setTooltip(t("settings.skillName"))
                        .setCta()
                        .onClick(() => {
                            void this.installSkill();
                        }),
                );
                setting.addButton((b) =>
                    b.setButtonText(t("settings.copyMarkdown")).onClick(() => {
                        void this.copySkill();
                    }),
                );
            },
        };
    }

    private agentsRow(): SettingGroupItem {
        const installed = this.plugin.settings.installedAgentsVersion;
        return {
            name: t("settings.agentsName"),
            desc: installed === null
                ? t("settings.agentsNotInstalled", { path: AGENTS_PATH })
                : installed === SKILL_VERSION
                    ? t("settings.agentsCurrent", { version: installed })
                    : t("settings.agentsOutdated", { installed, available: SKILL_VERSION }),
            render: (setting) => {
                setting.addButton((b) =>
                    b
                        .setButtonText(installed === null ? t("settings.install") : t("settings.update"))
                        .setTooltip(t("settings.agentsName"))
                        .onClick(() => {
                            void this.installAgents();
                        }),
                );
            },
        };
    }

    private async installSkill(): Promise<void> {
        if (await installSkill(this.app, this.plugin)) this.update();
    }

    /**
     * The clipboard is not a given.
     *
     * `navigator.clipboard` is missing outside a secure context, and even
     * where it exists the write can be refused. Unguarded, the first case
     * throws inside the click handler and the second rejects unhandled — and
     * either way the button does nothing and says nothing, which is the one
     * outcome this plugin does not allow itself.
     *
     * What is copied is the one-file text AGENTS.md carries, process and
     * reference together, without SKILL.md's frontmatter: pasted anywhere,
     * it has no reference.md next to it to link to.
     */
    private async copySkill(): Promise<void> {
        try {
            await navigator.clipboard.writeText(COMBINED_MARKDOWN);
            new Notice(t("settings.copied"));
        } catch (e) {
            new Notice(t("settings.copyFailed", { message: (e as Error).message }));
        }
    }

    private async installAgents(): Promise<void> {
        if (await installAgents(this.app, this.plugin)) this.update();
    }
}
