import { describe, it, expect } from "vitest";
import {
    SKILL_MARKDOWN,
    SKILL_VERSION,
    SKILL_DIR,
    SKILL_PATH,
    REFERENCE_MARKDOWN,
    REFERENCE_PATH,
    COMBINED_MARKDOWN,
    AGENTS_SECTION,
} from "./skill-content";
import schema from "../blocks/schema.json";

/**
 * Pins the facts a live test with AI agents (B-105..B-110) found agents
 * getting wrong from the generated skill text. `REFERENCE_MARKDOWN` (the
 * skill's reference.md) is built by `npm run build:skill` from
 * `src/blocks/schema.json`, so a regression here
 * means either the schema's wording regressed or the build script stopped
 * carrying it through — either way the agent reading the skill loses the
 * fact again.
 */
describe("the generated skill corrects what agents got wrong", () => {
    it("streak is the longest run on record, current_streak the run going on now (B-105, B-118)", () => {
        expect(REFERENCE_MARKDOWN).toContain("`streak` counts the longest run of consecutive days");
        expect(REFERENCE_MARKDOWN).not.toContain("There is no current-streak aggregate");
        expect(REFERENCE_MARKDOWN).toContain('`streak` is the best run on record: label the card "Best streak" or "Longest streak"');
        expect(REFERENCE_MARKDOWN).toContain('label the bar "Best streak" or "Longest streak"');
        expect(REFERENCE_MARKDOWN).toContain("`current_streak` is the run going on now");
        expect(REFERENCE_MARKDOWN).toContain("`current_streak` counts the run going on now");
        expect(REFERENCE_MARKDOWN).toContain("count sum avg min max latest streak current_streak");
    });

    it("current_streak states its today grace and its period cap, on both blocks (B-118)", () => {
        const grace = "a day not filled yet leaves the run counted up to yesterday, and only a gap on yesterday or earlier";
        const cap = "so `period: month` stops it at the first of the month";
        // stats and progress each carry their own note.
        expect(REFERENCE_MARKDOWN.split(grace).length - 1).toBe(2);
        expect(REFERENCE_MARKDOWN.split(cap).length - 1).toBe(2);
    });

    it("a week starts on the first day of the interface language, the plugin's own if picked (B-107)", () => {
        const phrase = "A week starts on the first day of the interface language, Dashy's own when one "
            + "is picked in its settings, otherwise Obsidian's: Sunday in English, Monday in most European languages";
        // stats, progress and tiles each document `period` separately, chart its `bucket`.
        expect(REFERENCE_MARKDOWN.split(phrase).length - 1).toBe(4);
    });

    it("a text field is not a number, and names the where + count workaround (B-106)", () => {
        // stats and progress each document `field` separately, heatmap has its own wording.
        const dashPhrase = "holding text rather than a number, shows a dash and a warning naming it";
        expect(REFERENCE_MARKDOWN.split(dashPhrase).length - 1).toBe(2);
        expect(REFERENCE_MARKDOWN).toContain('count text instead with `where: "field contains ...');
        expect(REFERENCE_MARKDOWN).toContain("holding text rather than a number, errors and says which");
    });

    it("states the empty rule exactly: count reads 0, a field aggregate reads a dash (B-109)", () => {
        expect(REFERENCE_MARKDOWN).toContain("`count` over nothing reads a plain `0`, the number of notes found");
        expect(REFERENCE_MARKDOWN).toContain("`count` over nothing reads a plain `0` and an empty bar");
        // The old blanket wording ("nothing to count... shows a dash rather
        // than a zero") contradicted `count`'s own honest `0` — it must not
        // reappear as a general rule.
        expect(REFERENCE_MARKDOWN).not.toContain("Nothing to count, and the card shows a dash rather than a zero");
        expect(REFERENCE_MARKDOWN).not.toContain("Nothing to count, and the bar stays empty and the value shows a dash rather than a zero");
    });

    it("countdown repeats a date yearly only when asked, and reads one from a note (B-148)", () => {
        // B-110's "does not repeat" note is gone with `repeat: yearly`; an agent
        // reading the old one would move a birthday's year forward by hand.
        expect(REFERENCE_MARKDOWN).not.toContain("The date does not repeat every year");
        expect(REFERENCE_MARKDOWN).toContain("A birthday or an anniversary repeats with `repeat: yearly`");
        // `date` gave way to `field` as an alternative, the way heatmap's `field` did to `layers`.
        const countdown = schema.blocks.countdown as { item: Record<string, { required?: boolean }> };
        expect(countdown.item.date.required).toBeUndefined();
        expect(REFERENCE_MARKDOWN).toContain("Required unless `field` is set, and not allowed together with it");
    });

    it("heatmap field is not marked required, since layers replaces it (B-124)", () => {
        const heatmap = schema.blocks.heatmap as { root: Record<string, { required?: boolean }> };
        expect(heatmap.root.field.required).toBeUndefined();
        expect(REFERENCE_MARKDOWN).toContain("required unless `layers` is set, and not allowed together with it");
        // The layer's own `field` stays required: a layer without one paints nothing.
        const item = schema.blocks.heatmap as { item: Record<string, { required?: boolean }> };
        expect(item.item.field.required).toBe(true);
    });

    it("no example labels a streak card as a running count, and none leaks a unit onto it", () => {
        for (const [name, block] of Object.entries(schema.blocks as Record<string, { example: string }>)) {
            const streakItems = block.example
                .split("\n")
                .filter((line) => /agg:\s*streak\b/.test(line));
            for (const line of streakItems) {
                expect(line.toLowerCase(), `${name} example: ${line}`).not.toContain("in a row");
                expect(line, `${name} example: ${line}`).not.toContain("unit: d.");
            }
        }
    });

    it("no stats or progress example repeats the root's source on a card (B-131)", () => {
        for (const name of ["stats", "progress"] as const) {
            const example = (schema.blocks[name] as { example: string }).example;
            const rootSource = /^source: (.+)$/m.exec(example)?.[1];
            expect(rootSource, `${name} example sets its folder at the root`).toBeDefined();
            for (const line of example.split("\n").filter((l) => l.trimStart().startsWith("- "))) {
                expect(line, `${name} example: ${line}`).not.toContain(`source: ${rootSource}`);
            }
        }
    });

    it("names the 1.7.0 heatmap recipes and every block in the description (B-159)", () => {
        expect(REFERENCE_MARKDOWN).toContain("Minutes per sport, coloured by the sport that took the longest");
        expect(REFERENCE_MARKDOWN).toContain("`layout: calendar` with `range: month` draws a month calendar of a habit");
        const description = SKILL_MARKDOWN.split("\n---\n")[0] ?? "";
        for (const phrase of ["tiles", "number cards", "progress bars", "countdowns", "day row", "heatmap", "month habit calendar", "chart"]) {
            expect(description, phrase).toContain(phrase);
        }
    });

    it("carries a copyable recipe for each 1.8.0 feature, in both files, and the review in the description (B-162)", () => {
        for (const recipe of [
            // A weekly review note counting its own week.
            "in a note named `2026-W40`, `period: note` at the block root counts that week and no other",
            // Daily notes not named as ISO dates.
            "name the format: `date_format: DD.MM.YYYY`",
            // A week against the usual level, not last week.
            "`{ label: Sleep, field: sleep_score, agg: avg, period: week, compare: usual, better: up }`",
            // A season between two dates.
            "`period: { from: 2026-06-01, to: 2026-08-31 }` for a season",
        ]) {
            // The recipes sit in the block notes, so since B-164 they reach
            // Claude Code through reference.md, next to SKILL.md.
            expect(REFERENCE_MARKDOWN, recipe).toContain(recipe);
            expect(AGENTS_SECTION, recipe).toContain(recipe);
        }
        const description = SKILL_MARKDOWN.split("\n---\n")[0] ?? "";
        expect(description).toContain("a weekly or monthly review that\n  counts its own week or month");
    });

    it("chart: the facts ADR 0005 says an agent gets wrong", () => {
        const chart = schema.blocks.chart as { root: Record<string, { required?: boolean }>; hints: Record<string, string> };
        // `field` is optional at the root: `series` or `agg: count` replace it.
        expect(chart.root.field.required).toBeUndefined();
        expect(REFERENCE_MARKDOWN).toContain("A list in the block's own `field` is an error rather than a guess");
        expect(REFERENCE_MARKDOWN).toContain("A bucket with no data is a gap in the line and no bar, never a zero");
        expect(REFERENCE_MARKDOWN).toContain("`avg` is over values, not days");
        expect(REFERENCE_MARKDOWN).toContain("`sum` of a checkbox counts the ticked days");
        expect(REFERENCE_MARKDOWN).toContain("a second y axis");
        // The neighbours' keys are printed with what they are called here.
        for (const [from, to] of Object.entries(chart.hints)) {
            expect(REFERENCE_MARKDOWN).toContain(`- \`${from}\` is \`${to}\` here`);
        }
        // Charts are no longer on the "does not do" list; pie charts are.
        expect(REFERENCE_MARKDOWN).not.toContain("Dashy does not draw charts");
        expect(REFERENCE_MARKDOWN).toContain("- **pie** —");
    });

    it("AGENTS.md carries every one of these facts too, not only SKILL.md", () => {
        // One body feeds both files today; this fails if the generator ever
        // stops sharing it and the facts land in only one of them.
        for (const phrase of [
            "`current_streak` is the run going on now",
            "a day not filled yet leaves the run counted up to yesterday",
            "Dashy's own when one is picked in its settings",
            "holding text rather than a number",
            "`count` over nothing reads a plain `0`",
            "A birthday or an anniversary repeats with `repeat: yearly`",
        ]) {
            expect(AGENTS_SECTION, phrase).toContain(phrase);
        }
    });
});

