import { describe, it, expect } from "vitest";
import { detectCollision } from "./collision";
import type { Bounds, Target, TrajectorySample, World } from "./types";

const BOUNDS: Bounds = { minX: -12, minY: -7, maxX: 12, maxY: 7 };

function line(points: [number, number][], gaps: boolean[] = []): TrajectorySample[] {
  return points.map(([x, y], i) => ({ p: { x, y }, x, gap: gaps[i] ?? false }));
}

function world(targets: Target[], muzzle: [number, number] = [0, 0]): World {
  return {
    soldier: { pos: { x: muzzle[0], y: muzzle[1] }, dir: 1 },
    targets,
    bounds: BOUNDS,
  };
}

describe("detectCollision — first hit over the sample stream", () => {
  it("hits a target the path passes through", () => {
    const samples = line([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0]]);
    const hit = detectCollision(samples, world([{ id: "t1", pos: { x: 5, y: 0 }, radius: 0.4 }]));
    expect(hit.kind).toBe("target");
    expect(hit.targetId).toBe("t1");
    expect(hit.at.x).toBeCloseTo(4.6, 1); // entry point = center - radius
  });

  it("returns expired when nothing is hit and the path stays in bounds", () => {
    const samples = line([[0, 0], [1, 0], [2, 0], [3, 0]]);
    const hit = detectCollision(samples, world([]));
    expect(hit.kind).toBe("expired");
    expect(hit.at.x).toBeCloseTo(3, 6);
  });

  it("reports bounds when the path leaves the playfield", () => {
    const samples = line([[0, 0], [0, 4], [0, 8]]);
    const hit = detectCollision(samples, world([]));
    expect(hit.kind).toBe("bounds");
    expect(hit.at.y).toBeCloseTo(7, 6);
  });

  it("hits the nearer of two targets first", () => {
    const samples = line([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0]]);
    const hit = detectCollision(
      samples,
      world([
        { id: "far", pos: { x: 8, y: 0 }, radius: 0.4 },
        { id: "near", pos: { x: 4, y: 0 }, radius: 0.4 },
      ]),
    );
    expect(hit.targetId).toBe("near");
  });

  it("ignores a target within the self-clear distance of the muzzle", () => {
    const samples = line([[0, 0], [2, 0], [4, 0], [6, 0]]);
    const hit = detectCollision(
      samples,
      world([{ id: "tooClose", pos: { x: 0.3, y: 0 }, radius: 0.2 }]),
    );
    expect(hit.kind).toBe("expired"); // muzzle-adjacent target is not detonated
  });

  it("does not connect a hit across a gap in the path", () => {
    const samples = line(
      [[0, 0], [1, 0], [2, 0]],
      [false, false, true], // discontinuity before the (2,0) point
    );
    const hit = detectCollision(
      samples,
      world([{ id: "behindGap", pos: { x: 1.5, y: 0 }, radius: 0.2 }]),
    );
    expect(hit.kind).toBe("expired");
  });
});
