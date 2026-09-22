/**
 * Putting our reference into a file the vault already owns. Pure layer.
 *
 * AGENTS.md is not ours: other tools write there, and so does the user. The
 * section is fenced by markers so an update can replace it without touching a
 * line around it — the alternative, rewriting the whole file, throws away
 * whatever else was in it.
 */

export interface ManagedSection {
    begin: string;
    end: string;
}

export function upsertManagedSection(
    existing: string | null,
    section: string,
    markers: ManagedSection,
): string {
    const body = section.trimEnd();
    if (!existing || !existing.trim()) return `${body}\n`;

    const from = existing.indexOf(markers.begin);
    const to = existing.indexOf(markers.end);

    // Both markers, in order: replace what is between them and keep the rest.
    if (from !== -1 && to !== -1 && to > from) {
        const head = existing.slice(0, from);
        const tail = existing.slice(to + markers.end.length);
        return `${head}${body}${tail}`;
    }

    // A half-written fence means someone edited inside ours; appending a second
    // section is wrong, so leave the file and say nothing was recognised.
    if (from !== -1 || to !== -1) return existing;

    return `${existing.trimEnd()}\n\n${body}\n`;
}

/** Whether our section is already in there — the caller offers update or install. */
export function hasManagedSection(existing: string | null, markers: ManagedSection): boolean {
    if (!existing) return false;
    const from = existing.indexOf(markers.begin);
    const to = existing.indexOf(markers.end);
    return from !== -1 && to !== -1 && to > from;
}
