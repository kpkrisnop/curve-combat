// src/game/resolveFire.test.ts
import { describe, it, expect } from "vitest";
import { resolveFire } from "./resolveFire";
import { createMatch } from "./matchState";
import type { RoundLayout, PlayerState } from "./matchState";
import type { MatchConfig } from "./matchLogic";

const BOUNDS = { minX: -12, minY: -7, maxX: 12, maxY: 7 };
const CLASSIC: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local" };

// red at x=-9, blue at x=9; a planet dead-centre blocks a flat shot.
function duel(planetAtCentre = false): RoundLayout {
  const players: PlayerState[] = [
    { id: "r1", name: "R1", team: "red", pos: { x: -9, y: 0 }, hp: 100, alive: true },
    { id: "b1", name: "B1", team: "blue", pos: { x: 9, y: 0 }, hp: 100, alive: true },
  ];
  const planets = planetAtCentre
    ? [{ id: "p1", pos: { x: 0, y: 0 }, radius: 1.5, craters: [] }]
    : [];
  return { players, planets };
}

// red vs a blue team of two; b1 sits on the x-axis, b2 well off it.
function oneVsTwo(): RoundLayout {
  const players: PlayerState[] = [
    { id: "r1", name: "R1", team: "red", pos: { x: -9, y: 0 }, hp: 100, alive: true },
    { id: "b1", name: "B1", team: "blue", pos: { x: 9, y: 0 }, hp: 100, alive: true },
    { id: "b2", name: "B2", team: "blue", pos: { x: 9, y: 3 }, hp: 100, alive: true },
  ];
  return { players, planets: [] };
}

describe("resolveFire guards", () => {
  it("rejects firing when it isn't your turn", () => {
    const m = createMatch(CLASSIC, duel(), BOUNDS, "red");
    const res = resolveFire(m, { playerId: "b1", latex: "0" });
    expect(res.rejected).toBe("not-active");
    expect(res.shot).toBeNull();
    expect(res.next).toBe(m); // unchanged reference
  });

  it("rejects an unplottable function without consuming the turn", () => {
    const m = createMatch(CLASSIC, duel(), BOUNDS, "red");
    const res = resolveFire(m, { playerId: "r1", latex: "\\sin(" });
    expect(res.rejected).toBe("bad-function");
    expect(res.next).toBe(m); // rejected → input state returned by reference
    expect(res.next.activePlayerId).toBe("r1"); // still red's turn
  });
});

describe("resolveFire — miss and planet", () => {
  it("a miss (off the field) advances the turn to the enemy", () => {
    const m = createMatch(CLASSIC, duel(), BOUNDS, "red");
    const res = resolveFire(m, { playerId: "r1", latex: "x^2" }); // arcs off top
    expect(res.shot!.hit.kind).toBe("bounds");
    expect(res.roundEnded).toBe(false);
    expect(res.next.activePlayerId).toBe("b1");
  });

  it("hitting a planet carves a crater immutably and advances the turn", () => {
    const m = createMatch(CLASSIC, duel(true), BOUNDS, "red");
    const res = resolveFire(m, { playerId: "r1", latex: "0" }); // flat into centre planet
    expect(res.shot!.hit.kind).toBe("planet");
    expect(res.next.planets[0].craters).toHaveLength(1);
    expect(m.planets[0].craters).toHaveLength(0); // original untouched
    expect(res.next.activePlayerId).toBe("b1");
  });
});

describe("resolveFire — Classic elimination", () => {
  it("a flat shot through the enemy eliminates them and ends the round", () => {
    const m = createMatch(CLASSIC, duel(), BOUNDS, "red");
    const res = resolveFire(m, { playerId: "r1", latex: "0" });
    expect(res.shot!.hit.kind).toBe("target");
    expect(res.eliminatedId).toBe("b1");
    expect(res.roundEnded).toBe(true);
    expect(res.roundLoser).toBe("blue");
    expect(res.next.scores).toEqual({ red: 1, blue: 0 });
    expect(res.next.phase).toBe("between"); // not yet match point in best-of-3
    expect(res.matchEnded).toBe(false);
  });

  it("reaching the round majority ends the match with a winner", () => {
    let m = createMatch(CLASSIC, duel(), BOUNDS, "red");
    m = { ...m, scores: { red: 1, blue: 0 } }; // red one round from winning bo3
    const res = resolveFire(m, { playerId: "r1", latex: "0" });
    expect(res.matchEnded).toBe(true);
    expect(res.next.phase).toBe("over");
    expect(res.next.winner).toBe("red");
    expect(res.next.scores).toEqual({ red: 2, blue: 0 });
  });

  it("eliminating one of two enemies does NOT end the round (team-generic)", () => {
    const m = createMatch(CLASSIC, oneVsTwo(), BOUNDS, "red");
    const res = resolveFire(m, { playerId: "r1", latex: "0" }); // flat shot hits b1 on the axis
    expect(res.eliminatedId).toBe("b1");
    expect(res.roundEnded).toBe(false);
    expect(res.next.players.find((p) => p.id === "b1")!.alive).toBe(false);
    expect(res.next.players.find((p) => p.id === "b2")!.alive).toBe(true);
    expect(res.next.scores).toEqual({ red: 0, blue: 0 });
  });
});
