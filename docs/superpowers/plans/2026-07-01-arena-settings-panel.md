# Arena Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make map size and planet-scatter ranges player-adjustable settings, edited in a modular lobby settings panel with a live preview, carried per-room via `MatchConfig`, and consumed by both the preview and the real game through one shared pure generator.

**Architecture:** A pure generator (`src/sim/planetScatter.ts`) is the single source of planet layout, used by the lobby preview and the game alike. Settings are three groups (`MapConfig`, `ScatterConfig`, top-level `teamSize`) on `MatchConfig`, serialized through the existing `configRouter` URL-hash mechanism so they inherit to each room. The map is a logical world rectangle that the renderer scales uniformly to fit the display (contain-fit), replacing today's screen-derived bounds. The settings UI is a decoupled module that never touches Pixi/`GameRenderer`.

**Tech Stack:** TypeScript, Vite, Vitest, Pixi.js (game renderer only), plain DOM + Canvas 2D (settings panel + preview).

## Global Constraints

- `src/sim/*` is **pure** — no DOM, no Pixi, no browser globals. Node + browser safe.
- Variable names are the integration names; do not rename between preview and game.
- `maxAttempts` is a non-user-facing constant `MAX_ATTEMPTS = 300`.
- TDD for every pure module (`src/sim`, `configRouter`, pure helpers). UI tasks unit-test their pure helpers and verify DOM manually.
- Test runner: `npm test` (`vitest run`); single file: `npx vitest run <path>`.
- Commit after each task. Branch: `feature/shooting-prototype`.
- Defaults live in ONE place (`src/game/arenaDefaults.ts`) and are imported everywhere — DRY.

---

### Task 1: Settings types + centralized defaults

**Files:**
- Modify: `src/game/matchLogic.ts` (add `MapConfig`, `ScatterConfig`, extend `MatchConfig`)
- Create: `src/game/arenaDefaults.ts`
- Modify: `src/game/main.ts:27` (default `matchConfig` literal)
- Modify: `src/ui/LobbyScreen.ts:57-64` (`handleStart` literal)
- Modify: `src/game/configRouter.ts:3-8` (`DEFAULT_CONFIG` literal)

**Interfaces:**
- Produces:
  - `interface MapConfig { width: number; height: number }`
  - `interface ScatterConfig { rMin: number; rMax: number; gapMin: number; gapMax: number; spawnClearance: number; fieldMargin: number; maxPlanets: number }`
  - `MatchConfig` gains `map: MapConfig; scatter: ScatterConfig; teamSize: 1|2|3|4|5`
  - `DEFAULT_MAP: MapConfig`, `DEFAULT_SCATTER: ScatterConfig`, `DEFAULT_TEAM_SIZE`, `MAX_ATTEMPTS`, and `arenaDefaults()` returning fresh copies.

- [ ] **Step 1: Add the types to `matchLogic.ts`**

Insert above `export interface MatchConfig`:

```ts
/** Logical playfield rectangle in world units. Identical for everyone in a room. */
export interface MapConfig {
  width: number;
  height: number;
}

/** Planet rejection-sampling parameters. */
export interface ScatterConfig {
  rMin: number;
  rMax: number;
  gapMin: number;
  gapMax: number;
  spawnClearance: number;
  fieldMargin: number;
  maxPlanets: number;
}
```

Extend `MatchConfig` (keep existing fields, add three):

```ts
export interface MatchConfig {
  mode: "classic" | "hp";
  noTurn: boolean;
  rounds: 3 | 5;
  roomCode?: string;
  role?: "host" | "guest" | "local";
  map: MapConfig;
  scatter: ScatterConfig;
  teamSize: 1 | 2 | 3 | 4 | 5;
}
```

- [ ] **Step 2: Create `src/game/arenaDefaults.ts`**

```ts
import type { MapConfig, ScatterConfig } from "./matchLogic";

/** Dart-throw budget — not user-facing. */
export const MAX_ATTEMPTS = 300;

export const DEFAULT_MAP: MapConfig = { width: 24, height: 14 };

export const DEFAULT_SCATTER: ScatterConfig = {
  rMin: 0.8,
  rMax: 2.0,
  gapMin: 0.5,
  gapMax: 2.0,
  spawnClearance: 2.0,
  fieldMargin: 0.5,
  maxPlanets: 12,
};

export const DEFAULT_TEAM_SIZE: 1 | 2 | 3 | 4 | 5 = 1;

/** Fresh, independent copies of the arena defaults (never share references). */
export function arenaDefaults(): {
  map: MapConfig;
  scatter: ScatterConfig;
  teamSize: 1 | 2 | 3 | 4 | 5;
} {
  return {
    map: { ...DEFAULT_MAP },
    scatter: { ...DEFAULT_SCATTER },
    teamSize: DEFAULT_TEAM_SIZE,
  };
}
```

- [ ] **Step 3: Update the three `MatchConfig` literals to include the new fields**

`src/game/configRouter.ts` — replace `DEFAULT_CONFIG`:

```ts
import type { MatchConfig } from "./matchLogic";
import { arenaDefaults } from "./arenaDefaults";

const DEFAULT_CONFIG: MatchConfig = {
  mode: "classic",
  rounds: 3,
  noTurn: false,
  role: "local",
  ...arenaDefaults(),
};
```

`src/game/main.ts:27` — replace the inline literal:

```ts
import { arenaDefaults } from "./arenaDefaults";
// ...
let matchConfig: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local", ...arenaDefaults() };
```

