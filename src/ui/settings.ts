import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type DashyPlugin from "../app/plugin";
import { SKILL_MARKDOWN, SKILL_VERSION, SKILL_PATH } from "../skill/skill-content";
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
}
