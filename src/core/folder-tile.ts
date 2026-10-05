/**
 * Where a `tiles` tile leads when its `path` may be a folder (B-144).
 *
 * A folder is not something Obsidian's link handling can open: a plain
 * internal link to `00-Inbox` reads as unresolved and, clicked, creates an
 * empty `00-Inbox/00-Inbox.md`. So a folder tile opens the folder's note
 * when it has one, and otherwise asks for the folder to be shown in the file
 * explorer. Anything else, a note or a path that does not exist at all, is
 * linked exactly as before.
 *
 * Pure: the vault is asked through `kindOf`, which `adapters/vault.ts`
 * answers.
 */
export type PathKind = "file" | "folder" | null;

export type TileTarget =
    /** a folder note that exists; linked like any other note */
    | { kind: "note"; path: string }
    /** a folder without a note; shown in the file explorer, never linked */
    | { kind: "folder"; path: string }
    /** not a folder; the tile's own `path`, unchanged */
    | { kind: "link"; path: string };

export function tileTarget(path: string, kindOf: (path: string) => PathKind): TileTarget {
    // `00-Inbox/` names the same folder as `00-Inbox`.
    const folder = path.replace(/\/+$/, "");
    if (!folder || kindOf(folder) !== "folder") return { kind: "link", path };

    for (const candidate of folderNoteCandidates(folder)) {
        if (kindOf(candidate) === "file") return { kind: "note", path: candidate };
    }
    return { kind: "folder", path: folder };
}

/**
 * The two places a folder note is kept by convention, in the order they are
 * tried: inside the folder (`Projects/Projects.md`), then next to it
 * (`Projects.md` beside `Projects/`).
 */
export function folderNoteCandidates(folder: string): [string, string] {
    const slash = folder.lastIndexOf("/");
    const name = folder.slice(slash + 1);
    const parent = slash === -1 ? "" : folder.slice(0, slash + 1);
    return [`${folder}/${name}.md`, `${parent}${name}.md`];
}
