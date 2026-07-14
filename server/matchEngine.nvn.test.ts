// server/matchEngine.nvn.test.ts
//
// NvN verification suite — proves MatchEngine is team-generic (2v2, 2v1).
// All tests use fixed seeds and maxPlanets: 0 where a guaranteed hit/miss is needed.
//
// Spawns are now seed-driven and randomized within the per-side zone (Issue 1), so
// exact spawn coordinates are no longer hardcoded. Tests that need to "aim" at a
// teammate's y read the ACTUAL spawn y off the live snapshot, and force
// spawnBandX: 0 so both same-side spawns share the same x — separation is then
// enforced purely on the y axis, guaranteeing the two teammates' y values differ
// by at least spawnSeparation (so a flat shot at one teammate's y cannot also
// clip the other).
//
// Guaranteed miss: latex:"x+999" — exits bounds immediately (no target at x+999 within field).
// NOTE: latex:"99" is a CONSTANT y=99 but the sim evaluates it as a hit (likely wraps/resolves
// at the muzzle position); do NOT use constant-number latex for misses.

import { describe, it, expect } from "vitest";
import { MatchEngine, type RoomPlayer } from "./matchEngine";
import { arenaDefaults } from "../src/game/arenaDefaults";
import type { MatchConfig } from "../src/game/matchLogic";

// ── helpers ──────────────────────────────────────────────────────────────────

function cfg2v(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    mode: "classic",
    rounds: 3,
    noTurn: false,
    ...arenaDefaults(),
    teamSize: 2,   // gives 4 spawn slots: 2 left + 2 right
    ...overrides,
  };
}

/**
 * cfg2v, but forces same-side spawns onto a single x column so separation is
 * purely on y — AND mirrors the two sides, so red and blue share a y and a flat
 * shot connects. Both are load-bearing for the elimination tests below: a fired
 * constant is anchored to the SHOOTER (trajectory.ts: `yOffset = sy - fn(sx)`),
 * so it draws a flat line at the shooter's own y whatever its value. Without the
 * mirror the sides roll independently (the default since cfd58cd) and the shot
 * sails past. These tests are about elimination and rotation, not spawn
 * geometry; they just need an arena where a flat shot lands.
 */
function cfg2vFixedColumn(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return cfg2v({
    ...overrides,
    // The forced values come LAST so they actually win. Callers pass a whole
    // `...arenaDefaults().scatter` in their override, which used to spread over
    // `spawnBandX: 0` and put it back to the default — so this helper's own
    // fixed column was silently not being applied.
    scatter: {
      ...arenaDefaults().scatter,
      ...(overrides.scatter ?? {}),
      spawnBandX: 0,
      spawnMirror: true,
    },
  });
}

/** 2v2 roster */
const PLAYERS_2V2: RoomPlayer[] = [
  { id: "r1", name: "Red1", team: "red" },
  { id: "r2", name: "Red2", team: "red" },
  { id: "b1", name: "Blue1", team: "blue" },
  { id: "b2", name: "Blue2", team: "blue" },
];

/** 2v1 roster (two red, one blue) */
const PLAYERS_2V1: RoomPlayer[] = [
  { id: "r1", name: "Red1", team: "red" },
  { id: "r2", name: "Red2", team: "red" },
  { id: "b1", name: "Blue1", team: "blue" },
];

// ── tests ─────────────────────────────────────────────────────────────────────

