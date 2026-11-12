import { defineUnitConfig } from "obsidian-plugin-dev-kit/vitest";

export default defineUnitConfig({
    rootDir: import.meta.dirname,
    // Dashy's own stub, for the node tests and the DOM ones alike.
    obsidian: "./src/test/stubs/obsidian.ts",
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
            // Generated file, no code of its own.
            "src/skill/**",
            // Registration only: onload wiring that a mount test cannot
            // observe without launching Obsidian. The E2E suite covers it.
            "src/app/plugin.ts",
            // The page wiring of the preview stand: selects, a theme switch
            // and a mount point. Its cases and fixture are covered.
            "src/preview/stand.ts",
            // The settings tab is driven through Obsidian's Setting builder;
            // covering it needs a fake of that builder, not of the DOM.
            // Its behaviour is checked end to end instead.
            "src/ui/**",
        ],
        extraReporters: ["lcov", "html"],
    },
});
