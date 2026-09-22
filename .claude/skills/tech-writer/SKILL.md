---
name: tech-writer
description: Keep snipsidian's user-facing documentation in sync with shipped releases. Triggered when the user says "обнови доки", "документация устарела", "опиши в доках", "update docs", "document this", or right after a release when README / wiki / privacy disclosures may have drifted from what actually shipped (new settings-UI affordances, changed default snippets, new placeholders, changed network behavior, changed submission flow).
---

# Tech Writer for snipsidian

Keep `README.md`, `docs/wiki/`, and the `manifest.json` description in sync with what's actually shipped. Stale docs are worse than no docs: this plugin's docs make **privacy and behavior claims** (what expands when, what touches the network, what reads the clipboard) that users rely on when deciding to install.

## Mental model

Two confirmation gates:

1. After detecting affected docs → **wait for OK** on the proposed mapping (which docs to touch, what changes to capture).
2. After drafting → **wait for OK** before committing.

Skip docs work for:
- Pure bugfixes with no behavior-contract change (CHANGELOG already covers them — that's the release-bump flow's job, not this skill's)
- Refactors, test-only changes, CI/tooling changes
- Unreleased work — **never document what isn't in a tagged release**; the Obsidian plugin index points users at `main`'s README while they run the last release
- CHANGELOG entries — those accumulate in `[Unreleased]` as work lands (release-bump skill owns promotion)
- `.claude/brain/` upkeep (sessions/backlog/ADRs) — that's the brain conventions in `.claude/brain/README.md`, not this skill; this skill may *reference* ADRs but doesn't write them

## Doc map

```
README.md ........................ GitHub-facing + what the Obsidian plugin index links to.
                                   Load-bearing sections: "Try these out of the box"
                                   (MUST mirror src/presets.ts DEFAULT_SNIPPETS),
                                   "How expansion works", "Packages", "Privacy",
                                   "Project status", "Development"
docs/wiki/ ....................... GitHub Wiki source (Home, Getting-Started, FAQ,
                                   Troubleshooting, Package-Creation, API-Reference,
                                   Google-Form-Package-Submission). ⚠ Written in the
                                   1.0.0 era, large parts aspirational/stale — verify
                                   any claim against current code before propagating it.
                                   ⚠ Publishing to the actual GitHub Wiki is a separate
                                   manual step — editing these files does NOT update the
                                   wiki; flag it in the summary when these change.
docs/screens/ .................... Screenshots / demo video assets referenced by README.
                                   Flag (don't silently keep) screenshots that show a UI
                                   the release visibly changed.
manifest.json "description" ...... The one-liner in Obsidian's plugin browser. Must not
                                   start with the plugin name (scorecard rule). Changing
                                   it is a release-worthy change, not a docs commit.
CHANGELOG.md ..................... Owned by the release flow. Read it as the source of
                                   "what shipped"; don't edit it from this skill.
CLAUDE.md / .claude/brain/ ....... Assistant layer, git-excluded. Update pointers if the
                                   docs layout itself changes; content upkeep is out of
                                   scope here.
```

## Decision tree — what goes where

| Shipped change | Doc(s) to touch |
|---|---|
| Default snippets changed (triggers, replacements, grouping) | README "Try these out of the box" — table mirrors `src/presets.ts`; wiki Getting-Started / Troubleshooting if they mention defaults |
| New settings-UI affordance (button, tab, flow) | README section that covers that surface; wiki Getting-Started + FAQ; screenshot check in `docs/screens/` |
| Expansion-contract change (delimiters, placeholders, tabstops, collision rules) | README "How expansion works"; wiki FAQ + Troubleshooting |
| Network behavior change (new host, new request, caching) | README "Privacy" — the network claims there must stay literally true (`api.github.com` listing + `raw.githubusercontent.com` pack downloads) |
| Privacy-relevant behavior (clipboard access, file access) | README "Privacy"; this is where audit items flagged "document, don't gate" land (e.g. S-012 `$clipboard`) |
| Package / submission flow change | README "Packages"; wiki Package-Creation + the submission page |
| Import path change (Espanso, JSON) | README "Packages"; wiki FAQ |
| Dev workflow / scripts change | README "Development"; CLAUDE.md tooling table |
| Version/status milestone | README "Project status" |

If a change touches several axes, it gets multiple updates — normal.

### Behavior claims need a code anchor

Every factual claim added to README/wiki must name (in the PR/commit body, not the prose) the code it mirrors — e.g. "defaults table ← `src/presets.ts` DEFAULT_SNIPPETS", "restore button ← `BasicTab.restoreDefaults`". If you can't point at the code, the claim doesn't go in. This is how the wiki got stale: 1.0.0-era pages documented buttons that didn't exist (Troubleshooting's "Add missing defaults" predated the real Restore button by two minor versions).

## Style rules

- **UI copy is quoted exactly as rendered** — sentence case, the real labels ("Restore default snippets", "Import from Espanso YAML"), Settings paths as **Settings → Snipsy → <tab>**.
- **Triggers/keys in backticks**, replacements shown literally; the defaults table format in README is the convention to follow.
- **No em-dashes (—) in user-facing prose** (user preference, same rule as issue comments); plain hyphens, colons, or rewrites. Existing em-dashes in untouched paragraphs stay — don't bulk-restyle.
- **No AI-slop phrasing** — write like the existing README voice: direct, specific, numbers over narrative.
- **Keep diffs small** — edit the affected section only.
- **English everywhere** in README/wiki (the plugin's audience); Russian only in conversation with the user.

## Workflow

### Step 1 — Detect what changed

```bash
# Boundary: last substantive docs touch
git log --oneline -5 -- README.md docs/wiki/

# What shipped since (releases are the unit of "shipped")
git tag --list '[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -3
git log --oneline {last_docs_sha}..HEAD --grep="^feat\|^fix" --oneline

# The authoritative "what shipped" summary
awk '/^## \[{latest_version}\]/,/^## \[{previous_version}\]/' CHANGELOG.md
```

Filter to **released** `feat:` and behavior-changing `fix:` only.

### Step 2 — Map changes to docs

Build a table:

| Shipped change (release) | Affected doc(s) | One-line summary |
|---|---|---|
| `feat: defaults as group + restore (1.2.0)` | README out-of-the-box, wiki Troubleshooting | defaults are a deletable group; Restore button exists now |

Show this to the user. **WAIT FOR OK** before writing.

### Step 3 — Write

Per doc: `Read` the file, `Edit` only the affected section. Verify every claim against the code (open the source, don't trust memory). After all edits: `git diff --stat README.md docs/`.

### Step 4 — Commit

Tracked docs go through the normal PR flow (`main` is the release branch). Single commit `docs: {short-title}`, or split per surface (`docs(readme): …` / `docs(wiki): …`) if review is easier.

**Never add AI co-author trailers or AI mentions** to commits/PRs (global rule 11 — this repo's commits are authored by the developer only).

If `docs/wiki/` changed, remind the user in the summary: the GitHub Wiki itself needs the manual sync step.

## What NOT to do

- ❌ Document unreleased work — tagged releases only
- ❌ Edit CHANGELOG.md from this skill (release-bump owns it)
- ❌ Trust an existing wiki claim while editing near it — verify or flag, half the wiki predates 1.1.0
- ❌ Bulk-restyle prose or reformat tables you aren't changing
- ❌ Change `manifest.json` description outside a release
- ❌ Let the README defaults table drift from `src/presets.ts` — if they disagree, the code wins and the table gets fixed in the same pass
- ❌ Add Co-Authored-By / AI mentions to docs commits or PRs
