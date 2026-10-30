import { describe, it, expect, afterEach } from "vitest";
import { renderStats } from "./stats";
import type { BlockContext } from "./context";
import { mockContext, host, texts, nodes, diagnostics, type FakeNote, type FakeVault } from "../test/vault";
import { setLocale } from "../i18n";
import { setDateLocale } from "../adapters/datetime";

/**
 * B-149, `origin`: a `latest`, `min` or `max` card names the note its value
 * came from, as a link, or that note's date. Today is Thursday 24 September
 * 2026.
 */
const TODAY = new Date(2026, 8, 24);

const races: FakeNote[] = [
    { path: "Races/2025-05-04 Spring 10k.md", frontmatter: { time: "0:52:10" } },
    { path: "Races/2025-09-14 Autumn 10k.md", frontmatter: { time: "0:48:05" } },
    { path: "Races/2026-04-12 City 10k.md", frontmatter: { time: "0:50:30" } },
    { path: "Races/2026-09-22 Trail 10k.md", frontmatter: { time: "1:01:00" } },
];

const at = (vault: FakeVault, sourcePath = "Home.md"): BlockContext =>
    ({ ...mockContext(vault), today: () => TODAY, sourcePath });

const draw = (config: string, notes: FakeNote[] = races, ctx: BlockContext = at({ notes })): HTMLElement => {
    const el = host();
    renderStats(ctx, config, el);
    return el;
};

afterEach(() => {
    setLocale("en");
    setDateLocale(null);
});

