import { mergeConfig } from "vitest/config";
import { defineUnitConfig } from "obsidian-plugin-dev-kit/vitest";

const unit = defineUnitConfig({
    rootDir: import.meta.dirname,
    // The node tests use Dashy's own stub; the DOM ones get obsidian-test-mocks.
    obsidian: { node: "./src/test/stubs/obsidian.ts", dom: "obsidian-test-mocks" },
    // Only the files that need a DOM start jsdom; the rest run in node.
    dom: [
        "src/blocks/**/*.test.ts",
        "src/ui/**/*.test.ts",
        "src/preview/**/*.test.ts",
        "src/adapters/adapters.test.ts",
        "src/app/agent-tools.test.ts",
        "src/app/api.test.ts",
        "src/app/block.test.ts",
        "src/app/indexing.test.ts",
        "src/app/plugin.test.ts",
        "src/core/clock.test.ts",
        "src/core/day-rollover.test.ts",
        "src/core/vault-profile.test.ts",
        "src/shared/render.test.ts",
        "src/skill/skill-process.test.ts",
        "src/test/guide-prompts.test.ts",
        "src/test/site-script.test.ts",
    ],
    coverage: {
        include: ["src/**/*.ts"],
        exclude: [
            "main.js",
            "scripts/**",
            "src/main.ts",
            "src/types.ts",
            // Generated file, no code of its own (stamp.ts next to it is covered).
            "src/skill/skill-content.ts",
            // The page wiring of the preview stand: selects, a theme switch
            // and a mount point. Its cases and fixture are covered.
            "src/preview/stand.ts",
            // The settings tab is built from Obsidian's declarative setting
            // rows, which obsidian-test-mocks cannot render. Its behaviour is
            // checked end to end instead. The rest of src/ui (the insert-block
            // picker) is counted.
            "src/ui/settings.ts",
        ],
        extraReporters: ["lcov", "html"],
    },
});

export default mergeConfig(unit, {
    test: {
        // Test files share their worker instead of each getting a fresh
        // module graph and jsdom: 3x faster here, the same tests, the same
        // coverage. The price is that module state a test leaves behind (a
        // moment or i18n locale, Platform flags, fake timers, document.body)
        // and any vi.mock of a module another file already loaded are seen by
        // the files after it: restore globals in afterEach, and spy on what a
        // module uses instead of vi.mock-ing it. After adding such state, check
        // with `vitest run --maxWorkers=1 --sequence.shuffle --sequence.seed=N`
        // for a few N. One worker on purpose: with many workers each gets a
        // few files, and a leak between files hides.
        isolate: false,
    },
});
