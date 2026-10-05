import { describe, it, expect, afterEach, vi } from "vitest";
import { renderCountdown } from "./countdown";
import { setLocale } from "../i18n";
import { mockContext, host, texts, nodes, diagnostics } from "../test/vault";

const ctx = mockContext();
afterEach(() => setLocale("en"));

/** A date key `days` away from today, so the specs never go stale. */
function shifted(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

const cards = (config: string) => {
    const el = host();
    renderCountdown(ctx, config, el);
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

    it("a single date written without items still reads name as its label (B-125)", () => {
        const el = cards(`name: Trip\ndate: ${shifted(3)}`);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-countdown-label")).toEqual(["Trip"]);
    });

    it("an unknown key warns with a suggestion", () => {
        const el = cards(`items:\n  - { label: A, dat: ${shifted(1)} }`);
        expect(diagnostics(el, "warning")[0]).toContain("date");
    });
});

describe("countdown: repeat yearly (B-148)", () => {
    // 5 October 2026, held still so the ages below never drift.
    const TODAY = new Date(2026, 9, 5, 12, 0, 0);
    afterEach(() => vi.useRealTimers());

    const at = (config: string, vault = ctx) => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(TODAY);
        const el = host();
        renderCountdown(vault, config, el);
        return el;
    };

    it("counts to the next birthday and shows the years apart from their noun", () => {
        const el = at("items:\n  - { label: Anna, date: 1990-05-12, repeat: yearly }");
        expect(diagnostics(el, "error")).toEqual([]);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["219"]);
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["days left"]);
        expect(texts(el, ".dashy-countdown-date")).toEqual(["May 12, 2027"]);
        expect(texts(el, ".dashy-countdown-years-count")).toEqual(["37"]);
        expect(texts(el, ".dashy-countdown-years-unit")).toEqual(["years"]);
        expect(nodes(el, ".dashy-countdown-card")[0]?.className).toContain("is-ahead");
    });

    it("a birthday today reads Today, with the age it turns", () => {
        const el = at("items:\n  - { label: Anna, date: 1990-10-05, repeat: yearly }");
        expect(texts(el, ".dashy-countdown-value")).toEqual(["Today"]);
        expect(texts(el, ".dashy-countdown-years")).toEqual(["36 years"]);
        expect(nodes(el, ".dashy-countdown-card")[0]?.className).toContain("is-today");
    });

    it("a birthday yesterday is a year away, not a day ago", () => {
        const el = at("items:\n  - { label: Anna, date: 1990-10-04, repeat: yearly }");
        expect(texts(el, ".dashy-countdown-value")).toEqual(["364"]);
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["days left"]);
        expect(texts(el, ".dashy-countdown-years-count")).toEqual(["37"]);
    });

    it("the first anniversary takes the singular", () => {
        const el = at("items:\n  - { label: Wedding, date: 2025-12-01, repeat: yearly }");
        expect(texts(el, ".dashy-countdown-years")).toEqual(["1 year"]);
    });

    it("a date still ahead counts to itself and shows no years", () => {
        const el = at("items:\n  - { label: Due, date: 2027-03-01, repeat: yearly }");
        expect(texts(el, ".dashy-countdown-value")).toEqual(["147"]);
        expect(nodes(el, ".dashy-countdown-years")).toHaveLength(0);
    });

    it("without repeat a past date still counts up, unchanged", () => {
        const el = at("items:\n  - { label: Anna, date: 2026-10-04 }");
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["day ago"]);
        expect(nodes(el, ".dashy-countdown-years")).toHaveLength(0);
    });

    it("the user's sub comes first, then the years", () => {
        const el = at("items:\n  - { label: Anna, date: 1990-05-12, repeat: yearly, sub: buy flowers }");
        const card = nodes(el, ".dashy-countdown-card")[0];
        const subs = Array.from(card?.querySelectorAll(".dashy-countdown-sub") ?? [], (n) => n.textContent);
        expect(subs).toEqual(["buy flowers", "37 years"]);
    });

    it("Russian years take one, few and many", () => {
        setLocale("ru");
        const el = at(`items:
  - { label: A, date: 2025-12-01, repeat: yearly }
  - { label: B, date: 2023-12-01, repeat: yearly }
  - { label: C, date: 2020-12-01, repeat: yearly }
  - { label: D, date: 2005-12-01, repeat: yearly }`);
        expect(texts(el, ".dashy-countdown-years-count")).toEqual(["1", "3", "6", "21"]);
        expect(texts(el, ".dashy-countdown-years-unit")).toEqual(["год", "года", "лет", "год"]);
    });

    it("repeat: weekly is an error and the card is marked broken, the rest still drawn", () => {
        const el = at(`items:
  - { label: Gym, date: 2026-10-01, repeat: weekly }
  - { label: Fine, date: 2026-10-12 }`);
        expect(diagnostics(el, "error")).toEqual([
            '⛔ countdown: "Gym": `repeat` expects `yearly`, got "weekly".',
        ]);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["—", "7"]);
        expect(nodes(el, ".dashy-countdown-card")[0]?.className).toContain("is-broken");
    });

    it("an unknown-key check knows repeat, field and the selection keys", () => {
        const el = at("items:\n  - { label: A, field: expires, source: Docs, tag: id, where: \"a = 1\", repeat: yearly }",
            mockContext({ notes: [{ path: "Docs/A.md", frontmatter: { a: 1, expires: "2027-01-01" }, tags: ["id"] }] }));
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(diagnostics(el, "error")).toEqual([]);
    });
});

