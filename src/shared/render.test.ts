import { describe, it, expect } from "vitest";
import { renderDiagnostics, internalLink } from "./render";
import { host, texts, nodes } from "../test/vault";

describe("renderDiagnostics", () => {
    it("says nothing when there is nothing to say", () => {
        const el = host();
        renderDiagnostics(el, "tiles", []);
        expect(el.children).toHaveLength(0);
    });

    it("names the block, the level and the message", () => {
        const el = host();
        renderDiagnostics(el, "tiles", [{ level: "error", message: "Boom." }]);
        expect(texts(el, ".dashy-diag-error")).toEqual(["⛔ tiles: Boom."]);
    });

    it("warnings and errors are told apart by class, not only by wording", () => {
        const el = host();
        renderDiagnostics(el, "stats", [
            { level: "warning", message: "Hmm." },
            { level: "error", message: "Boom." },
        ]);
        expect(nodes(el, ".dashy-diag-warning")).toHaveLength(1);
        expect(nodes(el, ".dashy-diag-error")).toHaveLength(1);
    });

    it("a line number is carried into the message", () => {
        const el = host();
        renderDiagnostics(el, "tiles", [{ level: "error", message: "Boom.", line: 7 }]);
        expect(texts(el, ".dashy-diag")[0]).toContain("line 7");
    });

    it("every message gets its own row", () => {
        const el = host();
        renderDiagnostics(el, "tiles", [
            { level: "warning", message: "One." },
            { level: "warning", message: "Two." },
        ]);
        expect(nodes(el, ".dashy-diag")).toHaveLength(2);
    });
});

describe("internalLink", () => {
    it("builds a link Obsidian will intercept", () => {
        const el = host();
        const link = internalLink(el, "Diary/2026-01-01.md", "dashy-tile-link");
        expect(link.tagName).toBe("A");
        expect(link.className).toBe("dashy-tile-link internal-link");
        expect(link.getAttribute("data-href")).toBe("Diary/2026-01-01.md");
        expect(link.getAttribute("href")).toBe("Diary/2026-01-01.md");
    });

    it("is appended to the parent it was given", () => {
        const el = host();
        internalLink(el, "x.md", "cls");
        expect(el.children).toHaveLength(1);
    });
});
