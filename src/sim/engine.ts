import { detectCollision, type CollisionOptions } from "./collision";
import { sampleTrajectory, type SampleOptions } from "./trajectory";
import type { ShotResult, TrajectorySample, Hit, World } from "./types";

export interface FireOptions extends SampleOptions, CollisionOptions {}

/**
 * Fire one shot: turn a compiled curve into a world-space trajectory, find the
 * first impact, and return the truncated path plus the hit. Pure and
 * deterministic — identical (world, fn) always produce identical results, and
 * `world` is never mutated (the caller removes a destroyed target and re-checks
 * the win state). See component-design.md §7 and the spec §5.4.
 */
export function fire(
  world: World,
  fn: (x: number) => number,
  opts: FireOptions = {},
): ShotResult {
  const samples = sampleTrajectory(fn, world.soldier, world.bounds, opts);

  if (samples.length === 0) {
    return {
      samples: [],
      hit: { kind: "dud", at: world.soldier.pos, sampleIndex: 0 },
      impactSlope: 0,
    };
  }

  const hit = detectCollision(samples, world, opts);

  // Truncate the path at the impact: keep samples up to the hit segment's start,
  // then end exactly on the impact point (for target / bounds hits).
  const truncated = samples.slice(0, hit.sampleIndex + 1);
  if (hit.kind === "target" || hit.kind === "planet" || hit.kind === "bounds") {
    truncated.push({ p: hit.at, x: hit.at.x, gap: false });
  }

  return { samples: truncated, hit, impactSlope: computeImpactSlope(samples, hit) };
}

/**
 * Compute |dy/dx| at the impact point using the two samples that bracket the
 * hit segment (samples[sampleIndex] → samples[sampleIndex+1]). Only meaningful
 * for target hits; returns 0 for all other hit kinds.
 */
function computeImpactSlope(samples: TrajectorySample[], hit: Hit): number {
  if (hit.kind !== "target" || hit.sampleIndex < 0 || hit.sampleIndex + 1 >= samples.length) {
    return 0;
  }
  const a = samples[hit.sampleIndex];
  const b = samples[hit.sampleIndex + 1];
  const dx = b.x - a.x;
  if (Math.abs(dx) < 1e-10) return 50; // near-vertical: cap at 50
  return Math.abs((b.p.y - a.p.y) / dx);
}
