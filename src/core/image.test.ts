import { describe, it, expect } from "vitest";
import { classifyImage } from "./image";

describe("classifyImage", () => {
    it("a bare vault path is a vault reference", () => {
        expect(classifyImage("Attachments/gym.jpg")).toEqual({ kind: "vault", path: "Attachments/gym.jpg" });
    });

    it("a wikilink is a vault reference, brackets stripped", () => {
        expect(classifyImage("[[gym.jpg]]")).toEqual({ kind: "vault", path: "gym.jpg" });
    });

    it("a wikilink alias after | is dropped, only the path is kept", () => {
        expect(classifyImage("[[Attachments/gym.jpg|Gym photo]]"))
            .toEqual({ kind: "vault", path: "Attachments/gym.jpg" });
    });

    it("an https URL is a URL reference", () => {
        expect(classifyImage("https://example.com/gym.jpg"))
            .toEqual({ kind: "url", url: "https://example.com/gym.jpg" });
    });

    it("an http URL is refused, https only", () => {
        expect(classifyImage("http://example.com/gym.jpg"))
            .toEqual({ kind: "invalid", value: "http://example.com/gym.jpg" });
    });

    it("another scheme is refused", () => {
        expect(classifyImage("ftp://example.com/gym.jpg"))
            .toEqual({ kind: "invalid", value: "ftp://example.com/gym.jpg" });
    });

    it("an empty or blank value is refused", () => {
        expect(classifyImage("")).toEqual({ kind: "invalid", value: "" });
        expect(classifyImage("   ")).toEqual({ kind: "invalid", value: "   " });
    });

    it("an empty wikilink is refused", () => {
        expect(classifyImage("[[]]")).toEqual({ kind: "invalid", value: "[[]]" });
        expect(classifyImage("[[ ]]")).toEqual({ kind: "invalid", value: "[[ ]]" });
    });

    it("surrounding whitespace on a plain path is trimmed", () => {
        expect(classifyImage("  gym.jpg  ")).toEqual({ kind: "vault", path: "gym.jpg" });
    });
});
