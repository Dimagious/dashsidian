---
name: release-bump
description: Cut a new release of Dashy (dashsidian). Triggered when the user says "релизим", "выкатываем версию", "поднять версию", "bump version", "release bump", or right before tagging a new version. Checks that master is green and `[Unreleased]` in `CHANGELOG.md` has entries, then runs `npx opdk release X.Y.Z` (or `patch`, `minor`, `major`), which bumps the version everywhere, commits `chore(release): X.Y.Z`, tags it, runs the kit's release workflow and publishes the release.
---

# Release bump for Dashy

Dashy's release is `opdk release` from obsidian-plugin-dev-kit. It bumps
`package.json`, `package-lock.json`, `manifest.json` and `versions.json`,
promotes `[Unreleased]` in `CHANGELOG.md`, commits `chore(release): X.Y.Z` and
tags `X.Y.Z` (annotated, bare, no `v`), pushes the tag, waits for
[`.github/workflows/release.yml`](../../../.github/workflows/release.yml) (the
kit's reusable workflow: build, attestation, a draft release), verifies the
draft against a local build of the tag, publishes it and only then pushes
`master`. Its flags, stops and how to resume:
https://github.com/Dimagious/obsidian-plugin-dev-kit/blob/main/docs/release.md

The repository is `dashsidian`, the plugin is Dashy, the long-lived branch is
`master`.

## Before it

- `master` is up to date, the tree is clean and CI is green.
- `[Unreleased]` in `CHANGELOG.md` has the entries of the release, written by
  hand. If it is empty while commits exist, stop and ask.
- `npm run release:check` passes (the kit's `opdk release check`, the scanner,
  lint, typecheck and the unit tests).
- Instructions review (`CLAUDE.md`, "Каждый релиз"): a manual habit, one line
  in the release PR. Nothing here checks it.

## The release

```bash
npx opdk release patch --dry-run   # everything but the commit, the tag and the pushes
npx opdk release X.Y.Z             # or patch | minor | major
```

The number is the author's call. Waiting for a go before the real run is the
whole confirmation gate: the tag push starts a release.

## After it

The generated skill and block reference name the plugin version, and the
release commit holds only the version files, so CI's `build:skill -- --check`
fails until they are rebuilt:

```bash
npm run build:skill && npm run build:reference
```

Commit the result as `chore(skill): rebuild for X.Y.Z` through a PR.
