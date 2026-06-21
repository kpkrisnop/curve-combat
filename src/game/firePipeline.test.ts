import { describe, it, expect } from "vitest";
import { evaluateAll } from "../math/Context";
import { fire } from "../sim/engine";
import type { World } from "../sim/types";

// Integration: the exact seam main.ts drives — a typed LaTeX string compiled by
// the shared math layer, fired through the engine. No DOM / Pixi involved.

function seed(): World {
  return {
    soldier: { pos: { x: -9, y: 0 }, dir: 1 },
    bounds: { minX: -12, minY: -7, maxX: 12, maxY: 7 },
    targets: [{ id: "t1", pos: { x: 0, y: 0 }, radius: 0.4 }],
  };
}

function fnFromLatex(latex: string): (x: number) => number {
  const row = evaluateAll([{ id: "shot", latex }]).get("shot");
  expect(row?.kind).toBe("curve");
  return row!.fn!;
}

describe("fire pipeline (LaTeX → evaluateAll → fire)", () => {
  it("a flat line y=0 destroys the target sitting on the x-axis", () => {
    const shot = fire(seed(), fnFromLatex("0"));
    expect(shot.hit.kind).toBe("target");
    expect(shot.hit.targetId).toBe("t1");
  });

  it("a parabola that overshoots the target leaves the field (a miss)", () => {
    // y = x^2 anchored at the soldier rises steeply away — flies off the top.
    const shot = fire(seed(), fnFromLatex("x^2"));
    expect(shot.hit.kind).toBe("bounds");
  });

  it("sqrt(x) from a left-side soldier is a dud (undefined at x=-9)", () => {
    const shot = fire(seed(), fnFromLatex("\\sqrt{x}"));
    expect(shot.hit.kind).toBe("dud");
  });
});
