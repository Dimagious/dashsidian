# Rehearsal: B-206, the dashboard on a phone
Filmed, not drawn: e2e/film-phone.spec.ts drives the real plugin in Obsidian's own mobile interface (`app.emulateMobile`) in a 390-wide window, against the demo vault. It replaced a drawn film whose navigation bar turned out to be wrong: the real one floats as a pill.
Beats: tap shows the value, second tap opens the note, Back returns. Loop 6.9s; the first and last frames match.
Added over the footage: a touch mark, since a screenshot shows no finger, and the side captions.
Not checked: an actual phone. Emulation runs the mobile interface on desktop Electron, so there is no system status bar (cropped off) and no real touch input: the taps are clicks.
