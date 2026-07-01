import { describe, it, expect } from "vitest";
import { coverage } from "./coverage";

describe("coverage", () => {
  it("is 0 with no planets", () => {
    expect(coverage([], { width: 24, height: 14 })).toBe(0);
  });
  it("is the area of the circles over the field area", () => {
    const planets = [{ id: "p1", pos: { x: 0, y: 0 }, radius: 2, craters: [] }];
    const expected = (Math.PI * 4) / (24 * 14);
    expect(coverage(planets, { width: 24, height: 14 })).toBeCloseTo(expected);
  });
});
