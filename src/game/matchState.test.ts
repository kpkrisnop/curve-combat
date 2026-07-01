// src/game/matchState.test.ts
import { describe, it, expect } from "vitest";
import { createMatch, livingEnemies, worldFor, teamDir, PLAYER_RADIUS, playerById, beginRound } from "./matchState";
import type { RoundLayout, PlayerState } from "./matchState";
import type { MatchConfig } from "./matchLogic";
import { HP_MAX } from "./hpLogic";

const BOUNDS = { minX: -12, minY: -7, maxX: 12, maxY: 7 };
const CONFIG: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local" };

function layout(): RoundLayout {
  const players: PlayerState[] = [
    { id: "r1", name: "R1", team: "red", pos: { x: -9, y: 0 }, hp: 0, alive: false },
    { id: "b1", name: "B1", team: "blue", pos: { x: 9, y: 0 }, hp: 0, alive: false },
  ];
  return { players, planets: [{ id: "p1", pos: { x: 0, y: 0 }, radius: 1, craters: [] }] };
}

describe("createMatch", () => {
  it("starts all players alive at full HP, scores 0, phase play, round 1", () => {
    const m = createMatch(CONFIG, layout(), BOUNDS, "red");
    expect(m.players.every((p) => p.alive && p.hp === HP_MAX)).toBe(true);
    expect(m.scores).toEqual({ red: 0, blue: 0 });
    expect(m.round).toBe(1);
    expect(m.phase).toBe("play");
    expect(m.winner).toBeNull();
  });

  it("turn-based active player is the first of firstTeam; no-turn is null", () => {
    expect(createMatch(CONFIG, layout(), BOUNDS, "red").activePlayerId).toBe("r1");
    const noTurn = createMatch({ ...CONFIG, noTurn: true }, layout(), BOUNDS, "red");
    expect(noTurn.activePlayerId).toBeNull();
  });
});

describe("selectors", () => {
  it("teamDir: red fires +x, blue fires -x", () => {
    expect(teamDir("red")).toBe(1);
    expect(teamDir("blue")).toBe(-1);
  });

  it("livingEnemies excludes own team and the dead", () => {
    const m = createMatch(CONFIG, layout(), BOUNDS, "red");
    m.players[1].alive = false; // kill b1
    expect(livingEnemies(m, "red")).toHaveLength(0);
  });

  it("worldFor builds soldier from shooter and targets from living enemies", () => {
    const m = createMatch(CONFIG, layout(), BOUNDS, "red");
    const w = worldFor(m, m.players[0]);
    expect(w.soldier.pos).toEqual({ x: -9, y: 0 });
    expect(w.soldier.dir).toBe(1);
    expect(w.targets).toEqual([{ id: "b1", pos: { x: 9, y: 0 }, radius: PLAYER_RADIUS }]);
    expect(w.planets).toHaveLength(1);
  });

  it("playerById finds a player by id and returns undefined for an unknown id", () => {
    const m = createMatch(CONFIG, layout(), BOUNDS, "red");
    expect(playerById(m, "r1")?.id).toBe("r1");
    expect(playerById(m, "nope")).toBeUndefined();
  });
});

describe("beginRound", () => {
  it("respawns players, keeps scores, bumps the round, and sets first shooter", () => {
    let m = createMatch(CONFIG, layout(), BOUNDS, "red");
    m = { ...m, scores: { red: 1, blue: 0 }, round: 1, players: m.players.map((p) => ({ ...p, hp: 0, alive: false })) };

    const next = beginRound(m, layout(), "blue"); // blue (round loser) shoots first
    expect(next.round).toBe(2);
    expect(next.phase).toBe("play");
    expect(next.winner).toBeNull();
    expect(next.scores).toEqual({ red: 1, blue: 0 });
    expect(next.players.every((p) => p.alive && p.hp === 100)).toBe(true);
    expect(next.activePlayerId).toBe("b1"); // firstTeam = blue
  });
});
