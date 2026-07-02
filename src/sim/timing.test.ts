import { describe, it, expect } from "vitest";
import { X_VELOCITY_WORLD, xLength, shotDuration } from "./timing";
import type { ShotResult, TrajectorySample } from "./types";

function sample(x: number): TrajectorySample {
  return { p: { x, y: 0 }, x, gap: false };
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

  it("shotDuration = xLength / X_VELOCITY_WORLD", () => {
    const shot = { samples: [sample(-9), sample(3)], hit: { kind: "bounds", at: { x: 3, y: 0 }, sampleIndex: 1 }, impactSlope: 0 } as ShotResult;
    expect(shotDuration(shot)).toBeCloseTo(12 / X_VELOCITY_WORLD);
  });
});
