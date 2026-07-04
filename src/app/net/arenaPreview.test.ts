// src/app/net/arenaPreview.test.ts
// TDD: tests written before implementation.
// Verifies buildArenaPreview determinism and team-spawn split.

import { describe, it, expect } from "vitest";
import { buildArenaPreview } from "./arenaPreview";
import { DEFAULT_MAP, DEFAULT_SCATTER } from "../../game/arenaDefaults";

const CFG = { map: { ...DEFAULT_MAP }, scatter: { ...DEFAULT_SCATTER } };
const SEED = 0xdeadbeef;

describe("buildArenaPreview — determinism", () => {
  it("returns identical planets for the same seed+config+counts", () => {
    const a = buildArenaPreview(CFG, SEED, { red: 1, blue: 1 });
    const b = buildArenaPreview(CFG, SEED, { red: 1, blue: 1 });
    expect(a.planets).toEqual(b.planets);
  });

  it("returns different planets for a different seed", () => {
    const a = buildArenaPreview(CFG, SEED, { red: 1, blue: 1 });
    const b = buildArenaPreview(CFG, SEED + 1, { red: 1, blue: 1 });
    // Extremely unlikely to be equal with different seeds
    expect(a.planets).not.toEqual(b.planets);
  });
});

describe("buildArenaPreview — team split", () => {
  it("1v1: one red player at x<0, one blue player at x>0", () => {
    const { players } = buildArenaPreview(CFG, SEED, { red: 1, blue: 1 });
    expect(players).toHaveLength(2);
    const red = players.filter((p) => p.team === "red");
    const blue = players.filter((p) => p.team === "blue");
    expect(red).toHaveLength(1);
    expect(blue).toHaveLength(1);
    expect(red[0].pos.x).toBeLessThan(0);
    expect(blue[0].pos.x).toBeGreaterThan(0);
  });

  it("2v1: produces 3 players total (2 red left, 1 blue right)", () => {
    const { players } = buildArenaPreview(CFG, SEED, { red: 2, blue: 1 });
    expect(players).toHaveLength(3);
    const red = players.filter((p) => p.team === "red");
    const blue = players.filter((p) => p.team === "blue");
    expect(red).toHaveLength(2);
    expect(blue).toHaveLength(1);
    for (const p of red) expect(p.pos.x).toBeLessThan(0);
    for (const p of blue) expect(p.pos.x).toBeGreaterThan(0);
  });

  it("players have hp:100 and alive:true", () => {
    const { players } = buildArenaPreview(CFG, SEED, { red: 1, blue: 1 });
    for (const p of players) {
      expect(p.hp).toBe(100);
      expect(p.alive).toBe(true);
    }
  });

  it("red player ids are r1, r2… and blue are b1, b2…", () => {
    const { players } = buildArenaPreview(CFG, SEED, { red: 2, blue: 2 });
    const red = players.filter((p) => p.team === "red");
    const blue = players.filter((p) => p.team === "blue");
    expect(red.map((p) => p.id)).toEqual(["r1", "r2"]);
    expect(blue.map((p) => p.id)).toEqual(["b1", "b2"]);
  });
});
