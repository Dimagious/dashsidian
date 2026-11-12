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
      // Test scaffolding: the fake Obsidian, the DOM shim, the fake vault.
      // None of it is bundled, and the preset forbids silencing its DOM rules
      // per line, rightly, since in plugin code they are never negotiable.
      'src/test/**',
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
