---
name: release-bump
description: Cut a new release of Dashy (dashsidian) end-to-end. Triggered when the user says "релизим", "выкатываем версию", "поднять версию", "bump version", "release bump", or right before tagging a new version. Reads conventional commits since the last tag, applies the plugin-level MAJOR rules (a settings key removed or renamed, a block key removed or renamed, a raised minAppVersion, a removed public export), bumps `package.json` and propagates it with `scripts/version-sync.cjs` to `manifest.json` and `versions.json`, promotes `[Unreleased]` in `CHANGELOG.md`, commits as `chore(release): X.Y.Z`, tags as `X.Y.Z` (no `v` prefix — matches `.github/workflows/release.yml` pattern `'*.*.*'`), and pushes to trigger the release workflow.
---

# Release bump for Dashy

Cuts a new tagged release of the **dashsidian** repository (the plugin is named
Dashy; the id and the repository are `dashsidian`, and that mismatch is
deliberate — see `CLAUDE.md`). Releases are tag-driven: pushing a tag `X.Y.Z`
triggers [`.github/workflows/release.yml`](../../../.github/workflows/release.yml),
which builds, attests provenance and creates a GitHub Release with `main.js`,
`manifest.json` and `styles.css` attached as separate files, the way Obsidian
requires. This skill owns the version decision **and** the file edits, commit
and tag that lead up to it.

## Mental model

- The version is written in **four** places: `package.json`, `manifest.json`,
  `versions.json` and the tag. `scripts/version-sync.cjs` propagates
  `package.json` into the first three. `scripts/assert-versions.cjs` checks all
  four — pass it the tag as an argument, which is what the release workflow
  does with `github.ref_name`.
- `versions.json` maps a plugin version to the Obsidian it needs. The catalogue
  reads it to decide what to serve someone on an older Obsidian. It is the file
  that rots silently, which is why the sync writes it even when the manifest
  needed nothing.
- Tag format is bare `X.Y.Z`, no `v` prefix. The workflow trigger is
  `tags: ['*.*.*']`. This repository has no historical tags at all, so there is
  no prefix legacy to work around.
- The long-lived branch is **`master`**, not `main`.
- `CHANGELOG.md` is curated by hand in Keep a Changelog format. `[Unreleased]`
  is where in-flight items accumulate; this skill promotes it to
  `[X.Y.Z] — YYYY-MM-DD` and re-opens an empty `[Unreleased]`.
- The end-to-end suite never runs in CI: it drives a real Obsidian through a
  project-local Electron. Before a release, run it locally (`npm run e2e`) — it
  is the only thing that proves the built bundle works in the app.

Three confirmation gates:

1. After analysing commits and applying the MAJOR rules → **wait for OK** on
   the proposed bump.
2. After staging the file edits → **wait for OK** before commit and tag.
3. Before `git push --follow-tags` → **wait for OK**; pushing the tag starts
   the release on the spot.

## What this skill DOES

- ✅ Decide the next version from conventional commits plus the MAJOR rules below
- ✅ Bump `package.json` and run `scripts/version-sync.cjs` to write
  `manifest.json` and `versions.json`
- ✅ Promote `[Unreleased]` to the new version with today's date and re-open it
- ✅ Create the release commit `chore(release): X.Y.Z` and the annotated tag
- ✅ Push commit and tag together

## What this skill does NOT do

- ❌ Invent CHANGELOG entries from commit subjects. The section is curated; if
  it is empty while commits exist, **stop and ask**.
- ❌ Submit to `obsidianmd/obsidian-releases`. The catalogue entry is a separate
  pull request against someone else's repository and needs the user's explicit
  go-ahead.
- ❌ Cherry-pick, rebase or force-push. If `master` is not what should ship,
  fix that first.
- ❌ Re-tag. A tag that already ran the workflow is spent; ship `X.Y.Z+1`.

## Step 1 — Read current state

```bash
node scripts/assert-versions.cjs          # all four places, minus the tag
node -p "require('./versions.json')"

LAST_TAG=$(git tag --list '[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1)
echo "Last tag: ${LAST_TAG:-none yet}"

RANGE=${LAST_TAG:+"$LAST_TAG..HEAD"}
git log --pretty=format:"%h %s" $RANGE | grep -vE "^[0-9a-f]+ Merge "
git log --pretty=format:"%h%n%B%n---" $RANGE | grep -E "^BREAKING CHANGE:|!:"

awk '/^## \[Unreleased\]/,/^## \[[0-9]/' CHANGELOG.md
```

If `assert-versions.cjs` fails, **stop** and reconcile before bumping.

If `[Unreleased]` is empty but the range is not, **stop** and ask what belongs
in it. The one honest exception is the first release, where the section for the
version may already be written by hand — check before promoting, or you will
end up with two headings for one version.

| Conventional type | Default bump | CHANGELOG bucket |
|---|---|---|
| `feat:` | MINOR | Added |
| `fix:`, `perf:` | PATCH | Fixed |
| `<type>!:` or a `BREAKING CHANGE:` footer | **MAJOR** | Changed (breaking) |
| `docs:`, `chore:`, `refactor:`, `test:` | hidden | skipped |

## Step 2 — Apply the plugin-level MAJOR rules