describe("stats — origin (B-149)", () => {
    it("`origin: note` links the record to the race it was run in", () => {
        const el = draw("items:\n  - { label: Best 10k, source: Races, field: time, agg: min, origin: note }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["0:48:05"]);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["2025-09-14 Autumn 10k"]);
        const link = nodes(el, ".dashy-stat-sub a")[0];
        expect(link?.className).toBe("dashy-stat-origin internal-link");
        expect(link?.getAttribute("data-href")).toBe("Races/2025-09-14 Autumn 10k.md");
        expect(link?.getAttribute("href")).toBe("Races/2025-09-14 Autumn 10k.md");
        // The name is the link's only text: no tooltip repeats it.
        expect(link?.hasAttribute("title")).toBe(false);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("`origin: date` labels a `latest` value with its note's date, in the reader's language", () => {
        const config = "items:\n  - { label: Last race, source: Races, field: time, agg: latest, origin: date }";
        const en = draw(config);
        expect(texts(en, ".dashy-stat-sub")).toEqual(["Sep 22, 2026"]);
        expect(nodes(en, ".dashy-stat-sub a")).toHaveLength(0);

        setLocale("ru");
        setDateLocale("ru");
        expect(texts(draw(config), ".dashy-stat-sub")).toEqual(["22 сент. 2026 г."]);
    });

    it("`max` names the slowest race; a tie goes to the newest note", () => {
        const tie: FakeNote[] = [
            ...races,
            { path: "Races/2024-06-01 Old trail.md", frontmatter: { time: "1:01:00" } },
            { path: "Races/2026-01-10 Snow trail.md", frontmatter: { time: "1:01:00" } },
        ];
        const el = draw("items:\n  - { label: Slowest, source: Races, field: time, agg: max, origin: note }", tie);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["2026-09-22 Trail 10k"]);
        const older = tie.filter((n) => !n.path.includes("Trail 10k"));
        expect(texts(draw("items:\n  - { label: Slowest, source: Races, field: time, agg: max, origin: note }", older),
            ".dashy-stat-sub")).toEqual(["2026-01-10 Snow trail"]);
    });

    it("a hand-written `sub` comes first, then the origin", () => {
        const el = draw("items:\n  - { label: Best 10k, source: Races, field: time, agg: min, sub: personal best, origin: note }");
        expect(texts(el, ".dashy-stat-sub")).toEqual(["personal best · 2025-09-14 Autumn 10k"]);
        expect(texts(el, ".dashy-stat-sub a")).toEqual(["2025-09-14 Autumn 10k"]);
    });

    it("with another aggregate it warns, naming the card and the aggregate, and the card still draws", () => {
        const el = draw("items:\n  - { label: All races, source: Races, field: time, agg: avg, sub: four races, origin: note }");
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ stats: "All races": `origin` works with `agg: latest`, `min` or `max` only, not `avg`. The card is drawn without it.',
        ]);
        expect(texts(el, ".dashy-stat-value")).toEqual(["0:52:56"]);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["four races"]);
    });

    it("the same warning, translated, in Russian", () => {
        setLocale("ru");
        const el = draw("items:\n  - { label: Races, source: Races, agg: count, origin: date }");
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ stats: "Races": `origin` работает только с `agg: latest`, `min` или `max`, а не `count`. Карточка нарисована без него.',
        ]);
        expect(texts(el, ".dashy-stat-value")).toEqual(["4"]);
    });

    it("an unknown value warns and the card draws without an origin", () => {
        const el = draw("items:\n  - { label: Best, source: Races, field: time, agg: min, origin: name }");
        expect(diagnostics(el, "warning")).toEqual(['⚠️ stats: "Best": `origin` expects `note` or `date`, got "name". Ignored.']);
        expect(nodes(el, ".dashy-stat-sub")).toHaveLength(0);
    });

    it("`origin: date` on a record from an undated note warns once, naming it; the value still draws", () => {
        const notes: FakeNote[] = [...races, { path: "Races/Club record.md", frontmatter: { time: "0:45:00" } }];
        const el = draw("items:\n  - { label: Best, source: Races, field: time, agg: min, origin: date }", notes);
        expect(texts(el, ".dashy-stat-value")).toEqual(["0:45:00"]);
        expect(nodes(el, ".dashy-stat-sub")).toHaveLength(0);
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ stats: "Best": the value comes from "Club record", which has no date to show for `origin: date`.',
        ]);
        // `origin: note` has nothing to complain about: the note has a name.
        const named = draw("items:\n  - { label: Best, source: Races, field: time, agg: min, origin: note }", notes);
        expect(texts(named, ".dashy-stat-sub")).toEqual(["Club record"]);
        expect(diagnostics(named, "warning")).toEqual([]);
    });

    it("`origin: date` reads the date from `date_field`, which then has an effect", () => {
        const labs: FakeNote[] = [
            { path: "Labs/Ferritin spring.md", frontmatter: { ferritin: 38, taken: "2026-03-02" } },
            { path: "Labs/Ferritin summer.md", frontmatter: { ferritin: 45, taken: "2026-07-15" } },
        ];
        const el = draw("items:\n  - { label: Ferritin, source: Labs, field: ferritin, agg: max, date_field: taken, origin: date }", labs);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["Jul 15, 2026"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a refused `origin` does not silence the `date_field` warning", () => {
        const labs: FakeNote[] = [{ path: "Labs/Ferritin.md", frontmatter: { ferritin: 38, taken: "2026-03-02" } }];
        const unused = '⚠️ stats: "Ferritin": `date_field` has no effect here. '
            + "It only steers `period`, `streak`, `current_streak`, `latest` and `trend`.";
        const sum = draw("items:\n  - { label: Ferritin, source: Labs, field: ferritin, agg: sum, date_field: taken, origin: note }", labs);
        expect(diagnostics(sum, "warning")).toContain(unused);
        const bad = draw("items:\n  - { label: Ferritin, source: Labs, field: ferritin, agg: max, date_field: taken, origin: name }", labs);
        expect(diagnostics(bad, "warning")).toEqual([
            '⚠️ stats: "Ferritin": `origin` expects `note` or `date`, got "name". Ignored.',
            unused,
        ]);
    });

    it("a field list names the note with the best total (B-193)", () => {
        const tri: FakeNote[] = [
            { path: "Tri/2026-05-01 Sprint.md", frontmatter: { swim: 20, bike: 40, run: 25 } },
            { path: "Tri/2026-07-01 Olympic.md", frontmatter: { swim: 30, bike: 70, run: 45 } },
            { path: "Tri/2026-08-01 Aquabike.md", frontmatter: { swim: 30, bike: 70 } },
        ];
        const el = draw("items:\n  - { label: Longest, source: Tri, field: [swim, bike, run], agg: max, origin: note }", tri);
        expect(texts(el, ".dashy-stat-value")).toEqual(["145"]);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["2026-07-01 Olympic"]);
    });

    it("describes the value of the current window, not the previous one `compare` reads", () => {
        // This week (Sun 20 .. Thu 24 September) holds only the trail race.
        const el = draw("items:\n  - { label: Best, source: Races, field: time, agg: min, period: year, compare: true, origin: note }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["0:50:30"]);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["2026-04-12 City 10k"]);
        const week = draw("items:\n  - { label: Best, source: Races, field: time, agg: min, period: week, origin: note }");
        expect(texts(week, ".dashy-stat-sub")).toEqual(["2026-09-22 Trail 10k"]);
    });

    it("no value, no origin: an empty window shows a dash and nothing under it", () => {
        const el = draw("items:\n  - { label: Best, source: Races, field: time, agg: min, period: 2026-W10, origin: note }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["—"]);
        expect(nodes(el, ".dashy-stat-sub")).toHaveLength(0);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a template draws only its hint, without an origin (B-190)", () => {
        const ctx = at({ notes: races, templates: { folder: "Templates" } }, "Templates/Review.md");
        const el = draw("source: Races\nperiod: note\nitems:\n  - { label: Best, field: time, agg: min, origin: note }", races, ctx);
        expect(nodes(el, ".dashy-stat")).toHaveLength(0);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("is a card key: written at the block root it is reported as unknown", () => {
        const el = draw("source: Races\norigin: note\nitems:\n  - { label: Best, field: time, agg: min }");
        expect(diagnostics(el, "warning").some((w) => w.includes("origin"))).toBe(true);
        expect(nodes(el, ".dashy-stat-sub")).toHaveLength(0);
    });

    it("a single card written without `items` keeps its origin", () => {
        const el = draw("source: Races\nlabel: Best\nfield: time\nagg: min\norigin: note");
        expect(texts(el, ".dashy-stat-sub")).toEqual(["2025-09-14 Autumn 10k"]);
    });

    it("`layout: inline` does not show it, and says so once for the block", () => {
        const notes: FakeNote[] = [...races, { path: "Races/Club record.md", frontmatter: { time: "0:45:00" } }];
        const el = draw(`layout: inline
items:
  - { label: best, source: Races, field: time, agg: min, origin: date }
  - { label: last, source: Races, field: time, agg: latest, origin: note }`, notes);
        expect(texts(el, ".dashy-stat-inline")).toEqual(["0:45:00 best", "1:01:00 last"]);
        expect(nodes(el, ".dashy-stat-origin")).toHaveLength(0);
        // Not also "no date to show" for an origin that is not drawn at all.
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ stats: `origin` is not shown with `layout: inline`: "best", "last". Use `layout: cards` to see it.',
        ]);
    });

    it("survives a redraw: one origin, not two", () => {
        const el = host();
        const ctx = at({ notes: races });
        const config = "items:\n  - { label: Best, source: Races, field: time, agg: min, sub: PB, origin: note }";
        renderStats(ctx, config, el);
        renderStats(ctx, config, el);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["PB · 2025-09-14 Autumn 10k"]);
        expect(nodes(el, ".dashy-stat-origin")).toHaveLength(1);
    });
});
