# Dashy rules for the maker and the checker

Binding for both agents, on top of the "Соглашения" in `CLAUDE.md` (layers, schema keys, i18n, dates, diagnostics, re-render, CSS tokens). The kit's agents and `.claude/rules/opdk/` cover everything general (TypeScript, scorecard rules, gates, what never to run); this file holds what is particular to Dashy.

## Layers and data

- **Moment stays out of `core/`.** A date in a user format is read through the injected `ParseDate` (`core/note-date.ts`), implemented by `adapters/datetime.ts`; tests pass a small fake parser. Never import `moment` or an adapter into `core/`.
- **Blocks only draw.** They never inspect raw frontmatter types: that knowledge goes into a `core/` helper.
- **Data flow** for tracing a change: vault snapshot (`adapters/vault.ts`) → selection (`core/source.ts`: `source`, `tag`, `where`) → aggregation (`core/aggregate.ts`, `stat.ts`, `progress.ts`, `sparkline.ts`, `calendar.ts`) → drawing (`blocks/*.ts`).
- **Root selection is inherited.** On `stats` and `progress` the root's `source`, `tag`, `where`, `period`, `date_field` and `date_format` reach every card (`core/inherit.ts`, B-131): a card's own value replaces the root's, `where` adds up. A card check ("`compare` needs `period`") reads the inherited value, not only the card's keys.
- **`from` is a synonym of `source`.** A map-valued key (`period: { from, to }`) escapes alias resolution in `shared/parse.ts` only through the schema type `map`; a new map-valued key needs that type.

## Schema and generated files

- After a schema edit, `build:skill` and `build:reference` regenerate `src/skill/`, `docs/dashy.schema.json`, `docs/*.preview.md` and `site/reference/`. Never hand-edit them.
- A new key or changed behaviour gets a schema `notes` line or `example` an agent can copy, not only a `doc`. An example that shows a worse way than the code allows (a folder repeated on every card the root could carry) is a finding.

## Date windows

- **Running windows** (`period: week`, `month`, `year`, `Nd`) end today and forgive today (`current_streak`, the `so far` bucket).
- **Fixed windows** (`period: note`, a literal like `2026-W40`, `from`/`to`) end on their own last day; `from` alone runs to today. Every "today" in the code (end of `trend`, the streak's last day, notes after the end, the `compare` window) uses that end. While a fixed window runs it behaves like `week`; once over it forgives nothing (B-173).
- A new date feature is tested in both kinds plus a window that has not started yet.
- **Periodic Notes.** A period switched on with no format saved uses the plugin's default (`PERIODIC_NOTES_FORMATS` in `core/period-name.ts`; the week is the locale `gggg-[W]ww`, not ISO); one switched off with no format falls back to ISO. Test both, not only a saved format (B-171).
- Traps: notes not named by a date (templates in the diary folder), two notes for one date in different folders, multi-year data, empty selections.

## Contracts

- **Agent skill is a product.** The process text (look, pick, write, recipes, check) is hand-written in `scripts/build-skill.cjs`; a new recipe renders against the fixture vault in `src/skill/skill-process.test.ts`. A feature an agent could use gets a row in "Pick the block" or a recipe. For a skill change, read `docs/SKILL.preview.md` and `docs/reference.preview.md` as an agent would.
- **Writes only on a call.** `src/app/agent-files.ts` (skill, AGENTS.md section) and the agent tools (`src/app/agent-tools.ts`, text from `core/block-check.ts` and `core/vault-profile-file.ts`) never write on load. The tools write only `.dashy/block-check.md` and `.dashy/vault-profile.md`; no note body goes into either, a property named like a password, token, secret or key shows no value, and the report uses the block's diagnostic word for word. A new field kind or diagnostic an agent should see goes into these files and into the skill's "look" and "check" steps together.
- **Public API** (`src/app/api.ts`, `docs/API.md`, B-208): Garmy codes against it. Removing, renaming or changing the meaning of a member raises `API_VERSION`; adding one does not. `check` reads the vault as it is after indexing (it drops the cached snapshot first).
- **Guide prompts.** Each guide's "Ask your agent" prompt is pinned by `src/test/guide-prompts.test.ts` and asks only for what the guide's YAML can do.

## Input, styles, text

- Caps on counts a user writes: `goal: { usual: N }` stops at 120 (B-209), `period` at `MAX_DAYS`. Over frontmatter text use `indexOf` where a lazy regex would backtrack (B-211). Internal links go through `shared/render.ts`. The plugin makes no network calls.
- Anything drawn as a link with text is also Obsidian's `.internal-link`, whose colour and underline (up to 0,4,0) beat a plain block class: override with a selector of the same weight, as the tile and the heatmap calendar day do in `blocks.css`.
- `opdk scan` reads `site/` and `design/` too: site scripts build markup with DOM nodes, not `innerHTML`.
- No typographic dashes (em, en) in README, CHANGELOG, catalogs or schema docs.

## Tests and the visible result

- Stubs: `src/test/stubs/obsidian.ts`, `src/test/vault.ts`, `obsidian-test-mocks` for DOM tests. `isolate: false`: state a test leaves (moment or i18n locale, `Platform`, fake timers, `document.body`) leaks into later files; see the `npm test` row in `CLAUDE.md`.
- A new visual state goes into `src/preview/cases.ts` (`npm run preview`).
- What the user sees: captions, legends, bands, number formatting, diagnostics, and the first-run examples `core/vault-profile.ts` fits from the schema examples. Each must still make sense for the data the change admits. A README or CHANGELOG claim must match what the code computes (`streak` is the longest run, not the current one).

## Not verifiable locally

Behaviour in a real vault (`npm run dev:vault` into a temp folder: Properties edits redrawing a block, narrow and mobile widths, themes like Minimal) and `npm run e2e`, which CI does not run.
