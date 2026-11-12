import { createObsidianTest } from "obsidian-plugin-dev-kit/e2e";

/**
 * The fixture of the specs that take pictures and films (capture, film-phone, listing-mobile). Their vault is the
 * generated demo vault, `.capture/vault` (`node scripts/demo-vault.cjs`): its dates end on the fixed day of
 * `demo-day.json`, which the specs freeze the clock at, so the heatmap is not a stripe that stops in the middle. It lies
 * inside the plugin folder, which the demo fixture requires.
 *
 * Pictures and films land in `.opdk/demo`, and `opdk demo` publishes them to `docs/screens` (opdk.config.mjs).
 */
export const { test, expect, onlyWhen } = createObsidianTest({
    seedVault: ".capture/vault",
    // The size of every desktop picture. Obsidian keeps a window inside the display, and a picture that runs past the
    // window fails instead of being cut.
    window: { width: 1280, height: 900 },
});

export { READING_VIEW } from "./fixtures";
