import { describe, it, expect, afterEach } from "vitest";
import { renderCountdown } from "./countdown";
import { setLocale } from "../i18n";
import { mockApp, host, texts, nodes, diagnostics } from "../test/vault";

const app = mockApp();
afterEach(() => setLocale("en"));

/** A date key `days` away from today, so the specs never go stale. */
function shifted(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

const cards = (config: string) => {
    const el = host();
    renderCountdown(app, config, el);
    return el;
};

describe("countdown — counting in both directions", () => {
    it("a date ahead counts down", () => {
        const el = cards(`items:\n  - { label: Race, date: ${shifted(54)} }`);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["54"]);
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["days left"]);
    });

    it("a date behind counts up instead of vanishing", () => {
        const el = cards(`items:\n  - { label: Was, date: ${shifted(-3)} }`);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["3"]);
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["days ago"]);
        expect(nodes(el, ".dashy-countdown-card")[0]?.className).toContain("is-past");
    });

    it("today is named, not counted as zero", () => {
        const el = cards(`items:\n  - { label: Now, date: ${shifted(0)} }`);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["Today"]);
        expect(texts(el, ".dashy-countdown-unit")).toHaveLength(0);
        expect(nodes(el, ".dashy-countdown-card")[0]?.className).toContain("is-today");
    });

    it("tomorrow takes the singular", () => {
        const el = cards(`items:\n  - { label: Soon, date: ${shifted(1)} }`);
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["day left"]);
    });

    it("a card ahead is marked as such", () => {
        const el = cards(`items:\n  - { label: Race, date: ${shifted(10)} }`);
        expect(nodes(el, ".dashy-countdown-card")[0]?.className).toContain("is-ahead");
    });

    it("label, icon, sub and the date itself are all shown", () => {
        const el = cards(`items:\n  - { label: Race, date: ${shifted(5)}, icon: 🏊, sub: half }`);
        expect(texts(el, ".dashy-countdown-label")).toEqual(["Race"]);
        expect(texts(el, ".dashy-countdown-icon")).toEqual(["🏊"]);
        expect(texts(el, ".dashy-countdown-sub")).toEqual(["half"]);
        expect(texts(el, ".dashy-countdown-date")[0]).not.toBe("");
    });

    it("the date is written the way the language writes it", () => {
        const el = cards("items:\n  - { label: Race, date: 2026-11-15 }");
        // Month names come from Obsidian's moment, so the key is not echoed back.
        expect(texts(el, ".dashy-countdown-date")[0]).not.toBe("2026-11-15");
        expect(texts(el, ".dashy-countdown-date")[0]).toContain("2026");
    });
});

describe("countdown — plural forms follow the language", () => {
    it("Russian picks one, few and many", () => {
        setLocale("ru");
        const el = cards(`items:
  - { label: A, date: ${shifted(1)} }
  - { label: B, date: ${shifted(3)} }
  - { label: C, date: ${shifted(11)} }`);
        expect(texts(el, ".dashy-countdown-unit"))
            .toEqual(["день остался", "дня осталось", "дней осталось"]);
    });

    it("English splits one from the rest", () => {
        const el = cards(`items:
  - { label: A, date: ${shifted(1)} }
  - { label: B, date: ${shifted(3)} }`);
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["day left", "days left"]);
    });
});

describe("countdown — edges", () => {
    it("a date in the wrong shape errors and the card is marked broken", () => {
        const el = cards("items:\n  - { label: Broken, date: 15.11.2026 }");
        expect(diagnostics(el, "error")[0]).toContain("YYYY-MM-DD");
        const card = nodes(el, ".dashy-countdown-card")[0];
        expect(card?.className).toContain("is-broken");
        expect(texts(el, ".dashy-countdown-value")).toEqual(["—"]);
    });

    it("a date that does not exist is refused", () => {
        const el = cards("items:\n  - { label: Nope, date: 2026-02-31 }");
        expect(diagnostics(el, "error")).toHaveLength(1);
    });

    it("a missing date names the card that is missing it", () => {
        const el = cards("items:\n  - { label: Holiday }");
        expect(diagnostics(el, "error")[0]).toContain("Holiday");
    });

    it("one broken card does not take the others down", () => {
        const el = cards(`items:
  - { label: Fine, date: ${shifted(7)} }
  - { label: Broken, date: soon }
  - { label: Also fine, date: ${shifted(2)} }`);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["7", "—", "2"]);
    });

    it("columns are clamped to what fits", () => {
        const el = cards(`columns: 12\nitems:\n  - { label: A, date: ${shifted(1)} }`);
        expect(nodes(el, ".dashy-countdown")[0]?.style.getPropertyValue("--dashy-countdown-columns")).toBe("6");
    });

    it("an empty block says so once", () => {
        const el = cards("   ");
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(nodes(el, ".dashy-countdown-card")).toHaveLength(0);
    });

    it("an unknown key warns with a suggestion", () => {
        const el = cards(`items:\n  - { label: A, dat: ${shifted(1)} }`);
        expect(diagnostics(el, "warning")[0]).toContain("date");
    });
});
