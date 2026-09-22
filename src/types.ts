export interface DashySettings {
    /** Папка заметок дня. Пусто — берём из Periodic Notes, если он установлен. */
    dailyFolder: string;
    weeklyFolder: string;
    monthlyFolder: string;
    /** Версия скилла, установленного в хранилище, чтобы предлагать обновление. */
    installedSkillVersion: string | null;
}

export const DEFAULT_SETTINGS: DashySettings = {
    dailyFolder: "",
    weeklyFolder: "",
    monthlyFolder: "",
    installedSkillVersion: null,
};
