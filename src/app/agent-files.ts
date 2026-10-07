import { Notice, normalizePath, type App } from "obsidian";
import type DashyPlugin from "./plugin";
import {
    SKILL_MARKDOWN,
    SKILL_VERSION,
    SKILL_DIR,
    SKILL_PATH,
    REFERENCE_MARKDOWN,
    REFERENCE_PATH,
    AGENTS_PATH,
    AGENTS_SECTION,
    AGENTS_BEGIN,
    AGENTS_END,
} from "../skill/skill-content";
import { upsertManagedSection, hasManagedSection } from "../core/agents-file";
import { t } from "../i18n";

/**
 * Writes the agent files into the vault, and only on an explicit call: the
 * Install button in settings and the command palette entries (B-186) both
 * land here, so the two ways in can never drift apart.
 *
 * Both return whether something was written, so a caller can redraw its own
 * view; the user has already been told either way.
 */

/**
 * The adapter rather than the Vault API, unusually: `.claude/` is a dotted
 * folder, which Obsidian does not index, so there is no TFile to get hold
 * of and `vault.create` has nothing to file the result under.
 *
 * Two files (B-164): SKILL.md, the process, and reference.md next to it,
 * the key tables SKILL.md links to. The reference goes first, so a write
 * that fails halfway never leaves a SKILL.md pointing at a file that is
 * not there. An install from before the split updates the same way:
 * SKILL.md is overwritten and reference.md created.
 */
export async function installSkill(app: App, plugin: DashyPlugin): Promise<boolean> {
    const adapter = app.vault.adapter;
    const folder = normalizePath(SKILL_DIR);
    try {
        if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
        await adapter.write(normalizePath(REFERENCE_PATH), REFERENCE_MARKDOWN);
        await adapter.write(normalizePath(SKILL_PATH), SKILL_MARKDOWN);
        plugin.settings.installedSkillVersion = SKILL_VERSION;
        await plugin.saveSettings();
        new Notice(t("settings.written", { path: SKILL_DIR }));
        return true;
    } catch (e) {
        new Notice(t("settings.writeFailed", { message: (e as Error).message }));
        return false;
    }
}

/**
 * AGENTS.md belongs to the vault, so the file is read first and only our
 * fenced section is replaced. A file we cannot recognise comes back
 * unchanged and the user is told, rather than being quietly overwritten.
 */
export async function installAgents(app: App, plugin: DashyPlugin): Promise<boolean> {
    const markers = { begin: AGENTS_BEGIN, end: AGENTS_END };
    const target = normalizePath(AGENTS_PATH);
    try {
        // A plain vault file, so it goes through the Vault API: Obsidian
        // knows about it, indexes it, and shows the change straight away.
        const file = app.vault.getFileByPath(target);
        const existing = file ? await app.vault.read(file) : null;
        const next = upsertManagedSection(existing, AGENTS_SECTION, markers);

        if (existing !== null && next === existing && !hasManagedSection(existing, markers)) {
            new Notice(t("settings.agentsUntouched", { path: AGENTS_PATH }));
            return false;
        }

        if (file) {
            await app.vault.modify(file, next);
        } else {
            await app.vault.create(target, next);
        }
        plugin.settings.installedAgentsVersion = SKILL_VERSION;
        await plugin.saveSettings();
        new Notice(t("settings.written", { path: AGENTS_PATH }));
        return true;
    } catch (e) {
        new Notice(t("settings.writeFailed", { message: (e as Error).message }));
        return false;
    }
}
