import { Notice, normalizePath, type App } from "obsidian";
import type { BlockContext } from "../blocks/context";
import {
    countFindings,
    dashyBlocks,
    findFencedBlocks,
    formatBlockCheck,
    type CheckCounts,
    type CheckedBlock,
    type FenceTable,
    type Finding,
} from "../core/block-check";
import { describeVault, formatVaultProfile, type DescribeOptions, type ProfileSettings } from "../core/vault-profile-file";
import { dateKey } from "../core/calendar";
import { getLocale, t, tPlural } from "../i18n";
import type { Draw } from "./block";

/**
 * The two commands that give an agent eyes on the vault (B-168): one writes
 * what the blocks of the open note report, the other what the vault holds.
 * Both write a file under `.dashy/` at the vault root, overwritten on each
 * run, and only when the command is run: nothing here is called on load.
 *
 * The adapter rather than the Vault API, as for the skill: `.dashy/` is a
 * dotted folder, which Obsidian does not index, so the files never turn up
 * in a block's `source`, in search or in the graph.
 */
export const DASHY_DIR = ".dashy";
export const BLOCK_CHECK_PATH = `${DASHY_DIR}/block-check.md`;
export const VAULT_PROFILE_PATH = `${DASHY_DIR}/vault-profile.md`;

/** What the commands need from the plugin, so they can be run without one. */
export interface AgentToolsHost {
    app: App;
    /** the draw function behind each fence name Dashy registered, the very ones the code block processors call */
    fences: () => ReadonlyMap<string, Draw>;
    /** names Dashy has but another plugin draws here: name to plugin id, or null when not known */
    elsewhere: () => ReadonlyMap<string, string | null>;
    /** the context a block in the note at `sourcePath` is drawn with */
    context: (sourcePath: string) => BlockContext;
    /** calls back once Obsidian has read every note's properties */
    whenIndexed: (done: () => void) => void;
    versions: { plugin: string; schema: string };
    /** what the profile reads from Obsidian; see `adapters/profile.ts` */
    reading: () => DescribeOptions;
    settings: (today: Date) => ProfileSettings;
    /** a detached element to draw a block into; defaults to Obsidian's `createDiv()` */
    newHost?: () => HTMLElement;
}

/** The command palette entries. A host that can add commands: the plugin, or a test. */
export interface CommandHost {
    addCommand: (command: { id: string; name: string; callback: () => void }) => unknown;
}

export function registerAgentTools(plugin: CommandHost, host: AgentToolsHost): void {
    plugin.addCommand({
        id: "check-blocks",
        name: t("command.checkBlocks"),
        callback: () => void checkBlocks(host),
    });
    plugin.addCommand({
        id: "vault-profile",
        name: t("command.vaultProfile"),
        callback: () => void writeVaultProfile(host),
    });
}

/** What a drawn block reported: its diagnostics, by the attributes `renderDiagnostics` puts on each, and its notices. */
export function readFindings(el: HTMLElement): Finding[] {
    const out: Finding[] = [];
    for (const row of Array.from(el.querySelectorAll<HTMLElement>(".dashy-diag"))) {
        const level = row.classList.contains("dashy-diag-error") ? "error" : "warning";
        const finding: Finding = { level, message: row.dataset.message ?? (row.textContent ?? "") };
        const line = Number(row.dataset.line);
        if (row.dataset.line !== undefined && Number.isFinite(line)) finding.line = line;
        out.push(finding);
    }
    for (const notice of Array.from(el.querySelectorAll<HTMLElement>(".dashy-notice"))) {
        out.push({ level: "notice", message: (notice.textContent ?? "").trim() });
    }
    return out;
}

/**
 * Draws every Dashy block of a note into a detached element, through the
 * same draw function its code block processor calls with the same context,
 * and reads back what it reported. Nothing is validated twice: a check the
 * block runs when it draws shows up here, and one it does not run cannot.
 */
