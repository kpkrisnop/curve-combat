import { describe, it, expect } from "vitest";
import { detectCollision, isSolid } from "./collision";
import type { Bounds, Planet, Target, TrajectorySample, World } from "./types";

const BOUNDS: Bounds = { minX: -12, minY: -7, maxX: 12, maxY: 7 };

function line(points: [number, number][], gaps: boolean[] = []): TrajectorySample[] {
  return points.map(([x, y], i) => ({ p: { x, y }, x, gap: gaps[i] ?? false }));
}

function world(targets: Target[], planets: Planet[] = [], muzzle: [number, number] = [0, 0]): World {
  return {
    soldier: { pos: { x: muzzle[0], y: muzzle[1] }, dir: 1 },
    targets,
    planets,
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

  it("hits a target grazed at 0.15 off-center — within the player's 0.2 hitbox but outside the old 0.1 one", () => {
    // Regression pin for the dot/hitbox unification: PLAYER_RADIUS grew from 0.1
    // to 0.2 to match the drawn dot, so a graze in (0.1, 0.2] now registers.
    const samples = line([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0]]);
    const grazed = { id: "b1", pos: { x: 5, y: 0.15 }, radius: 0.2 };
    const hit = detectCollision(samples, world([grazed]));
    expect(hit.kind).toBe("target");
    expect(hit.targetId).toBe("b1");

    // Same graze distance would have missed under the old, undersized radius.
    const oldRadius = { ...grazed, radius: 0.1 };
    const missed = detectCollision(samples, world([oldRadius]));
    expect(missed.kind).toBe("expired");
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

describe("isSolid — geometric meat test (no connectivity)", () => {
  it("is solid inside the circle and outside all craters", () => {
    const planets: Planet[] = [{ id: "p", pos: { x: 0, y: 0 }, radius: 2, craters: [] }];
    expect(isSolid({ x: 1, y: 0 }, planets)).toBe(true);
    expect(isSolid({ x: 3, y: 0 }, planets)).toBe(false); // outside the circle
  });

  it("a point inside a crater is empty even though it is inside the circle", () => {
    const planets: Planet[] = [
      { id: "p", pos: { x: 0, y: 0 }, radius: 2, craters: [{ pos: { x: 0, y: 0 }, radius: 1 }] },
    ];
    expect(isSolid({ x: 0, y: 0 }, planets)).toBe(false); // carved out
    expect(isSolid({ x: 1.5, y: 0 }, planets)).toBe(true); // still solid ring (a detached island stays solid)
  });
});

describe("detectCollision — Planets (destructible terrain)", () => {
  it("stops a shot at the planet's solid surface", () => {
    const samples = line([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0]]);
    const planet: Planet = { id: "p1", pos: { x: 5, y: 0 }, radius: 1, craters: [] };
    const hit = detectCollision(samples, world([], [planet]));
    expect(hit.kind).toBe("planet");
    expect(hit.planetId).toBe("p1");
    expect(hit.at.x).toBeCloseTo(4, 1); // surface = center - radius
  });

  it("flies through a crater and strikes the meat behind it", () => {
    const samples = line([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0]]);
    const planet: Planet = {
      id: "p1",
      pos: { x: 5, y: 0 },
      radius: 1,
      craters: [{ pos: { x: 4, y: 0 }, radius: 0.6 }], // eats the near rim [3.4, 4.6]
    };
    const hit = detectCollision(samples, world([], [planet]));
    expect(hit.kind).toBe("planet");
    expect(hit.at.x).toBeCloseTo(4.6, 1); // first meat past the crater
  });

  it("is not blocked when a tunnel is carved clean through", () => {
    const samples = line([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0]]);
    const planet: Planet = {
      id: "p1",
      pos: { x: 5, y: 0 },
      radius: 1,
      craters: [{ pos: { x: 5, y: 0 }, radius: 1.2 }], // covers the whole y=0 corridor
    };
    const hit = detectCollision(samples, world([], [planet]));
    expect(hit.kind).toBe("expired");
  });

  it("hits a planet before a target sitting behind it", () => {
    const samples = line([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0]]);
    const planet: Planet = { id: "p1", pos: { x: 4, y: 0 }, radius: 0.5, craters: [] };
    const target: Target = { id: "t1", pos: { x: 7, y: 0 }, radius: 0.4 };
    const hit = detectCollision(samples, world([target], [planet]));
    expect(hit.kind).toBe("planet");
    expect(hit.at.x).toBeCloseTo(3.5, 1);
  });
});
