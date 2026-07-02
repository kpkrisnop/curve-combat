import type { ShotResult, TrajectorySample } from "./types";

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

/** Animation duration in seconds, derived from the shot's path length. */
export function shotDuration(shot: ShotResult): number {
  return xLength(shot.samples) / X_VELOCITY_WORLD;
}
