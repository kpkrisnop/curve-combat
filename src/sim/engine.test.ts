import { describe, it, expect } from "vitest";
import { fire } from "./engine";
import type { Bounds, World } from "./types";

const BOUNDS: Bounds = { minX: -12, minY: -7, maxX: 12, maxY: 7 };

function world(partial: Partial<World> = {}): World {
  return {
    soldier: { pos: { x: -8, y: 0 }, dir: 1 },
    targets: [{ id: "t1", pos: { x: 0, y: 0 }, radius: 0.4 }],
    planets: [],
    bounds: BOUNDS,
    ...partial,
  };
}

describe("fire — the shot pipeline", () => {
  it("fires a dud when the function is undefined at the soldier", () => {
    const w = world({ soldier: { pos: { x: -4, y: 0 }, dir: 1 }, targets: [] });
    const result = fire(w, Math.sqrt); // sqrt(-4) is undefined
    expect(result.hit.kind).toBe("dud");
    expect(result.samples).toHaveLength(0);
  });

  it("destroys the target the curve passes through", () => {
    const result = fire(world(), () => 0); // flat line at y=0 from the soldier
    expect(result.hit.kind).toBe("target");
    expect(result.hit.targetId).toBe("t1");
  });

  it("truncates the sample stream at the impact point", () => {
    const result = fire(world(), () => 0);
    const last = result.samples[result.samples.length - 1];
    expect(last.p.x).toBeCloseTo(result.hit.at.x, 6);
    expect(last.p.y).toBeCloseTo(result.hit.at.y, 6);
  });

  it("is blocked by a planet standing between the soldier and the target", () => {
    const w = world({
      planets: [{ id: "p1", pos: { x: -4, y: 0 }, radius: 1, craters: [] }],
    });
    const result = fire(w, () => 0); // flat line would reach the target, but the planet blocks it
    expect(result.hit.kind).toBe("planet");
    expect(result.hit.planetId).toBe("p1");
    expect(result.hit.at.x).toBeCloseTo(-5, 1); // near surface = center - radius
  });

  it("reports a bounds miss when the curve flies off the field", () => {
    const result = fire(world({ soldier: { pos: { x: 0, y: 0 }, dir: 1 }, targets: [] }), (x) => x);
    expect(result.hit.kind).toBe("bounds");
    expect(result.hit.at.y).toBeCloseTo(7, 1);
  });

  it("does not mutate the world", () => {
    const w = world();
    const before = w.targets.length;
    fire(w, () => 0);
    expect(w.targets.length).toBe(before);
  });

  it("is deterministic — identical inputs give identical results", () => {
    const a = fire(world(), (x) => Math.sin(x));
    const b = fire(world(), (x) => Math.sin(x));
    expect(a.samples.length).toBe(b.samples.length);
    expect(a.hit).toEqual(b.hit);
  });
});

describe("fire — impactSlope", () => {
  it("is 0 for a flat horizontal hit (slope = 0)", () => {
    // fn = () => 0 → the anchored curve is y=0 everywhere
    // soldier at (-8, 0), target at (0, 0, r=0.4) → direct hit
    const result = fire(world(), () => 0);
    expect(result.hit.kind).toBe("target");
    expect(result.impactSlope).toBeCloseTo(0, 2);
  });

  it("is ~1 for a 45-degree diagonal hit (slope = 1)", () => {
    // fn = (x) => x → yOffset = 0 - (-8) = 8 → anchored curve: y = x + 8
    // at x=-2, y=6 → place target at (-2, 6) — within bounds
    const w = world({
      targets: [{ id: "diag", pos: { x: -2, y: 6 }, radius: 0.4 }],
    });
    const result = fire(w, (x) => x);
    expect(result.hit.kind).toBe("target");
    expect(result.impactSlope).toBeCloseTo(1, 1);
  });

  it("is 0 for a non-target hit (planet block)", () => {
    const w = world({
      planets: [{ id: "p1", pos: { x: -4, y: 0 }, radius: 1, craters: [] }],
    });
    const result = fire(w, () => 0);
    expect(result.hit.kind).toBe("planet");
    expect(result.impactSlope).toBe(0);
  });
});
