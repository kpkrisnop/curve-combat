# Arena Settings Panel — Design Spec

**Date:** 2026-07-01
**Branch:** `feature/shooting-prototype`
**Status:** Approved design — ready for implementation plan
**Related:** Decision **D4** (planet scatter, `docs/multiplayer-arch/B-decisions.md`),
Architecture **B** (Arena / authoritative server), and forthcoming **D1** (teams).
Supersedes the throwaway `planet-scatter-prototype.html` (delete on integration).

---

## 1. Problem & Goal

The planet-scatter prototype proved out the generator, but it hardcodes the map at
`x∈[-12,12] / y∈[-7,7]` and lives outside the app. We want the **map size** and the
**planet-scatter ranges** to be real, player-adjustable settings that:

- Live in a **settings panel on the home page (lobby)**, with a **live preview**.
- Are **only editable in the lobby**, never mid-game.
- **Inherit to each room** — the settings a player picks become part of *their* room,
  so player A's room can differ from player B's. (Authoritative copy = the room's
  `MatchConfig`, which already serializes to the URL hash.)
- Are built as a **modular** panel so future setting groups slot in later.

This is a standalone, buildable-now feature. Variable names match the eventual
integration so the pure generator drops straight into the online (Architecture B) path.

### Map-size semantics (settled)

The map is a **logical world rectangle `width × height` in world units**, defined in
settings and identical for everyone in a room. The renderer **scales that fixed
rectangle uniformly to fit each player's display** (contain-fit / letterbox) — the
math is **not** expanded to fit the screen. Consequence: geometry (planets, spawns,
relative positions) is identical across devices; only the on-screen pixel size differs.

This replaces today's behavior in `GameRenderer`, where `Y` is hard-fixed at `±7` and
`X` is derived from canvas width (so two players on different screens get different
X-bounds).

---

## 2. Data Model

Three independent setting groups, plus one match-level field. Field/variable names are
the integration names (carried over from the prototype).

```ts
// src/game/matchLogic.ts (extended)

/** Logical playfield rectangle, world units. Authoritative & identical per room. */
interface MapConfig {
  width: number;   // e.g. 24
  height: number;  // e.g. 14
}

/** Planet dart-throw / rejection-sampling parameters. */
interface ScatterConfig {
  rMin: number; rMax: number;        // planet size range (world units)
  gapMin: number; gapMax: number;    // required edge-to-edge gap range (per placement)
  spawnClearance: number;            // keep planets off every muzzle
  fieldMargin: number;               // inset from map edge
  maxPlanets: number;                // hard cap
  // maxAttempts is a non-user-facing constant (MAX_ATTEMPTS = 300)
}

interface MatchConfig {
  mode: "classic" | "hp";
  noTurn: boolean;
  rounds: 3 | 5;
  roomCode?: string;
  role?: "host" | "guest" | "local";
  // ── new ──
  map: MapConfig;
  scatter: ScatterConfig;
  teamSize: 1 | 2 | 3 | 4 | 5;       // match/team setting; fully wired at D1
}
```

**`teamSize`** is a top-level match setting (KP owns full team gameplay at **D1**). In
*this* feature it is a live knob that does exactly one thing: it determines how many
spawn columns per side the scatter must keep clear (and that the preview draws). It does
**not** yet spawn multiple soldiers in-game.

### Defaults & serialization

- **Defaults** (single source of truth, e.g. `DEFAULT_ARENA` in `configRouter.ts` or a
  dedicated `arenaDefaults.ts`): starting values are the prototype's — `map {24×14}`,
  `scatter { rMin 0.8, rMax 2.0, gapMin 0.5, gapMax 2.0, spawnClearance 2.0,
  fieldMargin 0.5, maxPlanets 12 }`, `teamSize 1`. Final tuned values are KP's to set
  in the preview; these are placeholders until then.
- **`configToHash` / `parseConfigFromHash`** gain compact keys for every new field.
  Parsing **validates and clamps** each field to a sane range and **falls back to the
  default** on missing/invalid input (mirrors the existing mode/rounds handling). This
  is what makes settings ride the room link.

---

## 3. Components

### 3a. `src/sim/planetScatter.ts` — pure generator (new, unit-tested)

Ports the prototype's algorithm into the sim layer, typed to `Planet`/`Vec2`/`Bounds`.
No DOM; Node + browser safe (lives in `src/sim` with the other pure modules).

```ts
function mulberry32(seed: number): () => number;

/** Game path — returns just the planets. */
function generatePlanets(
  seed: number, bounds: Bounds, spawns: Vec2[], params: ScatterConfig,
): Planet[];

/** Preview path — same result plus telemetry for the readout. */
function generatePlanetsWithStats(
  seed: number, bounds: Bounds, spawns: Vec2[], params: ScatterConfig,
): { planets: Planet[]; attempts: number };

/** Spawn columns at x = ±(width/2 − spawnInset), teamSize points spread on y. */
function computeSpawns(map: MapConfig, teamSize: number): Vec2[];
```

`generatePlanets` is `generatePlanetsWithStats(...).planets` — one implementation, two
entry points, so the game path never carries preview telemetry.

**Tests (TDD, Vitest):** determinism (same seed+params ⇒ identical array); every planet
clears every spawn by `≥ r + spawnClearance`; every pair separated by `≥ r₁+r₂+gap`;
never exceeds `maxPlanets`; terminates within `maxAttempts`; `computeSpawns` count/positions
for teamSize 1..5.