`src/ui/LobbyScreen.ts` — in `handleStart()`, spread defaults for now (real panel values wired in Task 6):

```ts
import { arenaDefaults } from "../game/arenaDefaults";
// ...
private handleStart(): void {
  const config: MatchConfig = {
    mode: this.selectedMode,
    rounds: this.selectedRounds,
    noTurn: this.noTurnCheckbox.checked,
    role: "local",
    ...arenaDefaults(),
  };
  this.startCb?.(config);
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 5: Run the existing suite to see the configRouter tests break**

Run: `npm test`
Expected: `configRouter` tests FAIL (hash now includes new fields / `toEqual` mismatch). This is expected — Task 3 fixes them. All other suites PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/matchLogic.ts src/game/arenaDefaults.ts src/game/configRouter.ts src/game/main.ts src/ui/LobbyScreen.ts
git commit -m "feat(config): add MapConfig/ScatterConfig/teamSize to MatchConfig with centralized defaults"
```

---

### Task 2: Pure planet generator `src/sim/planetScatter.ts`

**Files:**
- Create: `src/sim/planetScatter.ts`
- Test: `src/sim/planetScatter.test.ts`

**Interfaces:**
- Consumes: `ScatterConfig`, `MapConfig` (from `../game/matchLogic`); `Planet`, `Vec2`, `Bounds` (from `./types`); `MAX_ATTEMPTS` (from `../game/arenaDefaults`).
- Produces:
  - `mulberry32(seed: number): () => number`
  - `boundsFromMap(map: MapConfig): Bounds` — `{ minX:-w/2, maxX:w/2, minY:-h/2, maxY:h/2 }`
  - `computeSpawns(map: MapConfig, teamSize: number): Vec2[]`
  - `generatePlanetsWithStats(seed, bounds, spawns, params): { planets: Planet[]; attempts: number }`
  - `generatePlanets(seed, bounds, spawns, params): Planet[]`
  - `SPAWN_INSET = 3` (edge inset of spawn columns, world units)

- [ ] **Step 1: Write the failing test file**

```ts
import { describe, it, expect } from "vitest";
import {
  mulberry32, boundsFromMap, computeSpawns,
  generatePlanets, generatePlanetsWithStats, SPAWN_INSET,
} from "./planetScatter";
import { DEFAULT_MAP, DEFAULT_SCATTER } from "../game/arenaDefaults";
import type { Vec2 } from "./types";

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("returns values in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe("boundsFromMap", () => {
  it("centers the rectangle on the origin", () => {
    expect(boundsFromMap({ width: 24, height: 14 })).toEqual({ minX: -12, maxX: 12, minY: -7, maxY: 7 });
  });
});

describe("computeSpawns", () => {
  it("places one spawn per side at the center for teamSize 1", () => {
    const s = computeSpawns({ width: 24, height: 14 }, 1);
    expect(s).toHaveLength(2);
    expect(s).toContainEqual({ x: -(12 - SPAWN_INSET), y: 0 });
    expect(s).toContainEqual({ x: 12 - SPAWN_INSET, y: 0 });
  });
  it("places teamSize spawns per side spread along y", () => {
    const s = computeSpawns({ width: 24, height: 14 }, 5);
    expect(s).toHaveLength(10);
    const leftYs = s.filter(p => p.x < 0).map(p => p.y);
    expect(Math.min(...leftYs)).toBeCloseTo(-6); // minY + 1
    expect(Math.max(...leftYs)).toBeCloseTo(6);  // maxY - 1
  });
});

describe("generatePlanets", () => {
  const map = DEFAULT_MAP, bounds = boundsFromMap(map);
  const spawns = computeSpawns(map, 5);

  it("is deterministic for same seed + params", () => {
    const a = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    const b = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    expect(a).toEqual(b);
  });
  it("keeps every planet clear of every spawn muzzle", () => {
    const ps = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    for (const p of ps) for (const s of spawns)
      expect(dist(p.pos, s)).toBeGreaterThanOrEqual(p.radius + DEFAULT_SCATTER.spawnClearance - 1e-9);
  });
  it("keeps every planet pair separated by at least their radii (gap >= 0)", () => {
    const ps = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
      expect(dist(ps[i].pos, ps[j].pos)).toBeGreaterThanOrEqual(ps[i].radius + ps[j].radius - 1e-9);
  });
  it("never exceeds maxPlanets", () => {
    const ps = generatePlanets(123, bounds, spawns, { ...DEFAULT_SCATTER, maxPlanets: 4 });
    expect(ps.length).toBeLessThanOrEqual(4);
  });
  it("assigns unique ids and empty craters", () => {
    const ps = generatePlanets(123, bounds, spawns, DEFAULT_SCATTER);
    expect(new Set(ps.map(p => p.id)).size).toBe(ps.length);
    for (const p of ps) expect(p.craters).toEqual([]);
  });
});

describe("generatePlanetsWithStats", () => {
  it("returns attempts and matches generatePlanets", () => {
    const map = DEFAULT_MAP, bounds = boundsFromMap(map), spawns = computeSpawns(map, 1);
    const { planets, attempts } = generatePlanetsWithStats(9, bounds, spawns, DEFAULT_SCATTER);
    expect(attempts).toBeGreaterThan(0);
    expect(attempts).toBeLessThanOrEqual(300);
    expect(planets).toEqual(generatePlanets(9, bounds, spawns, DEFAULT_SCATTER));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sim/planetScatter.test.ts`
Expected: FAIL — cannot resolve `./planetScatter`.

