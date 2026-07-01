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

  it("flies a high-frequency sin all the way to the far bound (no mid-air stall)", () => {
    const soldier: Soldier = { pos: { x: -9, y: 0 }, dir: 1 };
    const samples = sampleTrajectory((x) => Math.sin(50 * x), soldier, BOUNDS);

    // The path must reach the right edge, not expire near the muzzle.
    const last = samples[samples.length - 1];
    expect(last.p.x).toBeGreaterThan(BOUNDS.maxX - 0.1);
    // And it must stay within the sample budget.
    expect(samples.length).toBeLessThanOrEqual(40_000);
  });

  it("traverses an extreme-frequency sin within budget (sin(200x))", () => {
    const soldier: Soldier = { pos: { x: -9, y: 0 }, dir: 1 };
    const samples = sampleTrajectory((x) => Math.sin(200 * x), soldier, BOUNDS);

    const last = samples[samples.length - 1];
    expect(last.p.x).toBeGreaterThan(BOUNDS.maxX - 0.2);
    expect(samples.length).toBeLessThanOrEqual(40_000);
  });

  it("keeps a steep-but-continuous line connected (no false gap on y = 50x)", () => {
    const soldier: Soldier = { pos: { x: -0.1, y: 0 }, dir: 1 };
    // Narrow bounds so the steep line stays on-screen briefly.
    const tall: Bounds = { minX: -1, minY: -200, maxX: 1, maxY: 200 };
    const samples = sampleTrajectory((x) => 50 * x, soldier, tall);
    // A steep straight line is continuous: no segment should be flagged a gap.
    expect(samples.every((s) => !s.gap)).toBe(true);
  });

  it("samples a flat line sparsely (curvature-driven density)", () => {
    const samples = sampleTrajectory(() => 0, { pos: { x: -9, y: 0 }, dir: 1 }, BOUNDS);
    // y = 0 has zero curvature, so refinement adds nothing beyond the coarse march.
    expect(samples.length).toBeLessThan(2000);
    const last = samples[samples.length - 1];
    expect(last.p.x).toBeGreaterThan(BOUNDS.maxX - 0.1);
  });
});
