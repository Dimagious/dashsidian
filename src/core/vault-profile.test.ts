import { describe, it, expect, vi, afterEach } from "vitest";
import { profileVault, fitExample } from "./vault-profile";
import { dateKey } from "./calendar";
import type { NoteRecord } from "./source";
import schema from "../blocks/schema.json";
import { renderStats } from "../blocks/stats";
import { renderProgress } from "../blocks/progress";
import { mockContext, host, diagnostics } from "../test/vault";

const note = (folder: string, name: string, fm: Record<string, unknown> = {}): NoteRecord =>
    ({ path: `${folder}/${name}.md`, name, folder, tags: [], frontmatter: fm });

describe("profileVault", () => {
    it("picks the folder holding the most notes", () => {
        const notes = [
            note("Journal", "a"), note("Journal", "b"), note("Journal", "c"),
            note("Work", "d"), note("Work", "e"),
        ];
        expect(profileVault(notes).folder).toBe("Journal");
    });

    it("picks the numeric property found in the most notes", () => {
        const notes = [
            note("J", "a", { mood: 3, once: 1 }),
            note("J", "b", { mood: 4 }),
            note("J", "c", { mood: 5 }),
        ];
        expect(profileVault(notes).field).toBe("mood");
    });

    it("a property that is never a number is not a field", () => {
        const notes = [note("J", "a", { title: "hello", tags: ["x"] })];
        expect(profileVault(notes).field).toBeNull();
    });

    // A checkbox property (`gym: true`) is numeric data everywhere else now,
    // but not here: `field: gym` in a first-run example would draw a heatmap
    // with `bands: [90, 80, 60]` over a 1/0 value and a "Sleep" card
    // averaging 0.7, both nonsense the moment a checkbox happens to be the
    // vault's most common property.
    it("a boolean checkbox property is passed over for a real number", () => {
        const notes = [
            note("Diary", "a", { gym: true, sleep_score: 82 }),
            note("Diary", "b", { gym: false, sleep_score: 74 }),
            note("Diary", "c", { gym: true, sleep_score: 90 }),
        ];
        expect(profileVault(notes).field).toBe("sleep_score");
    });

    it("a vault with only a checkbox property has no field to suggest", () => {
        const notes = [
            note("Diary", "a", { gym: true }),
            note("Diary", "b", { gym: false }),
        ];
        expect(profileVault(notes).field).toBeNull();
    });

    it("an empty property in a template does not count", () => {
        const notes = [note("J", "a", { mood: 3 }), note("Templates", "Daily", { mood: "" })];
        expect(profileVault(notes).field).toBe("mood");
    });

    it("a vault of loose notes has no folder to suggest", () => {
        expect(profileVault([note("", "a")]).folder).toBeNull();
    });

    it("an empty vault profiles as nothing, not as a guess", () => {
        expect(profileVault([])).toEqual({ folder: null, field: null });
    });

    it("the same vault always yields the same answer", () => {
        const notes = [note("Beta", "a", { x: 1 }), note("Alpha", "b", { y: 1 })];
        expect(profileVault(notes)).toEqual(profileVault([...notes].reverse()));
    });
});

describe("fitExample", () => {
    const profile = { folder: "Journal", field: "mood" };

    it("points a folder at this vault", () => {
        expect(fitExample("source: Diary", profile)).toBe("source: Journal");
    });

    it("points a property at this vault", () => {
        expect(fitExample("field: sleep_score", profile)).toBe("field: mood");
    });

    it("replaces a whole path, however deep", () => {
        expect(fitExample("path: 01-Areas/Sport/Training-Log", profile)).toBe("path: Journal");
    });

    it("leaves the label alone, only the value moves", () => {
        // Replacing the text `Books` everywhere turned "Books this year" into
        // "Journal this year".
        expect(fitExample("{ label: Books this year, source: Books, agg: count }", profile))
            .toBe("{ label: Books this year, source: Journal, agg: count }");
    });

    it("works inside an inline map, stopping at the comma", () => {
        expect(fitExample("{ label: A, source: Diary, field: sleep_score, agg: avg }", profile))
            .toBe("{ label: A, source: Journal, field: mood, agg: avg }");
    });

    it("synonyms of the keys are rewritten too", () => {
        expect(fitExample("folder: Diary\nproperty: sleep_score", profile))
            .toBe("folder: Journal\nproperty: mood");
    });

    it("leaves `year` alone, since the where example is about it", () => {
        expect(fitExample('where: "year = 2026"', profile)).toBe('where: "year = 2026"');
    });

    it("an example mentioning none of the samples comes back untouched", () => {
        expect(fitExample("daily: true", profile)).toBe("daily: true");
    });

    it("nothing to offer leaves the example as written", () => {
        const as_is = "source: Diary\nfield: sleep_score";
        expect(fitExample(as_is, { folder: null, field: null })).toBe(as_is);
    });

    it("half a profile replaces half the example", () => {
        expect(fitExample("source: Diary\nfield: sleep_score", { folder: "J", field: null }))
            .toBe("source: J\nfield: sleep_score");
    });
});

