import { describe, it, expect } from "vitest";
import { RenameTrail } from "./renames";

describe("RenameTrail (B-129)", () => {
    it("a note never renamed is where it was", () => {
        expect(new RenameTrail().current("Weekly/2026-W4.md")).toBe("Weekly/2026-W4.md");
    });

    it("follows a rename, and a chain of them", () => {
        const trail = new RenameTrail();
        trail.renamed("Weekly/2026-W4.md", "Weekly/2026-W40.md");
        expect(trail.current("Weekly/2026-W4.md")).toBe("Weekly/2026-W40.md");
        trail.renamed("Weekly/2026-W40.md", "Reviews/2026-W40.md");
        expect(trail.current("Weekly/2026-W4.md")).toBe("Reviews/2026-W40.md");
        expect(trail.current("Weekly/2026-W40.md")).toBe("Reviews/2026-W40.md");
    });

    it("a note renamed back is current again under its first name, and no trail loops", () => {
        const trail = new RenameTrail();
        trail.renamed("a.md", "b.md");
        trail.renamed("b.md", "a.md");
        expect(trail.current("a.md")).toBe("a.md");
        expect(trail.current("b.md")).toBe("a.md");
        trail.renamed("a.md", "b.md");
        expect(trail.current("a.md")).toBe("b.md");
        expect(trail.current("b.md")).toBe("b.md");
    });

    it("a note created where one was renamed away from is its own, not the renamed one (template re-creates W40)", () => {
        const trail = new RenameTrail();
        trail.renamed("Weekly/2026-W40.md", "Weekly/2026-W41.md");
        expect(trail.current("Weekly/2026-W40.md")).toBe("Weekly/2026-W41.md");
        trail.created("Weekly/2026-W40.md");
        expect(trail.current("Weekly/2026-W40.md")).toBe("Weekly/2026-W40.md");
        expect(trail.current("Weekly/2026-W41.md")).toBe("Weekly/2026-W41.md");
    });

    it("keeps one entry per path left, however long the chain", () => {
        const trail = new RenameTrail();
        trail.renamed("a.md", "b.md");
        trail.renamed("b.md", "c.md");
        trail.renamed("c.md", "d.md");
        expect(["a.md", "b.md", "c.md", "d.md"].map((p) => trail.current(p))).toEqual(["d.md", "d.md", "d.md", "d.md"]);
        trail.created("a.md");
        expect(trail.current("a.md")).toBe("a.md");
        expect(trail.current("b.md")).toBe("d.md");
    });

    it("a rename onto itself changes nothing", () => {
        const trail = new RenameTrail();
        trail.renamed("a.md", "a.md");
        expect(trail.current("a.md")).toBe("a.md");
    });
});
