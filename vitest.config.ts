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
                // Сгенерированный файл, кода в нём нет.
                "src/skill/**",
                // Тонкие обёртки над Obsidian и чистая отрисовка: логика из них
                // вынесена в core/ и покрыта там. Появятся mount-тесты — убрать
                // отсюда. См. .claude/brain/backlog.md.
                "src/adapters/**",
                "src/shared/render.ts",
                // Слои, которые только регистрируют и рисуют. Логика из них
                // вынесена в core/ и shared/ и покрыта там. Убирать отсюда по
                // мере появления mount-тестов — порог не трогать, он шумовой
                // гейт, а не показатель качества.
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
