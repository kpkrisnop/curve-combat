import { describe, it, expect } from "vitest";
import { sampleTrajectory } from "./trajectory";
import type { Bounds, Soldier } from "./types";

const BOUNDS: Bounds = { minX: -12, minY: -7, maxX: 12, maxY: 7 };

describe("sampleTrajectory — world-anchored firing", () => {
  it("anchors the first sample exactly on the soldier", () => {
    const soldier: Soldier = { pos: { x: 4, y: 0 }, dir: -1 };
    const samples = sampleTrajectory(Math.sqrt, soldier, BOUNDS);

    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0].p.x).toBeCloseTo(4, 6);
    expect(samples[0].p.y).toBeCloseTo(0, 6);
    expect(samples[0].gap).toBe(false);
  });

  it("vertically bumps the curve so sqrt(x) from (4,0) reaches (0,-2) and stops at the domain edge", () => {
    const soldier: Soldier = { pos: { x: 4, y: 0 }, dir: -1 };
    const samples = sampleTrajectory(Math.sqrt, soldier, BOUNDS);

    // sqrt is undefined for x < 0, so nothing should be sampled left of the origin.
    for (const s of samples) expect(s.p.x).toBeGreaterThanOrEqual(-1e-6);

    // The path terminates near the domain edge at (0, -2).
    const last = samples[samples.length - 1];
    expect(last.p.x).toBeCloseTo(0, 1);
    expect(last.p.y).toBeCloseTo(-2, 1);
  });

  it("returns an empty stream (a dud) when the function is undefined at the soldier", () => {
    const soldier: Soldier = { pos: { x: -4, y: 0 }, dir: 1 };
    const samples = sampleTrajectory(Math.sqrt, soldier, BOUNDS);
    expect(samples).toHaveLength(0);
  });

  it("marches toward +x when dir is +1 and toward -x when dir is -1", () => {
    const right = sampleTrajectory((x) => x, { pos: { x: 0, y: 0 }, dir: 1 }, BOUNDS);
    const left = sampleTrajectory((x) => x, { pos: { x: 0, y: 0 }, dir: -1 }, BOUNDS);

    expect(right[1].p.x).toBeGreaterThan(right[0].p.x);
    expect(left[1].p.x).toBeLessThan(left[0].p.x);
  });

  it("stays within the horizontal bounds", () => {
    const samples = sampleTrajectory((x) => x, { pos: { x: 0, y: 0 }, dir: 1 }, BOUNDS);
    for (const s of samples) {
      expect(s.p.x).toBeGreaterThanOrEqual(BOUNDS.minX - 0.1);
      expect(s.p.x).toBeLessThanOrEqual(BOUNDS.maxX + 0.1);
    }
  });

  it("breaks the path with a gap across an asymptote (1/x)", () => {
    const soldier: Soldier = { pos: { x: 1, y: 0 }, dir: -1 };
    const samples = sampleTrajectory((x) => 1 / x, soldier, BOUNDS);
    expect(samples.some((s) => s.gap)).toBe(true);
  });
});
