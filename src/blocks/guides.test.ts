import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { BlockContext } from "./context";
import { renderCountdown } from "./countdown";
import { renderChart } from "./chart";
import { renderStats } from "./stats";
import { renderProgress } from "./progress";
import { renderTiles } from "./tiles";
import { renderToday } from "./today";
import { renderHeatmap } from "./heatmap";
import { mockContext, diary, host, texts, nodes, diagnostics, type FakeNote, type FakeVault } from "../test/vault";

/**
 * The site guides (B-155), checked against the code they describe.
 *
 * Every Dashy block printed on a guide page is rendered here against a vault
 * shaped like that guide's example, and must draw without a single error or
 * warning. The specific numbers, captions and dates a guide's prose promises
 * are asserted on their own below, so a change in the code that makes a guide
 * wrong fails here rather than on the published page.
 */

// Monday 5 October 2026, noon. The test locale (moment's `en`) starts weeks on Sunday.
const TODAY = new Date(2026, 9, 5, 12, 0, 0);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
});
afterEach(() => {
    vi.useRealTimers();
});

type Render = (ctx: BlockContext, source: string, el: HTMLElement) => void | (() => void);

const RENDERERS: Record<string, Render> = {
    countdown: renderCountdown,
    chart: renderChart,
    "dashy-chart": renderChart,
    stats: renderStats,
    progress: renderProgress,
    tiles: renderTiles,
    today: renderToday,
    heatmap: renderHeatmap,
};

/** Renders one block the way Obsidian hands it a code block, stopping a clock it may start. */
function render(lang: string, source: string, vault: FakeVault): HTMLElement {
    const draw = RENDERERS[lang];
    if (!draw) throw new Error(`no renderer for ${lang}`);
    const el = host();
    const stop = draw(mockContext(vault), source, el);
    if (stop) stop();
    return el;
}

function decode(html: string): string {
    return html
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
}

/** Every fenced Dashy block inside a `<pre><code>` on a guide page, as the reader copies it. */
function guideBlocks(slug: string): { lang: string; source: string }[] {
    // vitest runs from the repository root; import.meta.url is not a file URL under jsdom.
    const file = path.resolve(process.cwd(), "site/guides", slug, "index.html");
    const html = readFileSync(file, "utf8");
    const blocks: { lang: string; source: string }[] = [];
    for (const pre of html.matchAll(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g)) {
        const code = decode(pre[1] ?? "");
        for (const fence of code.matchAll(/```([\w-]+)\n([\s\S]*?)\n```/g)) {
            const lang = fence[1] ?? "";
            if (lang in RENDERERS) blocks.push({ lang, source: fence[2] ?? "" });
        }
    }
    return blocks;
}

function expectClean(el: HTMLElement): void {
    expect(diagnostics(el, "error")).toEqual([]);
    expect(diagnostics(el, "warning")).toEqual([]);
}

/* ---------------------------------------------------------------- guide 1 */

const PEOPLE: FakeNote[] = [
    { path: "People/Anna.md", frontmatter: { name: "Anna", birthday: "1991-11-02" }, tags: ["person"] },
    { path: "People/Leo.md", frontmatter: { name: "Leo", birthday: "2000-02-29" } },
    { path: "Documents/Passport.md", frontmatter: { type: "passport", expires: "2031-03-14" } },
    { path: "Documents/First aid.md", frontmatter: { type: "first-aid", expires: "2026-08-26" } },
    { path: "Family.md", frontmatter: { mum_birthday: "1962-04-30", dad_birthday: "1960-12-01" } },
];

const BIRTHDAYS = `items:
  - { label: Anna, field: birthday, repeat: yearly, source: People, where: "name = Anna", icon: 🎂 }
  - { label: Leo, field: birthday, repeat: yearly, source: People, where: "name = Leo", icon: 🎂 }
  - { label: Our wedding, date: 2015-06-20, repeat: yearly, icon: 💍 }`;

const DOCUMENTS = `columns: 2
items:
  - { label: Passport, field: expires, where: "type = passport", icon: 🛂 }
  - { label: First aid certificate, field: expires, where: "type = first-aid", icon: ⛑️ }`;

