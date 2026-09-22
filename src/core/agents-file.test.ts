import { describe, it, expect } from "vitest";
import { upsertManagedSection, hasManagedSection } from "./agents-file";

const markers = { begin: "<!-- dashy:begin -->", end: "<!-- dashy:end -->" };
const section = `${markers.begin}\nours\n${markers.end}`;

describe("upsertManagedSection", () => {
    it("an absent file becomes the section", () => {
        expect(upsertManagedSection(null, section, markers)).toBe(`${section}\n`);
    });

    it("an empty file becomes the section too", () => {
        expect(upsertManagedSection("   \n\n", section, markers)).toBe(`${section}\n`);
    });

    it("a file that is not ours keeps everything and gains the section", () => {
        const result = upsertManagedSection("# Their rules\n\nDo the thing.\n", section, markers);
        expect(result).toContain("# Their rules");
        expect(result).toContain("Do the thing.");
        expect(result).toContain("ours");
    });

    it("an update replaces only what is between the markers", () => {
        const before = `# Theirs\n\n${markers.begin}\nold\n${markers.end}\n\n## After\n`;
        const after = upsertManagedSection(before, `${markers.begin}\nnew\n${markers.end}`, markers);
        expect(after).toContain("# Theirs");
        expect(after).toContain("## After");
        expect(after).toContain("new");
        expect(after).not.toContain("old");
    });

    it("updating twice does not stack two sections", () => {
        const once = upsertManagedSection("# Theirs\n", section, markers);
        const twice = upsertManagedSection(once, section, markers);
        expect(twice.split(markers.begin)).toHaveLength(2);
        expect(twice).toBe(once);
    });

    it("text the user wrote around our section survives an update", () => {
        const before = `keep me before\n\n${markers.begin}\nold\n${markers.end}\nkeep me after\n`;
        const after = upsertManagedSection(before, section, markers);
        expect(after.startsWith("keep me before")).toBe(true);
        expect(after.endsWith("keep me after\n")).toBe(true);
    });

    it("a half-written fence is left alone rather than doubled", () => {
        const broken = `# Theirs\n\n${markers.begin}\nsomeone deleted the end marker\n`;
        expect(upsertManagedSection(broken, section, markers)).toBe(broken);
    });

    it("markers in the wrong order are treated as broken, not as a range", () => {
        const inverted = `${markers.end}\nwhat\n${markers.begin}\n`;
        expect(upsertManagedSection(inverted, section, markers)).toBe(inverted);
    });
});

describe("hasManagedSection", () => {
    it("knows a file it has written before", () => {
        expect(hasManagedSection(`a\n${section}\nb`, markers)).toBe(true);
    });

    it("and one it has not", () => {
        expect(hasManagedSection("# Theirs\n", markers)).toBe(false);
        expect(hasManagedSection(null, markers)).toBe(false);
        expect(hasManagedSection("", markers)).toBe(false);
    });

    it("a half-written fence does not count", () => {
        expect(hasManagedSection(`${markers.begin}\nno end`, markers)).toBe(false);
    });
});
