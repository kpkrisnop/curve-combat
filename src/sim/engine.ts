import { detectCollision, type CollisionOptions } from "./collision";
import { sampleTrajectory, type SampleOptions } from "./trajectory";
import type { ShotResult, World } from "./types";

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
    return { samples: [], hit: { kind: "dud", at: world.soldier.pos, sampleIndex: 0 } };
  }

  const hit = detectCollision(samples, world, opts);

  // Truncate the path at the impact: keep samples up to the hit segment's start,
  // then end exactly on the impact point (for target / bounds hits).
  const truncated = samples.slice(0, hit.sampleIndex + 1);
  if (hit.kind === "target" || hit.kind === "planet" || hit.kind === "bounds") {
    truncated.push({ p: hit.at, x: hit.at.x, gap: false });
  }

  return { samples: truncated, hit };
}