describe("guide: countdown-birthday", () => {
    it("every Dashy block on the page draws without an error or a warning", () => {
        const blocks = guideBlocks("countdown-birthday");
        // step 2, step 3, the whole note (2), four variations, the written-date example
        expect(blocks.map((b) => b.lang)).toEqual(Array(9).fill("countdown"));
        for (const { lang, source } of blocks) expectClean(render(lang, source, { notes: PEOPLE }));
    });

    it("the step 2 block and the whole note are the same YAML", () => {
        const blocks = guideBlocks("countdown-birthday").map((b) => b.source);
        expect(blocks[0]).toBe(BIRTHDAYS);
        expect(blocks[1]).toBe(DOCUMENTS);
        expect(blocks[2]).toBe(BIRTHDAYS);
        expect(blocks[3]).toBe(DOCUMENTS);
    });

    it("step 2: days to the next birthday, its date, and the years it marks", () => {
        const el = render("countdown", BIRTHDAYS, { notes: PEOPLE });
        expect(texts(el, ".dashy-countdown-value")).toEqual(["28", "146", "258"]);
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["days left", "days left", "days left"]);
        expect(texts(el, ".dashy-countdown-date")).toEqual(["November 2, 2026", "February 28, 2027", "June 20, 2027"]);
        expect(texts(el, ".dashy-countdown-years")).toEqual(["35 years", "27 years", "12 years"]);
        // The label links to the note the date came from; a written date links nowhere.
        expect(nodes(el, "a.dashy-countdown-link").map((a) => a.getAttribute("data-href")))
            .toEqual(["People/Anna.md", "People/Leo.md"]);
    });

    it("on the birthday the card says Today with the years; the day after it moves to next year", () => {
        vi.setSystemTime(new Date(2026, 10, 2, 12));
        const onTheDay = render("countdown", BIRTHDAYS, { notes: PEOPLE });
        expect(texts(onTheDay, ".dashy-countdown-value")[0]).toBe("Today");
        expect(texts(onTheDay, ".dashy-countdown-years")[0]).toBe("35 years");

        vi.setSystemTime(new Date(2026, 10, 3, 12));
        const after = render("countdown", BIRTHDAYS, { notes: PEOPLE });
        expect(texts(after, ".dashy-countdown-value")[0]).toBe("364");
        expect(texts(after, ".dashy-countdown-date")[0]).toBe("November 2, 2027");
        expect(texts(after, ".dashy-countdown-years")[0]).toBe("36 years");
    });

    it("29 February: the 28th in 2027 (27 years), the 29th in 2028 (28 years)", () => {
        vi.setSystemTime(new Date(2027, 1, 28, 12));
        const leap = render("countdown", BIRTHDAYS, { notes: PEOPLE });
        expect(texts(leap, ".dashy-countdown-value")[1]).toBe("Today");
        expect(texts(leap, ".dashy-countdown-years")[1]).toBe("27 years");

        vi.setSystemTime(new Date(2027, 2, 1, 12));
        const next = render("countdown", BIRTHDAYS, { notes: PEOPLE });
        expect(texts(next, ".dashy-countdown-date")[1]).toBe("February 29, 2028");
        expect(texts(next, ".dashy-countdown-years")[1]).toBe("28 years");
    });

    it("step 3: an expiry ahead counts down, one that passed counts up, with no years", () => {
        const el = render("countdown", DOCUMENTS, { notes: PEOPLE });
        expect(texts(el, ".dashy-countdown-value")).toEqual(["1621", "40"]);
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["days left", "days ago"]);
        expect(texts(el, ".dashy-countdown-date")).toEqual(["March 14, 2031", "August 26, 2026"]);
        expect(nodes(el, ".dashy-countdown-card")[1]?.className).toContain("is-past");
        expect(nodes(el, ".dashy-countdown-years")).toHaveLength(0);
    });

    it("a date property with a time after it reads as the same day", () => {
        const notes = [{ path: "People/Anna.md", frontmatter: { name: "Anna", birthday: "1991-11-02T08:30" } }];
        const el = render("countdown", "items:\n  - { label: Anna, field: birthday, repeat: yearly, source: People }", { notes });
        expect(texts(el, ".dashy-countdown-value")).toEqual(["28"]);
        expectClean(el);
    });

    it("without `where`, every card reads the same note, the first by path", () => {
        const el = render("countdown", `items:
  - { label: Anna, field: birthday, repeat: yearly, source: People }
  - { label: Leo, field: birthday, repeat: yearly, source: People }`, { notes: PEOPLE });
        expect(texts(el, ".dashy-countdown-date")).toEqual(["November 2, 2026", "November 2, 2026"]);
    });

    it("the written-date example counts up the day after", () => {
        vi.setSystemTime(new Date(2026, 10, 3, 12));
        const el = render("countdown", "items:\n  - { label: Anna, date: 2026-11-02 }", { notes: PEOPLE });
        expect(texts(el, ".dashy-countdown-value")).toEqual(["1"]);
        expect(texts(el, ".dashy-countdown-unit")).toEqual(["day ago"]);
    });

    it("the errors the guide lists are the ones the card shows", () => {
        const notDate = render("countdown", "items:\n  - { label: Anna, field: birthday, source: People }",
            { notes: [{ path: "People/Anna.md", frontmatter: { birthday: "next week" } }] });
        expect(diagnostics(notDate, "error").join("\n")).toContain('"birthday" in "Anna" is "next week", not a date.');
        expect(texts(notDate, ".dashy-countdown-value")).toEqual(["—"]);

        const missing = render("countdown", "items:\n  - { label: Anna, field: birthdy, source: People }", { notes: PEOPLE });
        expect(diagnostics(missing, "error").join("\n")).toContain('no note in the selection has "birthdy" filled in');

        const both = render("countdown", "items:\n  - { label: Anna, field: birthday, date: 1991-11-02 }", { notes: PEOPLE });
        expect(diagnostics(both, "error").join("\n")).toContain("both `date:` and `field:` are set");

        const repeat = render("countdown", "items:\n  - { label: Anna, date: 1991-11-02, repeat: annual }", { notes: PEOPLE });
        expect(diagnostics(repeat, "error").join("\n")).toContain("`repeat` expects `yearly`");
    });
});

