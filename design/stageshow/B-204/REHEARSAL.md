# Rehearsal: B-204, the block says what is wrong
Gold: form-error (the message arrives and leaves with its cause).
Beats: Backspace, two messages, the letter returns, grid returns. Loop 5.9s.
Facts: wording from src/i18n/en.ts. Changed from the backlog: the real block shows two messages, not one, so the film shows both, as diagnostics-dark.png does.
Rejected review finding: a red mark on the fild line. The plugin does not draw one.
Assumption: a source pane above a rendered pane, updating as you type, stands for a split in Obsidian. Not timed against a real one.
Captured: 480 wide and 390 wide, light theme only, no reduced-motion pass.
Gate: `film.mjs --gate` ended "rehearsal passed" at both widths. Coverage was reported as inconclusive (sampling gaps), so the gate does not vouch for every frame.
Review: one fresh-eye pass. Accepted findings are fixed, and the final build was looked at only as stills from the MP4, not re-reviewed.
Not checked: playback in a real page, dark theme.

Wide cut (`dashy-b204-wide`, 720x420), light and dark: the source beside the reading view. Gate passed at 720. Checked on the site in Chrome at 2560 wide.
