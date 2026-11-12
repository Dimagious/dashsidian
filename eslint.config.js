import { obsidianPlugin } from 'obsidian-plugin-dev-kit/eslint';

// The lint config is the kit's: eslint-plugin-obsidianmd's `recommended` preset
// (which carries ESLint's recommended rules and typescript-eslint's
// type-checked ones), with `prefer-window-timers`, `prefer-setting-definitions`
// and the unused-variable policy of the community scanner as errors. Run with
// `--max-warnings=0`, so a warning from the preset fails the run too.
export default [
  ...obsidianPlugin({
    rootDir: import.meta.dirname,
    ignores: [
      // Build output of the preview stand and the capture run: bundles, and
      // one of them is a symlink to main.js inside a generated vault.
      '.preview/**',
      '.capture/**',
      // The GitHub Pages site and its assembled copy: a static web page, not
      // plugin code. The plugin preset's rules (App#saveLocalStorage, popout
      // timers) have no meaning there, and none of it ships in main.js.
      'site/**',
      '_site/**',
      // The fake Obsidian. It is not bundled, and it re-exports `moment` from
      // the package on purpose, the one import the plugin preset forbids
      // (the real app hands plugins its own). The fake vault next to it
      // (src/test/vault.ts) is linted like plugin code. Unit tests
      // (`src/**/*.test.ts`, the tests of the site and README scripts in
      // src/test among them) are left out by the preset itself.
      'src/test/stubs/**',
    ],
  }),
  {
    files: ['**/*.ts'],
    rules: {
      // The preset leaves this off in favour of obsidianmd/no-nodejs-modules,
      // which only warns. The plugin runs on phones: no `require` belongs in it.
      '@typescript-eslint/no-require-imports': 'error',
    },
  },
];