describe("every block's example fits the vault it lands in", () => {
    const profile = { folder: "Journal", field: "mood" };

    it("no example still points at a folder or property of the author's", () => {
        for (const [name, block] of Object.entries(schema.blocks as Record<string, { example: string }>)) {
            const fitted = fitExample(block.example, profile);
            const values = [...fitted.matchAll(/\b(?:source|folder|from|path|field|property|prop)\s*:\s*([^,}\n]+)/g)]
                .map((m) => (m[1] ?? "").trim());
            for (const value of values) {
                expect([profile.folder, profile.field], `${name} kept "${value}"`).toContain(value);
            }
        }
    });

    it("the blocks that read no vault data are untouched", () => {
        const blocks = schema.blocks as Record<string, { example: string }>;
        expect(fitExample(blocks.today!.example, profile)).toBe(blocks.today!.example);
        expect(fitExample(blocks.countdown!.example, profile)).toBe(blocks.countdown!.example);
    });
});

/**
 * The shape `scripts/newcomer-vault.cjs` builds for the first-run audit: a
 * `Journal` folder of YYYY-MM-DD notes with `mood`/`ran_km`, a `Templates`
 * note with both empty, and a `Work` folder of unrelated notes. Fitting is
 * only half the story for `period` items: `date_field` is never rewritten
 * (B-079 round 2 caught it live on this exact vault shape), so a schema
 * example carrying one has to happen to name a property this vault actually
 * has, or it silently warns instead of drawing. Rendering through the real
 * blocks is the only check that catches that; comparing rewritten text
 * against the profile, as the tests above do, cannot.
 */
function newcomerVaultNotes(today: Date): NoteRecord[] {
    const notes: NoteRecord[] = [];
    for (let back = 60; back >= 0; back--) {
        if (back % 6 === 2) continue; // days they missed
        const at = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
        notes.push(note("Journal", dateKey(at), { mood: 3 + (back % 3), ran_km: (back % 9) + 1 }));
    }
    notes.push(note("Templates", "Daily", {}));
    for (let i = 1; i <= 12; i++) notes.push(note("Work", `meeting-${i}`, {}));
    return notes;
}

describe("the schema examples survive a newcomer-shaped vault", () => {
    const TODAY = new Date(2026, 8, 24);

    afterEach(() => vi.useRealTimers());

    it("stats and progress render every fitted example with no diagnostics", () => {
        const notes = newcomerVaultNotes(TODAY);
        const profile = profileVault(notes);
        // Ties break alphabetically (see profileVault above), and every
        // Journal note carries both fields equally, so "mood" wins over
        // "ran_km" — asserted here so a change to that tie-break does not
        // silently swap which field the rest of this test exercises.
        expect(profile).toEqual({ folder: "Journal", field: "mood" });

        const ctx = mockContext({
            notes: notes.map((n) => ({ path: n.path, frontmatter: n.frontmatter, tags: n.tags })),
        });

        vi.useFakeTimers();
        vi.setSystemTime(TODAY);

        const blocks = schema.blocks as Record<string, { example: string }>;
        for (const name of ["stats", "progress"] as const) {
            const fitted = fitExample(blocks[name]!.example, profile);
            const el = host();
            if (name === "stats") renderStats(ctx, fitted, el);
            else renderProgress(ctx, fitted, el);

            expect(diagnostics(el, "error"), `${name}:\n${fitted}`).toEqual([]);
            expect(diagnostics(el, "warning"), `${name}:\n${fitted}`).toEqual([]);
        }
    });
});
