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

    it("a single tile written without items still reads title as its label (B-125)", () => {
        const el = host();
        renderTiles(ctx, "title: Inbox\npath: 00-Inbox", el);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Inbox"]);
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
        const revealed: string[] = [];
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
            fileExplorer: { enabled: true, instance: { revealInFolder: (file: { path: string }) => revealed.push(file.path) } },
        });
        const el = withToday(
            fixture,
            "columns: 2\nitems:\n" +
                "  - { label: Mails, path: Mails, icon: 📥, date_field: start, period: month, badge: count }\n" +
                "  - { label: Events, path: Events, icon: 📅, date_field: start, period: 1d, badge: count }",
        );
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2", "1"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
        // The tile still leads to its folder, unchanged by the selection
        // keys: neither has a folder note, so both are folder tiles (B-144).
        const links = nodes(el, "a.dashy-tile-link");
        expect(links.map((l) => l.className)).toEqual([
            "dashy-tile-link dashy-tile-folder",
            "dashy-tile-link dashy-tile-folder",
        ]);
        for (const link of links) link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        expect(revealed).toEqual(["Mails", "Events"]);
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

describe("tiles — cover image (B-083)", () => {
    it("a vault path resolves to a resource URL and draws above the label", () => {
        const fixture = mockContext({
            notes: [{ path: "00-Inbox/a.md" }],
            alsoExists: ["Attachments/gym.jpg"],
        });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Gym, path: 00-Inbox, image: Attachments/gym.jpg }", el);
        const img = nodes(el, "img.dashy-tile-cover")[0];
        expect(img?.getAttribute("src")).toBe("app://local/Attachments/gym.jpg");
        expect(img?.getAttribute("alt")).toBe("Gym");
        expect(diagnostics(el, "warning")).toHaveLength(0);
        // the image comes before the label in the same clickable link
        const link = nodes(el, "a.dashy-tile-link")[0];
        expect(link?.firstElementChild?.className).toContain("dashy-tile-cover");
    });

    it("a wikilink resolves the same way, brackets and alias stripped", () => {
        const fixture = mockContext({
            notes: [{ path: "00-Inbox/a.md" }],
            alsoExists: ["Attachments/gym.jpg"],
        });
        const el = host();
        renderTiles(
            fixture,
            "items:\n  - { label: Gym, path: 00-Inbox, image: \"[[Attachments/gym.jpg|cover]]\" }",
            el,
        );
        expect(nodes(el, "img.dashy-tile-cover")[0]?.getAttribute("src")).toContain("Attachments/gym.jpg");
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("an https URL is drawn as is, not resolved through the vault", () => {
        const el = host();
        renderTiles(
            ctx,
            "items:\n  - { label: Gym, path: 00-Inbox, image: https://example.com/gym.jpg }",
            el,
        );
        expect(nodes(el, "img.dashy-tile-cover")[0]?.getAttribute("src")).toBe("https://example.com/gym.jpg");
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    it("a vault path that does not resolve warns, naming the tile and the path, no cover drawn", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Gym, path: 00-Inbox, image: Attachments/missing.jpg }", el);
        expect(nodes(el, "img.dashy-tile-cover")).toHaveLength(0);
        const warning = diagnostics(el, "warning")[0];
        expect(warning).toContain("Gym");
        expect(warning).toContain("Attachments/missing.jpg");
    });

    it("http (non-TLS) warns and the image is skipped", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Gym, path: 00-Inbox, image: http://example.com/gym.jpg }", el);
        expect(nodes(el, "img.dashy-tile-cover")).toHaveLength(0);
        expect(diagnostics(el, "warning")[0]).toContain("http://example.com/gym.jpg");
    });

    it("another scheme warns and the image is skipped", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Gym, path: 00-Inbox, image: ftp://example.com/gym.jpg }", el);
        expect(nodes(el, "img.dashy-tile-cover")).toHaveLength(0);
        expect(diagnostics(el, "warning")).toHaveLength(1);
    });

    it("a tile with no image key draws exactly as before, no cover class or element", () => {
        const el = host();
        renderTiles(ctx, "items:\n  - { label: Sport, path: 01-Areas/Sport }", el);
        expect(nodes(el, "img.dashy-tile-cover")).toHaveLength(0);
        expect(nodes(el, ".dashy-tile")[0]?.className).not.toContain("has-cover");
    });

    it("one tile with a cover and one without still both draw, side by side", () => {
        const fixture = mockContext({
            notes: [{ path: "00-Inbox/a.md" }],
            alsoExists: ["Attachments/gym.jpg"],
        });
        const el = host();
        renderTiles(
            fixture,
            "items:\n" +
                "  - { label: Gym, path: 00-Inbox, image: Attachments/gym.jpg }\n" +
                "  - { label: Sport, path: 01-Areas/Sport }",
            el,
        );
        expect(nodes(el, "img.dashy-tile-cover")).toHaveLength(1);
        expect(nodes(el, ".dashy-tile")).toHaveLength(2);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Gym", "Sport"]);
    });
});

