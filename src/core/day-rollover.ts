/**
 * A timer that fires exactly once per effective day boundary, so an open
 * dashboard redraws itself even with no vault activity to trigger a redraw
 * otherwise — see `app/plugin.ts`'s `watchVault`, which only reacts to vault
 * events.
 *
 * Pure module: no Obsidian import. `now`, `setTimeout` and `clearTimeout` are
 * all passed in, so a test can drive the whole arm/fire/rearm cycle with fake
 * timers and a fake clock instead of a browser and the real wall clock.
 */

import { nextEffectiveDayBoundary } from "./today";

export interface DayRolloverDeps {
    /** the "New day starts at" setting at the moment this is created */
    startHour: number;
    now: () => Date;
    setTimeout: (handler: () => void, delayMs: number) => number;
    clearTimeout: (handle: number) => void;
    /** called once per rollover; the caller is the one that actually redraws */
    onRollover: () => void;
}

export interface DayRollover {
    /**
     * Re-arms for a (possibly different) hour, cancelling whatever timer was
     * pending first. Called from `saveSettings`: the hour may have just
     * changed, which moves where the next boundary sits, and the timer armed
     * for the old hour would otherwise fire at the wrong moment.
     */
    rearm(startHour: number): void;
    /** Cancels the pending timer. Safe to call more than once. */
    cancel(): void;
}

/**
 * Arms immediately on creation: the caller makes one in `onload`, and from
 * that point on it is already counting down to the next boundary.
 *
 * The delay is recomputed from `now()` and `nextEffectiveDayBoundary` every
 * time a timer is armed, including from inside the fired callback itself —
 * never by adding a fixed 24 hours to the previous schedule. That is what
 * keeps a single very late fire (the tab was in the background, or a test
 * jumps the clock in one step) landing on the correct next boundary rather
 * than one still anchored to a timestamp from before the jump, and what
 * keeps every boundary correct across a daylight-saving change.
 */
export function createDayRollover(deps: DayRolloverDeps): DayRollover {
    let startHour = deps.startHour;
    let handle: number | null = null;

    const arm = (): void => {
        if (handle !== null) deps.clearTimeout(handle);
        const now = deps.now();
        const boundary = nextEffectiveDayBoundary(now, startHour);
        const delay = Math.max(0, boundary.getTime() - now.getTime());
        handle = deps.setTimeout(() => {
            handle = null;
            deps.onRollover();
            arm();
        }, delay);
    };

    arm();

    return {
        rearm(nextStartHour: number): void {
            startHour = nextStartHour;
            arm();
        },
        cancel(): void {
            if (handle !== null) deps.clearTimeout(handle);
            handle = null;
        },
    };
}
