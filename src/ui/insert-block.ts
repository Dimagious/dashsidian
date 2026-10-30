import { SuggestModal, type App, type Editor } from "obsidian";
import type { NoteRecord } from "../core/source";
import { profileVault, fitExample } from "../core/vault-profile";
import { blockSnippet } from "../core/feedback";
import { t, type MessageKey } from "../i18n";
import schema from "../blocks/schema.json";

interface BlockChoice {
    /** the code block name to write: `dashy-chart` when `chart` belongs to Obsidian Charts */
    name: string;
    what: string;
    example: string;
}

/**
 * The way in for someone who does not write YAML from memory.
 *
 * Every example comes from `schema.json`, the same file the validator and the
 * agent reference are built from, so what gets pasted is what the block
 * accepts. A second set of samples kept by hand would be wrong within a
 * release.
 */
function choices(notes: readonly NoteRecord[], fence: (name: string) => string): BlockChoice[] {
    const blocks = schema.blocks as unknown as Record<string, { example: string }>;
    // Fitted to this vault, so the first block shows the reader's own numbers
    // rather than a zero counted from a folder that is not here.
    const profile = profileVault(notes);
    return Object.entries(blocks).map(([name, block]) => ({
        name: fence(name),
        what: t(`block.${name}` as MessageKey),
        example: fitExample(block.example, profile),
    }));
}

/**
 * Whether Obsidian has read the vault's frontmatter yet, and how to hear when
 * it has (B-181). The plugin passes its `IndexGate`, so the modal and the
 * blocks agree on "ready".
 */
export interface IndexState {
    ready: () => boolean;
    whenReady: (done: () => void) => void;
}

export class InsertBlockModal extends SuggestModal<BlockChoice> {
    private offered: BlockChoice[];
    private notice: HTMLElement | null = null;
    private closed = false;

    /**
     * `notes` is asked again once indexing is done: on a cold start the first
     * snapshot has every note but no frontmatter, so the examples fall back to
     * the schema's own folder and field until then.
     */
    constructor(
        app: App,
        private readonly editor: Editor,
        private readonly notes: () => readonly NoteRecord[],
        private readonly fence: (name: string) => string = (name) => name,
        private readonly index: IndexState = { ready: () => true, whenReady: (done) => done() },
    ) {
        super(app);
        // Asked before the snapshot is taken: the gate drops a mid-index
        // snapshot as it opens.
        const ready = index.ready();
        this.offered = choices(notes(), fence);
        this.setPlaceholder(t("insert.placeholder"));
        if (!ready) this.waitForIndex();
    }

    onClose(): void {
        super.onClose();
        this.closed = true;
    }

    /** One quiet line above the list, and a refit of the examples once the vault is read. */
    private waitForIndex(): void {
        const notice = this.modalEl.createDiv({ cls: "dashy-notice", text: t("insert.indexing") });
        this.modalEl.insertBefore(notice, this.resultContainerEl);
        this.notice = notice;
        this.index.whenReady(() => this.indexed());
    }

    private indexed(): void {
        if (this.closed) return;
        // A note queued in between: keep the line up and wait again.
        if (!this.index.ready()) {
            this.index.whenReady(() => this.indexed());
            return;
        }
        this.offered = choices(this.notes(), this.fence);
        this.notice?.remove();
        this.notice = null;
    }

    getSuggestions(query: string): BlockChoice[] {
        const needle = query.trim().toLowerCase();
        if (!needle) return this.offered;
        return this.offered.filter(
            (c) => c.name.includes(needle) || c.what.toLowerCase().includes(needle),
        );
    }

    renderSuggestion(choice: BlockChoice, el: HTMLElement): void {
        el.createDiv({ cls: "dashy-suggest-name", text: choice.name });
        el.createDiv({ cls: "dashy-suggest-what", text: choice.what });
    }

    onChooseSuggestion(choice: BlockChoice): void {
        // The list on screen may predate the refit: take the example by name.
        const current = this.offered.find((c) => c.name === choice.name) ?? choice;
        this.editor.replaceSelection(blockSnippet(current.name, current.example));
    }
}
