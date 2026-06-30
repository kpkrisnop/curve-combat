// src/game/turnQueue.test.ts
import { describe, it, expect } from "vitest";
import { buildTurnQueue, nextActive } from "./turnQueue";
import type { PlayerState } from "./matchState";

function p(id: string, team: "red" | "blue"): PlayerState {
  return { id, name: id, team, pos: { x: 0, y: 0 }, hp: 100, alive: true };
}

describe("buildTurnQueue", () => {
  it("alternates teams starting with firstTeam (1v1)", () => {
    expect(buildTurnQueue([p("r1", "red"), p("b1", "blue")], "red")).toEqual(["r1", "b1"]);
    expect(buildTurnQueue([p("r1", "red"), p("b1", "blue")], "blue")).toEqual(["b1", "r1"]);
  });

  it("snakes through even teams (2v2)", () => {
    const players = [p("r1", "red"), p("r2", "red"), p("b1", "blue"), p("b2", "blue")];
    expect(buildTurnQueue(players, "red")).toEqual(["r1", "b1", "r2", "b2"]);
  });

  it("appends the larger team's trailing players (3 red vs 1 blue)", () => {
    const players = [p("r1", "red"), p("r2", "red"), p("r3", "red"), p("b1", "blue")];
    expect(buildTurnQueue(players, "red")).toEqual(["r1", "b1", "r2", "r3"]);
  });

  it("appends the larger team's trailing players when blue goes first (1 red vs 3 blue)", () => {
    const players = [p("r1", "red"), p("b1", "blue"), p("b2", "blue"), p("b3", "blue")];
    expect(buildTurnQueue(players, "blue")).toEqual(["b1", "r1", "b2", "b3"]);
  });
});

describe("nextActive", () => {
  const queue = ["r1", "b1", "r2", "b2"];

  it("returns the next id, cycling past the end", () => {
    expect(nextActive(queue, "r1", () => true)).toBe("b1");
    expect(nextActive(queue, "b2", () => true)).toBe("r1");
  });

  it("skips dead players", () => {
    const alive = (id: string) => id !== "b1" && id !== "r2";
    expect(nextActive(queue, "r1", alive)).toBe("b2");
  });

  it("returns null when nobody else is alive", () => {
    expect(nextActive(queue, "r1", (id) => id === "r1")).toBe("r1");
    expect(nextActive(queue, "r1", () => false)).toBeNull();
  });
});
