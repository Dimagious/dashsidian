/**
 * Classifies a tile's `image:` value without touching the vault.
 *
 * Three shapes are accepted: a bare vault path (`Attachments/gym.jpg`), a
 * wikilink naming one (`[[gym.jpg]]`, an alias after `|` is ignored since a
 * cover has no caption of its own), and an `https://` URL. Anything else,
 * including a plain `http://` URL, is refused: `adapters/vault.ts` resolves
 * the vault-path case, the block draws the URL case as is, and the block
 * warns and skips the image for everything this function calls invalid.
 */
export type ImageRef =
    | { kind: "vault"; path: string }
    | { kind: "url"; url: string }
    | { kind: "invalid"; value: string };

const WIKILINK = /^\[\[(.*)\]\]$/;
/** Any `scheme://`, so `http://`, `ftp://` and the rest are told apart from a
 * bare vault path without hand-picking every scheme that is not `https`. */
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

export function classifyImage(raw: string): ImageRef {
    const trimmed = raw.trim();
    if (!trimmed) return { kind: "invalid", value: raw };

    const wikilink = WIKILINK.exec(trimmed);
    if (wikilink) {
        const inner = (wikilink[1] ?? "").split("|")[0]?.trim() ?? "";
        return inner ? { kind: "vault", path: inner } : { kind: "invalid", value: raw };
    }

    if (/^https:\/\//i.test(trimmed)) return { kind: "url", url: trimmed };
    if (SCHEME.test(trimmed)) return { kind: "invalid", value: raw };

    return { kind: "vault", path: trimmed };
}