- [ ] **Step 3: Implement `src/sim/planetScatter.ts`**

```ts
import type { Bounds, Planet, Vec2 } from "./types";
import type { MapConfig, ScatterConfig } from "../game/matchLogic";
import { MAX_ATTEMPTS } from "../game/arenaDefaults";

/** Edge inset of the spawn columns from the left/right map walls (world units). */
export const SPAWN_INSET = 3;

/** Deterministic 32-bit PRNG. Same seed ⇒ same uniform [0,1) stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Origin-centered bounds for a logical map rectangle. */
export function boundsFromMap(map: MapConfig): Bounds {
  return { minX: -map.width / 2, maxX: map.width / 2, minY: -map.height / 2, maxY: map.height / 2 };
}

/** Spawn columns at x = ±(width/2 − SPAWN_INSET), `teamSize` points spread along y. */
export function computeSpawns(map: MapConfig, teamSize: number): Vec2[] {
  const b = boundsFromMap(map);
  const yLo = b.minY + 1, yHi = b.maxY - 1;
  const x = b.maxX - SPAWN_INSET;
  const pts: Vec2[] = [];
  for (let i = 0; i < teamSize; i++) {
    const t = teamSize === 1 ? 0.5 : i / (teamSize - 1);
    const y = yLo + t * (yHi - yLo);
    pts.push({ x: -x, y }, { x, y });
  }
  return pts;
}

/**
 * Free-scatter planet generator (Decision D4). Pure & deterministic.
 * Rejection sampling until `maxPlanets` accepted or `MAX_ATTEMPTS` exhausted.
 */
export function generatePlanetsWithStats(
  seed: number, bounds: Bounds, spawns: Vec2[], params: ScatterConfig,
): { planets: Planet[]; attempts: number } {
  const { rMin, rMax, gapMin, gapMax, spawnClearance, fieldMargin, maxPlanets } = params;
  const rng = mulberry32(seed);
  const planets: Planet[] = [];
  let attempts = 0;

  while (planets.length < maxPlanets && attempts < MAX_ATTEMPTS) {
    attempts++;
    const r = rMin + rng() * (rMax - rMin);
    const lo = fieldMargin + r;
    const x = (bounds.minX + lo) + rng() * ((bounds.maxX - lo) - (bounds.minX + lo));
    const y = (bounds.minY + lo) + rng() * ((bounds.maxY - lo) - (bounds.minY + lo));
    const pos: Vec2 = { x, y };

    let bad = false;
    for (const s of spawns) {
      if (Math.hypot(pos.x - s.x, pos.y - s.y) < r + spawnClearance) { bad = true; break; }
    }
    if (bad) continue;

    const gap = gapMin + rng() * (gapMax - gapMin);
    for (const p of planets) {
      if (Math.hypot(pos.x - p.pos.x, pos.y - p.pos.y) < r + p.radius + gap) { bad = true; break; }
    }
    if (bad) continue;

    planets.push({ id: "p" + (planets.length + 1), pos, radius: r, craters: [] });
  }
  return { planets, attempts };
}

/** Game path: planets only. */
export function generatePlanets(
  seed: number, bounds: Bounds, spawns: Vec2[], params: ScatterConfig,
): Planet[] {
  return generatePlanetsWithStats(seed, bounds, spawns, params).planets;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/sim/planetScatter.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/sim/planetScatter.ts src/sim/planetScatter.test.ts
git commit -m "feat(sim): pure seeded planet-scatter generator + spawn helper (D4)"
```

---

### Task 3: Serialize arena settings through `configRouter`

**Files:**
- Modify: `src/game/configRouter.ts`
- Modify: `src/game/configRouter.test.ts`

**Interfaces:**
- Consumes: `MapConfig`, `ScatterConfig`, `MatchConfig`; `arenaDefaults`, `DEFAULT_MAP`, `DEFAULT_SCATTER`, `DEFAULT_TEAM_SIZE`.
- Produces: updated `configToHash` (appends `w,h,rmn,rmx,gmn,gmx,sc,fm,mp,ts` keys) and `parseConfigFromHash` (reads + clamps them, falling back to defaults). Adds `clampNum(raw, min, max, fallback)` helper (not exported).

- [ ] **Step 1: Update the existing tests to expect the new hash + add clamp/fallback tests**

Replace the body of `src/game/configRouter.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { parseConfigFromHash, configToHash } from "./configRouter";
import type { MatchConfig } from "./matchLogic";
import { arenaDefaults } from "./arenaDefaults";

const DEFAULT: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local", ...arenaDefaults() };
const ARENA_HASH = "&w=24&h=14&rmn=0.8&rmx=2&gmn=0.5&gmx=2&sc=2&fm=0.5&mp=12&ts=1";

describe("configToHash", () => {
  it("encodes classic 3-round default config with arena fields", () => {
    expect(configToHash(DEFAULT)).toBe("#game?mode=classic&rounds=3&noTurn=false" + ARENA_HASH);
  });
});

describe("parseConfigFromHash", () => {
  it("round-trips the default config", () => {
    expect(parseConfigFromHash(configToHash(DEFAULT))).toEqual(DEFAULT);
  });
  it("parses custom arena fields", () => {
    const hash = "#game?mode=hp&rounds=5&noTurn=true&w=30&h=18&rmn=1&rmx=3&gmn=1&gmx=4&sc=2.5&fm=1&mp=8&ts=3";
    expect(parseConfigFromHash(hash)).toEqual({
      mode: "hp", rounds: 5, noTurn: true, role: "local",
      map: { width: 30, height: 18 },
      scatter: { rMin: 1, rMax: 3, gapMin: 1, gapMax: 4, spawnClearance: 2.5, fieldMargin: 1, maxPlanets: 8 },
      teamSize: 3,
    });
  });
  it("falls back to arena defaults when arena fields are missing", () => {
    expect(parseConfigFromHash("#game?mode=classic&rounds=3&noTurn=false")).toEqual(DEFAULT);
  });
  it("clamps out-of-range and non-numeric arena fields to defaults/bounds", () => {
    const hash = "#game?mode=classic&rounds=3&noTurn=false&w=9999&h=abc&mp=-4&ts=99";
    const cfg = parseConfigFromHash(hash);
    expect(cfg.map.width).toBeLessThanOrEqual(60);   // clamped to max
    expect(cfg.map.height).toBe(14);                 // non-numeric → default
    expect(cfg.scatter.maxPlanets).toBeGreaterThanOrEqual(1); // clamped to min
    expect(cfg.teamSize).toBe(5);                    // clamped to max team
  });
  it("ignores non-#game hashes", () => {
    expect(parseConfigFromHash("#lobby")).toEqual(DEFAULT);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/configRouter.test.ts`
