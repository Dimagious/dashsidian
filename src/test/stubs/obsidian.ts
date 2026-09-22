/**
 * A stub of the `obsidian` package for vitest — the real one ships only inside
 * the application. The alias is configured in vitest.config.ts.
 *
 * Kept minimal: the pure layer (core/, shared/, i18n/) does not import obsidian
 * at all, and block mount tests will add to this as they appear.
 */

/**
 * The real Obsidian hands out its own moment, set to the application language.
 * In tests we take the package from node_modules — it comes along with the
 * obsidian types. It never reaches the bundle: `obsidian` is external.
 */
export { default as moment } from "moment";

export class Plugin {
    app: unknown;
    constructor(app: unknown) { this.app = app; }
    registerMarkdownCodeBlockProcessor(): void { /* no-op */ }
    addSettingTab(): void { /* no-op */ }
    async loadData(): Promise<unknown> { return {}; }
    async saveData(): Promise<void> { /* no-op */ }
}

export class MarkdownRenderChild {
    constructor(public containerEl: HTMLElement) {}
    onload(): void { /* no-op */ }
    onunload(): void { /* no-op */ }
    load(): void { this.onload(); }
    unload(): void { this.onunload(); }
}

/** Obsidian's own debounce; the stub keeps the trailing-call behaviour. */
export function debounce<A extends unknown[]>(
    fn: (...args: A) => void,
    timeout = 0,
    _resetTimer = false,
): (...args: A) => void {
    let handle: number | null = null;
    return (...args: A) => {
        if (handle !== null) window.clearTimeout(handle);
        handle = window.setTimeout(() => fn(...args), timeout);
    };
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
