import { describe, it, expect } from "vitest";
import { buildIssueUrl, blockSnippet, REPO_URL } from "./feedback";

const context = { plugin: "1.0.0", obsidian: "1.13.7", platform: "macOS desktop" };

/** The body as GitHub will read it: a query string spells a space as `+`. */
const bodyOf = (url: string): string =>
    new URLSearchParams(url.split("?")[1] ?? "").get("body") ?? "";

describe("buildIssueUrl", () => {
    it("points at this repository's new-issue form", () => {
        expect(buildIssueUrl("bug", context).startsWith(`${REPO_URL}/issues/new?`)).toBe(true);
    });

    it("labels a bug and a feature differently", () => {
        expect(buildIssueUrl("bug", context)).toContain("labels=bug");
        expect(buildIssueUrl("feature", context)).toContain("labels=feature");
    });

    it("carries the versions, so nobody has to ask for them", () => {
        const body = bodyOf(buildIssueUrl("bug", context));
        expect(body).toContain("Dashy 1.0.0");
        expect(body).toContain("Obsidian 1.13.7");
        expect(body).toContain("macOS desktop");
    });

    it("a bug report asks for the block that caused it", () => {
        expect(bodyOf(buildIssueUrl("bug", context))).toContain("The block that did it");
    });

    it("a feature request asks why, not for a stack trace", () => {
        const body = bodyOf(buildIssueUrl("feature", context));
        expect(body).toContain("Why");
        expect(body).not.toContain("What happened");
    });

    it("everything is escaped, so a stray & does not truncate the body", () => {
        const url = buildIssueUrl("bug", { ...context, platform: "Windows & WSL" });
        expect(url).toContain("Windows+%26+WSL");
        expect(url.split("?")[1]?.split("&").filter((p) => p.startsWith("title=")))
            .toHaveLength(1);
    });
});

describe("blockSnippet", () => {
    it("fences the example under the block name", () => {
        expect(blockSnippet("tiles", "columns: 4")).toBe("```tiles\ncolumns: 4\n```\n");
    });

    it("keeps a multi-line example intact", () => {
        expect(blockSnippet("stats", "items:\n  - { label: A }"))
            .toBe("```stats\nitems:\n  - { label: A }\n```\n");
    });

    it("a trailing newline in the example does not double the blank line", () => {
        expect(blockSnippet("tiles", "columns: 4\n\n")).toBe("```tiles\ncolumns: 4\n```\n");
    });

    it("ends with a newline, so the next thing typed starts on its own line", () => {
        expect(blockSnippet("today", "daily: true").endsWith("```\n")).toBe(true);
    });
});
