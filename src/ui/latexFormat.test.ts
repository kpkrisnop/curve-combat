import { describe, it, expect } from "vitest";
import { needsFormatting, latexToTyped } from "./latexFormat";

describe("needsFormatting", () => {
  it("flags a literal slash (flat division from a paste)", () => {
    // What MathQuill leaves in the field after pasting sin(100x)/(1+exp(...)).
    expect(needsFormatting("\\sin(100x)/(1+\\exp(-10*(x+-8)))")).toBe(true);
  });

  it("flags a literal asterisk", () => {
    expect(needsFormatting("2*x")).toBe(true);
  });

  it("flags a bare caret (x^2 pasted, not a real superscript)", () => {
    expect(needsFormatting("x^2+1")).toBe(true);
  });

  it("is quiet on already-structured LaTeX", () => {
    expect(
      needsFormatting("\\frac{\\sin\\left(100x\\right)}{1+\\exp\\left(-10\\cdot\\left(x-8\\right)\\right)}"),
    ).toBe(false);
    expect(needsFormatting("x^{2}+3x")).toBe(false); // real superscript: ^ followed by {
    expect(needsFormatting("")).toBe(false);
  });
});

describe("latexToTyped", () => {
  it("recovers the pasted ASCII from flat paste LaTeX", () => {
    // Paste applies only autoOperatorNames; everything else stays literal ASCII.
    expect(latexToTyped("\\sin(100x)/(1+\\exp(-10*(x+-8)))")).toBe(
      "sin(100x)/(1+exp(-10*(x+-8)))",
    );
  });

  it("unwraps \\left \\right and \\cdot and \\operatorname", () => {
    expect(latexToTyped("\\cos\\left(2x\\right)\\cdot\\operatorname{sign}(x)")).toBe(
      "cos(2x)*sign(x)",
    );
  });

  it("leaves plain ASCII untouched", () => {
    expect(latexToTyped("2*x+1")).toBe("2*x+1");
  });
});
