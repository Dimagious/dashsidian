/**
 * Obsidian extends HTMLElement.prototype with its own DOM helpers, and every
 * block is written against them. jsdom has none, so mount tests install the
 * same surface here — once, through vitest `setupFiles`.
 *
 * Only the helpers the plugin actually calls are implemented. A missing one
 * should fail loudly in a test rather than be quietly faked.
 */

interface DomElementInfo {
    cls?: string | string[];
    text?: string;
    href?: string;
    title?: string;
    attr?: Record<string, string | number | boolean>;
}

function apply(el: HTMLElement, o: DomElementInfo = {}): HTMLElement {
    if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
    if (o.text !== undefined) el.textContent = o.text;
    if (o.href !== undefined) el.setAttribute("href", o.href);
    if (o.title !== undefined) el.setAttribute("title", o.title);
    if (o.attr) {
        for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, String(v));
    }
    return el;
}

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

proto.createEl = function (this: HTMLElement, tag: string, o?: DomElementInfo): HTMLElement {
    const el = this.ownerDocument.createElement(tag);
    apply(el, o);
    this.appendChild(el);
    return el;
};

proto.createDiv = function (this: HTMLElement, o?: DomElementInfo): HTMLElement {
    return (this as unknown as { createEl: (t: string, o?: DomElementInfo) => HTMLElement })
        .createEl("div", o);
};

proto.createSpan = function (this: HTMLElement, o?: DomElementInfo): HTMLElement {
    return (this as unknown as { createEl: (t: string, o?: DomElementInfo) => HTMLElement })
        .createEl("span", o);
};

proto.setText = function (this: HTMLElement, text: string): void {
    this.textContent = text;
};

proto.setAttr = function (this: HTMLElement, name: string, value: string | number): void {
    this.setAttribute(name, String(value));
};

proto.appendText = function (this: HTMLElement, text: string): void {
    this.appendChild(this.ownerDocument.createTextNode(text));
};

proto.empty = function (this: HTMLElement): void {
    while (this.firstChild) this.removeChild(this.firstChild);
};

proto.addClass = function (this: HTMLElement, ...classes: string[]): void {
    this.classList.add(...classes);
};