### 3b. `src/ui/settings/` — modular settings panel

- **`SettingsPanel`** — mounts into a container and renders an ordered list of
  **section** modules. v1 registers two sections (Map, Scatter) + the teamSize control;
  future groups are added by registering another section, no rewrite. Holds the working
  settings object, emits `onChange({ map, scatter, teamSize })`. No game state.
- **Arena sections' controls** = the prototype minus the copy-JSON button and JSON
  textarea. Included: all labels, map `width`/`height` (presets + adjustable sliders),
  `rMin rMax gapMin gapMax spawnClearance fieldMargin maxPlanets`, `teamSize`, seed
  display + **Reroll**, and the **readout log** (planets placed, % coverage, attempts).
  `min ≤ max` enforced for the size and gap pairs.
- **`ArenaPreview`** — a small canvas renderer owned by the panel. Draws the map
  rectangle, both spawn columns (with clearance halos), and planets **to scale using the
  same contain-fit rule the game uses**. On every change it calls
  `generatePlanetsWithStats` + `computeSpawns` from `src/sim` — so the preview is
  faithful by construction, not a lookalike. It is **not** `GameRenderer` (kept
  decoupled from the Pixi/HUD game stack on purpose).

### 3c. Lobby wiring — `LobbyScreen` + `index.html`

`LobbyScreen` instantiates `SettingsPanel`, seeds it from the current `MatchConfig`
defaults, and folds the panel's latest `{ map, scatter, teamSize }` into the
`MatchConfig` it already emits from `handleStart()`. A container for the panel is added
to the lobby markup. **No in-game locking logic needed:** the lobby is hidden during
play and settings are read once at game start.

### 3d. Game integration — `GameRenderer` + `main.ts`

- **`GameRenderer`**: replace `recomputeEffectiveBounds()` with **fit-the-configured-rect**.
  `effectiveBounds = { minX:-width/2, maxX:width/2, minY:-height/2, maxY:height/2 }` from
  `MapConfig`; camera `scale = min(canvasW/width, canvasH/height)`, centered (letterboxed).
  The `HALF_Y = 7` constant becomes config-driven. Renderer takes the `MapConfig` (e.g.
  via `setWorld`/init).
- **`main.ts`**: `seedPlanets()` → `generatePlanets(seed, bounds, computeSpawns(map, teamSize),
  scatter)`. Seed minted locally now (`Math.random()`), server-minted later in B.
  `placePlayersRandomly` and the `x = ±9` spawn constants derive from `map.width` instead.

---

## 4. Data Flow

```
Lobby: SettingsPanel ──onChange({map,scatter,teamSize})──▶ LobbyScreen
                                                              │ handleStart()
                                                              ▼
                                            MatchConfig { …, map, scatter, teamSize }
                                              │                         │
                              configToHash (room link)          buildWorld / renderer init
                                              │                         │
                                              ▼                         ▼
                        parseConfigFromHash (guest / reload)   generatePlanets(seed,
                                                                 bounds, computeSpawns(...),
                                                                 scatter)  ← same sim module
                                                                 the preview used
Preview canvas ◀── generatePlanetsWithStats + computeSpawns (src/sim)  [faithful to game]
```

---

## 5. Boundaries, Isolation, Testing

- **`src/sim/planetScatter.ts`** — pure, fully unit-tested, zero UI/DOM deps. The one
  place the algorithm lives; preview and game both consume it.
- **`src/ui/settings/`** — owns UI + preview; depends on the sim module and a settings
  type; knows nothing about Pixi/`GameRenderer`. Swappable/testable in isolation.
- **`configRouter`** — the serialization boundary; extends existing encode/decode/validate.
  Unit tests: round-trip every field; clamp/fallback on garbage input.
- **`GameRenderer` / `main.ts`** — consume `MapConfig`/`ScatterConfig`; contain the only
  changes to live gameplay.

## 6. Error Handling & Edge Cases

- Invalid/missing hash fields → clamp to range or fall back to default (no crash).
- `min > max` in the panel → clamp on input (existing prototype behavior).
- Over-constrained params (attempts exhausted before `maxPlanets`) → return what was
  placed; preview readout flags "attempts used" so KP sees it while tuning.
- Extreme map sizes → panel slider ranges bound them; renderer contain-fit handles any
  aspect (letterbox), including displays narrower/taller than the map.

## 7. Out of Scope (YAGNI)

- localStorage "remember my last settings" (authoritative copy is the room config).
- Full multi-soldier team gameplay — **D1** (this feature only reserves spawn columns).
- Server seed minting / broadcast — Architecture B integration (seed minted locally now).
- Final visual/layout polish of the panel — explicitly the **last** step after all
  functional parts land.

## 8. Deliverables

1. `src/sim/planetScatter.ts` (+ tests) — pure generator, spawn helper.
2. `MapConfig` / `ScatterConfig` / `teamSize` on `MatchConfig`; `configRouter` serialization (+ tests).
3. `src/ui/settings/` modular panel + `ArenaPreview`; wired into `LobbyScreen` / `index.html`.
4. `GameRenderer` contain-fit bounds + `main.ts` using the generator.
5. Delete `planet-scatter-prototype.html`, `.NOTES.md`, and scratch screenshot on completion.
