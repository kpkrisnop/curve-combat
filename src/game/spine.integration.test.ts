// src/game/spine.integration.test.ts
import { describe, it, expect } from "vitest";
import { createMatch, beginRound } from "./matchState";
import { resolveFire } from "./resolveFire";
import { buildLocalLayout } from "./localLayout";
import { arenaDefaults } from "./arenaDefaults";

const BOUNDS = { minX: -12, minY: -7, maxX: 12, maxY: 7 };

describe("local layout", () => {
  it("buildLocalLayout yields one red and one blue player and the planet field", () => {
    const l = buildLocalLayout(BOUNDS, { mode: "classic", rounds: 3, noTurn: false, role: "local", ...arenaDefaults() });
    expect(l.players.map((p) => p.team).sort()).toEqual(["blue", "red"]);
    expect(l.players.find((p) => p.team === "red")!.pos.x).toBeLessThan(0);
    expect(l.players.find((p) => p.team === "blue")!.pos.x).toBeGreaterThan(0);
    expect(l.planets.length).toBeGreaterThan(0);
  });
});

describe("full Classic round through the spine", () => {
  it("red's flat shot wins the round and a second round can begin", () => {
    // Fixed positions so a y=0 shot connects (don't use random layout here).
    const layout = {
      players: [
        { id: "r1", name: "RED", team: "red" as const, pos: { x: -9, y: 0 }, hp: 100, alive: true },
        { id: "b1", name: "BLUE", team: "blue" as const, pos: { x: 9, y: 0 }, hp: 100, alive: true },
      ],
      planets: [],
    };
    const m = createMatch({ mode: "classic", rounds: 3, noTurn: false, role: "local", ...arenaDefaults() }, layout, BOUNDS, "red");
    const res = resolveFire(m, { playerId: "r1", latex: "0" });
    expect(res.roundEnded).toBe(true);
    expect(res.next.scores).toEqual({ red: 1, blue: 0 });

    const r2 = beginRound(res.next, layout, "blue");
    expect(r2.round).toBe(2);
    expect(r2.activePlayerId).toBe("b1");
  });
});
