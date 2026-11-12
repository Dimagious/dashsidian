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
https://github.com/Dimagious/obsidian-plugin-dev-kit/blob/v0.1.0/docs/release.md
(the docs of the pinned kit; move the tag here when the kit pin moves)

The repository is `dashsidian`, the plugin is Dashy, the long-lived branch is
`master`.

## Before it

- `master` is up to date, the tree is clean and CI is green.
- `[Unreleased]` in `CHANGELOG.md` has the entries of the release, written by
  hand. If it is empty while commits exist, stop and ask.
- `npm run release:check` passes. It runs the kit's `opdk release check`
  (versions, `versions.json`, the manifest rules, a CHANGELOG section, the
  build, a rebuild of the committed tree, the API against `minAppVersion`),
  then the scanner, lint, typecheck, the unit tests, and the checks of the
  generated skill, the block reference, the site and the README.
- Instructions review (`CLAUDE.md`, "Каждый релиз"): a manual habit, one line
  in the release PR. Nothing here checks it.

## The release

```bash
npx opdk release X.Y.Z --dry-run   # everything but the commit, the tag and the pushes
npx opdk release X.Y.Z             # the same argument; or patch | minor | major in both
```

The number is the author's call. Waiting for a go before the real run is the
whole confirmation gate: the tag push starts a release.
