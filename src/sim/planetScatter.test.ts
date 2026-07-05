import { describe, it, expect } from "vitest";
import {
  mulberry32,
  boundsFromMap,
  computeSpawns,
  generatePlanets,
  generatePlanetsWithStats,
} from "./planetScatter";
import { DEFAULT_MAP, DEFAULT_SCATTER } from "../game/arenaDefaults";
import type { Vec2 } from "./types";

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("returns values in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("boundsFromMap", () => {
  it("centers the rectangle on the origin", () => {
    expect(boundsFromMap({ width: 24, height: 14 })).toEqual({ minX: -12, maxX: 12, minY: -7, maxY: 7 });
  });
});

describe("computeSpawns — seeded, in-zone, mirror-symmetric", () => {
  it("is deterministic: same seed ⇒ identical spawns", () => {
    const a = computeSpawns(DEFAULT_MAP, 2, DEFAULT_SCATTER, 123);
    const b = computeSpawns(DEFAULT_MAP, 2, DEFAULT_SCATTER, 123);
    expect(a).toEqual(b);
  });

  it("a different seed moves the spawns (reroll)", () => {
    const a = computeSpawns(DEFAULT_MAP, 2, DEFAULT_SCATTER, 123);
    const b = computeSpawns(DEFAULT_MAP, 2, DEFAULT_SCATTER, 456);
    expect(a).not.toEqual(b);
  });

  it("returns 2 * teamSize points", () => {
    const s = computeSpawns(DEFAULT_MAP, 3, DEFAULT_SCATTER, 1);
    expect(s).toHaveLength(6);
  });

  it("every spawn is inside its side's zone", () => {
    const map = DEFAULT_MAP;
    const scatter = DEFAULT_SCATTER;
    const b = boundsFromMap(map);
    const xHiMag = b.maxX - scatter.spawnEdgeGap;
    const xLoMag = Math.max(0, xHiMag - scatter.spawnBandX);
    const yLo = b.minY + scatter.spawnYMargin;
    const yHi = b.maxY - scatter.spawnYMargin;

    const s = computeSpawns(map, 4, scatter, 999);
    for (const p of s) {
      expect(Math.abs(p.x)).toBeGreaterThanOrEqual(xLoMag - 1e-9);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(xHiMag + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(yLo - 1e-9);
      expect(p.y).toBeLessThanOrEqual(yHi + 1e-9);
    }
  });

  it("is mirror-symmetric: right = -left, same y", () => {
    const s = computeSpawns(DEFAULT_MAP, 3, DEFAULT_SCATTER, 77);
    // spawns are pushed as [left0, right0, left1, right1, ...]
    for (let i = 0; i < s.length; i += 2) {
      const left = s[i];
      const right = s[i + 1];
      expect(right.x).toBeCloseTo(-left.x, 9);
      expect(right.y).toBeCloseTo(left.y, 9);
    }
  });

  it("honors spawnSeparation between same-side points when the zone is roomy", () => {
    const roomy = { ...DEFAULT_SCATTER, spawnBandX: 6, spawnYMargin: 0.5, spawnSeparation: 2 };
    const s = computeSpawns({ width: 30, height: 20 }, 4, roomy, 42);
    const left = s.filter((p) => p.x < 0);
    for (let i = 0; i < left.length; i++) {
      for (let j = i + 1; j < left.length; j++) {
        expect(dist(left[i], left[j])).toBeGreaterThanOrEqual(roomy.spawnSeparation - 1e-9);
      }
    }
  });

  it("tight-zone fallback still returns exactly teamSize points per side", () => {
    // Zone far too small to fit 5 points at the requested separation → fallback kicks in.
    const tight = { ...DEFAULT_SCATTER, spawnBandX: 0.1, spawnYMargin: 5.9, spawnSeparation: 5 };
    const s = computeSpawns(DEFAULT_MAP, 5, tight, 5);
    expect(s.filter((p) => p.x < 0)).toHaveLength(5);
    expect(s.filter((p) => p.x > 0)).toHaveLength(5);
  });
});

describe("generatePlanets", () => {
  const map = DEFAULT_MAP;
  const bounds = boundsFromMap(map);
  const spawns = computeSpawns(map, 5, DEFAULT_SCATTER, 123);

  it("is deterministic for same seed + params", () => {
    const a = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    const b = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    expect(a).toEqual(b);
  });
  it("keeps every planet clear of every spawn muzzle", () => {
    const ps = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    for (const p of ps)
      for (const s of spawns)
        expect(dist(p.pos, s)).toBeGreaterThanOrEqual(p.radius + DEFAULT_SCATTER.spawnClearance - 1e-9);
  });
  it("keeps every planet pair separated by at least their radii", () => {
    const ps = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++)
        expect(dist(ps[i].pos, ps[j].pos)).toBeGreaterThanOrEqual(ps[i].radius + ps[j].radius - 1e-9);
  });
  it("never exceeds maxPlanets", () => {
    const ps = generatePlanets(123, bounds, spawns, { ...DEFAULT_SCATTER, maxPlanets: 4 });
    expect(ps.length).toBeLessThanOrEqual(4);
  });
  it("assigns unique ids and empty craters", () => {
    const ps = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    expect(new Set(ps.map((p) => p.id)).size).toBe(ps.length);
    for (const p of ps) expect(p.craters).toEqual([]);
  });
});

describe("generatePlanetsWithStats", () => {
  it("returns attempts and matches generatePlanets", () => {
    const map = DEFAULT_MAP;
    const bounds = boundsFromMap(map);
    const spawns = computeSpawns(map, 1, DEFAULT_SCATTER, 9);
    const { planets, attempts } = generatePlanetsWithStats(9, bounds, spawns, DEFAULT_SCATTER);
    expect(attempts).toBeGreaterThan(0);
    expect(attempts).toBeLessThanOrEqual(300);
    expect(planets).toEqual(generatePlanets(9, bounds, spawns, DEFAULT_SCATTER));
  });
});
