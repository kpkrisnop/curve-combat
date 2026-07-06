import { describe, it, expect } from "vitest";
import type { TrajectorySample } from "./types";
import { cumulativeArcLength, pointAtLength, bangTravelProgress } from "./playback";

/** Build samples from [x, y] pairs; every point is `gap:false` unless marked. */
function samplesOf(pts: [number, number][], gaps: number[] = []): TrajectorySample[] {
  return pts.map(([x, y], i) => ({ p: { x, y }, x, gap: gaps.includes(i) }));
}

describe("cumulativeArcLength", () => {
  it("returns [] for empty and [0] for a single sample", () => {
    expect(cumulativeArcLength([])).toEqual([]);
    expect(cumulativeArcLength(samplesOf([[0, 0]]))).toEqual([0]);
  });

  it("accumulates Euclidean segment lengths and stays monotonic non-decreasing", () => {
    // (0,0)→(3,4) = 5, →(3,4) stays, →(3,0) = 4  ⇒ [0,5,5,9]... use distinct pts:
    const s = samplesOf([[0, 0], [3, 4], [6, 8]]); // two 5-unit segments
    const cum = cumulativeArcLength(s);
    expect(cum).toEqual([0, 5, 10]);
    for (let i = 1; i < cum.length; i++) expect(cum[i]).toBeGreaterThanOrEqual(cum[i - 1]);
  });

  it("counts a gap segment as zero length (instant pen-lift jump)", () => {
    // index 2 is a gap: the (3,4)→(99,99) jump must add 0, not its huge distance.
    const s = samplesOf([[0, 0], [3, 4], [99, 99]], [2]);
    const cum = cumulativeArcLength(s);
    expect(cum).toEqual([0, 5, 5]);
  });
});

describe("pointAtLength", () => {
  const cum = [0, 5, 10]; // matches the two-segment path above

  it("guards degenerate arrays", () => {
    expect(pointAtLength([], 3)).toEqual({ idx: 0, frac: 0 });
    expect(pointAtLength([0], 3)).toEqual({ idx: 0, frac: 0 });
  });

  it("locates the bracketing segment and interpolation fraction", () => {
    expect(pointAtLength(cum, 0)).toEqual({ idx: 0, frac: 0 });
    expect(pointAtLength(cum, 2.5)).toEqual({ idx: 0, frac: 0.5 });
    expect(pointAtLength(cum, 7.5)).toEqual({ idx: 1, frac: 0.5 });
  });

  it("clamps to the final segment at or beyond total length", () => {
    expect(pointAtLength(cum, 10)).toEqual({ idx: 1, frac: 1 });
    expect(pointAtLength(cum, 999)).toEqual({ idx: 1, frac: 1 });
  });

  it("returns frac 0 on a flat/zero-length (gap) segment", () => {
    // arcLen flat between idx 1 and 2 (a gap): target exactly at that plateau.
    expect(pointAtLength([0, 5, 5, 9], 5)).toEqual({ idx: 0, frac: 1 });
  });
});

describe("bangTravelProgress", () => {
  it("pins the endpoints exactly (progress 0→0, 1→1)", () => {
    expect(bangTravelProgress(0, 1, 3)).toBe(0);
    expect(bangTravelProgress(1, 1, 3)).toBeCloseTo(1, 12);
  });

  it("reduces to linear when c === b", () => {
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      expect(bangTravelProgress(u, 1, 1, 1)).toBeCloseTo(u, 12);
    }
  });

  it("front-loads speed: progress is ahead of linear in the first half (c > b)", () => {
    // Locked params a=1, c=3, b=1 — the bullet starts fast then settles.
    expect(bangTravelProgress(0.5, 1, 3)).toBeGreaterThan(0.5);
  });

  it("is strictly increasing", () => {
    let prev = -1;
    for (let u = 0; u <= 1.0001; u += 0.1) {
      const p = bangTravelProgress(u, 1, 3);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });
});
