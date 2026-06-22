import type { Bounds, Soldier, TrajectorySample } from "./types";

export interface SampleOptions {
  /** Nominal world-space step in x between coarse samples. */
  maxStepWorld?: number;
  /** A vertical jump larger than this between adjacent points is treated as a discontinuity (gap). */
  asymptoteJump?: number;
  /** Hard cap on emitted samples (guards pathological inputs). */
  maxSamples?: number;
  /** Max midpoint subdivisions when refining a steep-but-continuous segment. */
  maxBisect?: number;
}

const DEFAULTS = {
  maxStepWorld: 0.02, // finer step → smoother rendered curve
  asymptoteJump: 2.5, // absolute world-unit jump treated as a discontinuity (decoupled from step)
  maxSamples: 40_000,
  maxBisect: 7,
};

/**
 * Sample a function shot in WORLD coordinates (see component-design.md §4).
 *
 * The curve is `fn` anchored vertically to pass through the soldier:
 *   yOffset = soldier.y - fn(soldier.x)
 *   y(x)    = fn(x) + yOffset
 * Sampling marches world-x from the soldier toward the enemy (`soldier.dir`)
 * until x leaves the horizontal bounds. `fn` is evaluated at TRUE world x, so a
 * function undefined at a given x produces a hole (the next defined point is a
 * gap), and a function undefined at the soldier itself produces a DUD (no
 * samples at all).
 */
export function sampleTrajectory(
  fn: (x: number) => number,
  soldier: Soldier,
  bounds: Bounds,
  opts: SampleOptions = {},
): TrajectorySample[] {
  const step = opts.maxStepWorld ?? DEFAULTS.maxStepWorld;
  const asymptoteJump = opts.asymptoteJump ?? DEFAULTS.asymptoteJump;
  const maxSamples = opts.maxSamples ?? DEFAULTS.maxSamples;
  const maxBisect = opts.maxBisect ?? DEFAULTS.maxBisect;
  const dir = soldier.dir;
  const { x: sx, y: sy } = soldier.pos;

  const eval0 = fn(sx);
  if (!Number.isFinite(eval0)) return []; // dud: can't anchor the curve
  const yOffset = sy - eval0;
  const at = (x: number): number => {
    const y = fn(x) + yOffset;
    return Number.isFinite(y) ? y : NaN;
  };

  const samples: TrajectorySample[] = [
    { p: { x: sx, y: sy }, x: sx, gap: false },
  ];

  let lastX = sx;
  let lastY = sy;
  let pendingGap = false;

  const push = (x: number, y: number, gap: boolean) => {
    samples.push({ p: { x, y }, x, gap });
    lastX = x;
    lastY = y;
  };

  for (
    let x = sx + dir * step;
    x >= bounds.minX && x <= bounds.maxX && samples.length < maxSamples;
    x += dir * step
  ) {
    const y = at(x);

    if (Number.isNaN(y)) {
      // Crossing from a defined point into an undefined region: pin a sample on
      // the actual domain edge (e.g. sqrt(x) ending exactly at x=0) instead of
      // stopping at the previous grid step.
      if (!pendingGap) {
        const edge = findEdge(at, lastX, x);
        if (edge) push(edge.x, edge.y, false);
      }
      pendingGap = true;
      continue;
    }

    if (pendingGap) {
      push(x, y, true);
      pendingGap = false;
      continue;
    }

    const dy = Math.abs(y - lastY);
    if (dy > asymptoteJump) {
      push(x, y, true); // discontinuity
    } else if (dy > step) {
      refine(at, lastX, lastY, x, y, step, maxBisect, push);
    } else {
      push(x, y, false);
    }
  }

  return samples;
}

/**
 * Binary-search the boundary between a known-defined x and a known-undefined x,
 * returning the last point where the curve is still defined (the domain edge).
 */
function findEdge(
  at: (x: number) => number,
  definedX: number,
  undefinedX: number,
): { x: number; y: number } | null {
  let lo = definedX; // defined side
  let hi = undefinedX; // undefined side
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (Number.isFinite(at(mid))) lo = mid;
    else hi = mid;
  }
  const y = at(lo);
  return Number.isFinite(y) ? { x: lo, y } : null;
}

/**
 * Insert midpoints between (ax,ay) and (bx,by) so no emitted segment jumps more
 * than `step` vertically, keeping a steep-but-continuous curve dense enough that
 * a small target between coarse samples is never skipped. Emits b last.
 */
function refine(
  at: (x: number) => number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  step: number,
  depth: number,
  push: (x: number, y: number, gap: boolean) => void,
): void {
  if (depth <= 0 || Math.abs(by - ay) <= step) {
    push(bx, by, false);
    return;
  }
  const mx = (ax + bx) / 2;
  const my = at(mx);
  if (Number.isNaN(my)) {
    // Hole inside the refined span — keep it simple: connect to b directly.
    push(bx, by, false);
    return;
  }
  refine(at, ax, ay, mx, my, step, depth - 1, push);
  refine(at, mx, my, bx, by, step, depth - 1, push);
}
