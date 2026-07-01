import { describe, it, expect } from "vitest";
import {
  mulberry32,
  boundsFromMap,
  computeSpawns,
  generatePlanets,
  generatePlanetsWithStats,
  SPAWN_INSET,
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

describe("computeSpawns", () => {
  it("places one spawn per side at the center for teamSize 1", () => {
    const s = computeSpawns({ width: 24, height: 14 }, 1);
    expect(s).toHaveLength(2);
    expect(s).toContainEqual({ x: -(12 - SPAWN_INSET), y: 0 });
    expect(s).toContainEqual({ x: 12 - SPAWN_INSET, y: 0 });
  });
  it("places teamSize spawns per side spread along y", () => {
    const s = computeSpawns({ width: 24, height: 14 }, 5);
    expect(s).toHaveLength(10);
    const leftYs = s.filter((p) => p.x < 0).map((p) => p.y);
    expect(Math.min(...leftYs)).toBeCloseTo(-6);
    expect(Math.max(...leftYs)).toBeCloseTo(6);
  });
});

describe("generatePlanets", () => {
  const map = DEFAULT_MAP;
  const bounds = boundsFromMap(map);
  const spawns = computeSpawns(map, 5);

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
    const spawns = computeSpawns(map, 1);
    const { planets, attempts } = generatePlanetsWithStats(9, bounds, spawns, DEFAULT_SCATTER);
    expect(attempts).toBeGreaterThan(0);
    expect(attempts).toBeLessThanOrEqual(300);
    expect(planets).toEqual(generatePlanets(9, bounds, spawns, DEFAULT_SCATTER));
  });
});
