import type { Bounds, Soldier, TrajectorySample } from "./types";

export interface SampleOptions {
  /** Nominal world-space step in x between coarse samples. */
  maxStepWorld?: number;
  /**
   * Max chord deviation (world units) tolerated before a coarse segment is
   * adaptively subdivided. Drives smoothness AND density: small curvy regions
   * get more points, flat regions stay sparse. ~0.01 world units ≈ sub-pixel.
   */
  flatTolWorld?: number;
  /** A vertical jump larger than this between adjacent points is treated as a discontinuity (gap). */
  asymptoteJump?: number;
  /** Hard cap on emitted samples (guards pathological inputs). */
  maxSamples?: number;
  /** Max midpoint subdivisions when refining a curvy-but-continuous segment. */
  maxBisect?: number;
}

const DEFAULTS = {
  // Coarse march step. The whole field is ~24 wide, so this is a few hundred
  // coarse points — leaving a large budget for curvature-driven refinement.
  maxStepWorld: 0.05,
  // Subdivide only where the curve bows away from its chord by more than this.
  flatTolWorld: 0.01,
  asymptoteJump: 2.5, // absolute world-unit jump treated as a discontinuity (decoupled from step)
  maxSamples: 40_000,
  maxBisect: 14,
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
 *
 * Density follows CURVATURE, not the raw step: each coarse segment is recursively
 * bisected while its midpoint bows away from the chord by more than `flatTolWorld`.
 * Critically, the coarse march ALWAYS advances to the far bound — refinement is
 * best-effort and self-limits as the sample budget fills, so even a wild
 * high-frequency function (sin(200x)) still traverses the entire field and
 * resolves a real impact instead of stalling mid-flight.
 * See docs/adr/0001-curvature-based-trajectory-sampling.md.
 */
export function sampleTrajectory(
  fn: (x: number) => number,
  soldier: Soldier,
  bounds: Bounds,
  opts: SampleOptions = {},
): TrajectorySample[] {
  const step = opts.maxStepWorld ?? DEFAULTS.maxStepWorld;
  const flatTol = opts.flatTolWorld ?? DEFAULTS.flatTolWorld;
  const asymptoteJump = opts.asymptoteJump ?? DEFAULTS.asymptoteJump;
  const maxSamples = opts.maxSamples ?? DEFAULTS.maxSamples;
  const maxBisect = opts.maxBisect ?? DEFAULTS.maxBisect;
  // Stop refining with headroom to spare so the remaining coarse march always
  // fits under the hard cap — guaranteeing full-field traversal.
  const refineCap = maxSamples - 1000;
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

    // Continuous coarse segment (lastX,lastY) → (x,y): subdivide by curvature.
    subdivide(at, lastX, lastY, x, y, flatTol, asymptoteJump, maxBisect, refineCap, samples, push);
  }

  return samples;
}

/**
 * Adaptively bisect the segment (ax,ay)→(bx,by), inserting interior points
 * wherever the true curve bows away from the chord by more than `flatTol`, and
 * always emitting b last. A residual end-to-end jump larger than `asymptoteJump`
 * that survives full subdivision is a genuine discontinuity (a pole), so b is
 * pushed as a gap; a steep-but-continuous segment shrinks its per-step jump as
 * it subdivides and is emitted as connected (gap=false).
 */
function subdivide(
  at: (x: number) => number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  flatTol: number,
  asymptoteJump: number,
  depth: number,
  refineCap: number,
  samples: TrajectorySample[],
  push: (x: number, y: number, gap: boolean) => void,
): void {
  const jump = Math.abs(by - ay);

  if (depth > 0 && samples.length < refineCap) {
    const mx = (ax + bx) / 2;
    const my = at(mx);
    if (Number.isNaN(my)) {
      // Hole inside the span — a discontinuity we can't straddle; break here.
      push(bx, by, true);
      return;
    }
    const chordMidY = (ay + by) / 2;
    const deviation = Math.abs(my - chordMidY);
    if (deviation > flatTol || jump > asymptoteJump) {
      subdivide(at, ax, ay, mx, my, flatTol, asymptoteJump, depth - 1, refineCap, samples, push);
      subdivide(at, mx, my, bx, by, flatTol, asymptoteJump, depth - 1, refineCap, samples, push);
      return;
    }
  }

  // Can't or needn't subdivide further: a surviving large jump is a real gap.
  push(bx, by, jump > asymptoteJump);
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
