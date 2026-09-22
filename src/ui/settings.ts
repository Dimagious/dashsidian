import { App, Notice, PluginSettingTab, Setting } from "obsidian";
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
import { t } from "../i18n";

export class DashySettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: DashyPlugin) {
        super(app, plugin);
    }

    /**
     * The presence of this method is what obsidianmd/settings-tab/
     * prefer-setting-definitions checks. The empty list is deliberate: the
     * fields below are described through Setting, there is nothing to declare.
     */
    getSettingDefinitions(): [] {
        return [];
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName(t("settings.periodicHeading")).setHeading();

        this.folderSetting(t("settings.dailyFolder"), t("settings.dailyFolderDesc"),
            "01-Areas/Personal/Diary", "dailyFolder");
        this.folderSetting(t("settings.weeklyFolder"), t("settings.followPeriodic"),
            "01-Areas/Personal/Weekly", "weeklyFolder");
        this.folderSetting(t("settings.monthlyFolder"), t("settings.followPeriodic"),
            "01-Areas/Personal/Monthly", "monthlyFolder");

        new Setting(containerEl).setName(t("settings.skillHeading")).setHeading();

        const installed = this.plugin.settings.installedSkillVersion;
        const desc = installed === null
            ? t("settings.skillNotInstalled", { path: SKILL_PATH })
            : installed === SKILL_VERSION
                ? t("settings.skillCurrent", { version: installed })
                : t("settings.skillOutdated", { installed, available: SKILL_VERSION });

        new Setting(containerEl)
            .setName(t("settings.skillName"))
            .setDesc(desc)
            .addButton((b) =>
                b
                    .setButtonText(installed === null ? t("settings.install") : t("settings.update"))
                    // Two rows carry an "Install" button; without a label they
                    // are indistinguishable to a screen reader, which reads the
                    // button and not the row it sits in.
                    .setTooltip(t("settings.skillName"))
                    .setCta()
                    .onClick(() => {
                        void this.installSkill();
                    }),
            )
            .addButton((b) =>
                b.setButtonText(t("settings.copyMarkdown")).onClick(() => {
                    void navigator.clipboard.writeText(SKILL_MARKDOWN).then(() => {
                        new Notice(t("settings.copied"));
                    });
                }),
            );

        const agents = this.plugin.settings.installedAgentsVersion;
        const agentsDesc = agents === null
            ? t("settings.agentsNotInstalled", { path: AGENTS_PATH })
            : agents === SKILL_VERSION
                ? t("settings.agentsCurrent", { version: agents })
                : t("settings.agentsOutdated", { installed: agents, available: SKILL_VERSION });

        new Setting(containerEl)
            .setName(t("settings.agentsName"))
            .setDesc(agentsDesc)
            .addButton((b) =>
                b
                    .setButtonText(agents === null ? t("settings.install") : t("settings.update"))
                    .setTooltip(t("settings.agentsName"))
                    .onClick(() => {
                        void this.installAgents();
                    }),
            );
    }

    /** The three fields differ only in their label and settings key. */
    private folderSetting(
        name: string,
        desc: string,
        placeholder: string,
        key: "dailyFolder" | "weeklyFolder" | "monthlyFolder",
    ): void {
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(desc)
            .addText((input) =>
                input
                    .setPlaceholder(placeholder)
                    .setValue(this.plugin.settings[key])
                    .onChange(async (v) => {
                        this.plugin.settings[key] = v.trim();
                        await this.plugin.saveSettings();
                    }),
            );
    }

    /** Writes the file only on a click — no silent writes outside our own folder. */
    private async installSkill(): Promise<void> {
        const adapter = this.app.vault.adapter;
        const folder = SKILL_PATH.slice(0, SKILL_PATH.lastIndexOf("/"));
        try {
            if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
            await adapter.write(SKILL_PATH, SKILL_MARKDOWN);
            this.plugin.settings.installedSkillVersion = SKILL_VERSION;
            await this.plugin.saveSettings();
            new Notice(t("settings.written", { path: SKILL_PATH }));
            this.display();
        } catch (e) {
            new Notice(t("settings.writeFailed", { message: (e as Error).message }));
        }
    }

    /**
     * AGENTS.md belongs to the vault, so the file is read first and only our
     * fenced section is replaced. A file we cannot recognise comes back
     * unchanged and the user is told, rather than being quietly overwritten.
     */
    private async installAgents(): Promise<void> {
        const adapter = this.app.vault.adapter;
        const markers = { begin: AGENTS_BEGIN, end: AGENTS_END };
        try {
            const existing = (await adapter.exists(AGENTS_PATH))
                ? await adapter.read(AGENTS_PATH)
                : null;
            const next = upsertManagedSection(existing, AGENTS_SECTION, markers);

            if (existing !== null && next === existing && !hasManagedSection(existing, markers)) {
                new Notice(t("settings.agentsUntouched", { path: AGENTS_PATH }));
                return;
            }

            await adapter.write(AGENTS_PATH, next);
            this.plugin.settings.installedAgentsVersion = SKILL_VERSION;
            await this.plugin.saveSettings();
            new Notice(t("settings.written", { path: AGENTS_PATH }));
            this.display();
        } catch (e) {
            new Notice(t("settings.writeFailed", { message: (e as Error).message }));
        }
    }
}