Conventional commits do not catch breakage that only hurts someone who already
has the plugin installed. `CHANGELOG.md` states the contract; this is the same
list with the place to look.

| Trigger for MAJOR, with or without `!:` | Where to look |
|---|---|
| A settings key removed or renamed — an existing `data.json` stops loading or loses a field | `git diff $LAST_TAG..HEAD -- src/types.ts src/ui/settings.ts` |
| A block key removed or renamed — a dashboard someone already wrote stops rendering | `git diff $LAST_TAG..HEAD -- src/blocks/schema.json` |
| `minAppVersion` raised in `manifest.json` | `git diff $LAST_TAG..HEAD -- manifest.json` |
| A public export removed or renamed | `git diff $LAST_TAG..HEAD -- src/types.ts src/main.ts` |
| A command id removed or renamed — it breaks the user's hotkey | `git diff $LAST_TAG..HEAD -- src/app/plugin.ts`, the `addCommand({ id: ... })` calls (today: `insert-block`) |

Two things that look breaking and are not:

- **A block key gained a synonym.** `KEY_ALIASES` is built from the schema, and
  old spellings keep working. That is MINOR.
- **A translation catalogue changed.** A missing key falls back to English by
  design, so a partial catalogue is not a break.

And one that looks harmless and is not: **raising the block schema version**
(`src/blocks/schema.json`) is only MINOR while every old config still parses.
If a key changed meaning rather than being added, it is a break even though
nothing was removed.

## Step 3 — Propose the bump

```text
Baseline:          1.0.0 (package, manifest and versions.json agree)
Last tag:          1.0.0
Commits since:     2 feat / 4 fix / 17 hidden
Breaking markers:  none
[Unreleased]:      non-empty (6 entries)

MAJOR review:
  • Settings key removed/renamed:  NO
  • Block key removed/renamed:     NO
  • minAppVersion raised:          NO
  • Public export removed:         NO
  • Command id removed/renamed:    NO

Proposed: 1.1.0 (MINOR — new feat:, nothing breaking)
```

**Wait for OK.** If the user wants a different number, take it — the contract
with their users is theirs to set — and record the reason in the commit body.

## Step 4 — Execute

```bash
NEW_VERSION="1.1.0"   # whatever was confirmed

npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
node scripts/version-sync.cjs     # manifest.json + versions.json
node scripts/assert-versions.cjs "$NEW_VERSION"
```

`npm version` writes the number into `package-lock.json` too, in two places.
The assertion does not read the lockfile, but `npm ci` does, and it refuses a
lockfile whose version disagrees with `package.json` — so the lockfile belongs
in the release commit with the rest.

Then edit `CHANGELOG.md` by hand (not `sed`): insert
`## [X.Y.Z] — YYYY-MM-DD` under `[Unreleased]`, move the entries beneath it,
leave `[Unreleased]` empty. Use the date from the session context rather than
`date` on the host — the host's timezone has bitten this repository before.

Run the gate before committing, because the tag push starts a release that
cannot be taken back quietly:

```bash
npm run release          # release:check + zip
npm run release:audit    # tag, manifest inside the zip, file structure
npm run e2e              # real Obsidian; never runs in CI
git diff -- package.json manifest.json versions.json CHANGELOG.md
```

**Wait for OK** before the commit.

## Step 5 — Commit and tag

```bash
git add package.json package-lock.json manifest.json versions.json CHANGELOG.md
git commit -m "chore(release): $NEW_VERSION"   # body: why, if the bump was overridden
git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"
```

Annotated tag, not lightweight — the release action reads its message. The tag
belongs on a commit that is already on `master`: merge first, then tag.

## Step 6 — Push

**Wait for OK.** The push starts the workflow immediately.

```bash
git push --follow-tags
```

## Step 7 — Say what happens next

1. The workflow builds, attests and publishes the Release with the three files.
   Watch it: https://github.com/Dimagious/dashsidian/actions
2. **Until the plugin is accepted into the catalogue, that is the whole story.**
   There is no listing to refresh and no update notice for anyone; the README's
   Install section describes the future, not the present.
3. Once listed, the catalogue re-reads `manifest.json` from `master` on its own
   schedule, and `versions.json` decides what an older Obsidian is offered.

## Common pitfalls

**The version files disagree going in** → `assert-versions.cjs` says which pair
and stops. Fix in a small commit first; do not bump on top of it.

**`versions.json` left behind** → it cannot happen through `version-sync.cjs`
any more, but a hand-edited `manifest.json` still can. This is why the
assertion reads all three files rather than two.

**Tagging a tree whose manifest says something else** → the workflow now fails
on it, by design. Before that check existed, it would have published a release
whose own manifest contradicted its tag.

**The first release** → `CHANGELOG.md` already carries a written `[1.0.0]`
section while `[Unreleased]` is empty. Promote nothing; check the date and the
contents, then bump.

**Wanting to skip the gate for a chore-only release** → do not. A release that
ships a broken bundle costs a version number, and the number is public.

## What NOT to do

- ❌ Edit `manifest.json` or `versions.json` by hand — go through the sync
- ❌ A lightweight tag, or a `v` prefix — the workflow matches neither
- ❌ Merge the three confirmation gates into one
- ❌ Force-push a moved tag — find out why the first one was wrong
- ❌ Open the catalogue pull request as part of this skill
