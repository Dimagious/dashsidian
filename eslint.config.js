import obsidianmd from 'eslint-plugin-obsidianmd';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // ESLint's own recommended rules, from the ESLint this repo runs (10). The
  // preset carries them too, but takes them from the ESLint it resolves, and
  // npm nests an ESLint 9 under it, which lacks the three rules 10 added
  // (`no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`).
  // Scoped to code: unscoped, the core rules reach `manifest.json` and
  // `LICENSE`, which the preset lints since 0.5.0, and abort the run.
  { ...js.configs.recommended, files: ['**/*.{ts,tsx,js,mjs,cjs}'] },

  // The plugin's own `recommended` preset, not a hand-picked subset of it.
  // Picking rules by hand is picking which parts of the review to fail: the
  // list here was 27 of the 39 the preset enables, and the twelve missing ones
  // included `no-unsupported-api` at error level and the console-logging rule
  // straight out of the plugin guidelines.
  //
  // Since 0.5.0 it also carries typescript-eslint's `recommendedTypeChecked`
  // for TS files (the reviewer's type-aware rules), so this file no longer
  // adds typescript-eslint's configs itself.
  ...obsidianmd.configs.recommended,

  // Our own overrides on top, each one deliberate.
  {
    plugins: {
      obsidianmd: obsidianmd,
    },
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        process: 'readonly',
      },
    },
    rules: {
      // Timers go through `window`, not `activeWindow`: a popout window gets a
      // `window` that resolves correctly through the timer's own closure.
      'obsidianmd/prefer-window-timers': 'error',
      // Presence-only check: it flags a PluginSettingTab without a
      // getSettingDefinitions() method. See src/ui/settings.ts, which has one.
      'obsidianmd/settings-tab/prefer-setting-definitions': 'error',
      // 0.5.x turns this off in favour of obsidianmd/no-nodejs-modules, which
      // only warns, and `eslint .` passes on warnings. The plugin runs on
      // phones: no `require` belongs in it.
      '@typescript-eslint/no-require-imports': 'error',

      // Off: it reads diagnostics and button labels as headings and asks for
      // sentence case where the text is already a sentence.
      'obsidianmd/ui/sentence-case': 'off',

      // Match the Obsidian scorecard scanner's strict no-unused-vars policy:
      // every declared argument must be used (or prefixed with `_`).
      '@typescript-eslint/no-unused-vars': ['error', {
        args: 'all',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
      }],

      // A Promise returned where a void-typed callback is expected, a DOM
      // listener for instance, drops its rejection in silence. The preset runs
      // this as `obsidianmd/no-misused-promises` at error level since 0.5.0:
      // the same check, without Obsidian's chaining `then` counted as a
      // Promise. Needs the type information parserOptions.project provides.
    },
  },
  
  // Config files - no type checking
  {
    files: ['*.config.ts', '*.config.js', 'vitest.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
      // No parserOptions.project for config files to avoid parsing errors
    },
    rules: {
      // Disable rules that require type checking for config files
      'obsidianmd/no-plugin-as-component': 'off',
    },
  },
  
  // Ignore patterns
  {
    ignores: [
      // Scenes for the stageshow skill: React, built in that skill's playground
      'design/**',
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'main.js',
      // Build output of the preview stand and the capture run: bundles, and
      // one of them is a symlink to main.js inside a generated vault.
      '.preview/**',
      '.capture/**',
      'scripts/**',
      // The GitHub Pages site and its assembled copy: a static web page, not
      // plugin code. The plugin preset's rules (App#saveLocalStorage, popout
      // timers) have no meaning there, and none of it ships in main.js.
      'site/**',
      '_site/**',
      // Test scaffolding: the fake Obsidian, the DOM shim, the fake vault.
      // None of it is bundled, and the preset forbids silencing its DOM rules
      // per line — rightly, since in plugin code they are never negotiable.
      // The shim cannot call createEl: it is what provides createEl.
      'src/test/**',
      'src/**/*.test.ts',
      'vitest.config.ts', // Exclude from type checking to avoid parsing errors
      // e2e/**, e2e-vault.pristine/**, and playwright.config.ts are
      // git-tracked, but outside tsconfig's `include` (`src/**/*.ts`
      // only), so the type-aware rules can't parse them ("file not
      // found in any of the provided project(s)"); none of this code
      // ships in main.js. E2E lint setup (its own tsconfig + config
      // block) is a separate future task.
      // .obsidian-unpacked/** is a local/untracked unpacked-vault
      // artifact, not source.
      '.obsidian-unpacked/**',
      'e2e-vault.pristine/**',
      'e2e/**',
      'playwright.config.ts',
    ],
  },
];

