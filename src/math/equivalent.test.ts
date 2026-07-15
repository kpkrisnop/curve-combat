import { describe, it, expect } from "vitest";
import { curvesEquivalent } from "./equivalent";

describe("curvesEquivalent", () => {
  it("treats flat paste and its structured form as the same curve", () => {
    // The hero example: the flat field LaTeX vs. what typedText structures it to.
    const flat = "\\sin(100x)/(1+\\exp(-10*(x+-8)))";
    const structured =
      "\\frac{\\sin\\left(100x\\right)}{1+\\exp\\left(-10\\cdot\\left(x+-8\\right)\\right)}";
    expect(curvesEquivalent(flat, structured)).toBe(true);
  });

  it("rejects a structuring that changed the math (greedy fraction)", () => {
    // x/2 - 1  is NOT  x/(2-1). This is exactly the typedText mis-grouping the
    // guard must catch so Format never silently changes the shot.
    expect(curvesEquivalent("x/2-1", "\\frac{x}{2-1}")).toBe(false);
  });

  it("holds for a simple polynomial round-trip", () => {
    expect(curvesEquivalent("x^2+3x", "x^{2}+3x")).toBe(true);
  });

  it("rejects two plainly different curves", () => {
    expect(curvesEquivalent("x^{2}", "x^{3}")).toBe(false);
  });
});
