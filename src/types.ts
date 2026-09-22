export interface DashySettings {
    /** Daily notes folder. Empty — take it from Periodic Notes when installed. */
    dailyFolder: string;
    weeklyFolder: string;
    monthlyFolder: string;
    /** Version of the skill installed in the vault, so we can offer an update. */
    installedSkillVersion: string | null;
}

export const DEFAULT_SETTINGS: DashySettings = {
    dailyFolder: "",
    weeklyFolder: "",
    monthlyFolder: "",
    installedSkillVersion: null,
};
