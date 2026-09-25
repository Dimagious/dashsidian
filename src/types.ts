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
    /**
     * The hour, 0 to 6, at which a new calendar day starts for every block.
     * 0 (midnight) is today's behaviour. A note written at 01:30 can still
     * count as yesterday's when this is pushed later, for the person who
     * writes their daily note before going to bed rather than after waking
     * up. See `core/today.ts`.
     */
    startDayHour: number;
}

export const DEFAULT_SETTINGS: DashySettings = {
    dailyFolder: "",
    weeklyFolder: "",
    monthlyFolder: "",
    installedSkillVersion: null,
    installedAgentsVersion: null,
    language: "",
    startDayHour: 0,
};
