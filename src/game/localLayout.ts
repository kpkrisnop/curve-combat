// src/game/localLayout.ts
import type { Bounds } from "../sim/types";
import type { RoundLayout, PlayerState } from "./matchState";
import type { MatchConfig } from "./matchLogic";
import { generatePlanets, computeSpawns } from "../sim/planetScatter";

/** Pick a random element. */
function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

/**
 * Local hot-seat layout (Decision D4): one player per team, and a seeded planet
 * scatter generated from the room's ArenaConfig. Players sit on reserved spawn
 * columns, so they are always clear of planets. A fresh seed is minted per round
 * (the authoritative server will mint it instead in online play).
 */
export function buildLocalLayout(bounds: Bounds, config: MatchConfig): RoundLayout {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const spawns = computeSpawns(config.map, config.teamSize);
  const planets = generatePlanets(seed, bounds, spawns, config.scatter);

  const left = spawns.filter((s) => s.x < 0);
  const right = spawns.filter((s) => s.x > 0);
  const players: PlayerState[] = [
    { id: "r1", name: "RED", team: "red", pos: { ...pick(left) }, hp: 100, alive: true },
    { id: "b1", name: "BLUE", team: "blue", pos: { ...pick(right) }, hp: 100, alive: true },
  ];
  return { players, planets };
}