/* ---------------------------------------------------------------- guide 2 */

const book = (title: string, date_read: string | null, pages: number, rating: number, extra: Record<string, unknown> = {}): FakeNote => ({
    path: `Reading/${title}.md`,
    frontmatter: { ...(date_read ? { date_read } : {}), pages, rating, ...extra },
});

/** 2021: 2, 2022: none, 2023: 3, 2024: 1, 2025: 4 (3 by 5 October), 2026: 5, plus two not finished. */
const BOOKS: FakeNote[] = [
    book("A", "2021-04-02", 300, 4),
    book("B", "2021-09-15", 220, 3),
    book("C", "2023-01-20", 410, 5),
    book("D", "2023-06-11", 280, 4),
    book("E", "2023-12-30", 350, 3),
    book("F", "2024-07-07", 512, 5),
    book("G", "2025-02-01", 260, 4),
    book("H", "2025-05-19", 330, 4),
    book("I", "2025-09-30", 190, 3),
    book("J", "2025-11-20", 640, 5),
    book("Project Hail Mary", "2026-03-14", 476, 5),
    book("K", "2026-01-09", 300, 4),
    book("L", "2026-04-22", 250, 3),
    book("M", "2026-07-03", 410, 5),
    book("N", "2026-09-28", 180, 4),
    book("O", null, 320, 0, { status: "to-read" }),
    book("P", null, 200, 0, { status: "to-read" }),
];

const STATS_THIS_YEAR = `source: Reading
date_field: date_read
period: year
items:
  - { label: Books this year, agg: count, compare: true, better: up, icon: 📚 }
  - { label: Pages this year, field: pages, agg: sum }
  - { label: Average rating, field: rating, agg: avg, precision: 1 }`;

const CHART_PER_YEAR = `source: Reading
date_field: date_read
agg: count
bucket: year
type: bar
range: 1825d
label: Books
goal: 24`;

