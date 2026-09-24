/**
 * Fitting an example to the vault it is about to land in. Pure layer.
 *
 * The examples in the schema name folders and properties from the vault they
 * were written in: `Diary`, `sleep_score`, `01-Areas`. In anyone else's vault
 * the first block a newcomer inserts counts nothing and shows a zero, with
 * nothing on screen to say that the folder in it does not exist.
 */

import type { NoteRecord } from "./source";
import { numberAt, isBooleanMark } from "./aggregate";

export interface VaultProfile {
    /** the folder holding the most notes, or null for a vault with none */
    folder: string | null;
    /** the numeric frontmatter property found in the most notes */
    field: string | null;
}

/**
 * The keys whose value names a place in the vault, and the keys whose value
 * names a property. Rewriting by key rather than by a list of sample names
 * means there is no vocabulary to drift out of step with the examples: in an
 * example, every value after one of these is by definition the author's.
 */
const FOLDER_KEYS = /\b(source|folder|from|path)(\s*:\s*)([^,}\n]+)/g;
const FIELD_KEYS = /\b(field|property|prop)(\s*:\s*)([^,}\n]+)/g;

export function profileVault(notes: readonly NoteRecord[]): VaultProfile {
    const byFolder = new Map<string, number>();
    const byField = new Map<string, number>();

    for (const note of notes) {
        if (note.folder) byFolder.set(note.folder, (byFolder.get(note.folder) ?? 0) + 1);
        for (const key of Object.keys(note.frontmatter)) {
            // A checkbox counts as data everywhere else now, but not as the
            // example field: `field: gym` painting itself into a stranger's
            // vault the moment they have one habit checkbox reads as a
            // fluke, and `bands: [90, 80, 60]` over a 1/0 value is nonsense.
            // A real number is still the honest guess for "what field".
            if (isBooleanMark(note, key)) continue;
            if (numberAt(note, key) !== null) byField.set(key, (byField.get(key) ?? 0) + 1);
        }
    }

    return { folder: mostCommon(byFolder), field: mostCommon(byField) };
}

/** Ties break alphabetically, so the same vault always yields the same example. */
function mostCommon(counts: Map<string, number>): string | null {
    let best: string | null = null;
    let bestCount = 0;
    for (const [name, count] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (count > bestCount) {
            best = name;
            bestCount = count;
        }
    }
    return best;
}

/**
 * Rewrites an example to point at this vault.
 *
 * Only the values are touched, never the labels around them: replacing the
 * text `Books` everywhere turned "Books this year" into "Journal this year".
 * What a profile cannot supply is left as written — a wrong-looking folder the
 * user can see and edit beats a silent zero.
 */
export function fitExample(example: string, profile: VaultProfile): string {
    let out = example;
    if (profile.folder) {
        out = out.replace(FOLDER_KEYS, (_m, key: string, sep: string) => `${key}${sep}${profile.folder}`);
    }
    if (profile.field) {
        out = out.replace(FIELD_KEYS, (_m, key: string, sep: string) => `${key}${sep}${profile.field}`);
    }
    return out;
}
