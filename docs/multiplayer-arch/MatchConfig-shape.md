# MatchConfig — final shape (for the backbone/server session)

**Owner:** front-end/settings track. **Consumers:** authoritative-server (Architecture B).
**Status as of:** 2026-07-01, branch `feature/design-foundation-arena-panel`.

Per the coordination contract: the front-end owns the gameplay extensions below;
the server adds only networking fields and consumes this shape as-is. It stays
**additive and fully serializable through `configRouter`**.

## Current shape

```ts
// src/game/matchLogic.ts
export interface MapConfig { width: number; height: number }   // world units

export interface ScatterConfig {
  rMin: number; rMax: number;        // planet size range (world units)
  gapMin: number; gapMax: number;    // required edge-to-edge gap range
  spawnClearance: number;            // keep planets off every muzzle
  fieldMargin: number;               // inset from map edge
  maxPlanets: number;                // hard cap
}

export interface MatchConfig {
  mode: "classic" | "hp";
  noTurn: boolean;
  rounds: 3 | 5;
  roomCode?: string;                 // networking — server-owned
  role?: "host" | "guest" | "local"; // networking — server-owned
  // ── gameplay extensions (front-end owned) ──
  map: MapConfig;
  scatter: ScatterConfig;
  teamSize: 1 | 2 | 3 | 4 | 5;       // spawn columns per side; full team play = D1
}
```

## Serialization (already implemented)

`configToHash(config)` / `parseConfigFromHash(hash)` in `src/game/configRouter.ts`
round-trip every field. Hash keys for the new fields:

```
&w=<width>&h=<height>
&rmn=<rMin>&rmx=<rMax>&gmn=<gapMin>&gmx=<gapMax>
&sc=<spawnClearance>&fm=<fieldMargin>&mp=<maxPlanets>&ts=<teamSize>
```

`parseConfigFromHash` **validates + clamps** each field and falls back to
`arenaDefaults()` on missing/invalid input, so a malformed or partial room link
never crashes — safe for the server to accept client-proposed hashes.

## Defaults & the generator (server should reuse these, not re-derive)

- Defaults: `src/game/arenaDefaults.ts` — `arenaDefaults()`, `DEFAULT_MAP`,
  `DEFAULT_SCATTER`, `DEFAULT_TEAM_SIZE`, `MAX_ATTEMPTS`.
- Pure, deterministic planet generator: `src/sim/planetScatter.ts` —
  `generatePlanets(seed, bounds, spawns, scatter)`, `computeSpawns(map, teamSize)`,
  `boundsFromMap(map)`. Node + browser safe. **The server mints the per-round
  `seed` and broadcasts the resulting `Planet[]`; clients render what they receive.**
  Local play currently mints the seed in `buildLocalLayout` (`src/game/localLayout.ts`).

## For the server

- Treat `map`/`scatter`/`teamSize` as authoritative room state; broadcast alongside
  `roomCode`/`role`. Do not add fields inside `MapConfig`/`ScatterConfig` without
  coordinating (they are serialized positionally-by-key in the hash).
- To regenerate a round server-side: `generatePlanets(seed, boundsFromMap(map),
  computeSpawns(map, teamSize), scatter)`.
