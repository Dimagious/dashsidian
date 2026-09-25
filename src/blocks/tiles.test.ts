import { describe, it, expect, vi, afterEach } from "vitest";
import { renderTiles } from "./tiles";
import { mockContext, host, texts, nodes, diagnostics } from "../test/vault";
import { DEFAULT_SETTINGS } from "../types";

const ctx = mockContext({
    notes: [
        { path: "00-Inbox/a.md" },
        { path: "00-Inbox/b.md" },
        { path: "01-Areas/Sport/run.md" },
    ],
});

describe("tiles — what a reader sees", () => {
    it("draws a tile per item, in order, with its label", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Inbox, path: 00-Inbox }\n  - { label: Sport, path: 01-Areas/Sport }", el);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Inbox", "Sport"]);
    });

    it("a badge of `count` is the real number of notes in the folder", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Inbox, path: 00-Inbox, badge: count }", el);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
    });

    it("an empty folder is counted as zero and marked, not hidden", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Nothing, path: 99-Empty, badge: count }", el);
        const badge = nodes(el, ".dashy-tile-badge")[0];
        expect(badge?.textContent).toBe("0");
        expect(badge?.className).toContain("is-empty");
    });

    it("a badge given as text is printed as given", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Inbox, path: 00-Inbox, badge: soon }", el);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["soon"]);
    });

    it("the tile links where it was told to", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Sport, path: 01-Areas/Sport/run.md }", el);
        const link = nodes(el, "a.dashy-tile-link")[0];
        expect(link?.getAttribute("data-href")).toBe("01-Areas/Sport/run.md");
        expect(link?.className).toContain("internal-link");
    });

    it("icon and sub are drawn when given and absent when not", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: A, path: x, icon: 📥, sub: note }\n  - { label: B, path: y }", el);
        expect(texts(el, ".dashy-tile-icon")).toEqual(["📥"]);
        expect(texts(el, ".dashy-tile-sub")).toEqual(["note"]);
    });

    it("accent is a class, not a colour baked into the element", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: A, path: x, accent: true }\n  - { label: B, path: y }", el);
        const tiles = nodes(el, ".dashy-tile");
        expect(tiles[0]?.className).toContain("dashy-tile-accent");
        expect(tiles[1]?.className).not.toContain("dashy-tile-accent");
        expect(tiles[0]?.style.backgroundColor).toBe("");
    });

    it("columns reach the grid as a custom property", () => {
        const el = host();
        renderTiles(ctx, "columns: 5\nitems:\n  - { label: A, path: x }", el);
        expect(nodes(el, ".dashy-tiles")[0]?.style.getPropertyValue("--dashy-tile-columns")).toBe("5");
    });
});

describe("tiles — edges", () => {
    it("an empty block says so once, and draws no grid", () => {
        const el = host();
        renderTiles(ctx, "   ", el);
        // Not twice: "the block is empty" and "the list is empty" are the same
        // problem, and two messages read as two.
        expect(diagnostics(el, "error")).toEqual(["⛔ tiles: The block is empty."]);
        expect(nodes(el, ".dashy-tiles")).toHaveLength(0);
    });

    it("a list with no items says so", () => {
        const el = host();
        renderTiles(ctx, "columns: 3\nitems: []", el);
        expect(diagnostics(el, "error")[0]).toContain("items");
    });

    it("columns are clamped to what the grid can show", () => {
        for (const [given, expected] of [["0", "1"], ["99", "8"], ["-4", "1"]] as const) {
            const el = host();
            renderTiles(ctx, `columns: ${given}\nitems:\n  - { label: A, path: x }`, el);
            expect(nodes(el, ".dashy-tiles")[0]?.style.getPropertyValue("--dashy-tile-columns")).toBe(expected);
        }
    });

    it("a tile with a path but no label falls back to the path", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { path: 00-Inbox }", el);
        expect(texts(el, ".dashy-tile-label")).toEqual(["00-Inbox"]);
    });

    it("a tile with neither label nor path is skipped rather than drawn blank", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { icon: 📥 }\n  - { label: Real, path: x }", el);
        expect(nodes(el, ".dashy-tile")).toHaveLength(1);
    });

    it("`title` is accepted as a synonym of label inside an item", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { title: Inbox, path: 00-Inbox }", el);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Inbox"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("a single tile written as a bare object draws, and warns about nothing", () => {
        const el = host();
        renderTiles(ctx, "{ label: Inbox, path: 00-Inbox, icon: 📥 }", el);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Inbox"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("the root keys are still checked when there is an items list", () => {
        const el = host();
        renderTiles(ctx, "colums: 4\nitems:\n  - { label: A, path: x }", el);
        expect(diagnostics(el, "warning")[0]).toContain("columns");
    });

    it("an unknown key warns with a suggestion but the tile is still drawn", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { lable: Inbox, path: 00-Inbox }", el);
        expect(diagnostics(el, "warning")[0]).toContain("label");
        expect(nodes(el, ".dashy-tile")).toHaveLength(1);
    });

    it("broken YAML reports the line instead of drawing nothing", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: X\n", el);
        expect(diagnostics(el, "error")[0]).toMatch(/line \d+/);
    });
});

