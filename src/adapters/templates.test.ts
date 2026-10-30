import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import { templateFolders } from "./templates";
import { periodContext } from "./periodic";
import { mockApp } from "../test/vault";

describe("templateFolders (B-190)", () => {
    const appWith = (host: unknown): App => host as App;

    it("reads the core Templates folder and Templater's, in that order", () => {
        const app = mockApp({ templates: { folder: "99-Meta/Templates" }, templater: { templates_folder: "Templater" } });
        expect(templateFolders(app)).toEqual(["99-Meta/Templates", "Templater"]);
    });

    it("reads either one alone", () => {
        expect(templateFolders(mockApp({ templates: { folder: "Templates" } }))).toEqual(["Templates"]);
        expect(templateFolders(mockApp({ templater: { templates_folder: "Templater" } }))).toEqual(["Templater"]);
    });

    it("no plugin, no settings, or settings of another shape: no folder, and no throw", () => {
        expect(templateFolders(mockApp())).toEqual([]);
        expect(templateFolders(appWith({}))).toEqual([]);
        expect(templateFolders(appWith({ internalPlugins: {}, plugins: {} }))).toEqual([]);
        expect(templateFolders(appWith({ internalPlugins: { plugins: { templates: { instance: null } } } }))).toEqual([]);
        expect(templateFolders(mockApp({ templates: "Templates", templater: ["Templater"] }))).toEqual([]);
        expect(templateFolders(mockApp({ templates: {}, templater: {} }))).toEqual([]);
        expect(templateFolders(mockApp({ templates: { folder: 7 }, templater: { templates_folder: null } }))).toEqual([]);
    });

    it("an unset folder comes back blank, which names no folder downstream", () => {
        const app = mockApp({ templates: { folder: "" } });
        expect(templateFolders(app)).toEqual([""]);
        expect(periodContext(app, "Weekly review.md").inTemplateFolder).toBeUndefined();
    });
});

describe("periodContext knows a note in a template folder (B-190)", () => {
    const app = mockApp({ templates: { folder: "99-Meta/Templates/" } });

    it("a note in the folder is marked; one elsewhere or beside it is not", () => {
        expect(periodContext(app, "99-Meta/Templates/Weekly-Review.md").inTemplateFolder).toBe(true);
        expect(periodContext(app, "Reviews/Weekly-Review.md").inTemplateFolder).toBeUndefined();
        expect(periodContext(app, "99-Meta/Templates-old/Weekly-Review.md").inTemplateFolder).toBeUndefined();
    });

    it("no note, no mark", () => {
        expect(periodContext(app).inTemplateFolder).toBeUndefined();
    });
});
