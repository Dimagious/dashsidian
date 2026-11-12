import { mergeConfig } from "vitest/config";
import { defineUnitConfig } from "obsidian-plugin-dev-kit/vitest";

const unit = defineUnitConfig({
    rootDir: import.meta.dirname,
    // Dashy's own stub, for the node tests and the DOM ones alike.
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
            // rows, which obsidian-test-mocks cannot render, and Dashy's stub
            // of `Setting` records nothing. Its behaviour is checked end to
            // end instead. The rest of src/ui (the insert-block picker) is
            // counted.
            "src/ui/settings.ts",
        ],
        extraReporters: ["lcov", "html"],
    },
});

export default mergeConfig(unit, {
    test: {
        // Test files share their worker instead of each getting a fresh
        // module graph and jsdom: 3x faster here, the same tests, the same
        // coverage. The price is that module state a test leaves behind is
        // seen by the files after it, so keep restoring globals and timers in
        // afterEach, and check with `vitest run --sequence.shuffle` after
        // adding a module-level cache.
        isolate: false,
    },
});
