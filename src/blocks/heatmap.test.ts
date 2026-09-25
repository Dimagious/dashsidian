import { describe, it, expect } from "vitest";
import { renderHeatmap } from "./heatmap";
import { formatValue } from "../core/stat";
import { mockContext, diary, host, texts, nodes, diagnostics } from "../test/vault";

// 2026 starts on a Thursday. With weeks starting on Sunday (the English
// locale) that means four pad cells before January 1st.
const ctx = mockContext({
    notes: [
        ...diary("Diary", "2026-01-01", 30, (i) => ({ sleep_score: 60 + i, steps: 5000 + i * 300 })),
        { path: "Diary/not-a-date.md", frontmatter: { sleep_score: 99 } },
        { path: "Diary/2026-02-05.md", frontmatter: { note: "no number here" } },
    ],
});

const map = (config: string, context = ctx) => {
    const el = host();
    renderHeatmap(context, config, el);
    return el;
};

describe("heatmap — the grid matches the calendar", () => {
    it("draws one grid for the one year present", () => {
        expect(nodes(map("source: Diary\nfield: sleep_score"), ".dashy-hm-grid")).toHaveLength(1);
    });

    it("pads the start of the year so the first row is the first weekday", () => {
        const el = map("source: Diary\nfield: sleep_score");
        // 1 January 2026 is a Thursday: four pads in a Sunday-first week.
        expect(nodes(el, ".dashy-hm-pad")).toHaveLength(4);
    });

    it("every day of the year up to today gets a cell", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const cells = nodes(el, ".dashy-hm-cell").length - nodes(el, ".dashy-hm-pad").length;
        const start = new Date(2026, 0, 1);
        const now = new Date();
        // Date-only on both ends: a time of day would round the difference up.
        const end = now.getFullYear() === 2026
            ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
            : new Date(2026, 11, 31);
        const expected = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
        expect(cells).toBe(expected);
    });

    it("only days with data are coloured; the rest stay bare", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const coloured = nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "");
        expect(coloured).toHaveLength(30);
    });

    it("a day with data links to its note and says what it holds", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const link = nodes(el, "a.dashy-hm-cell")[0];
        expect(link?.getAttribute("data-href")).toBe("Diary/2026-01-01.md");
        expect(link?.getAttribute("title")).toContain("sleep_score 60");
        expect(link?.getAttribute("aria-label")).toBe(link?.getAttribute("title"));
    });

    it("a day without data says so rather than staying silent", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const bare = nodes(el, "div.dashy-hm-cell").find((c) => !c.className.includes("pad"));
        expect(bare?.getAttribute("title")).toContain("no data");
    });

    it("`link: false` draws cells that are not links", () => {
        const el = map("source: Diary\nfield: sleep_score\nlink: false");
        expect(nodes(el, "a.dashy-hm-cell")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-cell").length).toBeGreaterThan(0);
    });

    it("weekday labels run Monday, Wednesday, Friday", () => {
        const el = map("source: Diary\nfield: sleep_score");
        expect(texts(el, ".dashy-hm-wd").filter(Boolean)).toHaveLength(3);
    });

    it("months are labelled from January", () => {
        const el = map("source: Diary\nfield: sleep_score");
        expect(texts(el, ".dashy-hm-mon")[0]).toBeTruthy();
        expect(nodes(el, ".dashy-hm-mon")[0]?.style.gridColumnStart).toBe("1");
    });
});

