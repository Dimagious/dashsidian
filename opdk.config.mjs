import { defineConfig } from "obsidian-plugin-dev-kit";

export default defineConfig({
    demo: {
        // The GIFs of the README and the site, from the capture spec. 256 colours at 4 fps: the default quantiser
        // bands the gradients on the cards into visible steps. A picture on the site sits beside its heading and is
        // read at the width of the column; a reel posted on its own keeps more pixels (the wide one).
        gif: { colors: 256, fps: 4, width: 760 },
        // The reels are GIFs and nothing else: no video, no poster.
        mp4: false,
        poster: false,
        films: {
            // The whole dashboard filling up: it ends with five more notes than it began with, on purpose.
            "dashboard-wide": { gif: { colors: 256, fps: 4, width: 1000 }, loop: "off" },
            // The phone film: the real Obsidian in its mobile interface beside two steps, as an MP4 for the site, a GIF
            // for the README and a poster. Light and dark are two films, as the site swaps the video by theme.
            "film-phone": {
                gif: { colors: 128, fps: 15, width: 1000 },
                mp4: true,
                poster: true,
                layout: "phone-captions",
                phone: {
                    title: "Works on\nyour phone",
                    background: "#f4f1fd",
                    text: "#222222",
                    muted: "#444444",
                    accent: "#6f4fe0",
                },
            },
            "film-phone-dark": {
                // The README shows the light GIF and the site swaps the two MP4s: nothing uses a dark GIF.
                gif: false,
                mp4: true,
                poster: true,
                layout: "phone-captions",
                phone: {
                    title: "Works on\nyour phone",
                    background: "#191722",
                    text: "#e4e4e8",
                    muted: "#b3b3b8",
                    accent: "#a48cff",
                },
            },
        },
    },
});
