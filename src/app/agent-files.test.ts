import { describe, it, expect, vi } from "vitest";
import type { App, TFile } from "obsidian";
import type DashyPlugin from "./plugin";
import { installSkill, installAgents } from "./agent-files";
import { DEFAULT_SETTINGS } from "../types";
import {
    SKILL_PATH,
    REFERENCE_PATH,
    AGENTS_PATH,
    AGENTS_SECTION,
    AGENTS_BEGIN,
    AGENTS_END,
    SKILL_VERSION,
} from "../skill/skill-content";

function plugin(): DashyPlugin {
    return { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn(async () => undefined) } as unknown as DashyPlugin;
}

/** A vault with at most one AGENTS.md, the only file `installAgents` goes through the Vault API for. */
function vaultWith(agents: string | null, failOn?: "create" | "modify") {
    const file = agents === null ? null : ({ path: AGENTS_PATH } as TFile);
    const written: { create?: string; modify?: string } = {};
    const app = {
        vault: {
            adapter: {
                exists: vi.fn(async () => true),
                mkdir: vi.fn(),
                write: vi.fn(async () => undefined),
            },
            getFileByPath: vi.fn(() => file),
            read: vi.fn(async () => agents ?? ""),
            create: vi.fn(async (_path: string, data: string) => {
                if (failOn === "create") throw new Error("read-only");
                written.create = data;
            }),
            modify: vi.fn(async (_file: TFile, data: string) => {
                if (failOn === "modify") throw new Error("read-only");
                written.modify = data;
            }),
        },
    } as unknown as App;
    return { app, written };
}

describe("installAgents (B-186)", () => {
    it("creates AGENTS.md with our section when the vault has none", async () => {
        const { app, written } = vaultWith(null);
        const p = plugin();
        expect(await installAgents(app, p)).toBe(true);
        expect(written.create).toContain(AGENTS_SECTION);
        expect(p.settings.installedAgentsVersion).toBe(SKILL_VERSION);
        expect(p.saveSettings).toHaveBeenCalledOnce();
    });

    it("appends the section to the author's own AGENTS.md and keeps what was there", async () => {
        const { app, written } = vaultWith("# My rules\n\nBe brief.\n");
        expect(await installAgents(app, plugin())).toBe(true);
        expect(written.modify).toContain("# My rules");
        expect(written.modify).toContain("Be brief.");
        expect(written.modify).toContain(AGENTS_BEGIN);
        expect(written.modify).toContain(AGENTS_END);
    });

    it("replaces an existing section through modify, keeping the rest and one fence", async () => {
        const { app, written } = vaultWith(`x\n${AGENTS_BEGIN}\nold\n${AGENTS_END}\ny\n`);
        const p = plugin();
        expect(await installAgents(app, p)).toBe(true);
        expect(written.create).toBeUndefined();
        expect(written.modify).toContain(AGENTS_SECTION);
        expect(written.modify?.split(AGENTS_BEGIN)).toHaveLength(2);
        expect(written.modify).toContain("x\n");
        expect(written.modify).toContain("y\n");
        expect(p.settings.installedAgentsVersion).toBe(SKILL_VERSION);
    });

    it("a failed modify of an existing file returns false and records nothing", async () => {
        const { app } = vaultWith("# mine\n", "modify");
        const p = plugin();
        expect(await installAgents(app, p)).toBe(false);
        expect(p.saveSettings).not.toHaveBeenCalled();
    });

    it("a file with a broken marker is left alone and nothing is recorded", async () => {
        const { app, written } = vaultWith(`${AGENTS_BEGIN}\nno end marker\n`);
        const p = plugin();
        expect(await installAgents(app, p)).toBe(false);
        expect(written.modify).toBeUndefined();
        expect(p.saveSettings).not.toHaveBeenCalled();
    });

    it("a failed write returns false and records no version", async () => {
        const { app } = vaultWith(null, "create");
        const p = plugin();
        expect(await installAgents(app, p)).toBe(false);
        expect(p.settings.installedAgentsVersion).toBeNull();
        expect(p.saveSettings).not.toHaveBeenCalled();
    });
});

describe("installSkill return value (B-186)", () => {
    it("tells the caller whether anything was written", async () => {
        const { app } = vaultWith(null);
        const adapter = app.vault.adapter as unknown as { write: ReturnType<typeof vi.fn> };
        expect(await installSkill(app, plugin())).toBe(true);
        expect(adapter.write.mock.calls.map((c) => c[0])).toEqual([REFERENCE_PATH, SKILL_PATH]);

        adapter.write.mockRejectedValueOnce(new Error("disk full"));
        expect(await installSkill(app, plugin())).toBe(false);
    });
});
