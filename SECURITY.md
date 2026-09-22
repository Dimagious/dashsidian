# Security policy

## Reporting a vulnerability

Report it privately through GitHub: open the
[Security tab](https://github.com/Dimagious/dashsidian/security) and choose
**Report a vulnerability**. That opens a thread only you and the maintainer can
see. Please do not open a public issue for something exploitable — an issue is
a disclosure.

Dashy is maintained by one person. You will get an acknowledgement within seven
days, and an honest estimate with it rather than a promise. If a fix ships, you
are credited in the release notes unless you would rather not be.

Include the Dashy version, the Obsidian version, the platform, and the block
configuration that triggers it. Settings → About has a row that fills the first
three in for you.

## What counts

Dashy renders dashboard blocks from YAML written inside a note. It reads the
vault through Obsidian's metadata cache, builds its output with DOM APIs, and
makes no network requests of any kind. It writes exactly two files, each only
on an explicit click in settings: the agent skill under `.claude/skills/`, and
a fenced section inside `AGENTS.md` at the vault root.

So the interesting reports are:

- A note that makes Dashy read or write anything outside the vault — including
  through the periodic-note folder and format settings, which become paths.
- A crafted block config, note body or frontmatter that ends up executed, or
  reaches the page as markup rather than as text.
- Anything that causes a network request.
- A way to make the `AGENTS.md` writer replace text it does not own, outside
  its own fenced section.

Worth knowing: a dashboard block is often written by an agent rather than by
the person reading it. Treat "the config author is not the reader" as part of
the threat model, not as an edge case.

## What does not count

- Advisories against development dependencies. The published plugin is
  `main.js`, `manifest.json` and `styles.css`; the test runner, the bundler and
  the Electron used to drive the end-to-end suite ship with nothing.
- A block showing the wrong number, or nothing at all. That is an ordinary bug
  and belongs in a public issue, where it can be discussed.
- Vulnerabilities in Obsidian itself — those go to the Obsidian team.

## Supported versions

The latest release. Fixes go out as a new version rather than as a patch to an
older one.