describe("heatmap — colours and bands", () => {
    it("bands become a legend, top band first and open above", () => {
        const el = map("source: Diary\nfield: sleep_score\nbands: [90, 80, 60]");
        expect(texts(el, ".dashy-hm-leg")).toEqual(["90+", "80–89", "60–79"]);
    });

    it("a higher value gets a stronger colour than a lower one", () => {
        const el = map("source: Diary\nfield: sleep_score\nbands: [80, 70, 60]");
        const alpha = (title: string) => {
            const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.includes(title));
            const colour = cell?.style.backgroundColor ?? "";
            // jsdom re-serialises a fully opaque rgba() as rgb(), so a missing
            // fourth component means alpha 1 rather than a parse failure.
            const parts = /\(([^)]*)\)/.exec(colour)?.[1]?.split(",") ?? [];
            return parts.length === 4 ? Number(parts[3]) : parts.length === 3 ? 1 : 0;
        };
        expect(alpha("sleep_score 85")).toBeGreaterThan(alpha("sleep_score 75"));
        expect(alpha("sleep_score 75")).toBeGreaterThan(alpha("sleep_score 65"));
    });

    it("a named colour is used, and nonsense falls back instead of failing", () => {
        const green = map("source: Diary\nfield: sleep_score\ncolor: green");
        const broken = map("source: Diary\nfield: sleep_score\ncolor: not-a-colour");
        const first = (el: HTMLElement) =>
            nodes(el, ".dashy-hm-cell").find((c) => c.style.backgroundColor !== "")?.style.backgroundColor;
        expect(first(green)).toContain("34, 197, 94");
        expect(first(broken)).toContain("59, 130, 246");
    });

    it("without bands there is one legend entry covering everything", () => {
        expect(texts(map("source: Diary\nfield: sleep_score"), ".dashy-hm-leg")).toEqual(["has data"]);
    });
});

