import { SuggestModal, type App, type Editor } from "obsidian";
import { blockSnippet } from "../core/feedback";
import { t, type MessageKey } from "../i18n";
import schema from "../blocks/schema.json";

interface BlockChoice {
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
function choices(): BlockChoice[] {
    const blocks = schema.blocks as unknown as Record<string, { example: string }>;
    return Object.entries(blocks).map(([name, block]) => ({
        name,
        what: t(`block.${name}` as MessageKey),
        example: block.example,
    }));
}

export class InsertBlockModal extends SuggestModal<BlockChoice> {
    constructor(app: App, private readonly editor: Editor) {
        super(app);
        this.setPlaceholder(t("insert.placeholder"));
    }

    getSuggestions(query: string): BlockChoice[] {
        const needle = query.trim().toLowerCase();
        if (!needle) return choices();
        return choices().filter(
            (c) => c.name.includes(needle) || c.what.toLowerCase().includes(needle),
        );
    }

    renderSuggestion(choice: BlockChoice, el: HTMLElement): void {
        el.createDiv({ cls: "dashy-suggest-name", text: choice.name });
        el.createDiv({ cls: "dashy-suggest-what", text: choice.what });
    }

    onChooseSuggestion(choice: BlockChoice): void {
        this.editor.replaceSelection(blockSnippet(choice.name, choice.example));
    }
}
