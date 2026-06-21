import { describe, it, expect } from "vitest";
import { fire } from "./engine";
import type { Bounds, World } from "./types";

const BOUNDS: Bounds = { minX: -12, minY: -7, maxX: 12, maxY: 7 };

function world(partial: Partial<World> = {}): World {
  return {
    soldier: { pos: { x: -8, y: 0 }, dir: 1 },
    targets: [{ id: "t1", pos: { x: 0, y: 0 }, radius: 0.4 }],
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
