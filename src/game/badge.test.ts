// src/game/badge.test.ts
//
// Pure helpers for the on-map name badge (Task D1+D2). Pixi rendering itself is
// not unit-tested here (see GameRenderer) — these cover the logic that decides
// what a badge shows and how big it is.

import { describe, it, expect } from "vitest";
import { badgeText, badgeSize, hpFraction, showHpBar } from "./badge";

describe("badgeText", () => {
  it("returns the trimmed name unchanged", () => {
    expect(badgeText("Alice")).toBe("Alice");
    expect(badgeText("  Bob  ")).toBe("Bob");
  });

  it("falls back to a default label for blank/empty names", () => {
    expect(badgeText("")).toBe("Player");
    expect(badgeText("   ")).toBe("Player");
  });
});

describe("badgeSize", () => {
  it("is 'lg' in the pre-game lobby and 'sm' in-game", () => {
    expect(badgeSize("pregame")).toBe("lg");
    expect(badgeSize("ingame")).toBe("sm");
  });
});

describe("hpFraction", () => {
  it("computes the fraction of HP remaining", () => {
    expect(hpFraction(100, 100)).toBe(1);
    expect(hpFraction(50, 100)).toBe(0.5);
    expect(hpFraction(0, 100)).toBe(0);
  });

  it("clamps to [0, 1] for out-of-range hp", () => {
    expect(hpFraction(-10, 100)).toBe(0);
    expect(hpFraction(150, 100)).toBe(1);
  });

  it("returns 0 rather than dividing by zero when maxHp <= 0", () => {
    expect(hpFraction(50, 0)).toBe(0);
  });
});

describe("showHpBar", () => {
  it("shows only in HP mode, never in Classic", () => {
    expect(showHpBar("hp")).toBe(true);
    expect(showHpBar("classic")).toBe(false);
  });
});
