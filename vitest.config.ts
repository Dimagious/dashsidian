import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    test: {
        environment: "jsdom",
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
                // Thin wrappers over Obsidian and pure drawing: their logic was
                // moved into core/ and is covered there. Once mount tests exist,
                // drop these exclusions.
                "src/adapters/**",
                "src/shared/render.ts",
                // Layers that only register and draw. Their logic lives in core/
                // and shared/ and is covered there. Remove these as mount tests
                // appear — do not touch the threshold, it is a noise gate, not a
                // quality metric.
                "src/app/plugin.ts",
                "src/ui/**",
                "src/blocks/**",
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