Expected: FAIL (hash lacks arena fields; parse ignores them).

- [ ] **Step 3: Rewrite `src/game/configRouter.ts`**

```ts
import type { MatchConfig } from "./matchLogic";
import { arenaDefaults, DEFAULT_MAP, DEFAULT_SCATTER } from "./arenaDefaults";

const DEFAULT_CONFIG: MatchConfig = {
  mode: "classic", rounds: 3, noTurn: false, role: "local", ...arenaDefaults(),
};

/** Trim trailing zeros so 2.0 → "2" (keeps hashes short and stable for tests). */
function n(v: number): string {
  return String(Number(v.toFixed(4)));
}

/** Encode a MatchConfig into a URL hash string. */
export function configToHash(c: MatchConfig): string {
  const { map, scatter, teamSize } = c;
  return (
    `#game?mode=${c.mode}&rounds=${c.rounds}&noTurn=${c.noTurn}` +
    `&w=${n(map.width)}&h=${n(map.height)}` +
    `&rmn=${n(scatter.rMin)}&rmx=${n(scatter.rMax)}` +
    `&gmn=${n(scatter.gapMin)}&gmx=${n(scatter.gapMax)}` +
    `&sc=${n(scatter.spawnClearance)}&fm=${n(scatter.fieldMargin)}` +
    `&mp=${scatter.maxPlanets}&ts=${teamSize}`
  );
}

