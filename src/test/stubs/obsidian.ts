/**
 * Заглушка пакета `obsidian` для vitest — настоящий поставляется только
 * внутри приложения. Алиас настроен в vitest.config.ts.
 *
 * Держим минимум: чистый слой (core/, shared/) обсидиан не импортирует
 * вовсе, а mount-тесты блоков будут дописывать сюда по мере появления.
 */
export class Plugin {
    app: unknown;
    constructor(app: unknown) { this.app = app; }
    registerMarkdownCodeBlockProcessor(): void { /* no-op */ }
    addSettingTab(): void { /* no-op */ }
    async loadData(): Promise<unknown> { return {}; }
    async saveData(): Promise<void> { /* no-op */ }
}

export class PluginSettingTab {
    containerEl: HTMLElement = document.createElement("div");
    constructor(public app: unknown, public plugin: unknown) {}
    display(): void { /* no-op */ }
}

export class Setting {
    constructor(public containerEl: HTMLElement) {}
    setName(): this { return this; }
    setDesc(): this { return this; }
    setHeading(): this { return this; }
    addText(): this { return this; }
    addButton(): this { return this; }
}

export class Notice {
    constructor(public message: string) {}
}

export type App = Record<string, never>;
export type TFile = Record<string, never>;
