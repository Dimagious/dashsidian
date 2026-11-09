import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderStats } from "./stats";
import { mockContext, host, texts, nodes, diagnostics, type FakeNote, type FakeVault } from "../test/vault";
import { setLocale } from "../i18n";

/**
 * `group_by` on a `stats` card (B-213), drawn: one card per `group_by`
 * item, ranked rows, the tail folded by `limit`, the notes with no value
 * last, and a hint when a note counts in more than one row.
 */

// Monday 5 October 2026, noon. The test locale starts weeks on Sunday.
const TODAY = new Date(2026, 9, 5, 12, 0, 0);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
});
afterEach(() => {
    vi.useRealTimers();
    setLocale("en");
});

const game = (name: string, frontmatter: Record<string, unknown>): FakeNote => ({ path: `Games/${name}.md`, frontmatter });

const GAMES: FakeNote[] = [
    game("Hades", { platform: ["PC", "Switch"], genre: "roguelike", hours: "40h", rating: 9, played: "2026-10-04" }),
    game("Celeste", { platform: "Switch", genre: "platformer", hours: "12h 30m", rating: 10, played: "2026-10-05" }),
    game("Zelda", { platform: "[[Switch]]", genre: "action", hours: "90h", rating: 9, played: "2026-09-20" }),
    game("BG3", { platform: "PC", genre: "RPG", hours: "120h", rating: 9, played: "2026-10-03" }),
    game("Disco", { platform: "pc", genre: "rpg", hours: "30h", rating: 10, played: "2026-08-01" }),
    game("Halo", { platform: "Xbox", genre: "shooter", hours: "8h", rating: 7, played: "2026-10-01" }),
    game("Tetris", { genre: "puzzle", hours: "2h", rating: 6, played: "2026-10-02" }),
    // Not a game: kept out by `source`.
    { path: "Diary/2026-10-05.md", frontmatter: { platform: "PC" } },
];

const VAULT: FakeVault = { notes: GAMES };

function draw(config: string, vault: FakeVault = VAULT): HTMLElement {
    const el = host();
    renderStats(mockContext(vault), config, el);
    return el;
}

const rows = (el: HTMLElement): string[][] =>
    nodes(el, ".dashy-stat-group-row").map((row) => [
        row.querySelector(".dashy-stat-group-name")?.textContent ?? "",
        row.querySelector(".dashy-stat-group-value")?.textContent ?? "",
    ]);

/** Every message the block draws, without the "⚠️ stats: " each one starts with. */
const warnings = (el: HTMLElement): string[] =>
    diagnostics(el, "warning").concat(diagnostics(el, "error")).map((m) => m.replace(/^\S+ stats: /, ""));

