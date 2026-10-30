/**
 * A block in a template note (B-190). A weekly review template holds
 * `period: note`, and its own name, `Weekly review`, is no period: the block
 * would draw an error to everyone who opens the template, though the
 * template is right and every review made from it works. Inside the
 * vault's template folder that one error becomes a quiet hint in place of
 * the values, every other diagnostic still drawn above it;
 * anywhere else it stays an error, since a review note named with a typo
 * must still say so. Pure layer: the folders come from
 * `adapters/templates.ts`.
 */

import { readPeriodValue, type PeriodContext } from "./period";
import { asItems, isRecord } from "../shared/parse";

/** A folder setting as a vault path: no surrounding space, no leading, trailing or doubled slashes. */
function normalizeFolder(folder: string): string {
    return folder.trim().replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * Whether the note at `path` sits in one of `folders` or below it. Compared
 * as written, case included, the way vault paths are; a blank folder, or
 * the vault root, names no template folder, or every note would be one.
 * `Templates` covers `Templates/Weekly.md` and `Templates/Reviews/Weekly.md`,
 * not `Templates-old/Weekly.md`.
 */
export function isInTemplateFolder(path: string, folders: readonly string[]): boolean {
    return folders.some((raw) => {
        const folder = normalizeFolder(raw);
        return folder !== "" && path.startsWith(`${folder}/`);
    });
}

/** `note`, the way `readPeriodValue` reads it: case and surrounding space aside. */
function isNoteValue(raw: unknown): boolean {
    return typeof raw === "string" && raw.trim().toLowerCase() === "note";
}

/**
 * Whether the block should draw the template hint in place of its values,
 * after its diagnostics: it sits in a template folder
 * (`context.inTemplateFolder`), writes `key: note` on its root or on any of
 * its items, and the note's own name stands for no period, which
 * `readPeriodValue` then reads as `template` rather than as a problem. A
 * template named like a period, `2026-W40`, draws as usual.
 * `key` is `period` for `stats`, `progress` and `tiles`, `range` for
 * `heatmap` and `chart`.
 */
export function showsTemplateHint(value: unknown, key: "period" | "range", context: PeriodContext): boolean {
    if (context.inTemplateFolder !== true) return false;
    const written = (isRecord(value) && isNoteValue(value[key])) || asItems(value).some((item) => isNoteValue(item[key]));
    return written && readPeriodValue("note", key, context).template === true;
}