/**
 * B-164 splits the Claude skill in two: SKILL.md holds the process an agent
 * reads on every request, reference.md the key tables it reads per block.
 * AGENTS.md and "Copy markdown" stay one text holding both.
 */
describe("the skill is a process file and a reference file (B-164)", () => {
    const reference = REFERENCE_MARKDOWN.slice(REFERENCE_MARKDOWN.indexOf("# Dashy block reference"));

    it("both files sit in one folder, the one the plugin installs", () => {
        expect(SKILL_PATH).toBe(`${SKILL_DIR}/SKILL.md`);
        expect(REFERENCE_PATH).toBe(`${SKILL_DIR}/reference.md`);
    });

    it("SKILL.md links reference.md and tells the agent to read the block's section first", () => {
        expect(SKILL_MARKDOWN).toContain(
            "Key tables for every block are in [reference.md](reference.md); "
            + "read the section of the block you are about to write before writing it, "
            + "and the \"Keys shared by several blocks\" section at its top, "
            + "where `where`, `date_field` and `date_format` are explained once.",
        );
    });

    it("SKILL.md holds the process, not the tables; reference.md the tables, not the process", () => {
        for (const step of ["## 1. Look before writing", "## 2. Pick the block", "## 3. Write",
            "## 4. Recipes", "## 5. Check before handing over", "## 6. When Dashy cannot do it"]) {
            expect(SKILL_MARKDOWN, step).toContain(step);
            expect(REFERENCE_MARKDOWN, step).not.toContain(step);
        }
        expect(SKILL_MARKDOWN).not.toContain("| key | type | required |");
        expect(REFERENCE_MARKDOWN).toContain("| key | type | required |");
        expect(REFERENCE_MARKDOWN).toContain("## What the plugin does NOT do");
        expect(REFERENCE_MARKDOWN).toContain("## General rules");
        // The process sends the agent to that list rather than repeating it.
        expect(SKILL_MARKDOWN).toContain('"What the plugin does NOT do" in\nreference.md');
    });

    it("both files carry the same version; only SKILL.md has frontmatter", () => {
        expect(SKILL_MARKDOWN.startsWith(`---\nname: dashy\n`)).toBe(true);
        expect(SKILL_MARKDOWN).toContain(`\nversion: ${SKILL_VERSION}\n---\n`);
        expect(REFERENCE_MARKDOWN.startsWith("---")).toBe(false);
        expect(REFERENCE_MARKDOWN).toContain(`version ${SKILL_VERSION}.`);
    });

    it("AGENTS.md is one section holding the process and the whole reference", () => {
        expect(AGENTS_SECTION).toContain(COMBINED_MARKDOWN);
        expect(AGENTS_SECTION).toContain(`version ${SKILL_VERSION}.`);
        expect(COMBINED_MARKDOWN).toContain("## 1. Look before writing");
        expect(COMBINED_MARKDOWN).toContain(reference);
        // The process comes first, then the tables it points to.
        expect(COMBINED_MARKDOWN.indexOf("## 5. Check before handing over"))
            .toBeLessThan(COMBINED_MARKDOWN.indexOf("# Dashy block reference"));
    });

    it("the one-file text points below, never to a reference.md that is not there", () => {
        expect(COMBINED_MARKDOWN).not.toContain("reference.md");
        expect(COMBINED_MARKDOWN).toContain("Key tables for every block are in the block reference below");
        expect(COMBINED_MARKDOWN.startsWith("---")).toBe(false);
    });
});