describe("stats group_by: one card that ranks a property's values (B-213)", () => {
    it("counts the notes per value, the largest first, the notes with no value last", () => {
        const el = draw("source: Games\nitems:\n  - { label: Games by platform, group_by: platform }");
        expect(nodes(el, ".dashy-stat")).toHaveLength(1);
        expect(texts(el, ".dashy-stat-group-head")).toEqual(["Games by platform"]);
        // Switch: Hades, Celeste, Zelda's link; PC: Hades, BG3, Disco's "pc".
        // A tie of 3 goes to the name; Tetris has no platform.
        expect(rows(el)).toEqual([["PC", "3"], ["Switch", "3"], ["Xbox", "1"], ["no value", "1"]]);
        expect(nodes(el, ".dashy-stat-group-row").at(-1)?.className).toContain("is-no-value");
        expect(texts(el, ".dashy-stat-group-more")).toEqual([]);
        expect(warnings(el)).toEqual([]);
    });

    it("a note with several values counts in each, and the card says so", () => {
        const el = draw("source: Games\nitems:\n  - { label: Games by platform, group_by: platform }");
        expect(texts(el, ".dashy-stat-group-hint")).toEqual([
            "A note with several values counts in each of them, so the rows can add up to more than the number of notes.",
        ]);
        // One genre per game: the rows add up to the games, no hint.
        const one = draw("source: Games\nitems:\n  - { label: Genres, group_by: genre }");
        expect(texts(one, ".dashy-stat-group-hint")).toEqual([]);
    });

    it("`limit` keeps the best rows and folds the rest; the no-value row is outside it", () => {
        const el = draw("source: Games\nitems:\n  - { label: Genres, group_by: genre, limit: 2 }");
        // BG3's RPG and Disco's rpg, one each: the tie of spellings goes to RPG.
        expect(rows(el)).toEqual([["RPG", "2"], ["action", "1"]]);
        expect(texts(el, ".dashy-stat-group-more")).toEqual(["+4 more values"]);
        expect(texts(el, ".dashy-stat-group-more-count")).toEqual(["+4"]);

        const platforms = draw("source: Games\nitems:\n  - { label: P, group_by: platform, limit: 1 }");
        expect(rows(platforms)).toEqual([["PC", "3"], ["no value", "1"]]);
        expect(texts(platforms, ".dashy-stat-group-more")).toEqual(["+2 more values"]);
        const one = draw("source: Games\nitems:\n  - { label: P, group_by: platform, limit: 2 }");
        expect(texts(one, ".dashy-stat-group-more")).toEqual(["+1 more value"]);
    });

    it("`where: platform not empty` drops the no-value row", () => {
        const el = draw('source: Games\nitems:\n  - { label: P, group_by: platform, where: "platform not empty" }');
        expect(rows(el).map(([name]) => name)).toEqual(["PC", "Switch", "Xbox"]);
    });

    it("`agg` and `field` work per value; durations read as durations, ranked by minutes", () => {
        const el = draw("source: Games\nitems:\n  - { label: Hours, group_by: platform, field: hours, agg: sum }");
        expect(rows(el)).toEqual([
            ["PC", "190h"],
            ["Switch", "142h 30m"],
            ["Xbox", "8h"],
            ["no value", "2h"],
        ]);
    });

    it("the best in each group: `max` ranks the largest first, `min` the smallest", () => {
        const best = draw("source: Games\nitems:\n  - { label: Best, group_by: genre, field: rating, agg: max, limit: 3 }");
        expect(rows(best)).toEqual([["platformer", "10"], ["RPG", "10"], ["action", "9"]]);
        const shortest = draw("source: Games\nitems:\n  - { label: Shortest, group_by: platform, field: hours, agg: min }");
        expect(rows(shortest)).toEqual([["Xbox", "8h"], ["Switch", "12h 30m"], ["PC", "30h"], ["no value", "2h"]]);
    });

    it("a streak is counted per value, from the notes' own dates", () => {
        const el = draw("source: Games\ndate_field: played\nitems:\n  - { label: Runs, group_by: platform, agg: streak, unit: days }");
        // PC: 3 and 4 October; Switch: 4 and 5 October; Xbox and Tetris one day each.
        expect(rows(el)).toEqual([["PC", "2 days"], ["Switch", "2 days"], ["Xbox", "1 day"], ["no value", "1 day"]]);
        expect(warnings(el)).toEqual([]);
    });

    it("`unit` and `precision` apply to every row, a dash takes no unit", () => {
        const vault: FakeVault = {
            notes: [
                game("A", { platform: "PC", rating: 9 }),
                game("B", { platform: "PC", rating: 8 }),
                game("C", { platform: "Switch", rating: 7 }),
                game("D", { platform: "Xbox" }),
            ],
        };
        const el = draw("source: Games\nitems:\n  - { label: Rating, group_by: platform, field: rating, agg: avg, precision: 2, unit: pts }", vault);
        expect(rows(el)).toEqual([["PC", "8.50 pts"], ["Switch", "7.00 pts"], ["Xbox", "—"]]);
        expect(texts(el, ".dashy-stat-group-unit")).toEqual(["pts", "pts"]);
        expect(nodes(el, ".dashy-stat-group-value.is-empty")).toHaveLength(1);
    });

    it("the selection at the block root reaches the card: source, where and period", () => {
        const el = draw(`source: Games
date_field: played
period: week
where: "rating >= 7"
items:
  - { label: This week, group_by: platform }`);
        // Sunday 4 to Monday 5 October: Hades and Celeste.
        expect(rows(el)).toEqual([["Switch", "2"], ["PC", "1"]]);
        expect(warnings(el)).toEqual([]);
    });

    it("the card's own selection replaces the root's", () => {
        const el = draw("source: Diary\nitems:\n  - { label: P, source: Games, group_by: platform, limit: 1 }");
        expect(rows(el)[0]).toEqual(["PC", "3"]);
    });

    it("an empty selection says no notes matched", () => {
        const el = draw('source: Games\nitems:\n  - { label: P, group_by: platform, where: "rating > 100" }');
        expect(texts(el, ".dashy-stat-group-empty")).toEqual(["No notes matched."]);
        expect(rows(el)).toEqual([]);
    });

    it("a window that has not started draws a dash beside the cards that count", () => {
        const el = draw(`source: Games
date_field: played
items:
  - { label: Later, group_by: platform, period: { from: 2026-11-01, to: 2026-11-30 } }
  - { label: All, agg: count }`);
        expect(nodes(el, ".dashy-stat-group .dashy-stat-value.is-empty")).toHaveLength(1);
        expect(texts(el, ".dashy-notice")).toHaveLength(1);
    });

    it("an `agg` that does not read is an error and the group card draws a dash", () => {
        const el = draw("source: Games\nitems:\n  - { label: P, group_by: platform, agg: avgg, field: rating }");
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(nodes(el, ".dashy-stat-group .dashy-stat-value.is-empty")).toHaveLength(1);
        expect(rows(el)).toEqual([]);
    });

    it("ignored keys warn once and raise none of their own warnings", () => {
        const el = draw("source: Games\nitems:\n  - { label: P, group_by: platform, compare: true, trend: 30d, origin: note }");
        expect(warnings(el)).toEqual([
            '"P": with `group_by` these keys do nothing and are ignored: `compare`, `trend`, `origin`.',
        ]);
        expect(nodes(el, ".dashy-stat-delta")).toHaveLength(0);
        expect(nodes(el, ".dashy-stat-trend")).toHaveLength(0);
    });

    it("a bad limit warns and shows ten", () => {
        const notes = Array.from({ length: 12 }, (_, i) => game(`G${i}`, { platform: `P${String(i).padStart(2, "0")}` }));
        const el = draw("source: Games\nitems:\n  - { label: P, group_by: platform, limit: 0 }", { notes });
        expect(warnings(el)).toEqual(['"P": `limit` expects a whole number of 1 or more, got "0". Showing 10 rows.']);
        expect(rows(el)).toHaveLength(10);
        expect(texts(el, ".dashy-stat-group-more")).toEqual(["+2 more values"]);
    });

    it("a property no note has warns, naming it", () => {
        const el = draw("source: Games\nitems:\n  - { label: P, group_by: platfrom }");
        expect(warnings(el)).toEqual([
            '"P": no selected note has "platfrom" for `group_by`. Check the name: every note is counted under "no value".',
        ]);
        expect(rows(el)).toEqual([["no value", "7"]]);
    });

    it("a field typo warns as on any card", () => {
        const el = draw("source: Games\nitems:\n  - { label: P, group_by: platform, field: hourz, agg: sum }");
        expect(warnings(el).join("\n")).toContain('"hourz"');
    });

    it("without a label the heading is the property", () => {
        const el = draw("source: Games\ngroup_by: genre\nlimit: 1");
        expect(texts(el, ".dashy-stat-group-head")).toEqual(["genre"]);
    });

    it("icon and sub are drawn at the head", () => {
        const el = draw("source: Games\nitems:\n  - { label: P, group_by: platform, icon: 🎮, sub: all time, limit: 1 }");
        expect(texts(el, ".dashy-stat-group-icon")).toEqual(["🎮"]);
        expect(texts(el, ".dashy-stat-sub")).toEqual(["all time"]);
    });

    it("sits in the grid beside ordinary cards", () => {
        const el = draw("source: Games\nitems:\n  - { label: Games, agg: count }\n  - { label: P, group_by: platform }");
        expect(texts(el, ".dashy-stat-value")).toEqual(["7"]);
        expect(nodes(el, ".dashy-stats > .dashy-stat")).toHaveLength(2);
    });

    it("`layout: inline` leaves a group card out and says so", () => {
        const el = draw("source: Games\nlayout: inline\nitems:\n  - { label: games, agg: count }\n  - { label: P, group_by: platform, sub: x }");
        expect(warnings(el)).toEqual([
            '`group_by` cards are not drawn with `layout: inline`: "P". Use `layout: cards` to see them.',
        ]);
        expect(texts(el, ".dashy-stat-inline")).toEqual(["7 games"]);
        expect(nodes(el, ".dashy-stat-group")).toHaveLength(0);
    });

    it("`layout: inline` with only group cards draws no empty line", () => {
        const el = draw("source: Games\nlayout: inline\nitems:\n  - { label: P, group_by: platform }");
        expect(warnings(el)).toHaveLength(1);
        expect(nodes(el, ".dashy-stats-inline")).toHaveLength(0);
    });

    it("a redraw replaces the card rather than adding a second", () => {
        const el = host();
        const ctx = mockContext(VAULT);
        const config = "source: Games\nitems:\n  - { label: P, group_by: platform }";
        renderStats(ctx, config, el);
        renderStats(ctx, config, el);
        expect(nodes(el, ".dashy-stat-group")).toHaveLength(1);
    });

    it("Russian: the folded tail agrees with its number, the empty row is translated", () => {
        setLocale("ru");
        const notes = Array.from({ length: 7 }, (_, i) => game(`G${i}`, { platform: `P${i}` }));
        notes.push(game("None", {}));
        const fold = (limit: number): string[] =>
            texts(draw(`source: Games\nitems:\n  - { label: P, group_by: platform, limit: ${limit} }`, { notes }), ".dashy-stat-group-more");
        expect(fold(6)).toEqual(["+1 значение"]);
        expect(fold(4)).toEqual(["+3 значения"]);
        expect(fold(2)).toEqual(["+5 значений"]);
        const el = draw("source: Games\nitems:\n  - { label: P, group_by: platform }", { notes });
        expect(rows(el).at(-1)).toEqual(["нет значения", "1"]);
    });
});
