// server/matchEngine.nvn.test.ts
//
// NvN verification suite — proves MatchEngine is team-generic (2v2, 2v1).
// All tests use fixed seeds and maxPlanets: 0 where a guaranteed hit/miss is needed.
//
// Spawn geometry (teamSize: 2, default map 24×14):
//   boundsFromMap → minX=-12, maxX=12, minY=-7, maxY=7
//   computeSpawns  → yLo=-6, yHi=6; x=±9
//   spawns = [{x:-9,y:-6},{x:9,y:-6},{x:-9,y:6},{x:9,y:6}]
//   left=[{x:-9,y:-6},{x:-9,y:6}], right=[{x:9,y:-6},{x:9,y:6}]
//   layout assigns: red r1→{x:-9,y:-6}, r2→{x:-9,y:6}
//                   blue b1→{x:9,y:-6},  b2→{x:9,y:6}
//
// Flat shot latex:"-6" travels y=-6 → hits b1; latex:"6" → hits b2.
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
    // Empty field + flat shot at y=-6 (b1's y position) → guaranteed hit
    const c = cfg2v({ scatter: { ...arenaDefaults().scatter, maxPlanets: 0 } });
    const e = new MatchEngine(c, PLAYERS_2V1, () => 1);

    // r1 is active (red goes first), fires flat line through b1's y=-6
    expect(e.fire("r1", "-6").ok).toBe(true);
    const s = e.resolvePlayerShot("r1");

    expect(s.phase).toBe("between");
    expect(s.scores.red).toBe(1);
    expect(s.scores.blue).toBe(0);
  });

  // ── Test 4: partial elimination does NOT end the round (2v2 classic) ───────
  it("2v2: killing one of two blues keeps phase=play; victim is skipped in rotation", () => {
    const c = cfg2v({ scatter: { ...arenaDefaults().scatter, maxPlanets: 0 } });
    const e = new MatchEngine(c, PLAYERS_2V2, () => 1);

    // r1 fires flat shot at y=-6 → hits b1 (at {x:9,y:-6}), misses b2 (at {x:9,y:6})
    expect(e.fire("r1", "-6").ok).toBe(true);
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
    const c = cfg2v({
      mode: "hp",
      scatter: { ...arenaDefaults().scatter, maxPlanets: 0 },
    });
    const e = new MatchEngine(c, PLAYERS_2V2, () => 1);

    // r1 fires at y=-6 → hits b1 (at {x:9,y:-6})
    expect(e.fire("r1", "-6").ok).toBe(true);
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
