import { describe, it, expect } from "vitest";
import { X_VELOCITY_WORLD, xLength, shotDuration, curveSpeedFactor } from "./timing";
import type { ShotResult, TrajectorySample } from "./types";

function sample(x: number): TrajectorySample {
  return { p: { x, y: 0 }, x, gap: false };
}

function samplePoint(x: number, y: number): TrajectorySample {
  return { p: { x, y }, x, gap: false };
}

describe("timing", () => {
  it("xLength sums absolute x-distance across samples", () => {
    const s = [sample(-9), sample(-6), sample(0), sample(3)];
    expect(xLength(s)).toBeCloseTo(12); // 3 + 6 + 3
  });

  it("xLength is 0 for fewer than two samples", () => {
    expect(xLength([])).toBe(0);
    expect(xLength([sample(1)])).toBe(0);
  });

  it("shotDuration = xLength / X_VELOCITY_WORLD for a straight path (r = 1)", () => {
    const shot = { samples: [sample(-9), sample(3)], hit: { kind: "bounds", at: { x: 3, y: 0 }, sampleIndex: 1 }, impactSlope: 0 } as ShotResult;
    expect(shotDuration(shot)).toBeCloseTo(12 / X_VELOCITY_WORLD);
  });

  it("shotDuration slows down a genuinely curvy path relative to its x-span", () => {
    // Up 1 unit then back down over an x-span of 1: two diagonal segments of
    // length hypot(0.5, 1), so true arc length (~2.236) is well over x-span (1).
    const shot = {
      samples: [samplePoint(0, 0), samplePoint(0.5, 1), samplePoint(1, 0)],
      hit: { kind: "bounds", at: { x: 1, y: 0 }, sampleIndex: 2 },
      impactSlope: 0,
    } as ShotResult;
    // Hand-derived: arc = 2*hypot(0.5,1) ≈ 2.2360679775, r = arc/1, speedFactor
    // = 0.2*exp(-0.25*(r-1))+0.8 ≈ 0.9468336586, duration = 1/(6*speedFactor).
    expect(shotDuration(shot)).toBeCloseTo(0.17602528717287935);
    // Slower than the naive x-only duration (1 / X_VELOCITY_WORLD).
    expect(shotDuration(shot)).toBeGreaterThan(1 / X_VELOCITY_WORLD);
  });

  it("curveSpeedFactor is 1.0 at r=1 and eases toward the 0.8 floor as r grows", () => {
    expect(curveSpeedFactor(1)).toBeCloseTo(1.0);
    expect(curveSpeedFactor(1000)).toBeCloseTo(0.8, 5);
    expect(curveSpeedFactor(5)).toBeGreaterThan(0.8);
    expect(curveSpeedFactor(5)).toBeLessThan(1.0);
  });
});