describe("heatmap — the caption", () => {
    it("says the year, the field, the average and how many days have data", () => {
        const caption = texts(map("source: Diary\nfield: sleep_score"), ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("2026");
        expect(caption).toContain("sleep_score");
        // 60 through 89 averages 74.5, and the caption says so. It used to
        // round to a whole number while a stat card over the same data printed
        // the decimal, and both were presented as facts.
        expect(caption).toContain("average 74.5");
        expect(caption).toContain("30 of");
    });

    it("a custom title replaces it and survives the synonym table", () => {
        // `title` is a synonym of `label` elsewhere; here it is the block's own key.
        const el = map("source: Diary\nfield: sleep_score\ntitle: My sleep");
        expect(texts(el, ".dashy-hm-title")).toEqual(["My sleep"]);
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    // A year that spans two calendars draws two grids. Under one custom title
    // they are indistinguishable, and the second one — whose data sits off to
    // the right — reads as an empty copy of the first. Reported as a duplicate
    // by the person who wrote the block.
    it("two years under a custom title each say which year they are", () => {
        const twoYears = mockContext({
            notes: [
                ...diary("Diary", "2025-11-01", 20, (i) => ({ sleep_score: 70 + i })),
                ...diary("Diary", "2026-01-01", 20, (i) => ({ sleep_score: 60 + i })),
            ],
        });
        const el = map("source: Diary\nfield: sleep_score\ntitle: My sleep", twoYears);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(2);
        expect(texts(el, ".dashy-hm-title")).toEqual(["My sleep (2026)", "My sleep (2025)"]);
    });

    it("one year leaves the custom title alone", () => {
        const el = map("source: Diary\nfield: sleep_score\ntitle: My sleep");
        expect(texts(el, ".dashy-hm-title")).toEqual(["My sleep"]);
    });
});

describe("heatmap — boolean checkbox fields", () => {
    // A ticked Obsidian checkbox property (`gym: true`) is the most requested
    // habit-tracker shape: a daily note with nothing but a checkbox should
    // still paint a heatmap.
    const gymCtx = mockContext({
        // day 0 (Jan 1) ticked, day 1 (Jan 2) unticked, day 2 (Jan 3) ticked.
        notes: diary("Diary", "2026-01-01", 3, (i) => ({ gym: i !== 1 })),
    });

    it("a ticked day is painted like a value of 1", () => {
        const el = map("source: Diary\nfield: gym", gymCtx);
        const jan1 = nodes(el, "a.dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith("2026-01-01"));
        expect(jan1?.getAttribute("title")).toContain("gym 1");
        expect(jan1?.style.backgroundColor).not.toBe("");
    });

    it("an unticked day is not painted and reads exactly like a day without data", () => {
        const el = map("source: Diary\nfield: gym", gymCtx);
        const jan2 = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith("2026-01-02"));
        expect(jan2?.tagName).toBe("DIV");
        expect(jan2?.style.backgroundColor).toBe("");
        expect(jan2?.getAttribute("title")).toContain("no data");
    });

    it("only the ticked days count toward the total painted", () => {
        const el = map("source: Diary\nfield: gym", gymCtx);
        const coloured = nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "");
        expect(coloured).toHaveLength(2);
    });

    it("a year that is entirely booleans drops the average from the caption", () => {
        const caption = texts(map("source: Diary\nfield: gym", gymCtx), ".dashy-hm-title")[0] ?? "";
        expect(caption).not.toContain("average");
        expect(caption).toContain("gym");
        expect(caption).toContain("2 of");
    });

    it("a year mixing numbers and booleans keeps the average", () => {
        const mixedCtx = mockContext({
            notes: [
                ...diary("Diary", "2026-01-01", 1, () => ({ steps: true })),
                ...diary("Diary", "2026-01-02", 1, () => ({ steps: 500 })),
            ],
        });
        const caption = texts(map("source: Diary\nfield: steps", mixedCtx), ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("average");
    });

    // The caption average has to agree with what a `stats` `avg` card would
    // show over the same field: both sum every recognised day and divide by
    // how many there are, a `false` counted as 0. Counting only the painted
    // days used to inflate this to (4 + 1) / 2 = 2.5.
    it("the caption average counts a false day as 0, the same as a stats avg would", () => {
        const days3Ctx = mockContext({
            notes: [
                ...diary("Diary", "2026-01-01", 1, () => ({ steps: 4 })),
                ...diary("Diary", "2026-01-02", 1, () => ({ steps: true })),
                ...diary("Diary", "2026-01-03", 1, () => ({ steps: false })),
            ],
        });
        const caption = texts(map("source: Diary\nfield: steps", days3Ctx), ".dashy-hm-title")[0] ?? "";
        const expected = formatValue((4 + 1 + 0) / 3);
        expect(caption).toContain(`average ${expected}`);
        // The false day still is not painted, so only 2 of 3 count as "present".
        expect(caption).toContain("2 of");
    });

    it("a field that is false every day still draws the year, not a no-data error", () => {
        const allFalseCtx = mockContext({
            notes: diary("Diary", "2026-01-01", 3, () => ({ gym: false })),
        });
        const el = map("source: Diary\nfield: gym", allFalseCtx);
        expect(diagnostics(el, "error")).toHaveLength(0);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("0 of");
        expect(nodes(el, ".dashy-hm-cell").filter((c) => c.style.backgroundColor !== "")).toHaveLength(0);
    });

    // Two notes named for the same day disagreeing (a ticked one in one
    // folder, an unticked one in another) used to paint or not depending on
    // which the vault happened to list last. `streak` never had this problem:
    // it drops `false` notes before deduping date names, so any note that
    // survives keeps the day, in either order. The heatmap now agrees with it.
    it.each([
        ["ticked note listed first", [
            { path: "Personal/2026-01-02.md", frontmatter: { gym: true } },
            { path: "Work/2026-01-02.md", frontmatter: { gym: false } },
        ]],
        ["ticked note listed last", [
            { path: "Work/2026-01-02.md", frontmatter: { gym: false } },
            { path: "Personal/2026-01-02.md", frontmatter: { gym: true } },
        ]],
    ])("a ticked twin always wins over an unticked one, regardless of order (%s)", (_label, notes) => {
        const el = map("field: gym", mockContext({ notes }));
        const link = nodes(el, "a.dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith("2026-01-02"));
        expect(link?.getAttribute("data-href")).toBe("Personal/2026-01-02.md");
        expect(link?.getAttribute("title")).toContain("gym 1");
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("1 of");
    });
});

describe("heatmap — dated names beyond an exact YYYY-MM-DD, and date_field (B-081)", () => {
    it("a name with a day-of-week suffix is painted, same as an exact one", () => {
        const notes = [{ path: "Diary/2026-01-05 Monday.md", frontmatter: { sleep_score: 88 } }];
        const el = map("field: sleep_score", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith("2026-01-05"));
        expect(cell?.style.backgroundColor).not.toBe("");
        expect(cell?.getAttribute("title")).toContain("sleep_score 88");
    });

    it("two numeric notes for the same day sum into one cell", () => {
        const notes = [
            { path: "Diary/2026-01-10.md", frontmatter: { steps: 5000 } },
            { path: "Diary/2026-01-10 evening.md", frontmatter: { steps: 3000 } },
        ];
        const el = map("field: steps", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith("2026-01-10"));
        expect(cell?.getAttribute("title")).toContain("steps 8000");
    });

    it("a ticked and an unticked note for the same day are painted, even with a suffixed name", () => {
        const notes = [
            { path: "Diary/2026-01-15.md", frontmatter: { gym: false } },
            { path: "Diary/2026-01-15 evening.md", frontmatter: { gym: true } },
        ];
        const el = map("field: gym", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith("2026-01-15"));
        expect(cell?.style.backgroundColor).not.toBe("");
        // The tick makes the day painted; the value shown is still the sum
        // (1 for the tick, 0 for the miss).
        expect(cell?.getAttribute("title")).toContain("gym 1");
    });

    it.each([
        ["A-folder listed first", [
            { path: "A-folder/2026-01-11.md", frontmatter: { steps: 100 } },
            { path: "B-folder/2026-01-11.md", frontmatter: { steps: 200 } },
        ]],
        ["A-folder listed last", [
            { path: "B-folder/2026-01-11.md", frontmatter: { steps: 200 } },
            { path: "A-folder/2026-01-11.md", frontmatter: { steps: 100 } },
        ]],
    ])("the link target is deterministic regardless of input order, even with two painted contributors (%s)", (_label, notes) => {
        const el = map("field: steps", mockContext({ notes }));
        const link = nodes(el, "a.dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith("2026-01-11"));
        expect(link?.getAttribute("data-href")).toBe("A-folder/2026-01-11.md");
        expect(link?.getAttribute("title")).toContain("steps 300");
    });

    it("date_field reads a frontmatter property instead of the note name", () => {
        const notes = [
            { path: "Books/rich-dad.md", frontmatter: { finished: "2026-01-12", rating: 5 } },
            { path: "Books/poor-dad.md", frontmatter: { finished: "2026-01-12", rating: 3 } },
        ];
        const el = map("field: rating\ndate_field: finished", mockContext({ notes }));
        const cell = nodes(el, ".dashy-hm-cell").find((c) => c.getAttribute("title")?.startsWith("2026-01-12"));
        expect(cell?.getAttribute("title")).toContain("rating 8");
    });

    it("date_field is unknown-key-free and appears in the diagnostics list only when misspelled", () => {
        const notes = [{ path: "Books/a.md", frontmatter: { finished: "2026-01-12", rating: 5 } }];
        const el = map("field: rating\ndate_field: finished", mockContext({ notes }));
        expect(diagnostics(el, "warning")).toHaveLength(0);
    });

    // A name with an invalid calendar date is not asserted directly against
    // the grid here: `layoutYear`/`eachDay` only ever generate real calendar
    // days to look marks up by, so a fabricated key like "2026-02-30" could
    // never be found in the grid regardless of whether `resolveNoteDate`
    // validated it — the padding would pass even with that check removed.
    // The resolver's own validation is pinned where it can actually fail,
    // in `core/note-date.test.ts`, and again at the block layer in
    // `stats.test.ts` ("a note named for an impossible date...", "a real
    // leap day name counts..."), where a `streak`/`count` reading really
    // does change if an invalid name is wrongly accepted.

    it("same-day notes sum before the caption averages, not the last one read (B-081 round 2)", () => {
        const notes = [
            { path: "Diary/2026-01-13.md", frontmatter: { steps: 1000 } },
            { path: "Diary/2026-01-13 evening.md", frontmatter: { steps: 3000 } }, // day total 4000
            { path: "Diary/2026-01-14.md", frontmatter: { steps: 2000 } }, // day total 2000
        ];
        const el = map("field: steps", mockContext({ notes }));
        const caption = texts(el, ".dashy-hm-title")[0] ?? "";
        // The caption always averaged over days (one Map entry per day, both
        // before and after B-081); what changed is what a day's own value
        // is: the sum of its notes, 4000 for the 13th, rather than whichever
        // one note happened to be read last. Average over the two days:
        // (4000 + 2000) / 2 = 3000, not (1000 + 3000 + 2000) / 3, which is
        // what averaging over notes instead of days would give, and not
        // (3000 + 2000) / 2 = 2500 either, which is what "last write wins"
        // on the 13th would give.
        expect(caption).toContain(`average ${formatValue((4000 + 2000) / 2)}`);
        expect(caption).toContain("2 of");
    });
});

describe("heatmap — edges", () => {
    it("no field is an error naming what is missing", () => {
        const el = map("source: Diary");
        expect(diagnostics(el, "error")[0]).toContain("field");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("a field nothing carries is an error, not an empty grid", () => {
        const el = map("source: Diary\nfield: nowhere");
        expect(diagnostics(el, "error")[0]).toContain("nowhere");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("notes not named as dates are ignored, not counted", () => {
        const caption = texts(map("source: Diary\nfield: sleep_score"), ".dashy-hm-title")[0] ?? "";
        expect(caption).toContain("30 of");
    });

    it("an unknown key warns with a suggestion and still draws", () => {
        const el = map("source: Diary\nfield: sleep_score\nfeild: x");
        expect(diagnostics(el, "warning")[0]).toContain("field");
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
    });

    it("two years give two grids, newest first", () => {
        const twoYears = mockContext({
            notes: [
                ...diary("Diary", "2025-03-01", 5, () => ({ v: 1 })),
                ...diary("Diary", "2026-03-01", 5, () => ({ v: 1 })),
            ],
        });
        const el = map("source: Diary\nfield: v", twoYears);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(2);
        expect(texts(el, ".dashy-hm-title")[0]).toContain("2026");
        expect(texts(el, ".dashy-hm-title")[1]).toContain("2025");
    });

    it("a list where a set of fields was expected is reported", () => {
        const el = map("- source: Diary");
        expect(diagnostics(el, "error")).toHaveLength(1);
    });
});

/**
 * jsdom never lays anything out, so `scrollWidth` / `clientWidth` are 0 on
 * every element (see the comment on `settled` in heatmap.ts). These tests
 * stand the scroller's metrics up by hand instead of trusting layout, the
 * same way a real browser would report them once the grid is wider than its
 * note. `.dashy-hm-scroll` is the scroller, not `.dashy-hm-wrap`: the title
 * and the weekday column live outside it and never move or fade (the fade
 * is a CSS mask keyed off the classes asserted here, not a separate
 * element, so there is nothing further to assert about it in a DOM that
 * never lays out).
 *
 * `updateScrollState` is driven by a `ResizeObserver`, not a timer, so
 * these tests install a fake one and fire it by hand rather than waiting on
 * anything — no fake timers needed here, unlike an earlier version of this
 * mechanism.
 */
describe("heatmap — the scroller says when there is more to see", () => {
    function stubMetrics(scroller: HTMLElement, scrollLeft: number, clientWidth: number, scrollWidth: number): void {
        // `writable: true` on `scrollLeft`: production code assigns to it
        // (the deferred initial scroll, below), and a non-writable stub
        // would throw the moment it tried.
        Object.defineProperty(scroller, "scrollLeft", { value: scrollLeft, configurable: true, writable: true });
        Object.defineProperty(scroller, "clientWidth", { value: clientWidth, configurable: true });
        Object.defineProperty(scroller, "scrollWidth", { value: scrollWidth, configurable: true });
    }

    /** A `ResizeObserver` stand-in the test fires on demand instead of waiting for a real resize. */
    class ManualResizeObserver implements ResizeObserver {
        static instances: ManualResizeObserver[] = [];
        constructor(private readonly callback: ResizeObserverCallback) {
            ManualResizeObserver.instances.push(this);
        }
        observe(): void { /* not exercised */ }
        unobserve(): void { /* not exercised */ }
        disconnect(): void { /* not exercised */ }
        /** Runs this observer's callback, the way a real resize would. */
        fire(): void {
            this.callback([], this);
        }
    }

    function withManualResizeObserver(run: () => void): void {
        const original = window.ResizeObserver;
        ManualResizeObserver.instances = [];
        window.ResizeObserver = ManualResizeObserver;
        try {
            run();
        } finally {
            window.ResizeObserver = original;
        }
    }

    it("a grid that fits (jsdom's default 0/0/0) carries neither class", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const scroller = nodes(el, ".dashy-hm-scroll")[0]!;
        expect(scroller.classList.contains("can-scroll-left")).toBe(false);
        expect(scroller.classList.contains("can-scroll-right")).toBe(false);
    });

    it("scrolls to the end once the observer reports a real, wider-than-the-note width", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;
            expect(scroller.scrollLeft).toBe(0);

            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();

            expect(scroller.scrollLeft).toBe(600);
            expect(scroller.classList.contains("can-scroll-left")).toBe(true);
            expect(scroller.classList.contains("can-scroll-right")).toBe(false);
        });
    });

    it("stops re-asserting the end once the reader has actually scrolled", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(600);

            // A wheel event on the scroller is the reader taking over.
            scroller.dispatchEvent(new Event("wheel"));

            // A later resize with a real width no longer forces the end, or
            // a reader who scrolled back to January would get yanked
            // forward again on every later resize.
            stubMetrics(scroller, 50, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(50);
        });
    });

    it("an unstyled reading (scrollWidth equal to clientWidth) neither scrolls nor settles", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            // The plugin's own stylesheet has not applied yet: the browser
            // default `overflow-x: visible` reports the same number for
            // both, wider than the note or not.
            stubMetrics(scroller, 0, 452, 452);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(0);
            expect(scroller.classList.contains("can-scroll-left")).toBe(false);
            expect(scroller.classList.contains("can-scroll-right")).toBe(false);

            // The stylesheet lands: still not settled, so the real, styled
            // reading still gets its turn.
            stubMetrics(scroller, 0, 300, 600);
            ManualResizeObserver.instances[0]!.fire();
            expect(scroller.scrollLeft).toBe(600);
        });
    });

    it("a scroll event recomputes the classes from the scroller's current metrics", () => {
        withManualResizeObserver(() => {
            const el = map("source: Diary\nfield: sleep_score");
            const scroller = nodes(el, ".dashy-hm-scroll")[0]!;

            // Settle first (a real drag), so the positions below are not
            // overwritten by the deferred initial scroll mid-test.
            scroller.dispatchEvent(new Event("wheel"));

            // At the left edge: only the right side has more.
            stubMetrics(scroller, 0, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.classList.contains("can-scroll-left")).toBe(false);
            expect(scroller.classList.contains("can-scroll-right")).toBe(true);

            // Scrolled into the middle: both sides have more.
            stubMetrics(scroller, 150, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.classList.contains("can-scroll-left")).toBe(true);
            expect(scroller.classList.contains("can-scroll-right")).toBe(true);

            // Scrolled to the right edge: only the left side has more.
            stubMetrics(scroller, 300, 300, 600);
            scroller.dispatchEvent(new Event("scroll"));
            expect(scroller.classList.contains("can-scroll-left")).toBe(true);
            expect(scroller.classList.contains("can-scroll-right")).toBe(false);
        });
    });

    it("the weekday column and the title sit outside the scroller", () => {
        const el = map("source: Diary\nfield: sleep_score");
        const scroller = nodes(el, ".dashy-hm-scroll")[0]!;
        expect(scroller.querySelector(".dashy-hm-side")).toBeNull();
        expect(scroller.querySelector(".dashy-hm-title")).toBeNull();
    });

    it("does not leak a ResizeObserver across redraws of the same element", () => {
        class FakeResizeObserver implements ResizeObserver {
            static observeCount = 0;
            static disconnectCount = 0;
            constructor(private readonly callback: ResizeObserverCallback) {}
            observe(): void { FakeResizeObserver.observeCount += 1; }
            unobserve(): void { /* not exercised */ }
            disconnect(): void { FakeResizeObserver.disconnectCount += 1; }
        }

        const original = window.ResizeObserver;
        window.ResizeObserver = FakeResizeObserver;
        try {
            const el = host();
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(FakeResizeObserver.observeCount).toBe(1);
            expect(FakeResizeObserver.disconnectCount).toBe(0);

            // A redraw on the same element (a vault event, a settings change)
            // must disconnect the observer it made last time before making a
            // new one, or every redraw adds one more that never stops firing.
            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(FakeResizeObserver.disconnectCount).toBe(1);
            expect(FakeResizeObserver.observeCount).toBe(2);

            renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(FakeResizeObserver.disconnectCount).toBe(2);
            expect(FakeResizeObserver.observeCount).toBe(3);
        } finally {
            window.ResizeObserver = original;
        }
    });

    it("the returned disposer disconnects the observer, and is idempotent", () => {
        class FakeResizeObserver implements ResizeObserver {
            static observeCount = 0;
            static disconnectCount = 0;
            constructor(private readonly callback: ResizeObserverCallback) {}
            observe(): void { FakeResizeObserver.observeCount += 1; }
            unobserve(): void { /* not exercised */ }
            disconnect(): void { FakeResizeObserver.disconnectCount += 1; }
        }

        const original = window.ResizeObserver;
        window.ResizeObserver = FakeResizeObserver;
        try {
            const el = host();
            // This is what `DashyBlock.onunload` (src/app/plugin.ts) calls
            // when a block is removed from the note entirely, not redrawn:
            // a redraw disconnects its own predecessor already, but nothing
            // else ever runs this cleanup for the very last draw.
            const dispose = renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(typeof dispose).toBe("function");
            expect(FakeResizeObserver.disconnectCount).toBe(0);

            dispose?.();
            expect(FakeResizeObserver.disconnectCount).toBe(1);

            // A stray double-unload finds nothing left to disconnect rather
            // than double-counting or throwing.
            dispose?.();
            expect(FakeResizeObserver.disconnectCount).toBe(1);
        } finally {
            window.ResizeObserver = original;
        }
    });

    it("without a ResizeObserver the block still draws and returns no disposer", () => {
        const original = window.ResizeObserver;
        Reflect.deleteProperty(window, "ResizeObserver");
        try {
            const el = host();
            const dispose = renderHeatmap(ctx, "source: Diary\nfield: sleep_score", el);
            expect(dispose).toBeUndefined();
            expect(nodes(el, ".dashy-hm-grid")).toHaveLength(1);
        } finally {
            window.ResizeObserver = original;
        }
    });
});
