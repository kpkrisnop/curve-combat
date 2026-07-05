// src/game/localLayout.ts
import type { Bounds } from "../sim/types";
import type { RoundLayout, PlayerState } from "./matchState";
import type { MatchConfig } from "./matchLogic";
import { generatePlanets, computeSpawns } from "../sim/planetScatter";

/**
 * Local hot-seat layout (Decision D4): one player per team, and a seeded planet
 * scatter generated from the room's ArenaConfig. Player spawns are seed-driven and
 * randomized within the configured per-side zone (always mirror-symmetric), so a
 * reroll moves players too. A fresh seed is minted per round (the authoritative
 * server will mint it instead in online play).
 */
export function buildLocalLayout(bounds: Bounds, config: MatchConfig, seed?: number): RoundLayout {
  const layoutSeed = seed ?? (Math.random() * 0xffffffff) >>> 0;
  const spawns = computeSpawns(config.map, config.teamSize, config.scatter, layoutSeed);
  const planets = generatePlanets(layoutSeed, bounds, spawns, config.scatter);

  const left = spawns.find((s) => s.x < 0)!;
  const right = spawns.find((s) => s.x > 0)!;
  const players: PlayerState[] = [
    { id: "r1", name: "RED", team: "red", pos: { ...left }, hp: 100, alive: true },
    { id: "b1", name: "BLUE", team: "blue", pos: { ...right }, hp: 100, alive: true },
  ];
  return { players, planets };
}
