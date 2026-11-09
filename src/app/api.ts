import { checkNote, type AgentToolsHost } from "./agent-tools";

/**
 * Dashy's public API for other plugins (B-208), read as
 * `app.plugins.plugins.dashsidian.api`. Documented for consumers in
 * `docs/API.md`.
 *
 * The types below are written out in full rather than imported from the
 * core, so a consumer can copy this block into its own code as is. The
 * compiler still holds them to the core's: `createApi` hands back what
 * `checkNote` returns, typed as these.
 */

/**
 * Bumped only by a breaking change: a member removed or renamed, or one whose
 * meaning changed. A member added keeps the number, so check `>=`, not `===`.
 */
export const API_VERSION = 1;

/** How serious a finding is: `error` stops the block from drawing what was asked, `warning` draws it anyway, `notice` is a hint. */
export type DashyFindingLevel = "error" | "warning" | "notice";

/** One thing a Dashy block reported when it was drawn. */
export interface DashyFinding {
    level: DashyFindingLevel;
    /** the text the user sees in the block, in the language Dashy speaks in this vault; English when the block crashed */
    message: string;
    /** 1-based line inside the block (the first line after the opening fence is 1), when the block named one */
    line?: number;
}

/** One fenced code block of the checked text that is Dashy's, or looks like it. */
export interface DashyCheckedBlock {
    /** 1-based line of the opening fence in the text */
    line: number;
    /** the fence name: `stats`, `dashy-chart`, ... */
    lang: string;
    /**
     * `checked`: Dashy drew it and `findings` is what it reported, empty when
     * the block is fine. `elsewhere`: a name Dashy has but another plugin draws
     * in this vault (`chart` with Obsidian Charts on); not checked. `unknown`:
     * a `dashy-` name Dashy does not have; nothing will draw it, so treat it as
     * an error.
     */
    status: "checked" | "elsewhere" | "unknown";
    /** for `elsewhere`, the id of the plugin that draws it, when known */
    owner?: string;
    findings: DashyFinding[];
}

export interface DashyApi {
    /** {@link API_VERSION}: an integer, bumped only by a breaking change. */
    readonly apiVersion: number;
    /** the Dashy plugin version, as in its manifest: `2.2.0` */
    readonly version: string;
    /** the version of the block schema: the block keys this Dashy knows */
    readonly schemaVersion: string;
    /**
     * The code block names Dashy draws in this vault right now. `dashy-chart`
     * is always there; `chart` is not when another plugin (Obsidian Charts)
     * draws it.
     */
    fences(): string[];
    /**
     * Checks every Dashy block in a note's text the way the command `Check
     * blocks in this note` does: each block is drawn off screen, with the
     * vault as it is, and what it reported is read back. Code blocks of other
     * languages are left out.
     *
     * Waits for Obsidian to finish indexing the vault first and then reads it
     * afresh, so notes written just before the call are read. `sourcePath`
     * is the path the note lives, or will live, at: `period: note` reads its
     * name. Rejects only when the
     * check itself could not run, never for a broken block.
     */
    check(text: string, sourcePath: string): Promise<DashyCheckedBlock[]>;
}

/** What the API needs from the plugin: the same host the agent commands get. */
export type ApiHost = Pick<AgentToolsHost, "fences" | "elsewhere" | "context" | "whenIndexed" | "versions" | "newHost" | "fresh">;

export interface ApiHandle {
    api: DashyApi;
    /** Called on unload: `fences()` turns empty and `check` rejects, so a reference kept past it holds nothing of the plugin's. */
    close: () => void;
}

export function createApi(host: ApiHost): ApiHandle {
    let current: ApiHost | null = host;
    const live = (): ApiHost => {
        if (!current) throw new Error("Dashy was unloaded; read app.plugins.plugins.dashsidian.api again");
        return current;
    };
    const api: DashyApi = {
        apiVersion: API_VERSION,
        version: host.versions.plugin,
        schemaVersion: host.versions.schema,
        fences: () => (current ? [...current.fences().keys()] : []),
        check: async (text, sourcePath) => {
            if (typeof text !== "string" || typeof sourcePath !== "string") {
                throw new TypeError("Dashy api.check(text, sourcePath) takes two strings");
            }
            try {
                await indexed(live());
                // Unloaded while it waited: the plugin's snapshot is gone.
                const blocks: DashyCheckedBlock[] = checkNote(live(), sourcePath, text);
                return blocks;
            } catch (e) {
                // A broken block is a finding, not this: this is the check itself failing.
                console.error(`[dashy] api.check could not check the blocks of "${sourcePath}"`, e);
                throw new Error(`Dashy could not check the blocks of "${sourcePath}": ${e instanceof Error ? e.message : String(e)}`, { cause: e });
            }
        },
    };
    return {
        api,
        close: () => {
            current = null;
        },
    };
}

function indexed(host: ApiHost): Promise<void> {
    return new Promise((resolve) => host.whenIndexed(resolve));
}
