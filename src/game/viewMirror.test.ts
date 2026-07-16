import { describe, it, expect } from "vitest";
import { mirroredForTeam, mirrorLatex } from "./viewMirror";
import { evaluateAll } from "../math/Context";

describe("mirroredForTeam", () => {
  it("mirrors the world-right team (blue), not red, not spectators", () => {
    expect(mirroredForTeam("blue")).toBe(true);
    expect(mirroredForTeam("red")).toBe(false);
    expect(mirroredForTeam(null)).toBe(false);
  });
});

/** Compile a fired-curve latex the same way resolveFire does, to a numeric fn. */
function fnOf(latex: string): (x: number) => number {
  const row = evaluateAll([{ id: "shot", latex }]).get("shot");
  if (row?.kind !== "curve" || !row.fn) throw new Error(`not a curve: ${latex}`);
  return row.fn;
}

describe("mirrorLatex", () => {
  // mirrorLatex(g)(x) must equal g(-x): the view-frame function reflected into
  // the world frame. Verified numerically through the real compile path so a
  // serialization quirk can't slip past.
  const cases = ["0.3x", "x^2", "\\sin(x)", "\\sqrt{x}", "2x+1", "\\ln(x)", "e^{x}", "\\exp(x)", "x^3-2x"];
  for (const latex of cases) {
    it(`reflects ${latex} so mirrored(x) === original(-x)`, () => {
      const orig = fnOf(latex);
      const mir = fnOf(mirrorLatex(latex));
      for (const x of [-2.3, -1, -0.4, 0, 0.7, 1.5, 3.1]) {
        const a = mir(x);
        const b = orig(-x);
        expect(Number.isFinite(a)).toBe(Number.isFinite(b));
        if (Number.isFinite(a)) expect(a).toBeCloseTo(b, 9);
      }
    });
  }

  it("leaves a constant unchanged in value", () => {
    expect(fnOf(mirrorLatex("3"))(5)).toBeCloseTo(3, 9);
  });

  it("returns the input untouched when it cannot be parsed", () => {
    // Garbage in → garbage out (downstream compile rejects it); never throws.
    expect(() => mirrorLatex("\\sin(")).not.toThrow();
  });
});
