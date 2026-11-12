/**
 * The preview stand: every block, in every state, without launching Obsidian.
 *
 * Built for the turnaround, not as a substitute for the real thing — the CSS
 * that ships is the CSS loaded here, and the Obsidian variables it derives from
 * are declared on `body`, exactly as a theme declares them. A stand that faked
 * those would hide the one class of bug it exists to catch.
 */

// The kit's Obsidian DOM helpers, the same ones the unit tests install:
// Obsidian puts them on HTMLElement.prototype and every block is written
// against them. Two copies would drift, and the stand has to run the code that
// ships.
import "obsidian-plugin-dev-kit/vitest/dom/setup";

import { setLocale, AVAILABLE_LOCALES } from "../i18n";
import { CASES } from "./cases";
import { BLOCKS, fakeVault, previewContext, withDates } from "./fixture";

const ctx = previewContext(fakeVault());
// What the blocks hand back to stop their timers and observers; run before
// the stand is drawn again, or a ticking clock outlives its mount.
let disposers: (() => void)[] = [];

function draw(): void {
    const root = activeDocument.querySelector("#cases");
    if (!root?.instanceOf(HTMLElement)) return;
    for (const dispose of disposers) dispose();
    disposers = [];
    root.textContent = "";

    for (const item of CASES) {
        const section = root.createDiv({ cls: "case" });
        section.createDiv({ cls: "case-title", text: item.title });

        const source = withDates(item.source);
        section.createEl("pre", { cls: "case-source", text: "```" + item.block + "\n" + source + "\n```" });

        const mount = section.createDiv({ cls: "case-render" });
        const dispose = BLOCKS[item.block]?.(item.note === undefined ? ctx : { ...ctx, sourcePath: item.note }, source, mount);
        if (typeof dispose === "function") disposers.push(dispose);
    }
}

function bind(id: string, onPick: (value: string) => void): void {
    const el = activeDocument.querySelector(id);
    if (el?.instanceOf(HTMLSelectElement)) {
        onPick(el.value);
        el.addEventListener("change", () => onPick(el.value));
    }
}

const locales = activeDocument.querySelector("#locale");
if (locales?.instanceOf(HTMLSelectElement)) {
    for (const code of AVAILABLE_LOCALES) {
        locales.createEl("option", { text: code, attr: { value: code } });
    }
}

bind("#theme", (value) => {
    activeDocument.body.dataset.theme = value;
});
bind("#locale", (value) => {
    setLocale(value);
    draw();
});

draw();