export function checkNote(host: AgentToolsHost, path: string, text: string): CheckedBlock[] {
    const fences = host.fences();
    const table: FenceTable = { drawn: new Set(fences.keys()), elsewhere: host.elsewhere() };
    const newHost = host.newHost ?? ((): HTMLElement => createDiv());
    return dashyBlocks(findFencedBlocks(text), table).map(({ block, status, owner }): CheckedBlock => {
        const checked: CheckedBlock = { line: block.line, lang: block.lang, status, findings: [] };
        if (owner) checked.owner = owner;
        const draw = fences.get(block.lang);
        if (status !== "checked" || !draw) return checked;
        const el = newHost();
        try {
            const stop = draw(host.context(path), block.source, el);
            // A heatmap's observers, a clock's timer: nothing of a check outlives it.
            if (stop) stop();
            checked.findings = readFindings(el);
        } catch (e) {
            // A block that throws is a bug of ours, but the report must still say so.
            checked.findings = [{ level: "error", message: `The block failed to draw: ${(e as Error).message}` }];
        }
        return checked;
    });
}

/** Waits for Obsidian to finish reading the vault: a check on half-read properties would report fields as missing. */
function indexed(host: AgentToolsHost): Promise<void> {
    return new Promise((resolve) => host.whenIndexed(resolve));
}

/** The `Check blocks in this note` command. Returns the counts written, or null when nothing was. */
export async function checkBlocks(host: AgentToolsHost): Promise<CheckCounts | null> {
    const file = host.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
        new Notice(t("command.checkNoNote"));
        return null;
    }
    let report: string;
    let counts: CheckCounts;
    try {
        await indexed(host);
        const text = await host.app.vault.read(file);
        const blocks = checkNote(host, file.path, text);
        report = formatBlockCheck({
            notePath: file.path,
            pluginVersion: host.versions.plugin,
            schemaVersion: host.versions.schema,
            language: getLocale(),
            today: dateKey(host.context(file.path).today()),
            drawn: [...host.fences().keys()],
            blocks,
        });
        counts = countFindings(blocks);
    } catch (e) {
        console.error(`[dashy] could not check the blocks of "${file.path}"`, e);
        new Notice(t("command.checkFailed", { note: file.path, message: errorText(e) }));
        return null;
    }
    if (!(await written(host.app, BLOCK_CHECK_PATH, report))) return null;
    new Notice(counts.blocks
        ? t("command.checkDone", {
            blocks: tPlural("command.blocks", counts.blocks),
            errors: tPlural("command.errors", counts.errors),
            warnings: tPlural("command.warnings", counts.warnings),
            path: BLOCK_CHECK_PATH,
        })
        : t("command.checkNone", { path: BLOCK_CHECK_PATH }));
    return counts;
}

/** The `Write vault profile` command. Returns whether the file was written. */
export async function writeVaultProfile(host: AgentToolsHost): Promise<boolean> {
    let profile: string;
    try {
        await indexed(host);
        // Any note's context reads the same snapshot and the same today.
        const context = host.context("");
        profile = formatVaultProfile(describeVault(context.notes(), host.reading()), host.settings(context.today()));
    } catch (e) {
        console.error("[dashy] could not read the vault for the vault profile", e);
        new Notice(t("command.profileFailed", { message: errorText(e) }));
        return false;
    }
    if (!(await written(host.app, VAULT_PROFILE_PATH, profile))) return false;
    new Notice(t("command.profileDone", { path: VAULT_PROFILE_PATH }));
    return true;
}

function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/** Writes the file, or says why it could not: a failed write is never put down to anything else. */
async function written(app: App, path: string, text: string): Promise<boolean> {
    try {
        await writeDashyFile(app, path, text);
        return true;
    } catch (e) {
        console.error(`[dashy] could not write "${path}"`, e);
        new Notice(t("command.writeFailed", { path, message: errorText(e) }));
        return false;
    }
}

/** Writes one of the two files, making `.dashy/` first when it is not there. Nothing else is ever written. */
async function writeDashyFile(app: App, path: string, text: string): Promise<void> {
    const adapter = app.vault.adapter;
    const folder = normalizePath(DASHY_DIR);
    if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
    await adapter.write(normalizePath(path), text);
}

