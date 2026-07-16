import { describe, it, expect } from "vitest";
import { latexToText } from "./latexToText";

describe("latexToText", () => {
  it("renders LaTeX as readable ASCII", () => {
    expect(latexToText("x^{2}")).toBe("x^2");
    expect(latexToText("\\sqrt{x}")).toBe("sqrt(x)");
    // A fraction becomes infix division, not a raw \frac.
    expect(latexToText("\\frac{\\sin\\left(100x\\right)}{2}")).toContain("/");
    expect(latexToText("\\frac{\\sin\\left(100x\\right)}{2}")).not.toContain("\\frac");
  });

  it("returns empty for blank input and never blanks a real string", () => {
    expect(latexToText("   ")).toBe("");
    // Even unparseable junk falls back to the raw string, never empty.
    expect(latexToText("!!!")).not.toBe("");
  });
});
