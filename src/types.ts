export interface DashySettings {
    /** Daily notes folder. Empty — take it from Periodic Notes when installed. */
    dailyFolder: string;
    weeklyFolder: string;
    monthlyFolder: string;
    /** Version of the skill installed in the vault, so we can offer an update. */
    installedSkillVersion: string | null;
    /** The same for the AGENTS.md section, which other agents read. */
    installedAgentsVersion: string | null;
    /**
     * Language for what the blocks say. Empty follows Obsidian, which is what
     * most people want; the override is for a vault whose notes are written in
     * one language while the app runs in another.
     */
    language: string;
}

export const DEFAULT_SETTINGS: DashySettings = {
    dailyFolder: "",
    weeklyFolder: "",
    monthlyFolder: "",
    installedSkillVersion: null,
    installedAgentsVersion: null,
    language: "",
};
