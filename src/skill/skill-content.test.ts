import { describe, it, expect } from "vitest";
import { SKILL_MARKDOWN, AGENTS_SECTION } from "./skill-content";
import schema from "../blocks/schema.json";

/**
 * Pins the facts a live test with AI agents (B-105..B-110) found agents
 * getting wrong from the generated skill text. `SKILL_MARKDOWN` is built by
 * `npm run build:skill` from `src/blocks/schema.json`, so a regression here
 * means either the schema's wording regressed or the build script stopped
 * carrying it through — either way the agent reading the skill loses the
 * fact again.
 */
describe("the generated skill corrects what agents got wrong", () => {
    it("streak is the longest run on record, current_streak the run going on now (B-105, B-118)", () => {
        expect(SKILL_MARKDOWN).toContain("`streak` counts the longest run of consecutive days");
        expect(SKILL_MARKDOWN).not.toContain("There is no current-streak aggregate");
        expect(SKILL_MARKDOWN).toContain('`streak` is the best run on record: label the card "Best streak" or "Longest streak"');
        expect(SKILL_MARKDOWN).toContain('label the bar "Best streak" or "Longest streak"');
        expect(SKILL_MARKDOWN).toContain("`current_streak` is the run going on now");
        expect(SKILL_MARKDOWN).toContain("`current_streak` counts the run going on now");
        expect(SKILL_MARKDOWN).toContain("count sum avg min max latest streak current_streak");
    });

    it("current_streak states its today grace and its period cap, on both blocks (B-118)", () => {
        const grace = "a day not filled yet leaves the run counted up to yesterday, and only a gap on yesterday or earlier";
        const cap = "so `period: month` stops it at the first of the month";
        // stats and progress each carry their own note.
        expect(SKILL_MARKDOWN.split(grace).length - 1).toBe(2);
        expect(SKILL_MARKDOWN.split(cap).length - 1).toBe(2);
    });

    it("a week starts on the first day of the interface language, the plugin's own if picked (B-107)", () => {
        const phrase = "A week starts on the first day of the interface language, Dashy's own when one "
            + "is picked in its settings, otherwise Obsidian's: Sunday in English, Monday in most European languages";
        // stats, progress and tiles each document `period` separately, chart its `bucket`.
        expect(SKILL_MARKDOWN.split(phrase).length - 1).toBe(4);
    });

    it("a text field is not a number, and names the where + count workaround (B-106)", () => {
        // stats and progress each document `field` separately, heatmap has its own wording.
        const dashPhrase = "holding text rather than a number, shows a dash and a warning naming it";
        expect(SKILL_MARKDOWN.split(dashPhrase).length - 1).toBe(2);
        expect(SKILL_MARKDOWN).toContain('count text instead with `where: "field contains ...');
        expect(SKILL_MARKDOWN).toContain("holding text rather than a number, errors and says which");
    });

    it("states the empty rule exactly: count reads 0, a field aggregate reads a dash (B-109)", () => {
        expect(SKILL_MARKDOWN).toContain("`count` over nothing reads a plain `0`, the number of notes found");
        expect(SKILL_MARKDOWN).toContain("`count` over nothing reads a plain `0` and an empty bar");
        // The old blanket wording ("nothing to count... shows a dash rather
        // than a zero") contradicted `count`'s own honest `0` — it must not
        // reappear as a general rule.
        expect(SKILL_MARKDOWN).not.toContain("Nothing to count, and the card shows a dash rather than a zero");
        expect(SKILL_MARKDOWN).not.toContain("Nothing to count, and the bar stays empty and the value shows a dash rather than a zero");
    });

    it("countdown does not repeat a date every year (B-110)", () => {
        expect(SKILL_MARKDOWN).toContain("The date does not repeat every year");
    });

    it("heatmap field is not marked required, since layers replaces it (B-124)", () => {
        const heatmap = schema.blocks.heatmap as { root: Record<string, { required?: boolean }> };
        expect(heatmap.root.field.required).toBeUndefined();
        expect(SKILL_MARKDOWN).toContain("required unless `layers` is set, and not allowed together with it");
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

    it("chart: the facts ADR 0005 says an agent gets wrong", () => {
        const chart = schema.blocks.chart as { root: Record<string, { required?: boolean }>; hints: Record<string, string> };
        // `field` is optional at the root: `series` or `agg: count` replace it.
        expect(chart.root.field.required).toBeUndefined();
        expect(SKILL_MARKDOWN).toContain("A list in the block's own `field` is an error rather than a guess");
        expect(SKILL_MARKDOWN).toContain("A bucket with no data is a gap in the line and no bar, never a zero");
        expect(SKILL_MARKDOWN).toContain("`avg` is over values, not days");
        expect(SKILL_MARKDOWN).toContain("`sum` of a checkbox counts the ticked days");
        expect(SKILL_MARKDOWN).toContain("a second y axis");
        // The neighbours' keys are printed with what they are called here.
        for (const [from, to] of Object.entries(chart.hints)) {
            expect(SKILL_MARKDOWN).toContain(`- \`${from}\` is \`${to}\` here`);
        }
        // Charts are no longer on the "does not do" list; pie charts are.
        expect(SKILL_MARKDOWN).not.toContain("Dashy does not draw charts");
        expect(SKILL_MARKDOWN).toContain("- **pie** —");
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
            "The date does not repeat every year",
        ]) {
            expect(AGENTS_SECTION, phrase).toContain(phrase);
        }
    });
});
