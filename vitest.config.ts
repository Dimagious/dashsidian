import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    test: {
        environment: "jsdom",
        // Obsidian's DOM helpers live on HTMLElement.prototype; blocks are
        // written against them, so mount tests need them installed first.
        setupFiles: ["src/test/setup-dom.ts"],
        include: ["src/**/*.test.ts"],
        coverage: {
            enabled: true,
            provider: "v8",
            reporter: ["text", "html", "lcov", "json-summary"],
            reportsDirectory: "coverage",
            include: ["src/**/*.ts"],
            exclude: [
                "main.js",
                "scripts/**",
                "src/main.ts",
                "src/types.ts",
                "src/test/**",
                "src/**/*.test.ts",
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
                "**/*.d.ts",
            ],
            thresholds: {
                lines: 90,
                functions: 90,
                statements: 90,
                branches: 80,
            },
        },
    },
    resolve: {
        alias: {
            obsidian: fileURLToPath(new URL("./src/test/stubs/obsidian.ts", import.meta.url)),
        },
    },
});
