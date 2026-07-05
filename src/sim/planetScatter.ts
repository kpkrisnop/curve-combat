import type { Bounds, Planet, Vec2 } from "./types";
import type { MapConfig, ScatterConfig } from "../game/matchLogic";
import { MAX_ATTEMPTS } from "../game/arenaDefaults";

/** Decouples the spawn PRNG stream from the planet PRNG stream (both derive from `seed`). */
const SPAWN_SEED_SALT = 0x9e3779b9;

/** Deterministic 32-bit PRNG. Same seed ⇒ same uniform [0,1) stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Origin-centered bounds for a logical map rectangle. */
export function boundsFromMap(map: MapConfig): Bounds {
  return { minX: -map.width / 2, maxX: map.width / 2, minY: -map.height / 2, maxY: map.height / 2 };
}

/** One side's spawn-zone rectangle, in world coordinates (sign < 0 = left/red, sign > 0 = right/blue). */
export interface SpawnZoneRect {
  sign: -1 | 1;
  xLo: number;
  xHi: number;
  yLo: number;
  yHi: number;
}

/**
 * Per-side spawn-zone rectangles derived from map bounds + the four spawn params
 * on `scatter` (spawnEdgeGap, spawnBandX, spawnYMargin) — the same rectangle
 * `computeSpawns` rejection-samples inside, exposed separately (pure, no PRNG)
 * so the pre-game margin-guide overlay (GameRenderer.drawGuides) can draw it
 * without duplicating computeSpawns' sampling logic.
 */
export function spawnZoneRects(bounds: Bounds, scatter: ScatterConfig): SpawnZoneRect[] {
  const xHiMag = bounds.maxX - scatter.spawnEdgeGap;
  const xLoMag = Math.max(0, xHiMag - scatter.spawnBandX);
  const yLo = bounds.minY + scatter.spawnYMargin;
  const yHi = bounds.maxY - scatter.spawnYMargin;
  return [
    { sign: -1, xLo: -xHiMag, xHi: -xLoMag, yLo, yHi },
    { sign: 1, xLo: xLoMag, xHi: xHiMag, yLo, yHi },
  ];
}

/**
 * Seed-driven, always mirror-symmetric player spawns. Per side, rejection-samples
 * `teamSize` points inside a rectangular zone derived from the map bounds and the
 * four spawn params on `scatter` (spawnEdgeGap, spawnBandX, spawnYMargin,
 * spawnSeparation); falls back to even-Y spacing at the outer column if the zone
 * is too tight to satisfy `spawnSeparation` within 200 attempts (guarantees exactly
 * `teamSize` points per side). The LEFT side is sampled, then mirrored to the right
 * (x → -x, same y) — there is no separate mirror toggle; spawns are always
 * mirror-symmetric.
 *
 * Deterministic in (map, teamSize, scatter, seed): uses a dedicated PRNG stream
 * (mulberry32(seed ^ salt)), decoupled from the planet generator's mulberry32(seed)
 * stream, so the server and the client-side preview produce identical layouts from
 * a shared seed.
 */
export function computeSpawns(
  map: MapConfig,
  teamSize: number,
  scatter: ScatterConfig,
  seed: number,
): Vec2[] {
  const b = boundsFromMap(map);
  const rng = mulberry32((seed ^ SPAWN_SEED_SALT) >>> 0);

  const xHiMag = b.maxX - scatter.spawnEdgeGap;
  const xLoMag = Math.max(0, xHiMag - scatter.spawnBandX);
  const yLo = b.minY + scatter.spawnYMargin;
  const yHi = b.maxY - scatter.spawnYMargin;

  const sampleLeft = (): Vec2[] => {
    const pts: Vec2[] = [];
    for (let i = 0; i < teamSize; i++) {
      let placed: Vec2 | null = null;
      for (let attempt = 0; attempt < 200 && !placed; attempt++) {
        const mag = xLoMag + rng() * (xHiMag - xLoMag);
        const y = yLo + rng() * (yHi - yLo);
        const cand: Vec2 = { x: -mag, y };
        if (pts.every((p) => Math.hypot(p.x - cand.x, p.y - cand.y) >= scatter.spawnSeparation)) {
          placed = cand;
        }
      }
      // Fallback: evenly spaced y at the outer column if the zone is too tight.
      if (!placed) {
        const t = teamSize === 1 ? 0.5 : i / (teamSize - 1);
        placed = { x: -xHiMag, y: yLo + t * (yHi - yLo) };
      }
      pts.push(placed);
    }
    return pts;
  };

  const left = sampleLeft();
  const right = left.map((p) => ({ x: -p.x, y: p.y }));
  const spawns: Vec2[] = [];
  for (let i = 0; i < teamSize; i++) spawns.push(left[i], right[i]);
  return spawns;
}

/**
 * Free-scatter planet generator (Decision D4). Pure & deterministic.
 * Rejection sampling until `maxPlanets` accepted or `MAX_ATTEMPTS` exhausted.
 */
export function generatePlanetsWithStats(
  seed: number,
  bounds: Bounds,
  spawns: Vec2[],
  params: ScatterConfig,
): { planets: Planet[]; attempts: number } {
  const { rMin, rMax, gapMin, gapMax, spawnClearance, fieldMargin, maxPlanets } = params;
  const rng = mulberry32(seed);
  const planets: Planet[] = [];
  let attempts = 0;

  while (planets.length < maxPlanets && attempts < MAX_ATTEMPTS) {
    attempts++;
    const r = rMin + rng() * (rMax - rMin);
    const lo = fieldMargin + r;
    const x = bounds.minX + lo + rng() * ((bounds.maxX - lo) - (bounds.minX + lo));
    const y = bounds.minY + lo + rng() * ((bounds.maxY - lo) - (bounds.minY + lo));
    const pos: Vec2 = { x, y };

    let bad = false;
    for (const s of spawns) {
      if (Math.hypot(pos.x - s.x, pos.y - s.y) < r + spawnClearance) {
        bad = true;
        break;
      }
    }
    if (bad) continue;

    const gap = gapMin + rng() * (gapMax - gapMin);
    for (const p of planets) {
      if (Math.hypot(pos.x - p.pos.x, pos.y - p.pos.y) < r + p.radius + gap) {
        bad = true;
        break;
      }
    }
    if (bad) continue;

    planets.push({ id: "p" + (planets.length + 1), pos, radius: r, craters: [] });
  }
  return { planets, attempts };
}

/** Game path: planets only. */
export function generatePlanets(
  seed: number,
  bounds: Bounds,
  spawns: Vec2[],
  params: ScatterConfig,
): Planet[] {
  return generatePlanetsWithStats(seed, bounds, spawns, params).planets;
}
