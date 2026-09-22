---
name: release-bump
description: Cut a new release of the snipsidian Obsidian plugin end-to-end. Triggered when the user says "релизим", "выкатываем версию", "поднять версию", "bump version", "release bump", or right before tagging a new version. Reads conventional commits since the last tag, applies snipsidian-specific MAJOR rules (settings schema break, command-id removal/rename, minAppVersion bump, removed public exports), updates `package.json` + `manifest.json` (synced via `scripts/version-sync.cjs`), updates the `[Unreleased]` section in `CHANGELOG.md` to the new version, commits as `chore(release): X.Y.Z`, tags as `X.Y.Z` (no `v` prefix — matches `.github/workflows/release.yml` pattern `'*.*.*'`), and pushes to trigger the release workflow.
---

# Release bump for snipsidian

Cuts a new tagged release of the snipsidian Obsidian plugin. There is **no release-please** here — releases are tag-driven: pushing a tag `X.Y.Z` triggers [`.github/workflows/release.yml`](../../.github/workflows/release.yml) which builds, attests, and creates a GitHub Release. This skill owns the version decision **and** the file edits + commit + tag that lead up to that.

## Mental model

- Two version files must stay in sync: `package.json` and `manifest.json`. `scripts/version-sync.cjs` propagates `package.json` → `manifest.json`. `scripts/assert-versions.cjs` fails CI if they diverge.
- Tag format is bare `X.Y.Z` (no `v` prefix). The release workflow's trigger is `tags: ['*.*.*']`.
- `CHANGELOG.md` is curated by hand in Keep a Changelog format. The `[Unreleased]` section is where in-flight items accumulate between releases. This skill promotes `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD` and opens a fresh empty `[Unreleased]`.
- The release workflow already attests `main.js`/`manifest.json`/`styles.css`, no separate signing step needed.
- There is no `versions.json` (the Obsidian-style file that maps plugin versions → minAppVersion). If `minAppVersion` ever changes, that's a Step 2 MAJOR trigger anyway.

Three confirmation gates:

1. After analyzing commits + applying snipsidian rules → **wait for OK** on the proposed bump.
2. After staging file edits (`package.json`, `manifest.json`, `CHANGELOG.md`) → **wait for OK** before commit + tag.
3. Before `git push --follow-tags` → **wait for OK** (pushing the tag triggers the release workflow on the spot).

## What this skill DOES

- ✅ Decide the next version using conventional commits + snipsidian-specific MAJOR rules
- ✅ Bump `package.json` and run `scripts/version-sync.cjs` to sync `manifest.json`
- ✅ Promote `[Unreleased]` in `CHANGELOG.md` to the new version with today's date, and re-open `[Unreleased]`
- ✅ Create the release commit `chore(release): X.Y.Z`
- ✅ Create the annotated tag `X.Y.Z` on that commit
- ✅ Push commit + tag (the release workflow fires off the tag push)

## What this skill does NOT do