describe("guide: books-per-year", () => {
    it("every Dashy block on the page draws without an error or a warning", () => {
        const blocks = guideBlocks("books-per-year");
        expect(blocks.map((b) => b.lang)).toEqual(["stats", "chart", "stats", "chart", "progress", "chart", "chart", "stats"]);
        for (const { lang, source } of blocks) expectClean(render(lang, source, { notes: BOOKS }));
    });

    it("the steps and the whole note are the same YAML", () => {
        const blocks = guideBlocks("books-per-year").map((b) => b.source);
        expect(blocks.slice(0, 4)).toEqual([STATS_THIS_YEAR, CHART_PER_YEAR, STATS_THIS_YEAR, CHART_PER_YEAR]);
    });

    it("step 2: this year's books, pages and rating; unfinished books are left out", () => {
        const el = render("stats", STATS_THIS_YEAR, { notes: BOOKS });
        expect(texts(el, ".dashy-stat-value")).toEqual(["5", "1616", "4.2"]);
        expect(texts(el, ".dashy-stat-label")).toEqual(["Books this year", "Pages this year", "Average rating"]);
    });

    it("step 2: compare is against last year to the same day, not the whole year", () => {
        // 2025 up to 5 October holds G, H, I; J (20 November) is left out.
        const el = render("stats", STATS_THIS_YEAR, { notes: BOOKS });
        expect(texts(el, ".dashy-stat-delta")).toEqual(["▲ +2"]);
        expect(nodes(el, ".dashy-stat-delta")[0]?.className).toContain("dashy-stat-delta-good");
    });

    it("step 3: one bar per year from 2021, an empty year is 0, this year is so far", () => {
        const el = render("chart", CHART_PER_YEAR, { notes: BOOKS });
        expect(texts(el, ".dashy-chart-title")).toEqual(["Books: count per year, last 6 years"]);
        expect(nodes(el, ".dashy-chart-hit").map((h) => h.getAttribute("title"))).toEqual([
            "2021: Books 2 (2 notes)",
            "2022: Books 0",
            "2023: Books 3 (3 notes)",
            "2024: Books 1 (F)",
            "2025: Books 4 (4 notes)",
            "2026: Books 5 (5 notes), so far",
        ]);
        expect(texts(el, "text.dashy-chart-goal-label")).toEqual(["goal 24"]);
    });

    it("without range: the last ten years and this one", () => {
        const el = render("chart", CHART_PER_YEAR.replace("range: 1825d\n", ""), { notes: BOOKS });
        expect(texts(el, ".dashy-chart-title")).toEqual(["Books: count per year, last 11 years"]);
    });

    it("notes named with the date first need no date_field", () => {
        const notes: FakeNote[] = [
            { path: "Reading/2026-03-14 Project Hail Mary.md", frontmatter: { pages: 476 } },
            { path: "Reading/2025-08-01 Dune.md", frontmatter: { pages: 600 } },
        ];
        const stats = render("stats", "source: Reading\nperiod: year\nitems:\n  - { label: Books this year, agg: count }", { notes });
        expect(texts(stats, ".dashy-stat-value")).toEqual(["1"]);
        expectClean(stats);
        const chart = render("chart", "source: Reading\nagg: count\nbucket: year\nrange: 730d", { notes });
        expect(nodes(chart, ".dashy-chart-hit").map((h) => h.getAttribute("title")))
            .toEqual(["2024: notes 0", "2025: notes 1 (2025-08-01 Dune)", "2026: notes 1 (2026-03-14 Project Hail Mary), so far"]);
    });

    it("the errors the guide lists are the ones the blocks show", () => {
        const noField = render("chart", "source: Reading\ndate_field: finished\nagg: count\nbucket: year", { notes: BOOKS });
        expect(diagnostics(noField, "error").concat(diagnostics(noField, "warning")).join("\n"))
            .toContain('None of the selected notes has a date in "finished".');

        const noDate = render("chart", "source: Reading\nagg: count\nbucket: year", { notes: BOOKS });
        expect(diagnostics(noDate, "error").concat(diagnostics(noDate, "warning")).join("\n"))
            .toContain("None of the selected notes has a name starting with a date like YYYY-MM-DD.");

        const bucket = render("chart", "source: Reading\ndate_field: date_read\nagg: count\nbucket: yearly", { notes: BOOKS });
        expect(diagnostics(bucket, "warning").join("\n")).toContain("`bucket` expects day, week, month or year");
    });
});

/* ---------------------------------------------------------------- guide 3 */

const HOME: FakeNote[] = [
    { path: "Inbox/idea-1.md" },
    { path: "Inbox/idea-2.md" },
    { path: "Inbox/idea-3.md" },
    // Sunday 27 September to Monday 5 October: five in October, two this week (from Sunday 4th)
    ...diary("Diary", "2026-09-27", 9, () => ({})),
    ...BOOKS,
    { path: "Projects/Garden.md" },
    { path: "Projects/Kitchen.md" },
    { path: "Projects/Talk.md" },
    { path: "Projects/Archive/Old site.md" },
    // the folder note, next to the folder
    { path: "Projects.md" },
    PEOPLE[0]!,
    PEOPLE[2]!,
];
const HOME_VAULT: FakeVault = { notes: HOME, alsoExists: ["Attachments/books.jpg", "Attachments/desk.jpg"] };

