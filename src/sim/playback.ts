import type { TrajectorySample } from "./types";

/**
 * Shot-playback pacing helpers (Issue 5). Pure & side-effect-free so they stay
 * Node-safe and unit-testable; the animation loop in GameRenderer.playShot drives
 * the projectile head with them.
 *
 * Why: the trajectory is sampled by CURVATURE (dense in curves, sparse in flats —
 * see sampleTrajectory in ./trajectory), so advancing the head by sample INDEX makes
 * it crawl through curves and race across flats. Driving it by cumulative ARC LENGTH
 * instead gives a constant on-screen speed. See docs/adr/0004-shot-playback-pacing.md
 * for the full decision (arc-length step + "same time" duration + bang-travel decel).
 */

/**
 * Cumulative Euclidean arc length at each sample index (world units).
 * `out[i]` = path length from `samples[0]` to `samples[i]`. A `gap: true` sample
 * (a discontinuity where the trail pen lifts) contributes ZERO length — the head
 * jumps the gap instantly rather than spending travel time crossing it.
 */
export function cumulativeArcLength(samples: TrajectorySample[]): number[] {
  if (samples.length === 0) return [];
  const out: number[] = [0];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (b.gap) {
      out.push(out[i - 1]);
      continue;
    }
    out.push(out[i - 1] + Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y));
  }
  return out;
}

/**
 * Locate a target cumulative length on the path: the bracketing segment
 * `[idx, idx+1]` and the `frac ∈ [0,1]` along it. `lenArr` is the monotone
 * non-decreasing output of {@link cumulativeArcLength}. On a flat/zero-length
 * segment (`hi === lo`, e.g. a gap) `frac` is 0. The renderer interpolates the
 * head position across the same segment's chord.
 */
export function pointAtLength(
  lenArr: number[],
  targetLen: number,
): { idx: number; frac: number } {
  if (lenArr.length < 2) return { idx: 0, frac: 0 };
  let i = 1;
  while (i < lenArr.length - 1 && lenArr[i] < targetLen) i++;
  const lo = lenArr[i - 1];
  const hi = lenArr[i];
  const frac = hi > lo ? Math.min(1, Math.max(0, (targetLen - lo) / (hi - lo))) : 0;
  return { idx: i - 1, frac };
}

/**
 * "Bang → travel" speed model: `v(u) = (c − b)·e^(−a·u) + b` over normalized
 * elapsed time `u ∈ [0,1]`. The bullet leaves at `c×` the cruise speed `b` and
 * decays at rate `a` toward `b`. Returns the NORMALIZED integral of `v`, so
 * `progress(0) = 0` and `progress(1) = 1` exactly — the shot always covers the
 * full path within its fixed duration; only the pacing within that window
 * front-loads speed.
 *
 * `b` is a normalization baseline, not a real speed — only the ratio `c/b`
 * shapes the curve (uniformly scaling b and c leaves `progress(u)` unchanged),
 * and the absolute speed scale is owned entirely by the caller's duration.
 * Reduces to linear pacing when `c === b`. Requires `a > 0`.
 */
export function bangTravelProgress(u: number, a: number, c: number, b = 1): number {
  if (c === b) return u;
  const integral = (uu: number) => ((c - b) / a) * (1 - Math.exp(-a * uu)) + b * uu;
  return integral(u) / integral(1);
}