describe("countdown: a date read from a note (B-148)", () => {
    const TODAY = new Date(2026, 9, 5, 12, 0, 0);
    afterEach(() => vi.useRealTimers());

    const at = (config: string, notes: { path: string; frontmatter?: Record<string, unknown> }[]) => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(TODAY);
        const el = host();
        renderCountdown(mockContext({ notes }), config, el);
        return el;
    };

    const health = [
        { path: "Health/2025-09-10 check.md", frontmatter: { valid_until: "2026-09-10" } },
        { path: "Health/2026-09-14 check.md", frontmatter: { valid_until: "2027-09-14" } },
        { path: "Diary/2026-10-01.md", frontmatter: { valid_until: "2099-01-01" } },
    ];

    it("counts to the property of the newest note in the folder", () => {
        const el = at("items:\n  - { label: Medical, field: valid_until, source: Health }", health);
        expect(diagnostics(el, "error")).toEqual([]);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["344"]);
        expect(texts(el, ".dashy-countdown-date")).toEqual(["September 14, 2027"]);
    });

    it("the label opens the note the date came from", () => {
        const el = at("items:\n  - { label: Medical, field: valid_until, source: Health }", health);
        const link = nodes(el, ".dashy-countdown-label a.internal-link")[0];
        expect(link?.getAttribute("data-href")).toBe("Health/2026-09-14 check.md");
        expect(link?.textContent).toBe("Medical");
    });

    it("a written date leaves the label a plain caption", () => {
        const el = at("items:\n  - { label: Race, date: 2026-11-15 }", []);
        expect(nodes(el, ".dashy-countdown-label a")).toHaveLength(0);
        expect(texts(el, ".dashy-countdown-label")).toEqual(["Race"]);
    });

    it("synonyms of field and source work on a single card written without items", () => {
        const el = at("label: Medical\nproperty: valid_until\nfolder: Health", health);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["344"]);
    });

    it("a birthday from a person's note repeats and shows the age", () => {
        const el = at("items:\n  - { label: Anna, field: birthday, repeat: yearly }", [
            { path: "People/Anna.md", frontmatter: { birthday: "1990-05-12" } },
        ]);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["219"]);
        expect(texts(el, ".dashy-countdown-years")).toEqual(["37 years"]);
    });

    it("a property nobody has errors on its card, and the other cards still draw", () => {
        const el = at(`items:
  - { label: Medical, field: valid_unti, source: Health }
  - { label: Race, date: 2026-11-15 }`, health);
        expect(diagnostics(el, "error")).toEqual([
            '⛔ countdown: "Medical": no note in the selection has "valid_unti" filled in. Check the name, `source`, `tag` and `where`.',
        ]);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["—", "41"]);
    });

    it("a value that is not a date names the note it sits in", () => {
        const el = at("items:\n  - { label: Passport, field: expires }", [
            { path: "Docs/Passport.md", frontmatter: { expires: "soon" } },
        ]);
        expect(diagnostics(el, "error")).toEqual([
            '⛔ countdown: "Passport": "expires" in "Passport" is "soon", not a date. Expected YYYY-MM-DD.',
        ]);
        expect(nodes(el, ".dashy-countdown-card")[0]?.className).toContain("is-broken");
    });

    it("date and field together is an error on the card", () => {
        const el = at("items:\n  - { label: Passport, date: 2027-01-01, field: expires }", [
            { path: "Docs/Passport.md", frontmatter: { expires: "2031-04-30" } },
        ]);
        expect(diagnostics(el, "error")[0]).toContain("both `date:` and `field:`");
        expect(texts(el, ".dashy-countdown-value")).toEqual(["—"]);
    });
});
