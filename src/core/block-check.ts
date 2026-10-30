/**
 * The `Check blocks in this note` command (B-168), pure part: finding the
 * fenced code blocks of a note and writing what the blocks reported as a
 * Markdown file an agent reads. The blocks themselves are drawn by the app
 * layer, through the same draw functions the code block processors call, so
 * nothing here judges a config: it only finds the blocks and reports.
 *
 * The file is for an agent and is written in English; the diagnostics in it
 * are the ones the user sees, in the language the blocks speak.
 */

export interface FencedBlock {
    /** 1-based line of the opening fence in the note */
    line: number;
    /** the first word of the info string: `stats`, `dashy-chart`, `js` */
    lang: string;
    /** what a code block processor is handed: the lines between the fences */
    source: string;
}

/**
 * An opening fence after any blockquote markers: three or more backticks or
 * tildes, after spaces or a list item's marker (`- `, `* `, `+ `, `1. `), as
 * Obsidian draws a block nested in a list. The first group is everything
 * before the fence, whose width the block's lines lose.
 */
const FENCE = /^((?:[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)?[ \t]*)(`{3,}|~{3,})(.*)$/;

/** A closing fence: indented any amount, nothing after it. */
const CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

/** The blockquote markers a line starts with (`> `, `>> `), as a callout holds a block. */
const QUOTE = /^(?: {0,3}> ?)*/;

function quoteDepth(prefix: string): number {
    return (prefix.match(/>/g) ?? []).length;
}

/**
 * Every fenced code block of a note, in order, the way Obsidian reads them:
 * a block closes on a fence of the same character at least as long as the
 * one that opened it, and one never closed runs to the end of the note. A
 * block inside a callout (`> ```stats`) is found too, its lines without the
 * `>` markers. A fence inside another code block is its content, not a block.
 */
export function findFencedBlocks(text: string): FencedBlock[] {
    const lines = text.split(/\r?\n/);
    const out: FencedBlock[] = [];
    let open: OpenFence | null = null;

    for (const [i, raw] of lines.entries()) {
        const prefix = QUOTE.exec(raw)?.[0] ?? "";
        const depth = quoteDepth(prefix);
        const line = raw.slice(prefix.length);

        if (open) {
            // A callout that ends ends the block inside it.
            if (depth < open.depth) {
                out.push(close(open));
                open = null;
            } else {
                const marks = CLOSE.exec(line)?.[1] ?? "";
                if (marks[0] === open.char && marks.length >= open.length) {
                    out.push(close(open));
                    open = null;
                    continue;
                }
                open.body.push(stripIndent(line, open.indent));
                continue;
            }
        }

        const fence = FENCE.exec(line);
        if (!fence) continue;
        const marks = fence[2] ?? "";
        const info = fence[3] ?? "";
        // A backtick fence's info string may not hold a backtick: that line is inline code.
        if (marks[0] === "`" && info.includes("`")) continue;
        open = {
            line: i + 1,
            lang: info.trim().split(/\s+/)[0] ?? "",
            char: marks[0] ?? "`",
            length: marks.length,
            indent: (fence[1] ?? "").length,
            depth,
            body: [],
        };
    }

    if (open) out.push(close(open));
    return out;
}

interface OpenFence {
    line: number;
    lang: string;
    char: string;
    length: number;
    indent: number;
    depth: number;
    body: string[];
}

function close(open: OpenFence): FencedBlock {
    return { line: open.line, lang: open.lang, source: open.body.join("\n") };
}

/** Content lines lose as much leading space as the opening fence was indented by (a list marker counts), no more. */
function stripIndent(line: string, indent: number): string {
    let n = 0;
    while (n < indent && (line[n] === " " || line[n] === "\t")) n++;
    return line.slice(n);
}

export type FindingLevel = "error" | "warning" | "notice";

export interface Finding {
    level: FindingLevel;
    /** the text the user sees in the block */
    message: string;
    /** 1-based line inside the block, when the block named one */
    line?: number;
}

export interface CheckedBlock {
    /** 1-based line of the opening fence in the note */
    line: number;
    lang: string;
    /**
     * `checked`: drawn by Dashy and read back. `elsewhere`: a name Dashy
     * registers but another plugin draws in this vault (`chart` with
     * Obsidian Charts). `unknown`: a `dashy-` name Dashy does not have.
     */
    status: "checked" | "elsewhere" | "unknown";
    /** for `elsewhere`, the plugin that draws it, when known */
    owner?: string;
    findings: Finding[];
}

/** Which fences of a note are Dashy's to check, and which only look like it. */
export interface FenceTable {
    /** the names Dashy draws in this vault */
    drawn: ReadonlySet<string>;
    /** names Dashy has but leaves to another plugin here: name to plugin id, or null when the owner is not known */
    elsewhere: ReadonlyMap<string, string | null>;
}

/** The blocks of a note that are Dashy's, or look like Dashy's, each with the status the report gives it. */
export function dashyBlocks(blocks: readonly FencedBlock[], fences: FenceTable): { block: FencedBlock; status: CheckedBlock["status"]; owner?: string }[] {
    const out: { block: FencedBlock; status: CheckedBlock["status"]; owner?: string }[] = [];
    for (const block of blocks) {
        if (fences.drawn.has(block.lang)) {
            out.push({ block, status: "checked" });
        } else if (fences.elsewhere.has(block.lang)) {
            const owner = fences.elsewhere.get(block.lang);
            out.push(owner ? { block, status: "elsewhere", owner } : { block, status: "elsewhere" });
        } else if (/^dashy-/i.test(block.lang)) {
            out.push({ block, status: "unknown" });
        }
    }
    return out;
}

export interface BlockCheckReport {
    notePath: string;
    pluginVersion: string;
    schemaVersion: string;
    /** the language the diagnostics are in, as a locale code */
    language: string;
    /** YYYY-MM-DD */
    today: string;
    /** the names Dashy draws in this vault, for the unknown-fence line */
    drawn: readonly string[];
    blocks: readonly CheckedBlock[];
}

export interface CheckCounts {
    blocks: number;
    errors: number;
    warnings: number;
}

/** An unknown `dashy-` fence counts as an error: nothing draws it, and the user sees plain code. */
export function countFindings(blocks: readonly CheckedBlock[]): CheckCounts {
    let errors = 0;
    let warnings = 0;
    for (const block of blocks) {
        if (block.status === "unknown") errors++;
        for (const f of block.findings) {
            if (f.level === "error") errors++;
            else if (f.level === "warning") warnings++;
        }
    }
    return { blocks: blocks.length, errors, warnings };
}

/** `1 block`, `2 blocks`: the report is English only. */
function count(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** One line of text in a list item, whatever the message held. */
function oneLine(text: string): string {
    return text.replace(/\s*\n\s*/g, " ").trim();
}

/** The report file, Markdown an agent reads top to bottom: a header, a section per block, a summary line. */
export function formatBlockCheck(report: BlockCheckReport): string {
    const out = [
        "# Dashy block check",
        "",
        `- Note: ${report.notePath}`,
        `- Checked: ${report.today}`,
        `- Plugin version: ${report.pluginVersion}`,
        `- Schema version: ${report.schemaVersion}`,
        `- Diagnostics language: ${report.language} (the messages are the ones the user sees in the note)`,
        "",
        "Run the command again after changing a block: this file is written only then.",
        "",
    ];

    if (!report.blocks.length) {
        out.push("No Dashy blocks in this note.", "");
    }

    report.blocks.forEach((block, i) => {
        out.push(`## Block ${i + 1}: \`${block.lang}\` at line ${block.line}`, "");
        if (block.status === "unknown") {
            out.push(
                `- error: \`${block.lang}\` is not a Dashy block, so the note shows it as plain code. Dashy blocks in this vault: ${report.drawn.map((n) => `\`${n}\``).join(", ")}.`,
                "",
            );
            return;
        }
        if (block.status === "elsewhere") {
            const by = block.owner ? `another plugin (${block.owner})` : "another plugin";
            out.push(
                `- notice: \`${block.lang}\` is drawn by ${by} in this vault, not by Dashy, so it was not checked. If it is meant for Dashy, write the fence as one of: ${report.drawn.map((n) => `\`${n}\``).join(", ")}.`,
                "",
            );
            return;
        }
        if (!block.findings.length) {
            out.push("ok", "");
            return;
        }
        for (const f of block.findings) {
            const where = f.line === undefined ? "" : `, line ${block.line + f.line} (block line ${f.line})`;
            out.push(`- ${f.level}${where}: ${oneLine(f.message)}`);
        }
        out.push("");
    });

    const counts = countFindings(report.blocks);
    out.push(`Summary: ${count(counts.blocks, "block")}, ${count(counts.errors, "error")}, ${count(counts.warnings, "warning")}.`, "");
    return out.join("\n");
}
