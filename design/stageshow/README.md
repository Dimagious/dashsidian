# Stageshow films

Drawn animations for posts and the site, B-202 to B-206. They are illustrations, not recordings:
every string and number was checked against the plugin's code and captures, but no frame comes
from a running Obsidian. They add to the real pictures in `docs/screens`, they do not replace them.

Published films live in `docs/screens` as `film-<name>.mp4` (960x1200, H.264), `.gif` (480 wide,
for the README) and `-poster.png`: B-202 `agent-block`, B-203 `one-tick`, B-204 `error-message`,
B-205 `review-week`. The README leads with wide cuts (`-wide.gif`, 1000 wide) of B-202 and B-205, shown at full width; the other two sit in a pair at 49%. The folders here keep each film's `REHEARSAL.md`. B-206 stays here, with its
files, until it has been compared with Obsidian on a real phone. `source/` holds the scenes. To rebuild, copy its folders into the `examples/` of
the stageshow skill, then run `scripts/export.mjs` there. The README's GIF comes from the MP4 at 480 wide, 15 fps, 128
colours (ffmpeg `palettegen` and `paletteuse`), which keeps the page under 2 MB of GIF.