const TODAY_BLOCK = "clock: true\ndaily: true\nweekly: true";
const INLINE = `layout: inline
items:
  - { label: notes, agg: count }
  - { label: in the inbox, source: Inbox, agg: count }
  - { label: diary days this month, source: Diary, agg: count, period: month }
  - { label: books this year, source: Reading, date_field: date_read, period: year, agg: count }`;
const TILES = `items:
  - { label: Inbox, path: Inbox, icon: 📥, badge: count }
  - { label: Diary, path: Diary, icon: 📔, badge: count, period: week, sub: this week }
  - { label: Reading, path: Reading, icon: 📚, badge: count }
  - { label: Projects, path: Projects, icon: 🗂, badge: count, accent: true }`;
const COMING = `items:
  - { label: Holiday, date: 2027-01-20, icon: 🏖 }
  - { label: Anna, field: birthday, repeat: yearly, source: People, where: "name = Anna", icon: 🎂 }
  - { label: Passport, field: expires, where: "type = passport", icon: 🛂 }`;

describe("guide: homepage-dashboard", () => {
    it("every Dashy block on the page draws without an error or a warning", () => {
        const blocks = guideBlocks("homepage-dashboard");
        expect(blocks.map((b) => b.lang)).toEqual([
            "today", "stats", "tiles", "countdown",
            "today", "stats", "tiles", "countdown",
            "tiles", "stats", "today", "tiles",
        ]);
        for (const { lang, source } of blocks) expectClean(render(lang, source, HOME_VAULT));
    });

    it("the steps and the whole note are the same YAML", () => {
        const blocks = guideBlocks("homepage-dashboard").map((b) => b.source);
        expect(blocks.slice(0, 8)).toEqual([TODAY_BLOCK, INLINE, TILES, COMING, TODAY_BLOCK, INLINE, TILES, COMING]);
    });

    it("step 1: a clock above today's date, and the day and week links", () => {
        const el = render("today", TODAY_BLOCK, HOME_VAULT);
        expect(texts(el, ".dashy-today-clock")).toEqual(["12:00 PM"]);
        expect(texts(el, ".dashy-today-date")).toEqual(["Monday, October 5, 2026"]);
        expect(texts(el, ".dashy-today-label")).toEqual(["Today", "This week"]);
    });

    it("step 2: one line; no source counts the whole vault", () => {
        const el = render("stats", INLINE, HOME_VAULT);
        expect(texts(el, ".dashy-stat-inline")).toEqual([
            `${HOME.length} notes`,
            "3 in the inbox",
            "5 diary days this month",
            "5 books this year",
        ]);
        expect(nodes(el, ".dashy-stat-card")).toHaveLength(0);
    });

    it("step 3: folder counts, subfolders included; this week's diary; the folder note next to the folder", () => {
        const el = render("tiles", TILES, HOME_VAULT);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["3", "2", String(BOOKS.length), "4"]);
        const links = nodes(el, ".dashy-tile-link");
        // Inbox has no folder note: shown in the file explorer, never a note link.
        expect(links[0]?.classList.contains("dashy-tile-folder")).toBe(true);
        expect(links[0]?.classList.contains("internal-link")).toBe(false);
        // Projects.md sits next to Projects/: the tile opens it.
        expect(links[3]?.getAttribute("data-href")).toBe("Projects.md");
        expect(nodes(el, ".dashy-tile")[3]?.className).toContain("dashy-tile-accent");
    });

    it("step 4: a written date and two read from notes", () => {
        const el = render("countdown", COMING, HOME_VAULT);
        expect(texts(el, ".dashy-countdown-value")).toEqual(["107", "28", "1621"]);
        expect(texts(el, ".dashy-countdown-years")).toEqual(["35 years"]);
    });

    it("an empty counted folder shows 0, and a missing one says so", () => {
        const el = render("tiles", "items:\n  - { label: Inbox, path: Inbx, badge: count }", HOME_VAULT);
        expect(texts(el, ".dashy-tile-badge")).toEqual(["0"]);
        expect(diagnostics(el, "warning").join("\n")).toContain("Nothing is filed under `Inbx`.");
    });

    it("the errors the guide lists are the ones the blocks show", () => {
        const trend = render("stats", "layout: inline\nitems:\n  - { label: steps, source: Diary, field: steps, agg: avg, trend: 30d }",
            { notes: diary("Diary", "2026-10-01", 5, (i) => ({ steps: 1000 * i })) });
        expect(diagnostics(trend, "warning").join("\n")).toContain("`trend` is not drawn with `layout: inline`");

        const clock = render("today", "clock: yes", HOME_VAULT);
        expect(diagnostics(clock, "warning").join("\n")).toContain("`clock` expects true, false, minutes or seconds");
        expect(nodes(clock, ".dashy-today-clock")).toHaveLength(0);
    });
});