/**
 * B-177: a key doc repeated across blocks (`where`, `date_field`,
 * `date_format`) is printed once, in its own section near the top of the
 * reference, and each block's row points there and keeps what is its own.
 * Nothing the schema says may be lost on the way.
 */
describe("the reference prints a key doc shared by several blocks once (B-177)", () => {
    const TITLE = "### Keys shared by several blocks";
    const section = REFERENCE_MARKDOWN.split(TITLE)[1]?.split("\n### ")[0] ?? "";

    /** The sentences of a doc, split after a full stop and a space outside backticks. */
    function sentences(doc: string): string[] {
        const out: string[] = [];
        let tick = false;
        let start = 0;
        for (let i = 0; i < doc.length; i++) {
            if (doc[i] === "`") tick = !tick;
            else if (!tick && doc[i] === "." && doc[i + 1] === " ") {
                out.push(doc.slice(start, i));
                start = i + 2;
            }
        }
        out.push(doc.slice(start).replace(/\.$/, ""));
        return out;
    }

    const cell = (text: string): string => text.replace(/\|/g, "\\|");

    it("sits before the first block and names where, date_field and date_format", () => {
        expect(REFERENCE_MARKDOWN.indexOf(TITLE)).toBeGreaterThan(0);
        expect(REFERENCE_MARKDOWN.indexOf(TITLE)).toBeLessThan(REFERENCE_MARKDOWN.indexOf("### `tiles`"));
        const keys = Array.from(section.matchAll(/^\| `([a-z_]+)` \|/gm), (m) => m[1]);
        expect(keys).toEqual(["where", "date_field", "date_format"]);
    });

    it("prints the shared text once, and each block that shares it points to it", () => {
        const where = "`or` is not supported; quote a value holding the word `and` or `or`";
        expect(REFERENCE_MARKDOWN.split(where).length - 1).toBe(1);
        // Five places share `where`; each keeps its own last sentence.
        expect(REFERENCE_MARKDOWN.split("Same as `where` in Keys shared by several blocks").length - 1).toBe(5);
        expect(REFERENCE_MARKDOWN).toContain(
            "Same as `where` in Keys shared by several blocks; here also: One unreadable condition drops "
            + "the whole filter with a warning, and the grid is drawn unfiltered",
        );
        // `stats` keeps the sentence the other blocks do not have.
        expect(REFERENCE_MARKDOWN).toContain(
            "Same as `date_format` in Keys shared by several blocks; here also: Steers the same readings `date_field` does",
        );
        // A block whose doc says something else is left whole: the root's
        // "conditions every card must meet" is not a card's `where`.
        expect(REFERENCE_MARKDOWN).toContain("conditions every card must meet, written like a card's `where`");
    });

    it("loses no sentence of any key doc in the schema", () => {
        const blocks = schema.blocks as Record<string, Record<string, Record<string, { doc: string }> | undefined>>;
        for (const [name, block] of Object.entries(blocks)) {
            for (const level of ["root", "item"]) {
                for (const [key, f] of Object.entries(block[level] ?? {})) {
                    for (const sentence of sentences(f.doc)) {
                        expect(REFERENCE_MARKDOWN, `${name} ${level} ${key}: ${sentence}`).toContain(cell(sentence));
                    }
                }
            }
        }
    });

    it("AGENTS.md carries the same section", () => {
        expect(AGENTS_SECTION).toContain(section);
    });
});
