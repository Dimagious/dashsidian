# Rehearsal: B-206, the dashboard on a phone
Gold: phone-touch (touch cursor, an app on a phone). Pinned from the bottom, because Back lives in the navigation bar.
Beats: tap shows the value, second tap opens the note, Back returns. Loop 7.7s.
Facts: tap behaviour and the status line's wording from src/blocks/heatmap.ts (attachTap, heatmap.cell, heatmap.cellWithNote).
NOT CHECKED AGAINST A REAL PHONE. The backlog asks for a reference shot first and none was taken. Obsidian's navigation bar is drawn from the help page's description (back, forward, new note, tabs, menu), not from a screenshot. Do not publish before comparing.
Rejected review finding: a distinct look for the tapped cell. The ring is what the plugin draws.
Captured: 480 wide and 390 wide, light theme only, no reduced-motion pass.
Gate: `film.mjs --gate` ended "rehearsal passed" at both widths. Coverage was reported as inconclusive (sampling gaps), so the gate does not vouch for every frame.
Review: one fresh-eye pass. Accepted findings are fixed, and the final build was looked at only as stills from the MP4, not re-reviewed.
Not checked: playback in a real page, dark theme.
