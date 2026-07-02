// server/matchEngine.test.ts
import { describe, it, expect } from "vitest";
import { MatchEngine, type RoomPlayer } from "./matchEngine";
import { arenaDefaults } from "../src/game/arenaDefaults";
import type { MatchConfig } from "../src/game/matchLogic";

function config(): MatchConfig {
  return { mode: "classic", rounds: 3, noTurn: false, ...arenaDefaults() };
}
const PLAYERS: RoomPlayer[] = [
  { id: "A", name: "Ann", team: "red" },
  { id: "B", name: "Bo", team: "blue" },
];

describe("MatchEngine", () => {
  it("builds a 1v1 play state: both alive, red active, planets generated", () => {
    const e = new MatchEngine(config(), PLAYERS, () => 12345);
    const s = e.snapshot();
    expect(s.phase).toBe("play");
    expect(s.players.map((p) => p.id).sort()).toEqual(["A", "B"]);
    expect(s.activePlayerId).toBe("A"); // red first
    expect(s.planets.length).toBeGreaterThan(0);
  });

  it("rejects a fire when it isn't the player's turn", () => {
    const e = new MatchEngine(config(), PLAYERS, () => 1);
    const r = e.fire("B", "0");
    expect(r.ok).toBe(false);
  });

  it("accepts a valid fire, returns shot+duration, and gates further fires until resolved", () => {
    const e = new MatchEngine(config(), PLAYERS, () => 1);
    const r = e.fire("A", "0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.duration).toBeGreaterThan(0);
    expect(e.busy).toBe(true);
    // input gate: another fire while mid-flight is rejected
    expect(e.fire("B", "0").ok).toBe(false);
  });

  it("after resolvePlayerShot, the outcome is applied and the turn passes (on a miss)", () => {
    const e = new MatchEngine(config(), PLAYERS, () => 1);
    // A flat 0 shot: hit-or-miss depends on layout; either way, if it doesn't end
    // the round the turn passes and busy clears.
    const r = e.fire("A", "x^2"); // parabola off the top → bounds (a miss)
    expect(r.ok).toBe(true);
    const s = e.resolvePlayerShot("A");
    expect(e.busy).toBe(false);
    expect(s.activePlayerId).toBe("B");
  });

  it("beginNextRound resets to play with the round loser shooting first", () => {
    const c = config();
    c.scatter = { ...c.scatter, maxPlanets: 0 }; // clear the lane so a flat shot connects
    const e = new MatchEngine(c, PLAYERS, () => 1);
    const r = e.fire("A", "0"); // red hits blue on the shared y-axis
    expect(r.ok).toBe(true);
    const ended = e.resolvePlayerShot("A");
    expect(ended.scores.red).toBe(1);
    expect(ended.phase).toBe("between"); // best-of-3, not over yet
    const next = e.beginNextRound();
    expect(next.phase).toBe("play");
    expect(next.round).toBe(2);
    expect(next.activePlayerId).toBe("B"); // loser (blue) shoots first
  });
});
