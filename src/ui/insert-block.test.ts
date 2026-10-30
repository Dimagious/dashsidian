import { describe, it, expect, afterEach } from "vitest";
import type { App, Editor } from "obsidian";
import { InsertBlockModal, type IndexState } from "./insert-block";
import type { NoteRecord } from "../core/source";
import { setLocale, t } from "../i18n";

const note = (name: string, fm: Record<string, unknown>): NoteRecord =>
    ({ path: `Journal/${name}.md`, name, folder: "Journal", tags: [], frontmatter: fm });

/** Mid-index: every note listed, none of their frontmatter read yet. */
const unread = [note("a", {}), note("b", {}), note("c", {})];
const read = [note("a", { mood: 3 }), note("b", { mood: 4 }), note("c", { mood: 5 })];

/** What the editor received from the modal. */
function editor(): { editor: Editor; inserted: string[] } {
    const inserted: string[] = [];
    const fake = { replaceSelection: (text: string): void => { inserted.push(text); } };
    return { editor: fake as unknown as Editor, inserted };
}

/** An index the test finishes by hand, the way `onCleanCache` would. */
function index(pending: boolean): IndexState & { finish: () => void; waiting: () => number } {
    let busy = pending;
    let callbacks: Array<() => void> = [];
    return {
        ready: () => !busy,
        whenReady: (done) => { callbacks.push(done); },
        finish: () => {
            busy = false;
            const due = callbacks;
            callbacks = [];
            due.forEach((done) => done());
        },
        waiting: () => callbacks.length,
    };
}

const app = {} as App;

function noticeOf(modal: InsertBlockModal): HTMLElement | null {
    return modal.modalEl.querySelector<HTMLElement>(".dashy-notice");
}

/** The snippet a pick of `name` pastes into the note. */
function pick(modal: InsertBlockModal, name: string, inserted: string[]): string {
    const choice = modal.getSuggestions("").find((c) => c.name === name);
    if (!choice) throw new Error(`no ${name} in the list`);
    modal.onChooseSuggestion(choice);
    return inserted[inserted.length - 1] ?? "";
}

describe("InsertBlockModal while Obsidian indexes (B-181)", () => {
    afterEach(() => setLocale("en"));

    it("a vault still being read shows one quiet line above the list", () => {
        const { editor: ed } = editor();
        const modal = new InsertBlockModal(app, ed, () => unread, undefined, index(true));
        const line = noticeOf(modal);
        expect(line?.textContent).toBe(t("insert.indexing"));
        expect(line?.textContent).toContain("still indexing the vault");
        expect(line?.nextElementSibling).toBe(modal.resultContainerEl);
        expect(modal.modalEl.querySelectorAll(".dashy-notice")).toHaveLength(1);
    });

    it("the line is in the reader's language", () => {
        setLocale("ru");
        const { editor: ed } = editor();
        const modal = new InsertBlockModal(app, ed, () => unread, undefined, index(true));
        expect(noticeOf(modal)?.textContent).toBe("Obsidian ещё индексирует хранилище, поэтому в примерах могут быть папки и поля по умолчанию.");
    });

    it("a read vault shows no line and fits the examples at once", () => {
        const { editor: ed, inserted } = editor();
        const idx = index(false);
        const modal = new InsertBlockModal(app, ed, () => read, undefined, idx);
        expect(noticeOf(modal)).toBeNull();
        expect(idx.waiting()).toBe(0);
        expect(pick(modal, "heatmap", inserted)).toContain("field: mood");
    });

    it("without an index the modal behaves as ready", () => {
        const { editor: ed, inserted } = editor();
        const modal = new InsertBlockModal(app, ed, () => read);
        expect(noticeOf(modal)).toBeNull();
        expect(pick(modal, "heatmap", inserted)).toContain("field: mood");
    });

    it("once indexing is done the line goes and the examples are fitted again", () => {
        const { editor: ed, inserted } = editor();
        const idx = index(true);
        let notes = unread;
        const modal = new InsertBlockModal(app, ed, () => notes, undefined, idx);
        const before = pick(modal, "heatmap", inserted);
        expect(before).not.toContain("field: mood");

        notes = read;
        idx.finish();
        expect(noticeOf(modal)).toBeNull();
        expect(pick(modal, "heatmap", inserted)).toContain("field: mood");
    });

    it("a choice taken from the list drawn before the refit pastes the refitted example", () => {
        const { editor: ed, inserted } = editor();
        const idx = index(true);
        let notes = unread;
        const modal = new InsertBlockModal(app, ed, () => notes, undefined, idx);
        const stale = modal.getSuggestions("heat")[0];
        if (!stale) throw new Error("no heatmap in the list");

        notes = read;
        idx.finish();
        modal.onChooseSuggestion(stale);
        expect(inserted[0]).toContain("field: mood");
    });

    it("a note queued as indexing ends keeps the line up and waits again", () => {
        const { editor: ed } = editor();
        let busy = true;
        const waits: Array<() => void> = [];
        const modal = new InsertBlockModal(app, ed, () => unread, undefined, {
            ready: () => !busy,
            whenReady: (done) => { waits.push(done); },
        });
        waits.shift()?.();
        expect(noticeOf(modal)).not.toBeNull();
        expect(waits).toHaveLength(1);

        busy = false;
        waits.shift()?.();
        expect(noticeOf(modal)).toBeNull();
    });

    it("a modal closed before indexing ends is left alone", () => {
        const { editor: ed } = editor();
        const idx = index(true);
        let asked = 0;
        const modal = new InsertBlockModal(app, ed, () => { asked++; return unread; }, undefined, idx);
        modal.close();
        idx.finish();
        expect(asked).toBe(1);
        expect(noticeOf(modal)).not.toBeNull();
    });

    it("the fence name is kept through the refit", () => {
        const { editor: ed, inserted } = editor();
        const idx = index(true);
        const modal = new InsertBlockModal(app, ed, () => read, (name) => (name === "chart" ? "dashy-chart" : name), idx);
        idx.finish();
        expect(modal.getSuggestions("dashy-chart").map((c) => c.name)).toEqual(["dashy-chart"]);
        expect(pick(modal, "dashy-chart", inserted)).toMatch(/^```dashy-chart\n/);
    });
});