/** Parse a raw param to a number clamped to [min,max], falling back on garbage. */
function clampNum(raw: string | null, min: number, max: number, fallback: number): number {
  const v = Number(raw);
  if (raw === null || raw === "" || Number.isNaN(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/**
 * Parse a URL hash string into a MatchConfig.
 * Falls back to defaults for missing/invalid values. Only "#game" hashes.
 */
export function parseConfigFromHash(hash: string): MatchConfig {
  if (!hash.startsWith("#game")) return { ...DEFAULT_CONFIG, ...arenaDefaults() };
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return { ...DEFAULT_CONFIG, ...arenaDefaults() };

  const p = new URLSearchParams(hash.slice(qIdx + 1));
  const mode: MatchConfig["mode"] = p.get("mode") === "hp" ? "hp" : "classic";
  const rounds: MatchConfig["rounds"] = Number(p.get("rounds")) === 5 ? 5 : 3;
  const noTurn = p.get("noTurn") === "true";

  const map = {
    width: clampNum(p.get("w"), 8, 60, DEFAULT_MAP.width),
    height: clampNum(p.get("h"), 6, 40, DEFAULT_MAP.height),
  };
  const scatter = {
    rMin: clampNum(p.get("rmn"), 0.3, 4, DEFAULT_SCATTER.rMin),
    rMax: clampNum(p.get("rmx"), 0.3, 4, DEFAULT_SCATTER.rMax),
    gapMin: clampNum(p.get("gmn"), 0, 6, DEFAULT_SCATTER.gapMin),
    gapMax: clampNum(p.get("gmx"), 0, 6, DEFAULT_SCATTER.gapMax),
    spawnClearance: clampNum(p.get("sc"), 0, 5, DEFAULT_SCATTER.spawnClearance),
    fieldMargin: clampNum(p.get("fm"), 0, 3, DEFAULT_SCATTER.fieldMargin),
    maxPlanets: Math.round(clampNum(p.get("mp"), 1, 24, DEFAULT_SCATTER.maxPlanets)),
  };
  const teamSize = Math.round(clampNum(p.get("ts"), 1, 5, arenaDefaults().teamSize)) as 1 | 2 | 3 | 4 | 5;

  return { mode, rounds, noTurn, role: "local", map, scatter, teamSize };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/game/configRouter.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (all suites green again).

- [ ] **Step 6: Commit**

```bash
git add src/game/configRouter.ts src/game/configRouter.test.ts
git commit -m "feat(config): serialize map/scatter/teamSize in room hash with clamping"
```

---

### Task 4: Contain-fit helper (shared by preview + renderer)

**Files:**
- Create: `src/sim/fitRect.ts`
- Test: `src/sim/fitRect.test.ts`

**Interfaces:**
- Produces: `interface FitTransform { scale: number; offsetX: number; offsetY: number }` and `fitContain(map: MapConfig, canvasW: number, canvasH: number): FitTransform`. `scale = min(canvasW/width, canvasH/height)`; offsets center the scaled rect (letterbox).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { fitContain } from "./fitRect";

describe("fitContain", () => {
  it("scales to fit width when canvas is relatively narrow", () => {
    // map 24x14 into 240x200: minScale = min(10, 14.28) = 10 → width-bound
    const t = fitContain({ width: 24, height: 14 }, 240, 200);
    expect(t.scale).toBeCloseTo(10);
    expect(t.offsetX).toBeCloseTo(0);             // width fills exactly
    expect(t.offsetY).toBeCloseTo((200 - 140) / 2); // 30px letterbox top/bottom
  });
  it("scales to fit height when canvas is relatively wide", () => {
    // map 24x14 into 480x140: minScale = min(20, 10) = 10 → height-bound
    const t = fitContain({ width: 24, height: 14 }, 480, 140);
    expect(t.scale).toBeCloseTo(10);
    expect(t.offsetY).toBeCloseTo(0);
    expect(t.offsetX).toBeCloseTo((480 - 240) / 2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sim/fitRect.test.ts`
Expected: FAIL — cannot resolve `./fitRect`.

- [ ] **Step 3: Implement `src/sim/fitRect.ts`**

```ts
import type { MapConfig } from "../game/matchLogic";

export interface FitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Uniformly scale a logical map rect to fit inside a canvas (contain/letterbox). */
export function fitContain(map: MapConfig, canvasW: number, canvasH: number): FitTransform {
  const scale = Math.min(canvasW / map.width, canvasH / map.height);
  return {
    scale,
    offsetX: (canvasW - map.width * scale) / 2,
    offsetY: (canvasH - map.height * scale) / 2,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/sim/fitRect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/fitRect.ts src/sim/fitRect.test.ts
git commit -m "feat(sim): fitContain helper for uniform map-to-display scaling"
```

---

### Task 5: `ArenaPreview` — canvas preview renderer

**Files:**
- Create: `src/ui/settings/ArenaPreview.ts`
- Create: `src/ui/settings/coverage.ts`
- Test: `src/ui/settings/coverage.test.ts`

**Interfaces:**
- Consumes: `generatePlanetsWithStats`, `computeSpawns`, `boundsFromMap` (sim), `fitContain` (sim), `MapConfig`, `ScatterConfig`.
- Produces:
  - `coverage(planets, map): number` — meat area ÷ field area, 0..1.
  - `class ArenaPreview` with `constructor(canvas: HTMLCanvasElement)` and `render(map, scatter, teamSize, seed): { placed: number; coveragePct: number; attempts: number }`.

- [ ] **Step 1: Write the failing coverage test**

```ts
import { describe, it, expect } from "vitest";
import { coverage } from "./coverage";

describe("coverage", () => {
  it("is 0 with no planets", () => {
    expect(coverage([], { width: 24, height: 14 })).toBe(0);
  });
  it("is area of circles over field area", () => {
    const planets = [{ id: "p1", pos: { x: 0, y: 0 }, radius: 2, craters: [] }];
    const expected = (Math.PI * 4) / (24 * 14);
    expect(coverage(planets, { width: 24, height: 14 })).toBeCloseTo(expected);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/settings/coverage.test.ts`
Expected: FAIL — cannot resolve `./coverage`.

- [ ] **Step 3: Implement `src/ui/settings/coverage.ts`**

```ts
import type { Planet } from "../../sim/types";
import type { MapConfig } from "../../game/matchLogic";

/** Fraction of the field covered by planet "meat" (craters ignored — none yet). */
export function coverage(planets: Planet[], map: MapConfig): number {
  const field = map.width * map.height;
  if (field <= 0) return 0;
  const meat = planets.reduce((a, p) => a + Math.PI * p.radius * p.radius, 0);
  return meat / field;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ui/settings/coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/ui/settings/ArenaPreview.ts`** (canvas draw; verified manually in Task 6)

```ts
import type { MapConfig, ScatterConfig } from "../../game/matchLogic";
import { boundsFromMap, computeSpawns, generatePlanetsWithStats } from "../../sim/planetScatter";
import { fitContain } from "../../sim/fitRect";
import { coverage } from "./coverage";

export interface PreviewStats { placed: number; coveragePct: number; attempts: number }

/** Lightweight, Pixi-free preview of a generated arena. Faithful to the game
 *  because it calls the same sim generator + the same contain-fit rule. */
export class ArenaPreview {
  private ctx: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  render(map: MapConfig, scatter: ScatterConfig, teamSize: number, seed: number): PreviewStats {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const spawns = computeSpawns(map, teamSize);
    const { planets, attempts } = generatePlanetsWithStats(seed, boundsFromMap(map), spawns, scatter);
    const t = fitContain(map, W, H);
    const b = boundsFromMap(map);
    const sx = (x: number) => t.offsetX + (x - b.minX) * t.scale;
    const sy = (y: number) => t.offsetY + (b.maxY - y) * t.scale;

    ctx.clearRect(0, 0, W, H);
    // map rectangle
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(sx(b.minX), sy(b.maxY), map.width * t.scale, map.height * t.scale);
    ctx.strokeStyle = "#263041"; ctx.lineWidth = 1;
    ctx.strokeRect(sx(b.minX), sy(b.maxY), map.width * t.scale, map.height * t.scale);

    // spawn halos + dots
    for (const s of spawns) {
      const red = s.x < 0;
      ctx.beginPath(); ctx.arc(sx(s.x), sy(s.y), scatter.spawnClearance * t.scale, 0, Math.PI * 2);
      ctx.fillStyle = red ? "rgba(255,107,107,0.06)" : "rgba(94,200,255,0.06)"; ctx.fill();
      ctx.beginPath(); ctx.arc(sx(s.x), sy(s.y), 4, 0, Math.PI * 2);
      ctx.fillStyle = red ? "#ff6b6b" : "#5ec8ff"; ctx.fill();
    }
    // planets
    for (const p of planets) {
      ctx.beginPath(); ctx.arc(sx(p.pos.x), sy(p.pos.y), p.radius * t.scale, 0, Math.PI * 2);
      ctx.fillStyle = "#7d8aa0"; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = "#aab6c8"; ctx.stroke();
    }
    return { placed: planets.length, coveragePct: 100 * coverage(planets, map), attempts };
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/settings/ArenaPreview.ts src/ui/settings/coverage.ts src/ui/settings/coverage.test.ts
git commit -m "feat(settings): ArenaPreview canvas renderer + coverage helper"
```

---

### Task 6: `SettingsPanel` module + lobby wiring

**Files:**
- Create: `src/ui/settings/SettingsPanel.ts`
- Modify: `index.html` (add a preview canvas + panel mount inside `#lobby-config`)
- Modify: `src/ui/LobbyScreen.ts` (instantiate panel; fold its values into `MatchConfig`)

**Interfaces:**
- Consumes: `ArenaPreview`; `MapConfig`, `ScatterConfig`; `arenaDefaults`.
- Produces:
  - `interface ArenaSettings { map: MapConfig; scatter: ScatterConfig; teamSize: 1|2|3|4|5 }`
  - `class SettingsPanel` with `constructor(root: ParentNode)`, `getSettings(): ArenaSettings`, and internal live re-render. Reroll button re-seeds the preview only (seed is not persisted — server/local mints it at game start).

- [ ] **Step 1: Add the panel markup to `index.html`** (inside `#lobby-config`, before the actions)

```html
        <!-- Arena settings + live preview (functional; visual polish is the last step) -->
        <div id="settings-panel">
          <p class="lobby-label">Arena</p>
          <canvas id="arena-preview" width="360" height="210"
                  style="width:100%;background:#0a0e14;border:1px solid #263041;border-radius:6px"></canvas>
          <div id="arena-readout" style="display:flex;gap:14px;font-size:11px;color:#8499ab;margin:6px 0"></div>
          <div id="arena-seed-row" style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <code id="arena-seed" style="flex:1;background:#0a0e14;border:1px solid #263041;border-radius:4px;padding:4px 6px;color:#cdd9e5;font-size:11px"></code>
            <button id="arena-reroll" type="button" style="border:1px solid #263041;background:transparent;color:#5ec8ff;border-radius:4px;padding:4px 10px;cursor:pointer">Reroll</button>
          </div>
          <div id="arena-controls" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px"></div>
        </div>
```

- [ ] **Step 2: Implement `src/ui/settings/SettingsPanel.ts`** (data-driven controls — DRY)

```ts
import { ArenaPreview } from "./ArenaPreview";
import { arenaDefaults } from "../../game/arenaDefaults";
import type { MapConfig, ScatterConfig } from "../../game/matchLogic";

export interface ArenaSettings {
  map: MapConfig;
  scatter: ScatterConfig;
  teamSize: 1 | 2 | 3 | 4 | 5;
}

/** Slider spec: [key path, label, min, max, step]. */
type Path = "map.width" | "map.height" | "teamSize"
  | `scatter.${keyof ScatterConfig}`;
const SPECS: [Path, string, number, number, number][] = [
  ["map.width", "map width", 8, 60, 1],
  ["map.height", "map height", 6, 40, 1],
  ["scatter.rMin", "rMin", 0.3, 4, 0.1],
  ["scatter.rMax", "rMax", 0.3, 4, 0.1],
  ["scatter.gapMin", "gapMin", 0, 6, 0.1],
  ["scatter.gapMax", "gapMax", 0, 6, 0.1],
  ["scatter.spawnClearance", "spawnClearance", 0, 5, 0.1],
  ["scatter.fieldMargin", "fieldMargin", 0, 3, 0.1],
  ["scatter.maxPlanets", "maxPlanets", 1, 24, 1],
  ["teamSize", "players/team", 1, 5, 1],
];

export class SettingsPanel {
  private state: ArenaSettings = arenaDefaults();
  private seed = (Math.random() * 0xffffffff) >>> 0;
  private preview: ArenaPreview;
  private inputs = new Map<Path, HTMLInputElement>();
  private readout: HTMLElement;
  private seedEl: HTMLElement;

  constructor(root: ParentNode = document) {
    const canvas = root.querySelector<HTMLCanvasElement>("#arena-preview")!;
    const controls = root.querySelector<HTMLElement>("#arena-controls")!;
    this.readout = root.querySelector<HTMLElement>("#arena-readout")!;
    this.seedEl = root.querySelector<HTMLElement>("#arena-seed")!;
    this.preview = new ArenaPreview(canvas);

    for (const [path, label, min, max, step] of SPECS) {
      const wrap = document.createElement("label");
      wrap.style.cssText = "display:flex;flex-direction:column;gap:2px;font-size:11px;color:#8499ab";
      const cap = document.createElement("span");
      const val = document.createElement("b"); val.style.color = "#5ec8ff";
      cap.append(label + " ", val);
      const input = document.createElement("input");
      input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = String(this.get(path));
      input.style.accentColor = "#5ec8ff";
      input.addEventListener("input", () => { this.set(path, +input.value); this.clamp(); this.rerender(); });
      wrap.append(cap, input);
      controls.append(wrap);
      this.inputs.set(path, input);
      (input as any)._val = val;
    }

    root.querySelector<HTMLButtonElement>("#arena-reroll")!
      .addEventListener("click", () => { this.seed = (Math.random() * 0xffffffff) >>> 0; this.rerender(); });

    this.rerender();
  }

  getSettings(): ArenaSettings {
    return { map: { ...this.state.map }, scatter: { ...this.state.scatter }, teamSize: this.state.teamSize };
  }

  private get(path: Path): number {
    if (path === "teamSize") return this.state.teamSize;
    const [grp, key] = path.split(".") as [string, string];
    return (this.state as any)[grp][key];
  }
  private set(path: Path, v: number): void {
    if (path === "teamSize") { this.state.teamSize = Math.round(v) as 1 | 2 | 3 | 4 | 5; return; }
    const [grp, key] = path.split(".") as [string, string];
    (this.state as any)[grp][key] = v;
  }
  /** Keep min ≤ max for the size and gap pairs. */
  private clamp(): void {
    const s = this.state.scatter;
    if (s.rMin > s.rMax) { s.rMax = s.rMin; this.inputs.get("scatter.rMax")!.value = String(s.rMax); }
    if (s.gapMin > s.gapMax) { s.gapMax = s.gapMin; this.inputs.get("scatter.gapMax")!.value = String(s.gapMax); }
  }
  private rerender(): void {
    for (const [path, input] of this.inputs) (input as any)._val.textContent = String(this.get(path));
    const st = this.preview.render(this.state.map, this.state.scatter, this.state.teamSize, this.seed);
    this.seedEl.textContent = "seed " + this.seed;
    this.readout.innerHTML =
      `<span>planets ${st.placed}/${this.state.scatter.maxPlanets}</span>` +
      `<span>coverage ${st.coveragePct.toFixed(1)}%</span>` +
      `<span>attempts ${st.attempts}/300</span>`;
  }
}
```

- [ ] **Step 3: Wire the panel into `LobbyScreen`**

In `src/ui/LobbyScreen.ts`: add `import { SettingsPanel } from "./settings/SettingsPanel";`, hold an instance, and merge its settings on start.

```ts
// field:
private settings: SettingsPanel;

// in constructor (after existing querySelectors):
this.settings = new SettingsPanel(root);

// replace handleStart():
private handleStart(): void {
  const config: MatchConfig = {
    mode: this.selectedMode,
    rounds: this.selectedRounds,
    noTurn: this.noTurnCheckbox.checked,
    role: "local",
    ...this.settings.getSettings(),
  };
  this.startCb?.(config);
}
```

Remove the now-unused `arenaDefaults` import added in Task 1 from `LobbyScreen.ts`.

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open the lobby. Confirm: preview canvas shows the map rectangle, both spawn columns with halos, and planets to scale; sliders live-update the preview and the value labels; changing `map height` makes the rectangle taller; Reroll changes the layout; readout shows planets/coverage/attempts. Screenshot for the record.

- [ ] **Step 6: Commit**

```bash
git add index.html src/ui/settings/SettingsPanel.ts src/ui/LobbyScreen.ts
git commit -m "feat(lobby): modular arena settings panel with live preview"
```

---

### Task 7: `GameRenderer` — contain-fit bounds from `MapConfig`

**Files:**
- Modify: `src/game/GameRenderer.ts` (`HALF_Y` usage, `effectiveBounds`, `recomputeEffectiveBounds`, add `setMap`)

**Interfaces:**
- Consumes: `MapConfig`; `fitContain` (sim); `boundsFromMap` (sim).
- Produces: `setMap(map: MapConfig): void` on `GameRenderer`; `getEffectiveBounds()` now returns `boundsFromMap(this.map)`; camera uses `fitContain`.

- [ ] **Step 1: Add imports and a `map` field**

At top of `GameRenderer.ts`:

```ts
import type { MapConfig } from "./matchLogic";
import { boundsFromMap } from "../sim/planetScatter";
import { fitContain } from "../sim/fitRect";
import { DEFAULT_MAP } from "./arenaDefaults";
```

Add field near `effectiveBounds`:

```ts
private map: MapConfig = { ...DEFAULT_MAP };
```

- [ ] **Step 2: Add `setMap` and rewrite `recomputeEffectiveBounds`**

```ts
/** Set the logical playfield rectangle. Call before setWorld/getEffectiveBounds. */
setMap(map: MapConfig): void {
  this.map = { ...map };
  this.recomputeEffectiveBounds();
}

private recomputeEffectiveBounds() {
  const cam = this.camera;
  const t = fitContain(this.map, cam.width, cam.height);
  cam.scale = t.scale;
  cam.centerX = 0;
  cam.centerY = 0;
  this.effectiveBounds = boundsFromMap(this.map);
}
```

Note: the existing `Camera` centers on `(centerX, centerY)`; with `scale = fitContain(...).scale` the origin-centered map is drawn centered and letterboxed automatically. Leave `getEffectiveBounds()` returning `{ ...this.effectiveBounds }` (now driven by the map).

- [ ] **Step 3: Remove the now-dead `HALF_Y` X-derivation**

The old `const HALF_Y = 7;` is no longer the bounds source. Keep the constant only if still referenced by grid/axis drawing; otherwise delete it. Verify with:

Run: `grep -n "HALF_Y" src/game/GameRenderer.ts`
If only the definition remains, delete the line. If used elsewhere, replace those uses with `this.map.height / 2`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/GameRenderer.ts
git commit -m "feat(renderer): fit logical map rectangle to display (contain-fit)"
```

---

### Task 8: `main.ts` — generate planets from config; spawns from map

**Files:**
- Modify: `src/game/main.ts` (`seedPlanets` removal, `start`/round-reset planet generation, `placePlayersRandomly`, renderer `setMap` call)

**Interfaces:**
- Consumes: `generatePlanets`, `computeSpawns`, `boundsFromMap` (sim); `matchConfig.map`, `matchConfig.scatter`, `matchConfig.teamSize`; `GameRenderer.setMap`.

- [ ] **Step 1: Replace `seedPlanets()` with a config-driven generator**

Add import:

```ts
import { generatePlanets, computeSpawns, boundsFromMap } from "../sim/planetScatter";
```

Replace the whole `seedPlanets()` function (lines ~42-51) with:

```ts
function seedPlanets(): Planet[] {
  const seed = (Math.random() * 0xffffffff) >>> 0; // local mint; server mints in online play
  const { map, scatter, teamSize } = matchConfig;
  return generatePlanets(seed, boundsFromMap(map), computeSpawns(map, teamSize), scatter);
}
```

- [ ] **Step 2: Feed the map to the renderer before reading bounds**

In `start()` (and the round-reset path near line 129-134), call `setMap` before `getEffectiveBounds()`/`buildWorld`. Immediately after `renderer` is guaranteed non-null in `start()`:

```ts
renderer!.setMap(matchConfig.map);
```

Add the same `renderer!.setMap(matchConfig.map);` line before the `placePlayersRandomly(renderer!.getEffectiveBounds())` call in the round-reset branch.

- [ ] **Step 3: Derive spawn-x from the map width in `placePlayersRandomly`**

Replace `placePlayersRandomly` body so the columns come from the map, not the hardcoded 11/±9:

```ts
function placePlayersRandomly(b: Bounds) {
  const yLo = b.minY + 1, yHi = b.maxY - 1;
  const xEdge = Math.abs(b.minX) - 0.3;
  const xInner = Math.min(matchConfig.map.width / 2 - 3, xEdge); // spawn column ≈ SPAWN_INSET from wall
  const xRange = Math.max(0, xEdge - xInner);
  redPlayerPos = { x: -(xInner + Math.random() * xRange), y: yLo + Math.random() * (yHi - yLo) };
  bluePlayerPos = { x: xInner + Math.random() * xRange, y: yLo + Math.random() * (yHi - yLo) };
}
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Manual end-to-end verification**

Run: `npm run dev`. In the lobby, set a distinctive map (e.g. tall, few big planets), Play Locally. Confirm in-game: the field matches the previewed shape/scale, planets are procedurally placed (not the old fixed 6), players sit clear of planets and can fire, and a new round re-rolls the layout. Reload the room URL and confirm the hash carries the settings. Screenshot.

- [ ] **Step 6: Commit**

```bash
git add src/game/main.ts
git commit -m "feat(game): generate planets from arena config; spawns/bounds from map size"
```

---

### Task 9: Remove the throwaway prototype

**Files:**
- Delete: `planet-scatter-prototype.html`, `planet-scatter-prototype.NOTES.md`
- Delete (if present): scratch screenshot under the session scratchpad (not in repo).

- [ ] **Step 1: Confirm the tuned defaults are captured**

Before deleting, ensure `src/game/arenaDefaults.ts` holds the values KP settled on in the preview (update `DEFAULT_MAP`/`DEFAULT_SCATTER` if KP tuned them). The NOTES verdict, if filled, is the source.

- [ ] **Step 2: Delete the prototype files**

```bash
git rm planet-scatter-prototype.html planet-scatter-prototype.NOTES.md
```

- [ ] **Step 3: Full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove planet-scatter tuning prototype (folded into arena settings)"
```

---

## Self-Review

**Spec coverage:**
- §2 data model → Task 1 (types/defaults) + Task 3 (serialization). ✓
- §3a pure generator + computeSpawns → Task 2. ✓
- §3b settings panel + ArenaPreview + modular sections → Tasks 5–6. ✓
- §3c lobby wiring + no in-game lock → Task 6. ✓
- §3d GameRenderer contain-fit + main.ts generator → Tasks 7–8. ✓
- Map contain-fit rule (§1) shared preview+game → Task 4 (`fitContain`), used in Tasks 5 & 7. ✓
- Serialization validation/clamp/fallback (§2, §6) → Task 3. ✓
- teamSize scope (drives spawns/preview only) → Tasks 2, 8. ✓
- Deliverable 5 (delete prototype) → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✓

**Type consistency:** `MapConfig`/`ScatterConfig`/`ArenaSettings`, `generatePlanets`/`generatePlanetsWithStats`, `computeSpawns`, `boundsFromMap`, `fitContain`/`FitTransform`, `coverage`, `setMap`, `SPAWN_INSET`, `MAX_ATTEMPTS` used identically across Tasks 1–8. `arenaDefaults()` returns fresh copies everywhere. ✓

**Note for implementer:** `Camera`'s exact `scale`/`centerX` fields are assumed from current usage in `recomputeEffectiveBounds`; if the `Camera` API differs, adapt Task 7 Step 2 to the real setters (the behavior — origin-centered, uniform `fitContain` scale — is what matters).
