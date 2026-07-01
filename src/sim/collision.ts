import type { Bounds, Hit, Planet, TrajectorySample, Vec2, World } from "./types";

export interface CollisionOptions {
  /** World units off the muzzle that are immune to target hits (no self-detonation). */
  selfClearDist?: number;
}

const DEFAULT_SELF_CLEAR = 0.5;

/**
 * Walk the trajectory segment-by-segment and return the FIRST impact (see
 * component-design.md §5.3). Per non-gap segment, bounds exit and each target
 * are tested; the earliest point of contact along the stream wins. Targets
 * within `selfClearDist` of the muzzle are ignored so a shot never detonates on
 * launch. If nothing is hit, the path "expires" at its last point.
 */
export function detectCollision(
  samples: TrajectorySample[],
  world: World,
  opts: CollisionOptions = {},
): Hit {
  const selfClear = opts.selfClearDist ?? DEFAULT_SELF_CLEAR;
  const muzzle = samples.length ? samples[0].p : world.soldier.pos;
  const planets = world.planets ?? [];

  if (samples.length < 2) {
    return { kind: "expired", at: muzzle, sampleIndex: Math.max(0, samples.length - 1) };
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i].p;
    const b = samples[i + 1].p;
    if (samples[i + 1].gap) continue; // never connect across a discontinuity

    type Cand = { t: number; at: Vec2; kind: "bounds" | "target" | "planet"; id?: string };
    const cands: Cand[] = [];

    // Bounds: the segment exits the playfield.
    const boundsT = segmentExitT(a, b, world.bounds);
    if (boundsT !== null) cands.push({ t: boundsT, at: lerp(a, b, boundsT), kind: "bounds" });

    // Targets: earliest entry along the segment, respecting self-immunity.
    for (const target of world.targets) {
      const t = segmentCircleEntryT(a, b, target.pos, target.radius);
      if (t === null) continue;
      const at = lerp(a, b, t);
      if (dist(at, muzzle) < selfClear) continue;
      cands.push({ t, at, kind: "target", id: target.id });
    }

    // Planets: the segment crosses from empty space into solid meat. Tested by
    // point sampling (the planet circle contains empty crater regions), so shots
    // pass through craters and stop at the meat behind them.
    if (isSolid(b, planets)) {
      const t = solidEntryT(a, b, planets);
      const at = lerp(a, b, t);
      cands.push({ t, at, kind: "planet", id: solidPlanetAt(at, planets)?.id });
    }

    if (cands.length > 0) {
      let h = cands[0];
      for (const c of cands) if (c.t < h.t) h = c;
      if (h.kind === "bounds") return { kind: "bounds", at: h.at, sampleIndex: i };
      if (h.kind === "planet") return { kind: "planet", at: h.at, planetId: h.id, sampleIndex: i };
      return { kind: "target", at: h.at, targetId: h.id, sampleIndex: i };
    }
  }

  const last = samples[samples.length - 1];
  return { kind: "expired", at: last.p, sampleIndex: samples.length - 1 };
}

/** True when `p` lies in some planet's solid meat: inside its circle, outside all its craters. */
export function isSolid(p: Vec2, planets: Planet[]): boolean {
  return solidPlanetAt(p, planets) !== null;
}

/** The planet whose meat contains `p`, or null. */
function solidPlanetAt(p: Vec2, planets: Planet[]): Planet | null {
  for (const planet of planets) {
    if (dist(p, planet.pos) > planet.radius) continue;
    let carved = false;
    for (const c of planet.craters) {
      if (dist(p, c.pos) <= c.radius) {
        carved = true;
        break;
      }
    }
    if (!carved) return planet;
  }
  return null;
}

/** Fraction t along a (empty) → b (solid) where the segment first enters meat. */
function solidEntryT(a: Vec2, b: Vec2, planets: Planet[]): number {
  let lo = 0; // empty side (a is empty by invariant)
  let hi = 1; // solid side (b is solid)
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (isSolid(lerp(a, b, mid), planets)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Smallest t in (0,1] at which a→b crosses out of the bounds rectangle, or null. */
function segmentExitT(a: Vec2, b: Vec2, bounds: Bounds): number | null {
  if (inside(b, bounds)) return null; // stays in (a is always inside by invariant)

  let t = 1;
  const consider = (num: number, den: number) => {
    if (den === 0) return;
    const tt = num / den;
    if (tt > 1e-9 && tt < t) t = tt;
  };
  // Find the first edge the segment crosses.
  if (b.x < bounds.minX) consider(bounds.minX - a.x, b.x - a.x);
  if (b.x > bounds.maxX) consider(bounds.maxX - a.x, b.x - a.x);
  if (b.y < bounds.minY) consider(bounds.minY - a.y, b.y - a.y);
  if (b.y > bounds.maxY) consider(bounds.maxY - a.y, b.y - a.y);
  return t;
}

/** Smallest t in [0,1] where segment a→b first enters the circle, or null. */
function segmentCircleEntryT(a: Vec2, b: Vec2, c: Vec2, r: number): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - c.x;
  const fy = a.y - c.y;

  const A = dx * dx + dy * dy;
  if (A === 0) return fx * fx + fy * fy <= r * r ? 0 : null;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;

  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-B - sq) / (2 * A);
  const t2 = (-B + sq) / (2 * A);
  // Earliest intersection within the segment; if it starts inside, t<=0 → clamp to 0.
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  if (t1 < 0 && t2 > 1) return 0; // segment fully inside the circle
  return null;
}

function inside(p: Vec2, b: Bounds): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
