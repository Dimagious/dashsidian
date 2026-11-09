/**
 * The community plugin scanner's ESLint configuration, for `scorecard:check`.
 *
 * Copied from eslint-plugin-obsidianmd's own "Community plugin scanner
 * configuration" (docs/configuration.md, 0.5.1): the recommended preset, the
 * rules the scanner switches off, its list of ignored paths, and unused
 * disable comments not reported. Not the repo's lint config on purpose: that
 * one leaves out `src/preview/`, `design/` and `site/`, and the scanner does
 * not, which is how 0.5.1's seven warnings on the preview stand went unseen.
 *
 * Two things the scanner does that the documented config does not, done here:
 * every finding counts, whatever its severity (the scanner turns most rules
 * into warnings, and a warning still lowers the score), which
 * `scripts/scorecard-check.cjs` enforces; and files no tsconfig covers are
 * linted without type information instead of failing to parse.
 */
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

/** What `tsconfig.json` takes in. Its tests are excluded there and ignored below. */
const TYPED = ["src/**/*.ts"];

/** obsidianmd rules that read the type checker (`meta.docs.requiresTypeChecking`). */
const OBSIDIANMD_TYPE_AWARE = Object.entries(obsidianmd.rules)
    .filter(([, rule]) => rule.meta?.docs?.requiresTypeChecking)
    .map(([name]) => `obsidianmd/${name}`);

export default [
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname + "/..",
            },
        },
    },

    ...obsidianmd.configs.recommended,

    {
        files: ["**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}"],
        rules: {
            // Security: kept as errors
            "no-eval": "error",
            "no-unsanitized/method": "error",
            "no-unsanitized/property": "error",
            "obsidianmd/regex-lookbehind": "error",
            "obsidianmd/no-forbidden-elements": "error",

            // Covered by TypeScript or too noisy
            "no-undef": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/restrict-template-expressions": "off",
            "@typescript-eslint/no-base-to-string": "off",
            "import/no-unresolved": "off",

            // Old plugins should not change their command ids
            "obsidianmd/commands/no-command-in-command-id": "off",
            "obsidianmd/commands/no-plugin-id-in-command-id": "off",
        },
    },
    {
        files: ["**/*.{js,cjs,mjs,jsx}"],
        rules: { "no-implied-eval": "error" },
    },
    {
        files: ["**/*.{ts,cts,mts,tsx}"],
        rules: { "@typescript-eslint/no-implied-eval": "error" },
    },

    // Files no tsconfig covers (the stageshow scenes, the site's scripts): the
    // scanner lints them without type information, with the rules that need
    // it switched off.
    {
        files: ["**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}"],
        ignores: TYPED,
        ...tseslint.configs.disableTypeChecked,
        languageOptions: {
            parserOptions: { projectService: false, project: null },
        },
        rules: {
            ...tseslint.configs.disableTypeChecked.rules,
            ...Object.fromEntries(OBSIDIANMD_TYPE_AWARE.map((name) => [name, "off"])),
        },
    },

    {
        files: ["manifest.json"],
        rules: { "obsidianmd/validate-manifest": "off" },
    },
    {
        files: ["LICENSE", "LICENSE.md", "LICENSE.txt"],
        rules: { "obsidianmd/validate-license": "off" },
    },
    {
        linterOptions: {
            reportUnusedDisableDirectives: "off",
            reportUnusedInlineConfigs: "off",
        },
    },

    {
        ignores: [
            "main.js",
            "**/*.min.js",
            "**/{dist,build,out,release}/**/*.{js,cjs,mjs,jsx}",
            "node_modules",
            "dist",
            "build",
            "pkg",
            "test-vault",
            ".obsidian",
            "**/.obsidian/**",
            "esbuild.config.mjs",
            "version-bump.mjs",
            "**/*.test.*",
            "**/*.tests.*",
            "**/*.spec.*",
            "**/*.specs.*",
            "**/test/**",
            "**/tests/**",
            "**/__tests__/**",
            "**/mocks/**",
            "**/__mocks__/**",
            "**/*.cjs",
            "**/*.mjs",
            "**/*.cts",
            "**/*.mts",
            "**/vite*",
            "**/scripts/**",
            "**/docs/**",
            "**/i18n/**",
            "**/i18next/**",
            "**/locale/**",
            "**/locales/**",
            "**/translations/**",
            "**/l10n/**",
            ".pnpm-store",
            "**/testUtils**",
            "automation/**",
            "**/e2e/**",
            "**/e2e-tests/**",
            "**/*.e2e.*",
            "**/wdio.conf.*",
            "**/wdio.*.conf.*",
            "**/playwright.config.*",
            "**/{astro,babel,commitlint,docusaurus,esbuild,eslint,jest,oxlint,postcss,prettier,rolldown,rollup,stylelint,svelte,tailwind,tsdown,tsup,uno,webpack}.config.*",
            "**/{eslint,jest}.*.config.*",
            "**/jest.setup.*",
            "**/.{babelrc,eslintrc,mocharc,prettierrc}.*",
        ],
    },
];
