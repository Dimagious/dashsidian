/**
 * Links out of the plugin: a prefilled issue, and a block to paste. Pure layer.
 */

export const REPO_URL = "https://github.com/Dimagious/dashsidian";
export const DOCS_URL = `${REPO_URL}#readme`;
export const FUNDING_URL = "https://buymeacoffee.com/dimagious";

export type IssueKind = "bug" | "feature";

export interface IssueContext {
    plugin: string;
    obsidian: string;
    platform: string;
}

/**
 * A GitHub issue with the versions already filled in.
 *
 * A report that arrives without them costs a round trip to ask, and the
 * answer is usually "I don't remember which version that was".
 */
export function buildIssueUrl(kind: IssueKind, context: IssueContext): string {
    const title = kind === "bug" ? "Bug: " : "Feature: ";
    const body = kind === "bug"
        ? [
            "### What happened",
            "",
            "",
            "### What you expected",
            "",
            "",
            "### The block that did it",
            "",
            "```",
            "",
            "```",
            "",
            environment(context),
        ].join("\n")
        : ["### What you would like to do", "", "", "### Why", "", "", environment(context)].join("\n");

    const query = new URLSearchParams({ title, body, labels: kind });
    return `${REPO_URL}/issues/new?${query.toString()}`;
}

function environment(context: IssueContext): string {
    return [
        "### Versions",
        "",
        `- Dashy ${context.plugin}`,
        `- Obsidian ${context.obsidian}`,
        `- ${context.platform}`,
    ].join("\n");
}

/** A fenced block, ready to drop into a note. */
export function blockSnippet(name: string, example: string): string {
    return `\`\`\`${name}\n${example.trimEnd()}\n\`\`\`\n`;
}