describe("tiles — a folder as the path (B-144)", () => {
    /** The core File explorer, recording what it was asked to reveal. */
    function explorer(enabled = true): { entry: unknown; revealed: string[] } {
        const revealed: string[] = [];
        return {
            revealed,
            entry: { enabled, instance: { revealInFolder: (file: { path: string }) => revealed.push(file.path) } },
        };
    }

    /**
     * Stands in for Obsidian's own link handling: a click on an
     * `.internal-link` opens its `data-href`, and creates it when nothing is
     * there. This is how a folder tile used to leave an empty
     * `00-Inbox/00-Inbox.md` behind.
     */
    function obsidianLinks(el: HTMLElement): string[] {
        const opened: string[] = [];
        const handle = (evt: Event): void => {
            const link = evt.target instanceof HTMLElement ? evt.target.closest(".internal-link") : null;
            const href = link?.getAttribute("data-href");
            if (href) opened.push(href);
        };
        el.addEventListener("click", handle);
        el.addEventListener("auxclick", handle);
        return opened;
    }

    function click(target: Element | undefined, init: MouseEventInit = {}, type = "click"): MouseEvent {
        const evt = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
        target?.dispatchEvent(evt);
        return evt;
    }

    it("a folder without a folder note opens nothing and creates nothing, on any click", () => {
        const fe = explorer();
        const fixture = mockContext({ notes: [{ path: "00-Inbox/a.md" }], fileExplorer: fe.entry });
        const el = host();
        const opened = obsidianLinks(el);
        renderTiles(fixture, "items:\n  - { label: Inbox, path: 00-Inbox, badge: count }", el);

        const tile = nodes(el, ".dashy-tile-link")[0];
        expect(nodes(el, ".internal-link")).toHaveLength(0);
        expect(tile?.hasAttribute("href")).toBe(false);
        expect(tile?.hasAttribute("data-href")).toBe(false);

        expect(click(tile).defaultPrevented).toBe(true);
        expect(click(tile, { ctrlKey: true }).defaultPrevented).toBe(true);
        expect(click(tile, { metaKey: true }).defaultPrevented).toBe(true);
        expect(click(tile, { button: 1 }, "auxclick").defaultPrevented).toBe(true);
        expect(opened).toEqual([]);
        // The three clicks revealed the folder; the middle click did nothing.
        expect(fe.revealed).toEqual(["00-Inbox", "00-Inbox", "00-Inbox"]);
    });

    it("Enter on the focused tile reveals the folder too", () => {
        const fe = explorer();
        const fixture = mockContext({ notes: [{ path: "00-Inbox/a.md" }], fileExplorer: fe.entry });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Inbox, path: 00-Inbox }", el);
        const tile = nodes(el, ".dashy-tile-link")[0];
        expect(tile?.getAttribute("tabindex")).toBe("0");
        tile?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
        expect(fe.revealed).toEqual([]);
        tile?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(fe.revealed).toEqual(["00-Inbox"]);
    });

    it("the count badge on a folder tile is unchanged", () => {
        const fixture = mockContext({ notes: [{ path: "00-Inbox/a.md" }, { path: "00-Inbox/b.md" }] });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Inbox, path: 00-Inbox, badge: count }", el);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Inbox2"]);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a folder note inside the folder is what the tile links to", () => {
        const fixture = mockContext({ notes: [{ path: "00-Inbox/a.md" }, { path: "00-Inbox/00-Inbox.md" }] });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Inbox, path: 00-Inbox, badge: count }", el);
        const link = nodes(el, "a.dashy-tile-link")[0];
        expect(link?.getAttribute("data-href")).toBe("00-Inbox/00-Inbox.md");
        expect(link?.className).toBe("dashy-tile-link internal-link");
        // The folder note is a note in the folder, and the count says so.
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
    });

    it("a folder note next to the folder is linked when there is none inside", () => {
        const fixture = mockContext({ notes: [{ path: "01-Areas/Sport/run.md" }, { path: "01-Areas/Sport.md" }] });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Sport, path: 01-Areas/Sport }", el);
        expect(nodes(el, "a.dashy-tile-link")[0]?.getAttribute("data-href")).toBe("01-Areas/Sport.md");
    });

    it("with a note both inside and next to the folder, the one inside wins", () => {
        const fixture = mockContext({
            notes: [{ path: "Projects/Projects.md" }, { path: "Projects.md" }],
        });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Projects, path: Projects }", el);
        expect(nodes(el, "a.dashy-tile-link")[0]?.getAttribute("data-href")).toBe("Projects/Projects.md");
    });

    it("with the file explorer off or missing, a click does nothing and does not throw", () => {
        for (const fileExplorer of [explorer(false).entry, undefined, { enabled: true, instance: {} }]) {
            const fixture = mockContext({ notes: [{ path: "00-Inbox/a.md" }], fileExplorer });
            const el = host();
            const opened = obsidianLinks(el);
            renderTiles(fixture, "items:\n  - { label: Inbox, path: 00-Inbox }", el);
            const tile = nodes(el, ".dashy-tile-link")[0];
            expect(() => click(tile)).not.toThrow();
            expect(opened).toEqual([]);
        }
        const off = explorer(false);
        const fixture = mockContext({ notes: [{ path: "00-Inbox/a.md" }], fileExplorer: off.entry });
        const el = host();
        renderTiles(fixture, "items:\n  - { label: Inbox, path: 00-Inbox }", el);
        click(nodes(el, ".dashy-tile-link")[0]);
        expect(off.revealed).toEqual([]);
    });

    it("a note tile and a tile for a path that does not exist link exactly as before", () => {
        const fixture = mockContext({ notes: [{ path: "01-Areas/Sport/run.md" }], fileExplorer: explorer().entry });
        const el = host();
        renderTiles(
            fixture,
            "items:\n  - { label: Run, path: 01-Areas/Sport/run.md }\n  - { label: Idea, path: Ideas/new idea }",
            el,
        );
        const links = nodes(el, "a.dashy-tile-link");
        expect(links.map((l) => [l.className, l.getAttribute("data-href"), l.getAttribute("href")])).toEqual([
            ["dashy-tile-link internal-link", "01-Areas/Sport/run.md", "01-Areas/Sport/run.md"],
            ["dashy-tile-link internal-link", "Ideas/new idea", "Ideas/new idea"],
        ]);
    });
});

