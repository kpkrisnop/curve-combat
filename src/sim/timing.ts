import type { ShotResult, TrajectorySample } from "./types";
import { cumulativeArcLength } from "./playback";

/** Shot animation speed: world-x units per second. A field-crossing shot (~24 x-units) ≈ 4s. */
export const X_VELOCITY_WORLD = 6;

/** Total absolute x-distance a shot's sample path covers. */
export function xLength(samples: TrajectorySample[]): number {
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    total += Math.abs(samples[i].x - samples[i - 1].x);
  }
  return total;
}

/**
 * Velocity multiplier from the arc-length/x-length ratio `r` (r >= 1). A dead-straight
 * shot (r = 1) flies at full speed (1.0); a shot whose true path is much longer than its
 * x-span (wiggly for real, not just near the target) eases down toward a floor of 0.8x —
 * so a curve can't fake being straight by front-loading its wiggle late in the flight.
 */
export function curveSpeedFactor(r: number): number {
  return 0.2 * Math.exp(-0.25 * (r - 1)) + 0.8;
}

/** Animation duration in seconds, derived from the shot's path length and its curvature. */
export function shotDuration(shot: ShotResult): number {
  const x = xLength(shot.samples);
  if (x === 0) return 0;
  const arc = cumulativeArcLength(shot.samples).at(-1) ?? x;
  const speedFactor = curveSpeedFactor(arc / x);
  return x / (X_VELOCITY_WORLD * speedFactor);
}
