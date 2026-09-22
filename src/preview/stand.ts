/**
 * The preview stand: every block, in every state, without launching Obsidian.
 *
 * Built for the turnaround, not as a substitute for the real thing — the CSS
 * that ships is the CSS loaded here, and the Obsidian variables it derives from
 * are declared on `body`, exactly as a theme declares them. A stand that faked
 * those would hide the one class of bug it exists to catch.
 */

// The same shim the unit tests install: Obsidian puts these helpers on
// HTMLElement.prototype and every block is written against them. Two copies of
// it would drift, and the stand has to run the code that ships.
import "../test/setup-dom";

import { setLocale, AVAILABLE_LOCALES } from "../i18n";
import { CASES } from "./cases";
import { BLOCKS, fakeVault, previewContext, withDates } from "./fixture";

const ctx = previewContext(fakeVault());

function draw(): void {
    const root = document.querySelector("#cases");
    if (!(root instanceof HTMLElement)) return;
    root.textContent = "";

    for (const item of CASES) {
        const section = root.createDiv({ cls: "case" });
        section.createDiv({ cls: "case-title", text: item.title });

        const source = withDates(item.source);
        section.createEl("pre", { cls: "case-source", text: "```" + item.block + "\n" + source + "\n```" });

        const mount = section.createDiv({ cls: "case-render" });
        BLOCKS[item.block]?.(ctx, source, mount);
    }
}

function bind(id: string, onPick: (value: string) => void): void {
    const el = document.querySelector(id);
    if (el instanceof HTMLSelectElement) {
        onPick(el.value);
        el.addEventListener("change", () => onPick(el.value));
    }
}

const locales = document.querySelector("#locale");
if (locales instanceof HTMLSelectElement) {
    for (const code of AVAILABLE_LOCALES) {
        locales.createEl("option", { text: code, attr: { value: code } });
    }
}

bind("#theme", (value) => {
    document.body.dataset.theme = value;
});
bind("#locale", (value) => {
    setLocale(value);
    draw();
});

draw();
