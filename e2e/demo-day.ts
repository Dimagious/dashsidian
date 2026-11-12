import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** Read from the file `scripts/demo-vault.cjs` reads too, found next to this module whatever the working directory. */
const demoDay = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./demo-day.json", import.meta.url)), "utf8")) as { day: string; time: string };

/**
 * The one day every picture and film is taken on. `scripts/demo-vault.cjs` ends the demo vault on it and the specs
 * freeze the window's clock at it (`demo.freezeTime`), so a retake on another date changes only what the code changed.
 * A Friday, so the current week of a heatmap is partly filled the way it is on a real Friday.
 */
export const DEMO_DAY: string = demoDay.day;
/** The frozen clock of the window: the day, at a morning hour. */
export const DEMO_NOW = `${demoDay.day}T${demoDay.time}`;

/** The day as the local midnight the generated vault counts back from. */
export function demoToday(): Date {
    const [year = 0, month = 1, day = 1] = demoDay.day.split("-").map(Number);
    return new Date(year, month - 1, day);
}
