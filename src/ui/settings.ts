import {
    App,
    Notice,
    Platform,
    apiVersion,
    PluginSettingTab,
    normalizePath,
    type SettingDefinitionItem,
    type SettingGroupItem,
} from "obsidian";
import type DashyPlugin from "../app/plugin";
import {
    SKILL_MARKDOWN,
    SKILL_VERSION,
    SKILL_PATH,
    AGENTS_PATH,
    AGENTS_SECTION,
    AGENTS_BEGIN,
    AGENTS_END,
} from "../skill/skill-content";
import { upsertManagedSection, hasManagedSection } from "../core/agents-file";
import { buildIssueUrl, DOCS_URL, FUNDING_URL, type IssueKind } from "../core/feedback";
import { t } from "../i18n";

type FolderKey = "dailyFolder" | "weeklyFolder" | "monthlyFolder";

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
                heading: t("settings.periodicHeading"),
                items: [
                    this.folder("dailyFolder", t("settings.dailyFolder"),
                        t("settings.dailyFolderDesc"), "01-Areas/Personal/Diary"),
                    this.folder("weeklyFolder", t("settings.weeklyFolder"),
                        t("settings.followPeriodic"), "01-Areas/Personal/Weekly"),
                    this.folder("monthlyFolder", t("settings.monthlyFolder"),
                        t("settings.followPeriodic"), "01-Areas/Personal/Monthly"),
                ],
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
        return this.plugin.settings[key as FolderKey];
    }

    /** And writes it back here, which is the only place a setting is stored. */
    override async setControlValue(key: string, value: unknown): Promise<void> {
        if (typeof value !== "string") return;
        this.plugin.settings[key as FolderKey] = value.trim();
        await this.plugin.saveSettings();
    }

    private folder(key: FolderKey, name: string, desc: string, placeholder: string): SettingGroupItem {
        return { name, desc, control: { type: "text", key, placeholder } };
    }

    private skillRow(): SettingGroupItem {
        const installed = this.plugin.settings.installedSkillVersion;
        return {
            name: t("settings.skillName"),
            desc: installed === null
                ? t("settings.skillNotInstalled", { path: SKILL_PATH })
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

    /**
     * Writes the file only on a click, never on its own.
     *
     * The adapter rather than the Vault API, unusually: `.claude/` is a dotted
     * folder, which Obsidian does not index, so there is no TFile to get hold
     * of and `vault.create` has nothing to file the result under.
     */
    private async installSkill(): Promise<void> {
        const adapter = this.app.vault.adapter;
        const target = normalizePath(SKILL_PATH);
        const folder = normalizePath(SKILL_PATH.slice(0, SKILL_PATH.lastIndexOf("/")));
        try {
            if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
            await adapter.write(target, SKILL_MARKDOWN);
            this.plugin.settings.installedSkillVersion = SKILL_VERSION;
            await this.plugin.saveSettings();
            new Notice(t("settings.written", { path: SKILL_PATH }));
            this.update();
        } catch (e) {
            new Notice(t("settings.writeFailed", { message: (e as Error).message }));
        }
    }

    /**
     * The clipboard is not a given.
     *
     * `navigator.clipboard` is missing outside a secure context, and even
     * where it exists the write can be refused. Unguarded, the first case
     * throws inside the click handler and the second rejects unhandled — and
     * either way the button does nothing and says nothing, which is the one
     * outcome this plugin does not allow itself.
     */
    private async copySkill(): Promise<void> {
        try {
            await navigator.clipboard.writeText(SKILL_MARKDOWN);
            new Notice(t("settings.copied"));
        } catch (e) {
            new Notice(t("settings.copyFailed", { message: (e as Error).message }));
        }
    }

    /**
     * AGENTS.md belongs to the vault, so the file is read first and only our
     * fenced section is replaced. A file we cannot recognise comes back
     * unchanged and the user is told, rather than being quietly overwritten.
     */
    private async installAgents(): Promise<void> {
        const markers = { begin: AGENTS_BEGIN, end: AGENTS_END };
        const target = normalizePath(AGENTS_PATH);
        try {
            // A plain vault file, so it goes through the Vault API: Obsidian
            // knows about it, indexes it, and shows the change straight away.
            const file = this.app.vault.getFileByPath(target);
            const existing = file ? await this.app.vault.read(file) : null;
            const next = upsertManagedSection(existing, AGENTS_SECTION, markers);

            if (existing !== null && next === existing && !hasManagedSection(existing, markers)) {
                new Notice(t("settings.agentsUntouched", { path: AGENTS_PATH }));
                return;
            }

            if (file) {
                await this.app.vault.modify(file, next);
            } else {
                await this.app.vault.create(target, next);
            }
            this.plugin.settings.installedAgentsVersion = SKILL_VERSION;
            await this.plugin.saveSettings();
            new Notice(t("settings.written", { path: AGENTS_PATH }));
            this.update();
        } catch (e) {
            new Notice(t("settings.writeFailed", { message: (e as Error).message }));
        }
    }
}