/* ---------------------------------------------------------------- guide 4 */

/**
 * October 2026 (the 1st is a Thursday) up to today, Monday the 5th, the
 * Tuesday after it, a planned day off ahead, and the last day of September.
 * `Workouts` holds a note per session: two on the 2nd, four on the 3rd.
 */
const HABIT_DAYS: FakeNote[] = [
    { path: "Diary/2026-09-30.md", frontmatter: { gym: true, read: true, meditate: true } },
    { path: "Diary/2026-10-01.md", frontmatter: { gym: true, read: false, meditate: true } },
    { path: "Diary/2026-10-02.md", frontmatter: { gym: true, read: true, meditate: true, run_km: 8.5 } },
    { path: "Diary/2026-10-03.md", frontmatter: { gym: false, read: true, meditate: false, run_km: 0 } },
    { path: "Diary/2026-10-04.md", frontmatter: { gym: false, read: false, meditate: false, vacation: true } },
    { path: "Diary/2026-10-05.md", frontmatter: { gym: true, read: false, meditate: true } },
    { path: "Diary/2026-10-06.md", frontmatter: { gym: true, read: false, meditate: true } },
    { path: "Diary/2026-10-09.md", frontmatter: { gym: true, vacation: true } },
    ...["Run", "Swim"].map((s) => ({ path: `Workouts/2026-10-02 ${s}.md`, frontmatter: { minutes: 40 } })),
    ...["Run", "Bike", "Swim", "Yoga"].map((s) => ({ path: `Workouts/2026-10-03 ${s}.md`, frontmatter: { minutes: 30 } })),
];
const HABIT_VAULT: FakeVault = { notes: HABIT_DAYS };

const ONE_HABIT = `source: Diary
field: gym
color: orange
range: month
layout: calendar`;

const HABIT_LAYERS = `source: Diary
range: month
layout: calendar
layers:
  - { field: gym, color: orange, label: Gym }
  - { field: read, color: green, label: Reading }
  - { field: meditate, color: purple, label: Meditation }`;

const THIS_WEEK = `source: Diary
field: gym
color: orange
range: week
layout: calendar
skip_field: vacation`;