describe("tiles — badge: count narrowed by a selection (B-114, issue #8)", () => {
    // Thursday, 24 Sep 2026. Picked so "this month" and "today" are unambiguous.
    const TODAY = new Date(2026, 8, 24);

    afterEach(() => vi.useRealTimers());

    const withToday = (fixture: ReturnType<typeof mockContext>, config: string) => {
        vi.useFakeTimers();
        vi.setSystemTime(TODAY);
        const el = host();
        renderTiles(fixture, config, el);
        return el;
    };

    it("the issue's own two tiles: period: month and period: 1d count only what falls in their window", () => {
        const fixture = mockContext({
            notes: [
                // Mails: last day of the previous month is out, the 1st and
                // today are in, next month is out, and one has no `start` at
                // all and never counts once `date_field` is given.
                { path: "Mails/aug31.md", frontmatter: { start: "2026-08-31" } },
                { path: "Mails/sep01.md", frontmatter: { start: "2026-09-01" } },
                { path: "Mails/sep24.md", frontmatter: { start: "2026-09-24" } },
                { path: "Mails/oct01.md", frontmatter: { start: "2026-10-01" } },
                { path: "Mails/nodate.md", frontmatter: {} },
                // Events: only a `start` on today counts for period: 1d.
                { path: "Events/today.md", frontmatter: { start: "2026-09-24T09:00" } },
                { path: "Events/yesterday.md", frontmatter: { start: "2026-09-23" } },
                { path: "Events/nostart.md", frontmatter: {} },
            ],
        });
        const el = withToday(
            fixture,
            "columns: 2\nitems:\n" +
                "  - { label: Mails, path: Mails, icon: 📥, date_field: start, period: month, badge: count }\n" +
                "  - { label: Events, path: Events, icon: 📅, date_field: start, period: 1d, badge: count }",
        );
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2", "1"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
        // The link still opens the folder, unchanged by the selection keys.
        const links = nodes(el, "a.dashy-tile-link");
        expect(links[0]?.getAttribute("data-href")).toBe("Mails");
        expect(links[1]?.getAttribute("data-href")).toBe("Events");
    });

    it("`where` alone narrows the count, nested subfolders included", () => {
        const fixture = mockContext({
            notes: [
                { path: "Tasks/a.md", frontmatter: { status: "open" } },
                { path: "Tasks/Sub/b.md", frontmatter: { status: "open" } },
                { path: "Tasks/c.md", frontmatter: { status: "closed" } },
            ],
        });
        const el = host();
        renderTiles(
            fixture,
            'items:\n  - { label: Open, path: Tasks, where: "status = open", badge: count }',
            el,
        );
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
    });

    it("`tag` alone narrows the count, nested subfolders included", () => {
        const fixture = mockContext({
            notes: [
                { path: "Tasks/a.md", tags: ["urgent"] },
                { path: "Tasks/Sub/b.md", tags: ["urgent"] },
                { path: "Tasks/c.md", tags: [] },
            ],
        });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Urgent, path: Tasks, tag: urgent, badge: count }", el);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
    });

    it("`where` and `period` narrow together", () => {
        const fixture = mockContext({
            notes: [
                { path: "Tasks/a.md", frontmatter: { status: "open", start: "2026-09-10" } },
                { path: "Tasks/b.md", frontmatter: { status: "open", start: "2026-08-01" } },
                { path: "Tasks/c.md", frontmatter: { status: "closed", start: "2026-09-15" } },
            ],
        });
        const el = withToday(
            fixture,
            'items:\n  - { label: Open this month, path: Tasks, where: "status = open", ' +
                "date_field: start, period: month, badge: count }",
        );
        expect(texts(el, ".dashy-tile-badge")).toEqual(["1"]);
    });

    it("no selection keys still counts nested subfolders, unchanged (regression pin)", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Areas, path: 01-Areas, badge: count }", el);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["1"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("an unreadable period warns and the count is drawn unfiltered (B-014 policy)", () => {
        const fixture = mockContext({
            notes: [{ path: "Tasks/a.md" }, { path: "Tasks/b.md" }, { path: "Tasks/c.md" }],
        });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Tasks, path: Tasks, period: fortnight, badge: count }", el);
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("period");
        expect(texts(el, ".dashy-tile-badge")).toEqual(["3"]);
    });

    it("a non-empty selection with no dated note under period warns, count stays an honest 0", () => {
        const fixture = mockContext({
            notes: [{ path: "Tasks/a.md", frontmatter: {} }, { path: "Tasks/b.md", frontmatter: {} }],
        });
        const el = withToday(
            fixture,
            "items:\n  - { label: Tasks, path: Tasks, date_field: start, period: month, badge: count }",
        );
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("start");
        const badge = nodes(el, ".dashy-tile-badge")[0];
        expect(badge?.textContent).toBe("0");
        expect(badge?.className).toContain("is-empty");
    });

    it("an empty window is an honest 0, no warning: the notes have dates, just not this one", () => {
        const fixture = mockContext({
            notes: [
                { path: "Tasks/a.md", frontmatter: { start: "2026-07-01" } },
                { path: "Tasks/b.md", frontmatter: { start: "2026-08-15" } },
            ],
        });
        const el = withToday(
            fixture,
            "items:\n  - { label: Tasks, path: Tasks, date_field: start, period: month, badge: count }",
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        const badge = nodes(el, ".dashy-tile-badge")[0];
        expect(badge?.textContent).toBe("0");
        expect(badge?.className).toContain("is-empty");
    });

    it("selection keys on a tile with no badge warn that they only narrow badge: count", () => {
        const fixture = mockContext({ notes: [{ path: "Tasks/a.md", frontmatter: { status: "open" } }] });
        const el = host();
        renderTiles(fixture, 'items:\n  - { label: Tasks, path: Tasks, where: "status = open" }', el);
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("badge: count");
        expect(nodes(el, ".dashy-tile-badge")).toHaveLength(0);
    });

    it("selection keys on a tile with a custom badge warn the same way, and the badge still shows as given", () => {
        const fixture = mockContext({ notes: [{ path: "Tasks/a.md" }] });
        const el = host();
        renderTiles(
            fixture,
            "items:\n  - { label: Tasks, path: Tasks, tag: urgent, period: week, badge: soon }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("badge: count");
        expect(texts(el, ".dashy-tile-badge")).toEqual(["soon"]);
    });

    it("date_field without period warns, and the count runs as if it were not there", () => {
        const fixture = mockContext({
            notes: [{ path: "Tasks/a.md" }, { path: "Tasks/b.md" }, { path: "Tasks/c.md" }],
        });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Tasks, path: Tasks, date_field: start, badge: count }", el);
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("date_field");
        expect(diagnostics(el, "warning")[0]).toContain("period");
        expect(texts(el, ".dashy-tile-badge")).toEqual(["3"]);
    });

    it("the new keys never trigger the unknown-key warning, and can all work together", () => {
        const fixture = mockContext({
            notes: [
                {
                    path: "Tasks/a.md",
                    frontmatter: { status: "open", start: "2026-09-10" },
                    tags: ["urgent"],
                },
            ],
        });
        const el = withToday(
            fixture,
            'items:\n  - { label: Tasks, path: Tasks, tag: urgent, where: "status = open", ' +
                "date_field: start, period: month, badge: count }",
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["1"]);
    });

    it("a missing folder still warns when badge: count is narrowed further", () => {
        const fixture = mockContext({ notes: [{ path: "Tasks/a.md" }] });
        const el = host();
        renderTiles(
            fixture,
            'items:\n  - { label: Ghost, path: 99-Nowhere, where: "status = open", badge: count }',
            el,
        );
        expect(diagnostics(el, "warning")[0]).toContain("99-Nowhere");
        const badge = nodes(el, ".dashy-tile-badge")[0];
        expect(badge?.textContent).toBe("0");
    });

    it("a where nobody can read warns and the count is drawn unfiltered", () => {
        const fixture = mockContext({
            notes: [{ path: "Tasks/a.md", frontmatter: { status: "open" } }, { path: "Tasks/b.md" }],
        });
        const el = host();
        renderTiles(
            fixture,
            'items:\n  - { label: Tasks, path: Tasks, where: "status =", badge: count }',
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("could not be read");
        // Unfiltered rather than an unexplained zero or a dropped tile.
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
    });

    it("`badge: true` is also a count badge, narrowed the same way `badge: count` is", () => {
        const fixture = mockContext({
            notes: [
                { path: "Tasks/a.md", frontmatter: { status: "open" } },
                { path: "Tasks/b.md", frontmatter: { status: "closed" } },
            ],
        });
        const el = host();
        renderTiles(
            fixture,
            'items:\n  - { label: Tasks, path: Tasks, where: "status = open", badge: true }',
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["1"]);
    });

    it("period: 1d counts against the effective today, not the wall-clock one", () => {
        vi.useFakeTimers();
        // Thursday 24 Sep, 02:00. With a 04:00 boundary, the effective day
        // is still Wednesday the 23rd, and only a note dated the 23rd is
        // "today" for `period: 1d` to count.
        vi.setSystemTime(new Date(2026, 8, 24, 2, 0));
        const fixture = mockContext(
            { notes: [{ path: "Diary/2026-09-23.md" }] },
            { ...DEFAULT_SETTINGS, startDayHour: 4 },
        );
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Diary, path: Diary, period: 1d, badge: count }", el);
        expect(diagnostics(el, "warning")).toHaveLength(0);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["1"]);
        vi.useRealTimers();
    });
});