describe("tiles: a blank path and a selection that is not text (B-160)", () => {
    const fixture = mockContext({
        notes: [
            { path: "Tasks/a.md", tags: ["2024"] },
            { path: "Tasks/b.md", tags: [] },
            { path: "Other/c.md", tags: ["2024"] },
        ],
    });
    const render = (config: string): HTMLElement => {
        const el = host();
        renderTiles(fixture, config, el);
        return el;
    };

    it("a path of only spaces and no label is skipped like a tile with neither", () => {
        const el = render('items:\n  - { path: "  ", badge: count }\n  - { label: Real, path: Tasks }');
        expect(texts(el, ".dashy-tile-label")).toEqual(["Real"]);
        expect(nodes(el, ".dashy-tile")).toHaveLength(1);
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(diagnostics(el, "error")).toEqual([]);
    });

    it("with a label, a path of only spaces is no link, the same as no path", () => {
        const spaces = render('items:\n  - { label: A, path: "   " }');
        const none = render("items:\n  - { label: A }");
        expect(nodes(spaces, "a.dashy-tile-link")).toHaveLength(0);
        expect(spaces.innerHTML).toBe(none.innerHTML);
    });

    it("a path with spaces around a folder name reads as that folder", () => {
        const el = render('items:\n  - { label: T, path: " Tasks ", badge: count }');
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a count badge with tag: 2024 says to quote it", () => {
        const el = render("items:\n  - { label: T, path: Tasks, tag: 2024, badge: count }");
        expect(diagnostics(el, "error")).toEqual([
            '⛔ tiles: `tag` must be a tag name in text, got `2024`, so it was ignored and the tag filter is dropped. Put the tag name in quotes, as written: `tag: "2024"`.',
        ]);
    });

    it("quoted, the tag narrows the count without a word", () => {
        const el = render('items:\n  - { label: T, path: Tasks, tag: "2024", badge: count }');
        expect(texts(el, ".dashy-tile-badge")).toEqual(["1"]);
        expect(diagnostics(el, "error")).toEqual([]);
    });

    it("a source on a tile is only an unknown key, not a source error", () => {
        const el = render("items:\n  - { label: T, path: Tasks, source: 2024, badge: count }");
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toHaveLength(1);
        expect(diagnostics(el, "warning")[0]).toContain("source");
    });
});

