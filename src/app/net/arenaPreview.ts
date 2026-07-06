// src/app/net/arenaPreview.ts
//
// Client-side mirror of the server's round-1 planet + spawn layout.
// PARITY CONTRACT: buildArenaPreview must produce the IDENTICAL planet array that
// MatchEngine.layout() (server/matchEngine.ts) would produce for the same seed,
// map, and scatter config.  localLayout.buildLocalLayout (src/game/localLayout.ts)
// uses the same generatePlanets call with the same argument order — that is the
// established pattern this function mirrors exactly.
//
// If any of those three call sites diverge (e.g. bounds, spawn ordering), the
// waiting-room terrain preview will not match the in-game arena.

import type { MapConfig, ScatterConfig } from "../../game/matchLogic";
import type { RoundLayout, PlayerState } from "../../game/matchState";
import { generatePlanets, computeSpawns, boundsFromMap } from "../../sim/planetScatter";

/**
 * Build a deterministic round-1 preview layout from config + seed + player counts.
 *
 * Algorithm (mirrors MatchEngine.layout and localLayout.buildLocalLayout):
 *   1. boundsFromMap(config.map)
 *   2. teamSize = max(counts.red, counts.blue, 1)     ← enough spawn slots for the larger side
 *   3. computeSpawns(config.map, teamSize, config.scatter, seed) ← seeded, interleaved left/right pairs
 *   4. generatePlanets(seed, bounds, spawns, config.scatter)  ← deterministic PRNG scatter
 *   5. Deal left-spawns to red players (in spawn order), right-spawns to blue players.
 *
 * Same inputs → identical output every call (no Math.random, no side-effects).
 */
export function buildArenaPreview(
  config: { map: MapConfig; scatter: ScatterConfig },
  seed: number,
  counts: { red: number; blue: number },
): RoundLayout {
  // Step 1-4: mirrors MatchEngine.layout / buildLocalLayout exactly
  const bounds = boundsFromMap(config.map);
  const teamSize = Math.max(counts.red, counts.blue, 1) as 1 | 2 | 3 | 4 | 5;
  const spawns = computeSpawns(config.map, teamSize, config.scatter, seed);
  const planets = generatePlanets(seed, bounds, spawns, config.scatter);

  // Step 5: separate left (x<0) and right (x>0) spawn columns, then deal in order.
  // MatchEngine.layout iterates this.players and picks left[li++] for "red", right[ri++] for "blue".
  // We replicate that pattern with synthetic placeholder ids (r1…/b1…).
  const left = spawns.filter((s) => s.x < 0);
  const right = spawns.filter((s) => s.x > 0);

  const players: PlayerState[] = [];
  for (let i = 0; i < counts.red; i++) {
    players.push({
      id: `r${i + 1}`,
      name: `RED${counts.red > 1 ? i + 1 : ""}`,
      team: "red",
      pos: { ...left[i] },
      hp: 100,
      alive: true,
    });
  }
  for (let i = 0; i < counts.blue; i++) {
    players.push({
      id: `b${i + 1}`,
      name: `BLUE${counts.blue > 1 ? i + 1 : ""}`,
      team: "blue",
      pos: { ...right[i] },
      hp: 100,
      alive: true,
    });
  }

  return { players, planets };
}
