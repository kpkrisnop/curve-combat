import { describe, it, expect } from "vitest";
import { computeDamage, HP_MAX } from "./hpLogic";

describe("HP_MAX", () => {
  it("is 100", () => {
    expect(HP_MAX).toBe(100);
  });
});

describe("computeDamage", () => {
  it("returns floor of 5 for slope 0", () => {
    expect(computeDamage(0)).toBe(5);
  });

  it("returns ~17 for slope 0.5", () => {
    expect(computeDamage(0.5)).toBeGreaterThanOrEqual(15);
    expect(computeDamage(0.5)).toBeLessThanOrEqual(19);
  });

  it("returns ~26 for slope 1", () => {
    expect(computeDamage(1)).toBeGreaterThanOrEqual(24);
    expect(computeDamage(1)).toBeLessThanOrEqual(28);
  });

  it("returns ~40 for slope 2", () => {
    expect(computeDamage(2)).toBeGreaterThanOrEqual(38);
    expect(computeDamage(2)).toBeLessThanOrEqual(42);
  });

  it("caps at 50 for very high slope", () => {
    expect(computeDamage(100)).toBe(50);
    expect(computeDamage(50)).toBe(50);
  });

  it("always returns an integer", () => {
    for (const s of [0, 0.3, 1.7, 5, 20]) {
      expect(Number.isInteger(computeDamage(s))).toBe(true);
    }
  });

  it("always returns at least 5", () => {
    for (const s of [0, -1, -100]) {
      expect(computeDamage(s)).toBeGreaterThanOrEqual(5);
    }
  });

  it("always returns at most 50", () => {
    for (const s of [10, 50, 1000]) {
      expect(computeDamage(s)).toBeLessThanOrEqual(50);
    }
  });
});