describe("tiles: a path that is not text (B-178)", () => {
    const fixture = mockContext({
        notes: [
            { path: "2024/a.md" },
            { path: "2024/b.md" },
            { path: "Other/c.md" },
        ],
    });
    const render = (config: string): HTMLElement => {
        const el = host();
        renderTiles(fixture, config, el);
        return el;
    };

    it("a number says to quote it; the tile has no link and no count of the whole vault", () => {
        const el = render("items:\n  - { label: Year, path: 2024, badge: count }");
        expect(diagnostics(el, "error")).toEqual([
            '⛔ tiles: "Year": `path` must be a note or folder name in text, got `2024`, so it was ignored: ' +
                'the tile links nowhere and a `badge: count` on it is not drawn. ' +
                'Put the name in quotes, as written: `path: "2024"`.',
        ]);
        expect(texts(el, ".dashy-tile-label")).toEqual(["Year"]);
        expect(nodes(el, "a.dashy-tile-link")).toHaveLength(0);
        expect(nodes(el, ".dashy-tile-badge")).toHaveLength(0);
    });

    it("quoted, the same path links and counts its folder without a word", () => {
        const el = render('items:\n  - { label: Year, path: "2024", badge: count }');
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
        expect(nodes(el, ".dashy-tile-link.dashy-tile-folder")).toHaveLength(1);
        expect(diagnostics(el, "error")).toEqual([]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a list, a map and a boolean each name the value and ask for one name", () => {
        const el = render(
            "items:\n" +
                "  - { label: L, path: [2024, Other], badge: count }\n" +
                "  - { label: M, path: { a: 1 } }\n" +
                "  - { label: B, path: true, badge: count }",
        );
        const tail =
            ", so it was ignored: the tile links nowhere and a `badge: count` on it is not drawn. " +
            "Name one note or folder, like `path: Journal`.";
        expect(diagnostics(el, "error")).toEqual([
            '⛔ tiles: "L": `path` must be one note or folder name in text, got `[2024,"Other"]`' + tail,
            '⛔ tiles: "M": `path` must be one note or folder name in text, got `{"a":1}`' + tail,
            '⛔ tiles: "B": `path` must be one note or folder name in text, got `true`' + tail,
        ]);
        expect(texts(el, ".dashy-tile-label")).toEqual(["L", "M", "B"]);
        expect(nodes(el, "a.dashy-tile-link")).toHaveLength(0);
        expect(nodes(el, ".dashy-tile-badge")).toHaveLength(0);
    });

    it("without a label the tile is not drawn, but the error still names it", () => {
        const el = render("items:\n  - { path: 2024, badge: count }\n  - { label: Real, path: Other }");
        expect(texts(el, ".dashy-tile-label")).toEqual(["Real"]);
        expect(diagnostics(el, "error")).toHaveLength(1);
        expect(diagnostics(el, "error")[0]).toContain("a card with no label: `path` must be a note or folder name");
    });

    it("a count tile with a bad path does not warn about its tag or period being unused", () => {
        const el = render("items:\n  - { label: Y, path: 2024, tag: x, period: week, badge: count }");
        expect(diagnostics(el, "warning")).toEqual([]);
        expect(diagnostics(el, "error")).toHaveLength(1);
    });

    it("a custom badge is still printed next to a bad path", () => {
        const el = render("items:\n  - { label: Y, path: 2024, badge: soon }");
        expect(texts(el, ".dashy-tile-badge")).toEqual(["soon"]);
        expect(diagnostics(el, "error")).toHaveLength(1);
    });

    it("a path of only spaces is still no path, not an error", () => {
        const el = render('items:\n  - { label: A, path: "  ", badge: count }');
        expect(diagnostics(el, "error")).toEqual([]);
        expect(nodes(el, "a.dashy-tile-link")).toHaveLength(0);
    });

    it("an empty path is the blank case, not an error", () => {
        const el = render("items:\n  - { label: A, path: }");
        expect(diagnostics(el, "error")).toEqual([]);
        expect(nodes(el, "a.dashy-tile-link")).toHaveLength(0);
    });
});

describe("tiles — a period over daily notes named another way (B-120)", () => {
    it("the Daily notes day format decides which notes fall in the window", () => {
        const notes = [
            { path: "Diary/05.10.2026.md" },
            { path: "Diary/06.10.2026.md" },
            { path: "Diary/01.09.2026.md" },
        ];
        const config = "items:\n  - { label: Diary, path: Diary, period: week, badge: count }";
        const today = () => new Date(2026, 9, 6);
        const withSettings = host();
        renderTiles({ ...mockContext({ notes, dailyNotes: { format: "DD.MM.YYYY" } }), today }, config, withSettings);
        expect(texts(withSettings, ".dashy-tile-badge")).toEqual(["2"]);
        // Without it, no name is a date, and the tile says so rather than counting zero silently.
        const without = host();
        renderTiles({ ...mockContext({ notes }), today }, config, without);
        expect(texts(without, ".dashy-tile-badge")).toEqual(["0"]);
        expect(diagnostics(without, "warning")[0]).toContain("none of the selected notes has a name starting with a date");
    });
});

describe("tiles: a badge's own date_format (B-174)", () => {
    // Tuesday, 6 Oct 2026; in English the week runs Sunday 4 to Saturday 10 October.
    const today = (): Date => new Date(2026, 9, 6);
    const diary = [
        { path: "Diary/05.10.2026.md" },
        { path: "Diary/06.10.2026.md" },
        { path: "Diary/01.09.2026.md" },
    ];
    const render = (config: string, vault: Parameters<typeof mockContext>[0] = { notes: diary }): HTMLElement => {
        const el = host();
        renderTiles({ ...mockContext(vault), today }, config, el);
        return el;
    };

    it("date_format reads DD.MM.YYYY names with no settings format, where the tile alone counted 0", () => {
        const withFormat = render(
            "items:\n  - { label: Diary, path: Diary, period: week, date_format: DD.MM.YYYY, badge: count }",
        );
        expect(texts(withFormat, ".dashy-tile-badge")).toEqual(["2"]);
        expect(diagnostics(withFormat, "warning")).toEqual([]);

        const without = render("items:\n  - { label: Diary, path: Diary, period: week, badge: count }");
        expect(texts(without, ".dashy-tile-badge")).toEqual(["0"]);
        expect(diagnostics(without, "warning")).toHaveLength(1);
        expect(diagnostics(without, "warning")[0]).toContain("Set `date_format:`");
    });

    it("the tile's own format is tried before the settings one", () => {
        // Under MM.DD.YYYY, 05.10.2026 is 10 May and 06.10.2026 is 10 June: outside this week.
        const vault = { notes: diary, dailyNotes: { format: "MM.DD.YYYY" } };
        const own = render(
            "items:\n  - { label: Diary, path: Diary, period: week, date_format: DD.MM.YYYY, badge: count }", vault,
        );
        expect(texts(own, ".dashy-tile-badge")).toEqual(["2"]);
        const settingsOnly = render("items:\n  - { label: Diary, path: Diary, period: week, badge: count }", vault);
        expect(texts(settingsOnly, ".dashy-tile-badge")).toEqual(["0"]);
    });

    it("reads date_field values in the format, and counts a fixed window to its own last day", () => {
        const notes = [
            { path: "Log/a.md", frontmatter: { day: "01.10.2026" } },
            { path: "Log/b.md", frontmatter: { day: "03.10.2026" } },
            { path: "Log/c.md", frontmatter: { day: "06.10.2026" } },
        ];
        const el = render(
            "items:\n  - { label: Log, path: Log, date_field: day, date_format: DD.MM.YYYY, " +
                "period: { from: 2026-10-01, to: 2026-10-03 }, badge: count }",
            { notes },
        );
        expect(texts(el, ".dashy-tile-badge")).toEqual(["2"]);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a window that has not started yet shows no badge, and a fitting format adds no warning", () => {
        const el = render(
            "items:\n  - { label: Diary, path: Diary, period: { from: 2026-11-01, to: 2026-11-30 }, " +
                "date_format: DD.MM.YYYY, badge: count }",
        );
        expect(nodes(el, ".dashy-tile-badge")).toHaveLength(0);
        expect(nodes(el, ".dashy-notice")).toHaveLength(1);
        expect(diagnostics(el, "warning")).toEqual([]);
    });

    it("a format that fits none of the selected notes warns, naming the first name by path", () => {
        const el = render("items:\n  - { label: Diary, path: Diary, period: week, date_format: YYYYMMDD, badge: count }");
        expect(texts(el, ".dashy-tile-badge")).toEqual(["0"]);
        const warnings = diagnostics(el, "warning");
        expect(warnings).toContain(
            '⚠️ tiles: `date_format: YYYYMMDD` fits none of the selected notes: "01.09.2026", for one, is not written that way.',
        );
        expect(warnings).toHaveLength(2);
    });

    it("a date_format that is not text, or names no day, warns and the tile counts as without it", () => {
        const notText = render("items:\n  - { label: Diary, path: Diary, period: week, date_format: 5, badge: count }");
        expect(diagnostics(notText, "warning")).toContain(
            '⚠️ tiles: `date_format` expects a date format such as DD.MM.YYYY, got "5". Ignored.',
        );
        expect(texts(notText, ".dashy-tile-badge")).toEqual(["0"]);

        // The settings format still reads the names once the tile's own is ignored.
        const noDay = render(
            "items:\n  - { label: Diary, path: Diary, period: week, date_format: MM.YYYY, badge: count }",
            { notes: diary, dailyNotes: { format: "DD.MM.YYYY" } },
        );
        expect(diagnostics(noDay, "warning")).toEqual([
            "⚠️ tiles: `date_format: MM.YYYY` has no year, month and day in it, so it cannot name a day. Ignored. Write it like DD.MM.YYYY.",
        ]);
        expect(texts(noDay, ".dashy-tile-badge")).toEqual(["2"]);
    });

    it("date_format without period warns like date_field does, and the count runs over the whole folder", () => {
        const el = render("items:\n  - { label: Diary, path: Diary, date_format: DD.MM.YYYY, badge: count }");
        expect(diagnostics(el, "warning")).toEqual(['⚠️ tiles: "Diary": `date_format` has no effect without `period`.']);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["3"]);
    });

    it("an unreadable date_format without period warns only that it is ignored", () => {
        const el = render("items:\n  - { label: Diary, path: Diary, date_format: 5, badge: count }");
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ tiles: `date_format` expects a date format such as DD.MM.YYYY, got "5". Ignored.',
        ]);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["3"]);
    });

    it("date_format on a custom badge warns that it only serves badge: count, and the badge shows as given", () => {
        const el = render("items:\n  - { label: Diary, path: Diary, date_format: DD.MM.YYYY, badge: soon }");
        expect(diagnostics(el, "warning")).toEqual([
            '⚠️ tiles: "Diary": `tag`, `where`, `period`, `date_field` and `date_format` only apply to `badge: count`.',
        ]);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["soon"]);
    });
});
