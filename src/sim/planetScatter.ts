import type { Bounds, Planet, Vec2 } from "./types";
import type { MapConfig, ScatterConfig } from "../game/matchLogic";
import { MAX_ATTEMPTS } from "../game/arenaDefaults";

/** Edge inset of the spawn columns from the left/right map walls (world units). */
export const SPAWN_INSET = 3;

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

/** Spawn columns at x = ±(width/2 − SPAWN_INSET), `teamSize` points spread along y. */
export function computeSpawns(map: MapConfig, teamSize: number): Vec2[] {
  const b = boundsFromMap(map);
  const yLo = b.minY + 1;
  const yHi = b.maxY - 1;
  const x = b.maxX - SPAWN_INSET;
  const pts: Vec2[] = [];
  for (let i = 0; i < teamSize; i++) {
    const t = teamSize === 1 ? 0.5 : i / (teamSize - 1);
    const y = yLo + t * (yHi - yLo);
    pts.push({ x: -x, y }, { x, y });
  }
  return pts;
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