- ❌ Hand-craft new CHANGELOG entries — the user should have been writing them under `[Unreleased]` as work landed. If the section is empty but commits exist, **stop and ask** rather than guess.
- ❌ Cherry-pick or rebase. If main isn't in the state you want released, fix that first.
- ❌ Skip `scripts/assert-versions.cjs` — if package/manifest are out of sync going in, fix that before bumping.
- ❌ Force-push. If `git push --follow-tags` fails, that's a real conflict, investigate.
- ❌ Publish anywhere else (community plugin index, Obsidian's master plugins.json) — that's handled separately.

## Step 1 — Read current state

```bash
# Current versions (must match — otherwise stop and reconcile first)
node -p "require('./package.json').version"
node -p "require('./manifest.json').version"
node scripts/assert-versions.cjs

# Last tag. Filter to bare X.Y.Z — the repo still carries old v-prefixed
# tags (v0.x.y), and `-v:refname` sorts those ABOVE 1.x, so an unfiltered
# `head -1` returns v0.9.0 instead of the real latest (bit us cutting 1.2.0).
LAST_TAG=$(git tag --list '[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1)
echo "Last tag: $LAST_TAG"

# Commits since last tag
RANGE=${LAST_TAG:+"$LAST_TAG..HEAD"}
git log --pretty=format:"%h %s" $RANGE | grep -vE "^[0-9a-f]+ Merge "

# Look for explicit BREAKING markers (footer or `<type>!:`)
git log --pretty=format:"%h%n%B%n---" $RANGE | grep -B 1 -E "^BREAKING CHANGE:|^feat!:|^fix!:|^chore!:|^refactor!:"

# Check the [Unreleased] section state
awk '/^## \[Unreleased\]/,/^## \[/' CHANGELOG.md | head -40
```

If `assert-versions.cjs` fails, **stop** and tell the user to reconcile `package.json` ↔ `manifest.json` first.

If `[Unreleased]` is empty but the commit range is non-empty, **stop** and ask the user what should go into it — don't invent entries from commit messages.

Categorise the commit list:

| Conventional type | Default bump | CHANGELOG bucket |
|---|---|---|
| `feat:` | MINOR | Added |
| `fix:`, `perf:` | PATCH | Fixed / Performance |
| `<type>!:` / `BREAKING CHANGE:` footer | **MAJOR** | Changed (breaking) |
| `revert:` | PATCH | Fixed |
| `docs:`, `chore:`, `refactor:`, `test:`, `build:`, `ci:`, `style:` | hidden | (skip; CHANGELOG omits these) |

## Step 2 — Apply snipsidian-specific MAJOR rules

Conventional commits alone won't catch plugin-level breakage that hurts existing users. Walk this checklist with the user — even if the commit log looks like a minor.

| Trigger for MAJOR (independent of `!:`) | Where to look |
|---|---|
| Settings/data-schema break: existing users' `data.json` no longer loads or silently loses fields | `git diff $LAST_TAG..HEAD -- src/types.ts src/store/ src/app/plugin.ts` — types added without migration, renamed top-level keys, removed fields |
| Removed or renamed Obsidian command IDs (breaks users' hotkeys) | `git diff $LAST_TAG..HEAD -- src/app/plugin.ts` — anything in `this.addCommand({ id: "..." })` |
| Bumped `minAppVersion` in `manifest.json` | `git diff $LAST_TAG..HEAD -- manifest.json` |
| Removed or renamed exported types/functions used by other plugins or community packages | `git diff $LAST_TAG..HEAD -- src/types.ts src/services/package-types.ts` |
| Breaking change to the community package YAML schema | `git diff $LAST_TAG..HEAD -- src/services/package-validator.ts src/services/package-types.ts` |
| Built-in snippet packs renamed/removed in a way that breaks existing user vault keys | `git diff $LAST_TAG..HEAD -- src/catalog/ src/presets.ts src/store/presets.ts` |

If any answer is yes AND the commit log lacks a `!:` marker → propose either (a) re-doing the offending commit's subject with `!:` (only if not yet pushed) or (b) accepting the bump anyway, and noting the breaking surface in the CHANGELOG `### Changed` section. Don't fabricate a `chore!:` signal commit — there's no release-please to convince here.

If everything's no and the commit log has no breaking markers → the bump is whatever the conventional analysis says (MINOR for any `feat:`, otherwise PATCH).

Edge cases worth flagging out loud:

- **Pure chore PR with no `feat:`/`fix:` (e.g., the scorecard-fixes branch)** → still bump as **PATCH**. The Obsidian community plugin index re-fetches `manifest.json` to decide if users see an update, and we want users to pick up the new scorecard-clean bundle even though no behavior changed. Note this rationale in the release commit body, not in CHANGELOG (chore-only releases legitimately have a sparse CHANGELOG section).
- **Pre-1.0 pattern** → `versions <1.0.0` predate this skill. The plugin is at `1.0.x` now; we don't reset to 0.x.
- **Tag-prefix mismatch** → older tags use `v0.X.Y`; current tag scheme is bare `X.Y.Z`. Use bare — the release workflow's glob matches that.

## Step 3 — Propose the bump

Build a short report:

```text
Current baseline: 1.0.5 (package.json + manifest.json in sync)
Last tag:         1.0.5
Commits since:    3 feat / 5 fix / 22 hidden (chore/build/ci/refactor/style/test)
Breaking markers: none in the existing log
[Unreleased]:     non-empty (12 entries)

Snipsidian MAJOR review:
  • Settings schema break:        NO
  • Removed/renamed command IDs:  NO
  • minAppVersion bumped:         NO
  • Removed public exports:       NO
  • Package YAML schema break:    NO
  • Built-in pack rename:         NO

Proposed bump: 1.1.0 (MINOR — new `feat:` since last tag, no breaking)
New tag:       1.1.0
```

**Wait for OK** on the proposed bump.

If the user wants a different bump than the conventional default (e.g., "no, ship this as 2.0.0 because the snippet picker UX is a redesign") — accept it; SemVer for plugins is a judgment call and the user owns the contract with their users. Note the override reason in the release commit body.

## Step 4 — Execute the bump

After OK on the version:

```bash
NEW_VERSION="1.1.0"  # whatever was confirmed

# 1. Bump package.json (also re-write to keep formatting stable)
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version

# 2. Sync manifest.json from package.json
node scripts/version-sync.cjs

# 3. Verify they match (sanity)
node scripts/assert-versions.cjs

# 4. Promote [Unreleased] in CHANGELOG.md — do this via Edit, NOT sed:
#    - replace `## [Unreleased]` with `## [Unreleased]\n\n## [X.Y.Z] - YYYY-MM-DD`
#    - keep the existing content under the new dated heading
#    - the new `[Unreleased]` heading stays empty for next cycle
```

Use today's date in ISO form (`YYYY-MM-DD`). Get it from `currentDate` in the system context, not `date` on the host (timezone surprises).

If `[Unreleased]` only has chore-bucket items (no Added/Changed/Fixed), it's OK to leave the dated section near-empty — but include a one-liner like `### Maintenance` so the section isn't literally just a heading. Don't enumerate every chore commit; that's what `git log` is for.

Show the user the diff:

```bash
git diff -- package.json manifest.json CHANGELOG.md
```

**Wait for OK** before the commit.

## Step 5 — Commit + tag

```bash
git add package.json manifest.json CHANGELOG.md

git commit -m "$(cat <<'EOF'
chore(release): X.Y.Z

<Optional one-paragraph body. Useful when:
 - the bump overrides the conventional default (say why),
 - a chore-only release (note rationale, e.g. "ship scorecard-clean bundle"),
 - any heads-up the next person merging will want.>
EOF
)"

git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"
```

Annotated tag (`-a`) — not lightweight. The `softprops/action-gh-release` step reads tag metadata.

Do NOT use `--no-verify`. Pre-commit hooks (if any) must run. CI re-runs everything on the tag push anyway, but local hooks catch obvious breakage before pushing.

## Step 6 — Push (release workflow fires)

**Wait for OK before this step.** Pushing the tag triggers [`.github/workflows/release.yml`](../../.github/workflows/release.yml) immediately; once it's running, rolling back means yanking a GitHub Release.

```bash
# Push the commit and the tag in one go (--follow-tags pushes annotated tags
# reachable from pushed commits)
git push --follow-tags
```

If you're on a feature branch and the release commit needs to land on `main` first → do the merge to `main` BEFORE creating the tag. Tagging a feature-branch commit and pushing the tag works (the workflow fires off the tag, not the branch), but it leaves the tag pointing to a commit that's not on `main` until the merge — confusing for future archeology. Cleaner: merge first, then tag main, then push tag.

## Step 7 — Tell the user what happens next

After the push:

1. The release workflow builds `main.js`, attests provenance, and opens a GitHub Release with `main.js`/`manifest.json`/`styles.css` attached. Watch it at [Actions](https://github.com/Dimagious/snipsidian/actions).
2. The Obsidian community plugins index re-fetches `manifest.json` from the repo's `main` branch on its own schedule (typically within hours). Users get an "Update available" notice when their installed `manifest.json` version is lower than what the index reports.
3. The scorecard at `community.obsidian.md/plugins/snipsidian` re-scans on its own; that's outside our control. Health/Review badges may take a release cycle to refresh.

## Common pitfalls

**`package.json` and `manifest.json` out of sync before bumping** → `assert-versions.cjs` will catch it. Sync them in a small `chore: sync versions` commit first, then run the skill.

**`[Unreleased]` is empty but commits exist** → stop. The CHANGELOG is curated, not generated. Ask the user to fill in `[Unreleased]` first (or explicitly confirm "yes, ship a chore-only release with `### Maintenance` only").

**Trying to retag `X.Y.Z` after the workflow already ran** → don't. Bump to `X.Y.Z+1` and ship that. The release workflow expects each tag to be unique; force-pushing a tag risks weird state in the Release.

**The Obsidian community plugins index doesn't pick up the new version** → the index reads the `manifest.json` on `main`. If you tagged a feature branch and never merged it, the index has nothing new to read. Merge to main.

**Wanting to skip CI for this tag** → don't. CI gates on tests/typecheck/build; if it fails on the tag, the GitHub Release is incomplete. Fix the failure and re-cut as `X.Y.Z+1`.

## What NOT to do

- ❌ Edit `package.json` and `manifest.json` independently — always go through `scripts/version-sync.cjs`
- ❌ Use lightweight tags (`git tag X.Y.Z` without `-a`) — Release notes lose the tag message
- ❌ Push the commit and tag separately if you didn't mean to — `--follow-tags` is one operation
- ❌ Combine the version-decision and the push confirmations into one OK gate — three gates exist for a reason
- ❌ Force-push a moved tag — investigate why the original tag is wrong instead
- ❌ Add a `v` prefix to the tag — the release workflow won't match it