describe("tiles — diagnostics render once, above the grid (F1, round 2)", () => {
    it("a warning found while drawing a tile still lands in one box before the grid", () => {
        const fixture = mockContext({ notes: [{ path: "Tasks/a.md" }] });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Ghost, path: 99-Nowhere, badge: count }", el);
        expect(el.firstElementChild?.className).toBe("dashy-diagnostics");
        // Exactly one diagnostics box, drawn before the grid, not stitched
        // in between tiles.
        expect(nodes(el, ".dashy-diagnostics")).toHaveLength(1);
        const grid = nodes(el, ".dashy-tiles")[0];
        expect(grid?.previousElementSibling?.className).toBe("dashy-diagnostics");
    });

    it("two tiles on the same missing folder warn once, not twice", () => {
        const fixture = mockContext({ notes: [{ path: "Tasks/a.md" }] });
        const el = host();
        renderTiles(
            fixture,
            "items:\n" +
                "  - { label: A, path: 99-Nowhere, badge: count }\n" +
                "  - { label: B, path: 99-Nowhere, badge: count }",
            el,
        );
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(nodes(el, ".dashy-diagnostics")).toHaveLength(1);
    });

    it("a root-level and an item-level diagnostic render in the same single box", () => {
        const fixture = mockContext({ notes: [{ path: "Tasks/a.md" }] });
        const el = host();
        renderTiles(
            fixture,
            "colums: 2\nitems:\n  - { label: Ghost, path: 99-Nowhere, badge: count }",
            el,
        );
        const boxes = nodes(el, ".dashy-diagnostics");
        expect(boxes).toHaveLength(1);
        expect(nodes(el, ".dashy-diag")).toHaveLength(2);
        expect(diagnostics(el, "warning").some((m) => m.includes("columns"))).toBe(true);
        expect(diagnostics(el, "warning").some((m) => m.includes("99-Nowhere"))).toBe(true);
    });
});
