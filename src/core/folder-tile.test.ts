import { describe, it, expect } from "vitest";
import { tileTarget, folderNoteCandidates, type PathKind } from "./folder-tile";

/** A lookup over explicit sets, the way the adapter answers it. */
function vault(files: string[], folders: string[]): (path: string) => PathKind {
    const f = new Set(files);
    const d = new Set(folders);
    return (path) => (f.has(path) ? "file" : d.has(path) ? "folder" : null);
}

describe("folderNoteCandidates", () => {
    it("inside the folder first, then next to it", () => {
        expect(folderNoteCandidates("01-Areas/Projects"))
            .toEqual(["01-Areas/Projects/Projects.md", "01-Areas/Projects.md"]);
    });

    it("a folder at the vault root has its sibling note at the root", () => {
        expect(folderNoteCandidates("00-Inbox")).toEqual(["00-Inbox/00-Inbox.md", "00-Inbox.md"]);
    });
});

describe("tileTarget", () => {
    it("a folder with a note inside opens that note", () => {
        const kindOf = vault(["00-Inbox/00-Inbox.md"], ["00-Inbox"]);
        expect(tileTarget("00-Inbox", kindOf)).toEqual({ kind: "note", path: "00-Inbox/00-Inbox.md" });
    });

    it("a folder with only a sibling note opens the sibling", () => {
        const kindOf = vault(["01-Areas/Sport.md"], ["01-Areas", "01-Areas/Sport"]);
        expect(tileTarget("01-Areas/Sport", kindOf)).toEqual({ kind: "note", path: "01-Areas/Sport.md" });
    });

    it("with both notes present, the one inside wins", () => {
        const kindOf = vault(["Projects/Projects.md", "Projects.md"], ["Projects"]);
        expect(tileTarget("Projects", kindOf)).toEqual({ kind: "note", path: "Projects/Projects.md" });
    });

    it("a folder without a note is a folder to reveal", () => {
        const kindOf = vault(["00-Inbox/a.md"], ["00-Inbox"]);
        expect(tileTarget("00-Inbox", kindOf)).toEqual({ kind: "folder", path: "00-Inbox" });
    });

    it("a trailing slash names the same folder", () => {
        const kindOf = vault(["00-Inbox/00-Inbox.md"], ["00-Inbox"]);
        expect(tileTarget("00-Inbox/", kindOf)).toEqual({ kind: "note", path: "00-Inbox/00-Inbox.md" });
        expect(tileTarget("00-Inbox//", vault([], ["00-Inbox"]))).toEqual({ kind: "folder", path: "00-Inbox" });
    });

    it("a candidate that is itself a folder is not a folder note", () => {
        const kindOf = vault([], ["X", "X/X.md"]);
        expect(tileTarget("X", kindOf)).toEqual({ kind: "folder", path: "X" });
    });

    it("a note is linked as given", () => {
        const kindOf = vault(["01-Areas/Sport/run.md"], ["01-Areas", "01-Areas/Sport"]);
        expect(tileTarget("01-Areas/Sport/run.md", kindOf))
            .toEqual({ kind: "link", path: "01-Areas/Sport/run.md" });
    });

    it("a path that does not exist is linked as given, untouched", () => {
        expect(tileTarget("Ideas/new idea/", vault([], []))).toEqual({ kind: "link", path: "Ideas/new idea/" });
    });

    it("a path made only of slashes is linked as given, never looked up", () => {
        const asked: string[] = [];
        const kindOf = (p: string): PathKind => { asked.push(p); return "folder"; };
        expect(tileTarget("/", kindOf)).toEqual({ kind: "link", path: "/" });
        expect(asked).toEqual([]);
    });
});
