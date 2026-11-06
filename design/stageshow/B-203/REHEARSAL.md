# Rehearsal: B-203, one checkbox moves the dashboard
Gold: table-edit (an edit, then what it feeds rolls a beat later).
Beats: tick gym, numbers roll, cell paints, untick returns all. Loop 6.8s.
Facts: current_streak forgives an unfilled today (core/calendar.ts), so 3 before and 4 after. The total counts the cells the data paints.
Changed from the backlog: Current streak instead of Longest gym streak, because a longest streak would not move on one tick. Three cards instead of four, for phone width.
Assumption: compare keeps "was 3" for the same days of last week; the numbers were worked out by hand, not run through core/.
Animation liberty: the plugin redraws numbers at once, it does not roll them.
Captured: 480 wide and 390 wide, light theme only, no reduced-motion pass.
Gate: `film.mjs --gate` ended "rehearsal passed" at both widths. Coverage was reported as inconclusive (sampling gaps), so the gate does not vouch for every frame.
Review: one fresh-eye pass. Accepted findings are fixed, and the final build was looked at only as stills from the MP4, not re-reviewed.
Not checked: playback in a real page, dark theme.

Wide cut (`dashy-b203-wide`, 720x420), light and dark: the note beside the dashboard. Gate passed at 720. Checked on the site in Chrome at 2560 wide.