describe("MatchEngine NvN verification", () => {
  // ── Test 1: 2v2 turn rotation ─────────────────────────────────────────────
  it("2v2 rotation: turnQueue alternates teams r1,b1,r2,b2 and advances on a miss", () => {
    const e = new MatchEngine(cfg2v(), PLAYERS_2V2, () => 1);
    const s0 = e.snapshot();

    // buildTurnQueue interleaves starting with firstTeam ("red"):
    // first=[r1,r2], second=[b1,b2] → snake → [r1,b1,r2,b2]
    expect(s0.turnQueue).toEqual(["r1", "b1", "r2", "b2"]);
    expect(s0.activePlayerId).toBe("r1");

    // Guaranteed miss: x+999 exits bounds immediately (no target reachable at that offset)
    const fireResult = e.fire("r1", "x+999");
    expect(fireResult.ok).toBe(true);

    const s1 = e.resolvePlayerShot("r1");
    // After miss, round continues and turn advances to next alive player: b1
    expect(s1.phase).toBe("play");
    expect(s1.activePlayerId).toBe("b1");
  });

  // ── Test 2: 2v1 uneven spawns ─────────────────────────────────────────────
  it("2v1 uneven spawns: constructs without error; red at x<0, blue at x>0; all distinct", () => {
    // teamSize: 2 gives 2 left + 2 right spawn slots; 2 reds fill left, 1 blue fills right[0]
    const e = new MatchEngine(cfg2v(), PLAYERS_2V1, () => 1);
    const s = e.snapshot();

    expect(s.players).toHaveLength(3);
    const r1 = s.players.find((p) => p.id === "r1")!;
    const r2 = s.players.find((p) => p.id === "r2")!;
    const b1 = s.players.find((p) => p.id === "b1")!;

    // Red players on the left half, blue on the right half
    expect(r1.pos.x).toBeLessThan(0);
    expect(r2.pos.x).toBeLessThan(0);
    expect(b1.pos.x).toBeGreaterThan(0);

    // All positions are distinct
    expect(r1.pos).not.toEqual(r2.pos);
    expect(r1.pos).not.toEqual(b1.pos);
    expect(r2.pos).not.toEqual(b1.pos);
  });

  // ── Test 3: team elimination ends the round (2v1 classic) ─────────────────
  it("2v1: killing the lone blue ends the round (phase=between, scores.red=1)", () => {
    // Empty field + flat shot at b1's actual y position → guaranteed hit
    const c = cfg2vFixedColumn({ scatter: { ...arenaDefaults().scatter, maxPlanets: 0 } });
    const e = new MatchEngine(c, PLAYERS_2V1, () => 1);
    const b1y = e.snapshot().players.find((p) => p.id === "b1")!.pos.y;

    // r1 is active (red goes first), fires flat line through b1's y
    expect(e.fire("r1", String(b1y)).ok).toBe(true);
    const s = e.resolvePlayerShot("r1");

    expect(s.phase).toBe("between");
    expect(s.scores.red).toBe(1);
    expect(s.scores.blue).toBe(0);
  });

  // ── Test 4: partial elimination does NOT end the round (2v2 classic) ───────
  it("2v2: killing one of two blues keeps phase=play; victim is skipped in rotation", () => {
    const c = cfg2vFixedColumn({ scatter: { ...arenaDefaults().scatter, maxPlanets: 0 } });
    const e = new MatchEngine(c, PLAYERS_2V2, () => 1);
    const b1y = e.snapshot().players.find((p) => p.id === "b1")!.pos.y;

    // r1 fires flat shot at b1's y → hits b1, misses b2 (fixed-column spawns ⇒ b2's y
    // differs from b1's by at least spawnSeparation)
    expect(e.fire("r1", String(b1y)).ok).toBe(true);
    const s = e.resolvePlayerShot("r1");

    // Round must still be in play — b2 is still alive
    expect(s.phase).toBe("play");

    // b1 is eliminated
    const b1 = s.players.find((p) => p.id === "b1")!;
    expect(b1.alive).toBe(false);

    // b2 is still alive
    const b2 = s.players.find((p) => p.id === "b2")!;
    expect(b2.alive).toBe(true);

    // After r1's kill of b1: nextActive(["r1","b1","r2","b2"], "r1", isAlive)
    // step1→b1 (dead, skip), step2→r2 (alive) → r2
    expect(s.activePlayerId).toBe("r2");

    // r2 fires a miss — turn advances from r2, skipping dead b1
    // nextActive(["r1","b1","r2","b2"], "r2", isAlive):
    // step1→b2 (alive) → b2  (b1 is already dead and would be skipped anyway)
    expect(e.fire("r2", "x+999").ok).toBe(true);
    const s2 = e.resolvePlayerShot("r2");
    expect(s2.activePlayerId).toBe("b2");
  });

  // ── Test 5: HP mode per-player pools ──────────────────────────────────────
  it("2v2 hp: hitting b1 reduces b1.hp but leaves b2.hp unchanged at 100", () => {
    const c = cfg2vFixedColumn({
      mode: "hp",
      scatter: { ...arenaDefaults().scatter, maxPlanets: 0 },
    });
    const e = new MatchEngine(c, PLAYERS_2V2, () => 1);
    const b1y = e.snapshot().players.find((p) => p.id === "b1")!.pos.y;

    // r1 fires at b1's actual y → hits b1
    expect(e.fire("r1", String(b1y)).ok).toBe(true);
    const s = e.resolvePlayerShot("r1");

    const b1 = s.players.find((p) => p.id === "b1")!;
    const b2 = s.players.find((p) => p.id === "b2")!;

    // b1 took damage
    expect(b1.hp).toBeLessThan(100);
    expect(b1.hp).toBeGreaterThan(0); // one hit shouldn't kill (min damage 5, max 50)

    // b2 is untouched
    expect(b2.hp).toBe(100);
  });
});
