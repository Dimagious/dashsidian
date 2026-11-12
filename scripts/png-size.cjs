"use strict";
/**
 * The pixel size of a PNG, read from its header (the IHDR chunk is always the first: width at byte 16, height at 20).
 * The composers use it to lay a 2x still out at half its pixel size, so the layout is the one a 1x still gave.
 */
const fs = require("fs");

function pngSize(file) {
    const head = fs.readFileSync(file).subarray(0, 24);
    if (head.toString("latin1", 1, 4) !== "PNG") throw new Error(`${file} is not a PNG file`);
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

module.exports = { pngSize };