describe("guide: monthly-habit-calendar", () => {
    /** The day cell showing `day`, pads excluded. */
    const day = (el: HTMLElement, n: number): HTMLElement | undefined =>
        nodes(el, ".dashy-hm-cal-day:not(.dashy-hm-pad)").find((c) => c.querySelector(".dashy-hm-cal-num")?.textContent === String(n));
    const dots = (el: HTMLElement, n: number): number => day(el, n)?.querySelectorAll(".dashy-hm-dot").length ?? 0;

    it("every Dashy block on the page draws without an error or a warning", () => {
        const blocks = guideBlocks("monthly-habit-calendar");
        // steps 2, 3 and 4, the whole note (2), four variations, the first of them two blocks
        expect(blocks.map((b) => b.lang)).toEqual(Array(10).fill("heatmap"));
        for (const { lang, source } of blocks) expectClean(render(lang, source, HABIT_VAULT));
    });

    it("the steps and the whole note are the same YAML", () => {
        const blocks = guideBlocks("monthly-habit-calendar").map((b) => b.source);
        expect(blocks.slice(0, 5)).toEqual([ONE_HABIT, HABIT_LAYERS, THIS_WEEK, HABIT_LAYERS, THIS_WEEK]);
        // The first variation's calendar is step 2's block.
        expect(blocks[5]).toBe(ONE_HABIT);
    });

    it("step 2: the whole month by weekday, a dot per ticked day, the days ahead dimmed and bare", () => {
        const el = render("heatmap", ONE_HABIT, HABIT_VAULT);
        expect(texts(el, ".dashy-hm-cal-month")).toEqual(["October 2026"]);
        expect(texts(el, ".dashy-hm-cal-num")).toHaveLength(31);
        expect([1, 2, 3, 4, 5, 6].map((d) => dots(el, d))).toEqual([1, 1, 0, 0, 1, 0]);
        expect(day(el, 6)?.classList.contains("is-future")).toBe(true);
        expect(day(el, 5)?.classList.contains("is-today")).toBe(true);
        expect(nodes(el, ".is-today")).toHaveLength(1);
        expect(nodes(el, ".dashy-hm-grid")).toHaveLength(0);
    });

    it("step 2: the caption counts the days with a dot out of the days so far, today included", () => {
        expect(texts(render("heatmap", ONE_HABIT, HABIT_VAULT), ".dashy-hm-title")).toEqual(["gym: 3 of 5 days"]);
        // The figure the guide quotes, on the 6th.
        vi.setSystemTime(new Date(2026, 9, 6, 12));
        expect(texts(render("heatmap", ONE_HABIT, HABIT_VAULT), ".dashy-hm-title")).toEqual(["gym: 4 of 6 days"]);
    });

    it("step 2: a day with a dot opens its note; a day without one is not a link", () => {
        const el = render("heatmap", ONE_HABIT, HABIT_VAULT);
        expect(day(el, 2)?.tagName).toBe("A");
        expect(day(el, 2)?.getAttribute("data-href")).toBe("Diary/2026-10-02.md");
        expect(day(el, 2)?.getAttribute("title")).toBe("Oct 2, 2026: gym 1 (2026-10-02)");
        expect(day(el, 3)?.tagName).toBe("DIV");
        expect(day(el, 6)?.tagName).toBe("DIV");
    });

    it("step 3: a dot per ticked habit, in list order and its own colour, a legend, every habit in the tooltip", () => {
        const el = render("heatmap", HABIT_LAYERS, HABIT_VAULT);
        const colours = (n: number): string[] =>
            Array.from(day(el, n)?.querySelectorAll<HTMLElement>(".dashy-hm-dot") ?? [], (d) => d.style.backgroundColor);
        expect([1, 2, 3, 4, 5].map((d) => dots(el, d))).toEqual([2, 3, 1, 0, 2]);
        const two = colours(2);
        expect(new Set(two).size).toBe(3);
        expect(colours(1)).toEqual([two[0], two[2]]);
        expect(colours(3)).toEqual([two[1]]);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["Gym", "Reading", "Meditation"]);
        expect(day(el, 1)?.getAttribute("title")).toBe("Oct 1, 2026: Gym 1, Reading 0, Meditation 1 (2026-10-01)");
    });

    it("step 3: the caption counts the days with at least one dot", () => {
        vi.setSystemTime(new Date(2026, 9, 6, 12));
        expect(texts(render("heatmap", HABIT_LAYERS, HABIT_VAULT), ".dashy-hm-title"))
            .toEqual(["Gym, Reading, Meditation: 5 of 6 days"]);
    });

    it("step 3: pick changes nothing on the calendar", () => {
        const notes = [{ path: "Diary/2026-10-02.md", frontmatter: { gym: 1, read: 5, meditate: 3 } }];
        const plain = render("heatmap", HABIT_LAYERS, { notes });
        const max = render("heatmap", `${HABIT_LAYERS}\npick: max`, { notes });
        expectClean(max);
        const colours = (el: HTMLElement): string[] =>
            Array.from(day(el, 2)?.querySelectorAll<HTMLElement>(".dashy-hm-dot") ?? [], (d) => d.style.backgroundColor);
        expect(colours(max)).toHaveLength(3);
        expect(colours(max)).toEqual(colours(plain));
    });

    it("step 3: at most four dots under a day", () => {
        const fields = ["a", "b", "c", "d", "e"];
        const notes = [{ path: "Diary/2026-10-02.md", frontmatter: Object.fromEntries(fields.map((f) => [f, true])) }];
        const config = ["source: Diary", "range: month", "layout: calendar", "layers:", ...fields.map((f) => `  - { field: ${f} }`)].join("\n");
        expect(dots(render("heatmap", config, { notes }), 2)).toBe(4);
    });

    it("step 4: one row for this week, a day off hatched, one ahead too but without its dot", () => {
        const el = render("heatmap", THIS_WEEK, HABIT_VAULT);
        // Sunday-first: Sunday 4 to Saturday 10 October.
        expect(texts(el, ".dashy-hm-cal-num")).toEqual(["4", "5", "6", "7", "8", "9", "10"]);
        expect(texts(el, ".dashy-hm-cal-month")).toEqual(["October 2026"]);
        expect(texts(el, ".dashy-hm-title")).toEqual(["gym: 1 of 2 days"]);
        expect(day(el, 4)?.classList.contains("is-skipped")).toBe(true);
        expect(day(el, 9)?.classList.contains("is-skipped")).toBe(true);
        expect(day(el, 9)?.classList.contains("is-future")).toBe(true);
        expect(dots(el, 9)).toBe(0);
        expect(day(el, 5)?.classList.contains("is-skipped")).toBe(false);
        expect(texts(el, ".dashy-hm-leg")).toEqual(["Day off"]);
    });

    it("step 4: a week running into the next month names both", () => {
        vi.setSystemTime(new Date(2026, 8, 30, 12));
        const el = render("heatmap", THIS_WEEK, HABIT_VAULT);
        expect(texts(el, ".dashy-hm-cal-month")).toEqual(["Sep 2026 to Oct 2026"]);
        expect(texts(el, ".dashy-hm-cal-num")).toEqual(["27", "28", "29", "30", "1", "2", "3"]);
    });

    it("variations: a grid of the last half year; any number dots its day, even 0", () => {
        const grid = render("heatmap", "source: Diary\nfield: gym\ncolor: orange\nrange: 182d", HABIT_VAULT);
        expect(nodes(grid, ".dashy-hm-grid")).toHaveLength(1);
        expect(nodes(grid, ".dashy-hm-cal")).toHaveLength(0);

        const km = render("heatmap", "source: Diary\nfield: run_km\ncolor: green\nrange: month\nlayout: calendar", HABIT_VAULT);
        expect([2, 3, 4].map((d) => dots(km, d))).toEqual([1, 1, 0]);
        expect(day(km, 2)?.getAttribute("title")).toBe("Oct 2, 2026: run_km 8.5 (2026-10-02)");
    });

    it("variations: a note per workout is a dot per note, three at most", () => {
        const el = render("heatmap", "source: Workouts\nfield: minutes\ncolor: red\nrange: month\nlayout: calendar", HABIT_VAULT);
        expect([2, 3].map((d) => dots(el, d))).toEqual([2, 3]);
        expect(day(el, 3)?.getAttribute("title")).toBe("Oct 3, 2026: minutes 120 (4 notes)");
    });

    it("variations: a title replaces the caption; the month heading stays", () => {
        const el = render("heatmap", `${ONE_HABIT}\ntitle: Meditation this month`, HABIT_VAULT);
        expect(texts(el, ".dashy-hm-title")).toEqual(["Meditation this month"]);
        expect(texts(el, ".dashy-hm-cal-month")).toEqual(["October 2026"]);
    });

    it("what it does not do: any other range, or none, warns and draws the grid; bands warn", () => {
        const needsRange = "⚠️ heatmap: `layout: calendar` needs `range: month` or `range: week`. Drawing the grid instead.";
        for (const range of ["range: year\n", "range: 90d\n", ""]) {
            const el = render("heatmap", `source: Diary\nfield: gym\n${range}layout: calendar`, HABIT_VAULT);
            expect(diagnostics(el, "warning")).toEqual([needsRange]);
            expect(nodes(el, ".dashy-hm-grid").length).toBeGreaterThan(0);
            expect(nodes(el, ".dashy-hm-cal")).toHaveLength(0);
        }
        const bands = render("heatmap", `${ONE_HABIT}\nbands: [10, 5]`, HABIT_VAULT);
        expect(diagnostics(bands, "warning")).toEqual(["⚠️ heatmap: `bands` is ignored with `layout: calendar`: a day shows dots, not a shade."]);
        expect(nodes(bands, ".dashy-hm-cal")).toHaveLength(1);
    });

    it("the errors the guide lists are the ones the block shows", () => {
        const typo = render("heatmap", "source: Diary\nfield: gym\nrange: month\nlayout: calender", HABIT_VAULT);
        expect(diagnostics(typo, "warning").join("\n")).toContain("`layout` expects grid or calendar, got \"calender\". Using grid.");
        expect(nodes(typo, ".dashy-hm-grid")).toHaveLength(1);

        const missing = render("heatmap", HABIT_LAYERS, { notes: [{ path: "Diary/2026-10-02.md", frontmatter: { gym: true, read: true } }] });
        // Two habits still draw; the third is named in a warning.
        expect(diagnostics(missing, "error")).toEqual([]);
        expect(diagnostics(missing, "warning").join("\n")).toContain("\"meditate\" never contributed a value here.");
        expect(dots(missing, 2)).toBe(2);
    });
});
