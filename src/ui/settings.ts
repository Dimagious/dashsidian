import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type DashyPlugin from "../app/plugin";
import { SKILL_MARKDOWN, SKILL_VERSION, SKILL_PATH } from "../skill/skill-content";

export class DashySettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: DashyPlugin) {
        super(app, plugin);
    }

    /**
     * Присутствие метода проверяет obsidianmd/settings-tab/prefer-setting-definitions.
     * Пустой список — осознанно: поля здесь описываются через Setting ниже,
     * дублировать их декларацией нечем.
     */
    getSettingDefinitions(): [] {
        return [];
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName("Periodic notes").setHeading();

        this.folderSetting(
            "Daily notes folder",
            "Leave empty to use the Periodic Notes plugin settings when it is installed.",
            "01-Areas/Personal/Diary",
            "dailyFolder",
        );
        this.folderSetting(
            "Weekly notes folder",
            "Used by the today block. Leave empty to follow Periodic Notes.",
            "01-Areas/Personal/Weekly",
            "weeklyFolder",
        );
        this.folderSetting(
            "Monthly notes folder",
            "Used by the today block. Leave empty to follow Periodic Notes.",
            "01-Areas/Personal/Monthly",
            "monthlyFolder",
        );

        new Setting(containerEl).setName("AI agent skill").setHeading();

        const installed = this.plugin.settings.installedSkillVersion;
        const desc = installed === null
            ? `Writes ${SKILL_PATH} so an agent (Claude Code, Cursor) can write these blocks for you.`
            : installed === SKILL_VERSION
                ? `Installed, version ${installed}. Nothing to do.`
                : `Installed version ${installed}, available ${SKILL_VERSION}.`;

        new Setting(containerEl)
            .setName("Skill file in this vault")
            .setDesc(desc)
            .addButton((b) =>
                b
                    .setButtonText(installed === null ? "Install" : "Update")
                    .setCta()
                    .onClick(() => {
                        void this.installSkill();
                    }),
            )
            .addButton((b) =>
                b.setButtonText("Copy markdown").onClick(() => {
                    void navigator.clipboard.writeText(SKILL_MARKDOWN).then(() => {
                        new Notice("Skill markdown copied.");
                    });
                }),
            );
    }

    /** Три поля различаются только текстом и ключом настройки. */
    private folderSetting(
        name: string,
        desc: string,
        placeholder: string,
        key: "dailyFolder" | "weeklyFolder" | "monthlyFolder",
    ): void {
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(desc)
            .addText((t) =>
                t
                    .setPlaceholder(placeholder)
                    .setValue(this.plugin.settings[key])
                    .onChange(async (v) => {
                        this.plugin.settings[key] = v.trim();
                        await this.plugin.saveSettings();
                    }),
            );
    }

    /** Пишет файл только по нажатию — никаких тихих записей за пределы своей папки. */
    private async installSkill(): Promise<void> {
        const adapter = this.app.vault.adapter;
        const folder = SKILL_PATH.slice(0, SKILL_PATH.lastIndexOf("/"));
        try {
            if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
            await adapter.write(SKILL_PATH, SKILL_MARKDOWN);
            this.plugin.settings.installedSkillVersion = SKILL_VERSION;
            await this.plugin.saveSettings();
            new Notice(`Skill written to ${SKILL_PATH}`);
            this.display();
        } catch (e) {
            new Notice(`Could not write the skill: ${(e as Error).message}`);
        }
    }
}
