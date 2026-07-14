# Match-State Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract CurveCombat's match logic out of `main.ts`'s mutable module-globals into a pure, team-generic `MatchState` + a `resolveFire` reducer, then rewire local hot-seat play to drive through it with zero behavior change.

**Architecture:** A single pure data type (`MatchState`) describes a whole match: players grouped into two teams, planets, turn order, scores, phase. One pure reducer (`resolveFire(state, intent) → { next, shot }`) wraps the existing `sim/engine.fire` and computes the entire next state (crater carving, HP/elimination, round/match end, turn advance). `main.ts` becomes thin orchestration: build intent → `resolveFire` → animate the returned shot → commit the returned state → re-render. The reducer and its helpers stay strictly DOM-free so they later import into the authoritative Node server (Architecture B) unchanged.

**Tech Stack:** TypeScript (strict), Vitest, PixiJS (render only — untouched here), `@cortex-js/compute-engine` (already Node-safe).

## Global Constraints

- **TypeScript strict** — `npm run build` runs `tsc --noEmit`; the plan must keep it green.
- **ESM modules** — `"type": "module"`; use `import`/`export`, no `require`.
- **The spine is DOM-free.** `src/game/matchState.ts`, `src/game/turnQueue.ts`, and `src/game/resolveFire.ts` MUST NOT import Pixi, the DOM, `GameRenderer`, or `GameUI`. They may import `../sim/*`, `../math/Context`, and the other pure `game/*` logic modules only. (This is what lets the server reuse them — see `docs/multiplayer-arch/B-arena-authoritative-server.canvas`.)
- **Team-generic from day one** (Decision D2, `docs/multiplayer-arch/B-decisions.md`): exactly 2 teams (`"red"`/`"blue"`), 1–5 players each. 1v1 is two teams of one — no per-count special-casing in logic.
- **Test command:** single file `npx vitest run <path>`, all `npm test`. **Typecheck:** `npx tsc --noEmit`.
- **Out of scope for this plan (separate downstream plans):** N-player rendering/HUD, lobby team-assignment UI, the `turnSeconds` turn timer (D3), seeded random planet layouts (D4 — keep the existing hand-authored `seedPlanets()` here), and all networking/server code. The data model is built N-ready so those plans need no spine changes.

---

## File Structure

**New files (the pure spine — DOM-free):**
- `src/game/matchState.ts` — types (`Team`, `PlayerState`, `MatchPhase`, `MatchState`, `RoundLayout`), shared constants (`PLAYER_RADIUS`, `CRATER_RADIUS`), selectors (`playerById`, `livingEnemies`, `teamDir`, `worldFor`), and lifecycle constructors (`createMatch`, `beginRound`).
- `src/game/turnQueue.ts` — `buildTurnQueue(players, firstTeam)` and `nextActive(queue, currentId, isAlive)`.
- `src/game/resolveFire.ts` — `FireIntent`, `ShotResolution`, and the `resolveFire(state, intent)` reducer.
- `src/game/localLayout.ts` — `buildLocalLayout(bounds)` producing a 1-per-team `RoundLayout` (random spawns + the existing hand-authored planets); this is the local-play glue that replaces `seedPlanets()`/`placePlayersRandomly()`.

**New test files:**
- `src/game/matchState.test.ts`, `src/game/turnQueue.test.ts`, `src/game/resolveFire.test.ts`, `src/game/spine.integration.test.ts`.

**Modified:**
- `src/game/main.ts` — drop module-globals; hold one `MatchState`; rewrite `start`/`nextRound`/`onFire` as orchestration over the reducer.

**Untouched:** `src/sim/*`, `src/math/*`, `GameRenderer.ts`, `GameUI.ts`, `matchLogic.ts`, `hpLogic.ts`, `configRouter.ts`.

---

### Task 1: MatchState types, constants, selectors, and `createMatch`

**Files:**
- Create: `src/game/matchState.ts`
- Test: `src/game/matchState.test.ts`

**Interfaces:**
- Consumes: `Bounds`, `Planet`, `Vec2`, `World` from `../sim/types`; `MatchConfig` from `./matchLogic`; `HP_MAX` from `./hpLogic`; `buildTurnQueue` from `./turnQueue` (Task 2 — type-only at module load, called at runtime).
- Produces:
  - `type Team = "red" | "blue"`
  - `type MatchPhase = "play" | "between" | "over"`
  - `interface PlayerState { id: string; name: string; team: Team; pos: Vec2; hp: number; alive: boolean }`
  - `interface MatchState { config: MatchConfig; players: PlayerState[]; planets: Planet[]; bounds: Bounds; turnQueue: string[]; activePlayerId: string | null; scores: Record<Team, number>; round: number; phase: MatchPhase; winner: Team | null }`
  - `interface RoundLayout { players: PlayerState[]; planets: Planet[] }`
  - `const PLAYER_RADIUS = 0.1`, `const CRATER_RADIUS = 0.8`
  - `teamDir(team: Team): 1 | -1`
  - `playerById(state: MatchState, id: string): PlayerState | undefined`
  - `livingEnemies(state: MatchState, team: Team): PlayerState[]`
  - `worldFor(state: MatchState, shooter: PlayerState): World`
  - `createMatch(config: MatchConfig, layout: RoundLayout, bounds: Bounds, firstTeam?: Team): MatchState`

- [ ] **Step 1: Write the failing test**

```ts
// src/game/matchState.test.ts
import { describe, it, expect } from "vitest";
import { createMatch, livingEnemies, worldFor, teamDir, PLAYER_RADIUS } from "./matchState";
import type { RoundLayout, PlayerState } from "./matchState";
import type { MatchConfig } from "./matchLogic";

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
    expect(m.players.every((p) => p.alive && p.hp === 100)).toBe(true);
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/matchState.test.ts`
Expected: FAIL — `Cannot find module './matchState'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/game/matchState.ts
import type { Bounds, Planet, Vec2, World } from "../sim/types";
import type { MatchConfig } from "./matchLogic";
import { HP_MAX } from "./hpLogic";
import { buildTurnQueue } from "./turnQueue";

export type Team = "red" | "blue";
export type MatchPhase = "play" | "between" | "over";

export interface PlayerState {
  id: string;
  name: string;
  team: Team;
  pos: Vec2;
  hp: number;
  alive: boolean;
}

export interface MatchState {
  config: MatchConfig;
  players: PlayerState[];
  planets: Planet[];
  bounds: Bounds;
  /** Player ids in firing order (turn-based). */
  turnQueue: string[];
  /** Whose turn it is (turn-based); null in no-turn mode. */
  activePlayerId: string | null;
  scores: Record<Team, number>;
  round: number;
  phase: MatchPhase;
  winner: Team | null;
}

/** Positions + identities for one round; HP/alive are (re)set by the lifecycle fns. */
export interface RoundLayout {
  players: PlayerState[];
  planets: Planet[];
}

/** Collision + draw radius for a player-as-target, world units. */
export const PLAYER_RADIUS = 0.1;
/** Radius of the crater carved into a planet on impact, world units. */
export const CRATER_RADIUS = 0.8;

/** Which way world x marches when a team fires: red → +x, blue → -x. */
export function teamDir(team: Team): 1 | -1 {
  return team === "red" ? 1 : -1;
}

export function playerById(state: MatchState, id: string): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

export function livingEnemies(state: MatchState, team: Team): PlayerState[] {
  return state.players.filter((p) => p.team !== team && p.alive);
}

/** The engine World as seen from one shooter: own muzzle + all living enemies as targets. */
export function worldFor(state: MatchState, shooter: PlayerState): World {
  return {
    soldier: { pos: shooter.pos, dir: teamDir(shooter.team) },
    bounds: state.bounds,
    targets: livingEnemies(state, shooter.team).map((e) => ({
      id: e.id,
      pos: e.pos,
      radius: PLAYER_RADIUS,
    })),
    planets: state.planets,
  };
}

/** Build a fresh match in the "play" phase. `firstTeam` fires first (round 1: red). */
export function createMatch(
  config: MatchConfig,
  layout: RoundLayout,
  bounds: Bounds,
  firstTeam: Team = "red",
): MatchState {
  const players = layout.players.map((p) => ({ ...p, hp: HP_MAX, alive: true }));
  const turnQueue = buildTurnQueue(players, firstTeam);
  return {
    config,
    players,
    planets: layout.planets,
    bounds,
    turnQueue,
    activePlayerId: config.noTurn ? null : (turnQueue[0] ?? null),
    scores: { red: 0, blue: 0 },
    round: 1,
    phase: "play",
    winner: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/matchState.test.ts`
Expected: FAIL still — `buildTurnQueue` does not exist yet (`./turnQueue` missing). This is expected; Task 2 provides it. If you are doing tasks in order, proceed to Task 2 and re-run at the end of Task 2 Step 4.

> Note: Task 1 and Task 2 are mutually dependent at module-resolution time (`matchState` imports `buildTurnQueue`; `turnQueue` imports types from `matchState`). Implement both, then both test files go green. The type-only import in `turnQueue` is erased at runtime, so there is no runtime cycle.

- [ ] **Step 5: Commit (after Task 2 is also green)**

```bash
git add src/game/matchState.ts src/game/matchState.test.ts
git commit -m "feat(spine): MatchState types, selectors, and createMatch"
```

---

### Task 2: Turn-queue helpers

**Files:**
- Create: `src/game/turnQueue.ts`
- Test: `src/game/turnQueue.test.ts`

**Interfaces:**
- Consumes: `PlayerState`, `Team` (type-only) from `./matchState`.
- Produces:
  - `buildTurnQueue(players: PlayerState[], firstTeam: Team): string[]` — snake order F1,O1,F2,O2,… then trailing players of the larger team.
  - `nextActive(queue: string[], currentId: string | null, isAlive: (id: string) => boolean): string | null` — next living id after `currentId`, cycling; null if none.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/turnQueue.test.ts`
Expected: FAIL — `Cannot find module './turnQueue'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/game/turnQueue.ts
import type { PlayerState, Team } from "./matchState";

/**
 * Snake / alternating firing order starting with `firstTeam`:
 * F1, O1, F2, O2, … then any trailing players of the larger team.
 * Includes all players (a round starts with everyone alive).
 */
export function buildTurnQueue(players: PlayerState[], firstTeam: Team): string[] {
  const first = players.filter((p) => p.team === firstTeam).map((p) => p.id);
  const second = players.filter((p) => p.team !== firstTeam).map((p) => p.id);
  const out: string[] = [];
  const n = Math.max(first.length, second.length);
  for (let i = 0; i < n; i++) {
    if (i < first.length) out.push(first[i]);
    if (i < second.length) out.push(second[i]);
  }
  return out;
}

/**
 * The next ALIVE player id after `currentId` in the queue, cycling around.
 * If `currentId` is null/absent, search from the start. Returns null if no
 * player satisfies `isAlive`.
 */
export function nextActive(
  queue: string[],
  currentId: string | null,
  isAlive: (id: string) => boolean,
): string | null {
  if (queue.length === 0) return null;
  const start = currentId ? queue.indexOf(currentId) : -1;
  for (let step = 1; step <= queue.length; step++) {
    const id = queue[(start + step + queue.length) % queue.length];
    if (isAlive(id)) return id;
  }
  return null;
}
```

- [ ] **Step 4: Run both test files to verify they pass**

Run: `npx vitest run src/game/turnQueue.test.ts src/game/matchState.test.ts`
Expected: PASS (both files). Task 1's `buildTurnQueue` dependency is now satisfied.

- [ ] **Step 5: Commit**

```bash
git add src/game/turnQueue.ts src/game/turnQueue.test.ts src/game/matchState.ts src/game/matchState.test.ts
git commit -m "feat(spine): turn-queue helpers + complete MatchState core"
```

---

### Task 3: `resolveFire` — guards, miss, and planet impact

**Files:**
- Create: `src/game/resolveFire.ts`
- Test: `src/game/resolveFire.test.ts`

**Interfaces:**
- Consumes: `fire` from `../sim/engine`; `evaluateAll` from `../math/Context`; `computeDamage` from `./hpLogic`; `matchWinner` from `./matchLogic`; `nextActive` from `./turnQueue`; `MatchState`, `Team`, `PlayerState`, `CRATER_RADIUS`, `playerById`, `livingEnemies`, `worldFor` from `./matchState`; `ShotResult` from `../sim/types`.
- Produces:
  - `interface FireIntent { playerId: string; latex: string }`
  - `type RejectReason = "game-over" | "not-active" | "dead" | "unknown-player" | "bad-function"`
  - `interface ShotResolution { next: MatchState; shot: ShotResult | null; rejected?: RejectReason; damage?: number; eliminatedId?: string; roundLoser?: Team; roundEnded?: boolean; matchEnded?: boolean }`
  - `resolveFire(state: MatchState, intent: FireIntent): ShotResolution`

This task implements the reducer's guards and the non-scoring outcomes (miss, planet crater). Target-hit scoring lands in Tasks 4–5; until then a target hit just falls through to the "round continues" branch — that is fine because the dedicated tests here never hit a target.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/resolveFire.test.ts`
Expected: FAIL — `Cannot find module './resolveFire'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/game/resolveFire.ts
import { fire } from "../sim/engine";
import { evaluateAll } from "../math/Context";
import { computeDamage } from "./hpLogic";
import { matchWinner } from "./matchLogic";
import { nextActive } from "./turnQueue";
import {
  type MatchState,
  type Team,
  CRATER_RADIUS,
  playerById,
  worldFor,
} from "./matchState";
import type { ShotResult } from "../sim/types";

export interface FireIntent {
  playerId: string;
  latex: string;
}

export type RejectReason =
  | "game-over"
  | "not-active"
  | "dead"
  | "unknown-player"
  | "bad-function";

export interface ShotResolution {
  /** The committed next state. Equals the input state (by reference) when `rejected` is set. */
  next: MatchState;
  shot: ShotResult | null;
  rejected?: RejectReason;
  /** HP-mode damage dealt on a target hit. */
  damage?: number;
  /** Set when this shot eliminated an enemy. */
  eliminatedId?: string;
  /** The team wiped out this shot (round loser). */
  roundLoser?: Team;
  roundEnded?: boolean;
  matchEnded?: boolean;
}

function compile(latex: string): ((x: number) => number) | null {
  const row = evaluateAll([{ id: "shot", latex }]).get("shot");
  return row?.kind === "curve" && row.fn ? row.fn : null;
}

/**
 * Resolve one fire intent into the next match state. Pure: never mutates
 * `state`, and identical (state, intent) always produce identical results.
 */
export function resolveFire(state: MatchState, intent: FireIntent): ShotResolution {
  if (state.phase !== "play") return { next: state, shot: null, rejected: "game-over" };

  const shooter = playerById(state, intent.playerId);
  if (!shooter) return { next: state, shot: null, rejected: "unknown-player" };
  if (!shooter.alive) return { next: state, shot: null, rejected: "dead" };
  if (!state.config.noTurn && state.activePlayerId !== shooter.id) {
    return { next: state, shot: null, rejected: "not-active" };
  }

  const fn = compile(intent.latex);
  if (!fn) return { next: state, shot: null, rejected: "bad-function" };

  const shot = fire(worldFor(state, shooter), fn);

  let players = state.players;
  let planets = state.planets;

  // Planet impact → carve a crater (immutably).
  if (shot.hit.kind === "planet" && shot.hit.planetId) {
    const planetId = shot.hit.planetId;
    planets = planets.map((p) =>
      p.id === planetId
        ? { ...p, craters: [...p.craters, { pos: shot.hit.at, radius: CRATER_RADIUS }] }
        : p,
    );
  }

  // Target scoring is added in Tasks 4–5. For now, target/miss/planet all
  // fall through to "round continues".
  void computeDamage; // referenced fully in Task 5
  void matchWinner; //  referenced fully in Task 4

  let next: MatchState = { ...state, players, planets };

  if (!state.config.noTurn) {
    next = {
      ...next,
      activePlayerId: nextActive(state.turnQueue, shooter.id, (id) => {
        const p = players.find((q) => q.id === id);
        return !!p && p.alive;
      }),
    };
  }

  return { next, shot, roundEnded: false, matchEnded: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/resolveFire.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/resolveFire.ts src/game/resolveFire.test.ts
git commit -m "feat(spine): resolveFire guards, miss, and planet-crater path"
```

---

### Task 4: `resolveFire` — Classic elimination, round end, match end

**Files:**
- Modify: `src/game/resolveFire.ts`
- Test: `src/game/resolveFire.test.ts` (add a `describe` block)

**Interfaces:**
- Produces: extends `resolveFire` so a Classic-mode target hit eliminates the enemy, and a wiped enemy team ends the round (scoring the shooter's team), ending the match when `matchWinner` reaches majority.

- [ ] **Step 1: Write the failing test (append to `src/game/resolveFire.test.ts`)**

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/resolveFire.test.ts`
Expected: FAIL — `eliminatedId`/`roundEnded`/`phase` not set (target hits currently fall through).

- [ ] **Step 3: Replace the body between the planet-impact block and the final return**

In `src/game/resolveFire.ts`, replace this section:

```ts
  // Target scoring is added in Tasks 4–5. For now, target/miss/planet all
  // fall through to "round continues".
  void computeDamage; // referenced fully in Task 5
  void matchWinner; //  referenced fully in Task 4

  let next: MatchState = { ...state, players, planets };

  if (!state.config.noTurn) {
    next = {
      ...next,
      activePlayerId: nextActive(state.turnQueue, shooter.id, (id) => {
        const p = players.find((q) => q.id === id);
        return !!p && p.alive;
      }),
    };
  }

  return { next, shot, roundEnded: false, matchEnded: false };
```

with:

```ts
  let damage: number | undefined;
  let eliminatedId: string | undefined;

  // Target impact → apply damage / elimination (immutably).
  if (shot.hit.kind === "target" && shot.hit.targetId) {
    const targetId = shot.hit.targetId;
    if (state.config.mode === "hp") {
      damage = computeDamage(shot.impactSlope);
      players = players.map((p) => {
        if (p.id !== targetId) return p;
        const hp = Math.max(0, p.hp - damage!);
        return { ...p, hp, alive: hp > 0 };
      });
      if (!players.find((p) => p.id === targetId)!.alive) eliminatedId = targetId;
    } else {
      // Classic: a single direct hit eliminates the target.
      players = players.map((p) => (p.id === targetId ? { ...p, alive: false } : p));
      eliminatedId = targetId;
    }
  }

  const enemyTeam: Team = shooter.team === "red" ? "blue" : "red";
  const enemyWiped = players
    .filter((p) => p.team === enemyTeam)
    .every((p) => !p.alive);

  let next: MatchState = { ...state, players, planets };

  if (enemyWiped) {
    const scores = { ...state.scores, [shooter.team]: state.scores[shooter.team] + 1 };
    const winner = matchWinner(scores.red, scores.blue, state.config.rounds);
    next = { ...next, scores, phase: winner ? "over" : "between", winner };
    return {
      next,
      shot,
      damage,
      eliminatedId,
      roundLoser: enemyTeam,
      roundEnded: true,
      matchEnded: winner !== null,
    };
  }

  // Round continues — advance the turn (turn-based only).
  if (!state.config.noTurn) {
    next = {
      ...next,
      activePlayerId: nextActive(state.turnQueue, shooter.id, (id) => {
        const p = players.find((q) => q.id === id);
        return !!p && p.alive;
      }),
    };
  }

  return { next, shot, damage, eliminatedId, roundEnded: false, matchEnded: false };
```

(The `void computeDamage; void matchWinner;` lines are now removed because both are used for real.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/resolveFire.test.ts`
Expected: PASS (all Task 3 + Task 4 blocks).

- [ ] **Step 5: Commit**

```bash
git add src/game/resolveFire.ts src/game/resolveFire.test.ts
git commit -m "feat(spine): Classic elimination, round end, and match end"
```

---

### Task 5: `resolveFire` — HP mode damage and non-fatal hits

**Files:**
- Modify: none (behavior already implemented in Task 4's HP branch)
- Test: `src/game/resolveFire.test.ts` (add a `describe` block that locks HP behavior)

**Interfaces:**
- Consumes: `HP_MAX` from `./hpLogic`.
- Produces: tests proving the HP branch — non-fatal hits deal `computeDamage(slope)`, keep the round going, and advance the turn; a hit that drops HP to 0 eliminates and (in 1v1) ends the round.

- [ ] **Step 1: Write the failing test (append to `src/game/resolveFire.test.ts`)**

```ts
import { HP_MAX } from "./hpLogic";

const HP: MatchConfig = { mode: "hp", rounds: 3, noTurn: false, role: "local" };

describe("resolveFire — HP mode", () => {
  it("a non-fatal hit subtracts damage and keeps the round going", () => {
    const m = createMatch(HP, duel(), BOUNDS, "red");
    const res = resolveFire(m, { playerId: "r1", latex: "0" });
    expect(res.shot!.hit.kind).toBe("target");
    expect(res.damage).toBeGreaterThanOrEqual(5);
    const blue = res.next.players.find((p) => p.id === "b1")!;
    expect(blue.hp).toBe(HP_MAX - res.damage!);
    expect(blue.alive).toBe(true);
    expect(res.roundEnded).toBe(false);
    expect(res.next.activePlayerId).toBe("b1"); // turn passes
  });

  it("a hit that empties HP eliminates the target and ends the round", () => {
    let m = createMatch(HP, duel(), BOUNDS, "red");
    // pre-damage blue to 1 HP so any hit finishes them.
    m = {
      ...m,
      players: m.players.map((p) => (p.id === "b1" ? { ...p, hp: 1 } : p)),
    };
    const res = resolveFire(m, { playerId: "r1", latex: "0" });
    expect(res.eliminatedId).toBe("b1");
    expect(res.roundEnded).toBe(true);
    expect(res.next.scores).toEqual({ red: 1, blue: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/game/resolveFire.test.ts`
Expected: PASS (Task 4 already implemented the HP branch). If anything fails, fix `resolveFire.ts` to match — do not weaken the test. This task exists to lock HP behavior with explicit coverage.

- [ ] **Step 3: (No code change expected.)** If Step 2 passed, skip. If it failed, reconcile `resolveFire.ts`'s HP branch with the test.

- [ ] **Step 4: Run the whole reducer suite**

Run: `npx vitest run src/game/resolveFire.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/resolveFire.test.ts
git commit -m "test(spine): lock HP-mode damage and elimination behavior"
```

---

### Task 6: `beginRound` lifecycle

**Files:**
- Modify: `src/game/matchState.ts` (add `beginRound`)
- Test: `src/game/matchState.test.ts` (add a `describe` block)

**Interfaces:**
- Produces: `beginRound(prev: MatchState, layout: RoundLayout, firstTeam: Team): MatchState` — fresh "play" state for the next round: respawn all players (full HP, alive), install the new layout, rebuild the turn queue starting with `firstTeam`, increment `round`, preserve `scores`/`config`/`bounds`, clear `winner`.

- [ ] **Step 1: Write the failing test (append to `src/game/matchState.test.ts`)**

```ts
import { beginRound } from "./matchState";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/matchState.test.ts`
Expected: FAIL — `beginRound` is not exported.

- [ ] **Step 3: Add `beginRound` to `src/game/matchState.ts`** (below `createMatch`)

```ts
/** Set up the next round: respawn everyone, install the new layout, keep scores. */
export function beginRound(
  prev: MatchState,
  layout: RoundLayout,
  firstTeam: Team,
): MatchState {
  const players = layout.players.map((p) => ({ ...p, hp: HP_MAX, alive: true }));
  const turnQueue = buildTurnQueue(players, firstTeam);
  return {
    ...prev,
    players,
    planets: layout.planets,
    turnQueue,
    activePlayerId: prev.config.noTurn ? null : (turnQueue[0] ?? null),
    round: prev.round + 1,
    phase: "play",
    winner: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/matchState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/matchState.ts src/game/matchState.test.ts
git commit -m "feat(spine): beginRound lifecycle for round resets"
```

---

### Task 7: Local layout helper + rewire `main.ts` through the spine

**Files:**
- Create: `src/game/localLayout.ts`
- Create: `src/game/spine.integration.test.ts`
- Modify: `src/game/main.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `buildLocalLayout(bounds: Bounds): RoundLayout` (1 player per team, random spawns, the existing hand-authored planets). `main.ts` now holds a single `MatchState` and orchestrates the reducer; existing local hot-seat play (Classic, HP, No-Turn) is byte-for-byte equivalent in behavior.

- [ ] **Step 1: Write the failing integration test**

```ts
// src/game/spine.integration.test.ts
import { describe, it, expect } from "vitest";
import { createMatch, beginRound } from "./matchState";
import { resolveFire } from "./resolveFire";
import { buildLocalLayout } from "./localLayout";

const BOUNDS = { minX: -12, minY: -7, maxX: 12, maxY: 7 };

describe("local layout", () => {
  it("buildLocalLayout yields one red and one blue player and the planet field", () => {
    const l = buildLocalLayout(BOUNDS);
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
    const m = createMatch({ mode: "classic", rounds: 3, noTurn: false, role: "local" }, layout, BOUNDS, "red");
    const res = resolveFire(m, { playerId: "r1", latex: "0" });
    expect(res.roundEnded).toBe(true);
    expect(res.next.scores).toEqual({ red: 1, blue: 0 });

    const r2 = beginRound(res.next, layout, "blue");
    expect(r2.round).toBe(2);
    expect(r2.activePlayerId).toBe("b1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/spine.integration.test.ts`
Expected: FAIL — `Cannot find module './localLayout'`.

- [ ] **Step 3: Create `src/game/localLayout.ts`**

```ts
// src/game/localLayout.ts
import type { Bounds, Planet } from "../sim/types";
import type { RoundLayout, PlayerState } from "./matchState";

/** The hand-authored planet field (Decision D4 will later swap this for a seeded scatter). */
function seedPlanets(): Planet[] {
  return [
    { id: "p1", pos: { x: -5, y: 3 }, radius: 1.2, craters: [] },
    { id: "p2", pos: { x: -3, y: -2 }, radius: 1.8, craters: [] },
    { id: "p3", pos: { x: 0, y: 2 }, radius: 1.5, craters: [] },
    { id: "p4", pos: { x: 0, y: -3 }, radius: 1.4, craters: [] },
    { id: "p5", pos: { x: 3, y: 1 }, radius: 2.0, craters: [] },
    { id: "p6", pos: { x: 5, y: -2 }, radius: 1.3, craters: [] },
  ];
}

/** Local hot-seat layout: one player per team at random vertical positions near each edge. */
export function buildLocalLayout(b: Bounds): RoundLayout {
  const yLo = b.minY + 1;
  const yHi = b.maxY - 1;
  const xEdge = Math.abs(b.minX) - 0.3;
  const xInner = Math.min(11, xEdge);
  const xRange = Math.max(0, xEdge - xInner);
  const ry = yLo + Math.random() * (yHi - yLo);
  const by = yLo + Math.random() * (yHi - yLo);
  const players: PlayerState[] = [
    { id: "r1", name: "RED", team: "red", pos: { x: -(xInner + Math.random() * xRange), y: ry }, hp: 100, alive: true },
    { id: "b1", name: "BLUE", team: "blue", pos: { x: xInner + Math.random() * xRange, y: by }, hp: 100, alive: true },
  ];
  return { players, planets: seedPlanets() };
}
```

- [ ] **Step 4: Rewire `src/game/main.ts`**

Replace the state declarations, `seedPlanets`, `buildWorld`, `placePlayersRandomly`, `start`, `nextRound`, and `onFire` with a single-`MatchState` orchestration. Keep all DOM/renderer/UI references exactly as they are — only the *source* of their arguments changes (now derived from `match`).

4a. Replace the imports block + state declarations (lines ~1–38) with:

```ts
import { GameRenderer } from "./GameRenderer";
import { GameUI } from "./GameUI";
import { LobbyScreen } from "../ui/LobbyScreen";
import { matchWinner, firstShooterNextRound, type MatchConfig } from "./matchLogic";
import { configToHash, parseConfigFromHash } from "./configRouter";
import {
  createMatch,
  beginRound,
  worldFor,
  playerById,
  type MatchState,
  type Team,
  type PlayerState,
} from "./matchState";
import { resolveFire } from "./resolveFire";
import { buildLocalLayout } from "./localLayout";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const lobbyEl = document.getElementById("lobby-screen")!;
const gameEl = document.getElementById("game")!;

// ── Game state ────────────────────────────────────────────────────────────────

let renderer: GameRenderer | null = null;
let ui: GameUI | null = null;
let matchConfig: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local" };
let match: MatchState | null = null;

// ── View adapters (1 player per team → existing 2-panel renderer/UI) ───────────

function redOf(m: MatchState): PlayerState {
  return m.players.find((p) => p.team === "red")!;
}
function blueOf(m: MatchState): PlayerState {
  return m.players.find((p) => p.team === "blue")!;
}

/** Push the current match into the renderer from a given team's perspective. */
function renderFrom(m: MatchState, viewTeam: Team): void {
  const viewer = m.players.find((p) => p.team === viewTeam && p.alive) ?? redOf(m);
  renderer!.setWorld(worldFor(m, viewer), viewTeam, redOf(m).pos, blueOf(m).pos);
}
```

4b. Replace `start()` with:

```ts
function start(): void {
  const bounds = renderer!.getEffectiveBounds();
  match = createMatch(matchConfig, buildLocalLayout(bounds), bounds, "red");

  const viewTeam: Team = match.activePlayerId
    ? playerById(match, match.activePlayerId)!.team
    : "red";
  renderFrom(match, viewTeam);

  ui!.resetInputs();
  ui!.setTurn(viewTeam, "");
  renderer!.setNoTurnMode(matchConfig.noTurn);
  if (matchConfig.noTurn) ui!.setNoTurnMode(true);
  ui!.hideWin();
  ui!.hideSplash();
  ui!.updateScoreboard(match.scores.red, match.scores.blue, match.round, matchConfig.rounds);
  ui!.showHpBars(matchConfig.mode === "hp");
  ui!.updateHp(redOf(match).hp, blueOf(match).hp);
  ui!.setStatus();
  ui!.focus();
}
```

4c. Replace `nextRound(roundLoser)` with a version driven by the reducer's result. It is called from `onFire` only when `res.roundEnded` is true:

```ts
function handleRoundEnd(roundLoser: Team): void {
  const m = match!;
  if (m.phase === "over") {
    ui!.setBusy("red", false);
    ui!.setBusy("blue", false);
    ui!.showWin(m.winner!, matchConfig.mode === "hp" ? "Health depleted." : "Direct hit.");
    return;
  }

  const loserLabel = roundLoser === "red" ? "RED" : "BLUE";
  const winnerLabel = roundLoser === "red" ? "BLUE" : "RED";
  const splashHtml =
    `Round ${m.round + 1} of ${matchConfig.rounds}<br>` +
    `<span style="color:${roundLoser === "red" ? "#4488ff" : "#ff4444"}">${winnerLabel} wins the round!</span><br>` +
    `<small style="color:#5e7081">${loserLabel} shoots first</small>`;
  ui!.showSplash(splashHtml);

  window.setTimeout(() => {
    ui!.hideSplash();
    const bounds = renderer!.getEffectiveBounds();
    const firstTeam = firstShooterNextRound(roundLoser);
    match = beginRound(m, buildLocalLayout(bounds), firstTeam);

    const viewTeam: Team = match.activePlayerId
      ? playerById(match, match.activePlayerId)!.team
      : "red";
    renderFrom(match, viewTeam);
    ui!.resetInputs();
    ui!.setTurn(viewTeam, "");
    if (matchConfig.noTurn) ui!.setNoTurnMode(true);
    ui!.updateScoreboard(match.scores.red, match.scores.blue, match.round, matchConfig.rounds);
    if (matchConfig.mode === "hp") ui!.updateHp(redOf(match).hp, blueOf(match).hp);
    ui!.setStatus();
    ui!.focus();
  }, 2000);
}
```

> Note: `matchWinner` is imported only to keep the type re-export stable for downstream files; if `tsc` flags it as unused, delete it from the import list. The reducer owns win detection now.

4d. Replace `onFire(player, latex)` with:

```ts
async function onFire(player: Team, latex: string): Promise<void> {
  const m = match;
  if (!m || m.phase !== "play") return;

  const shooter = m.players.find((p) => p.team === player && p.alive);
  if (!shooter) return;

  const res = resolveFire(m, { playerId: shooter.id, latex });

  if (res.rejected) {
    if (res.rejected === "bad-function") {
      ui!.setStatus("that isn't a plottable function of x");
    }
    return;
  }

  ui!.setBusy(player, true);
  await renderer!.playShot(res.shot!, player);

  // Commit the resolved state.
  match = res.next;
  ui!.setBusy(player, false);

  // Crater / HP visuals.
  if (res.shot!.hit.kind === "target" && matchConfig.mode === "hp" && res.damage) {
    const defender: Team = player === "red" ? "blue" : "red";
    renderer!.showFloatingDamage(res.shot!.hit.at, res.damage, defender);
  }

  if (res.roundEnded) {
    const viewTeam: Team = player; // shooter's view for the final frame
    renderFrom(match, viewTeam);
    if (matchConfig.mode === "hp") ui!.updateHp(redOf(match).hp, blueOf(match).hp);
    handleRoundEnd(res.roundLoser!);
    return;
  }

  // Round continues: re-render from the new active team's perspective.
  const viewTeam: Team = match.activePlayerId
    ? playerById(match, match.activePlayerId)!.team
    : player;
  renderFrom(match, viewTeam);
  if (matchConfig.mode === "hp") ui!.updateHp(redOf(match).hp, blueOf(match).hp);
  if (!matchConfig.noTurn) ui!.setTurn(viewTeam, latex);
  ui!.setStatus(res.shot!.hit.kind === "target" ? `Hit! -${res.damage ?? 0} HP` : noteFor(res.shot!.hit.kind));
  ui!.focus();
}
```

4e. Keep `noteFor`, `bootWithTutorial`, `startGame`, `goToLobby`, `route`, the `popstate` listener, and the final `route()` call exactly as they are. They already call `start()` / `onFire` through the same signatures.

- [ ] **Step 5: Typecheck, test, and smoke-test**

Run: `npx tsc --noEmit`
Expected: no errors. (If `matchWinner` is reported unused in `main.ts`, remove it from the import line and re-run.)

Run: `npm test`
Expected: PASS — all new spine tests plus the pre-existing `engine`, `collision`, `trajectory`, `matchLogic`, `hpLogic`, `configRouter`, and `firePipeline` suites.

Run: `npm run dev`, open the app, and manually confirm — for **Classic**, **HP**, and **No-Turn** matches — that: a flat `0` shot from a clear position hits; HP bars drain by the floating-damage amount; a round win shows the splash and starts the next round with the loser firing first; and the match-win banner appears at majority. Behavior should be indistinguishable from before this plan.

- [ ] **Step 6: Commit**

```bash
git add src/game/localLayout.ts src/game/spine.integration.test.ts src/game/main.ts
git commit -m "refactor(game): drive local hot-seat through the MatchState spine"
```

---

## Self-Review Notes

- **Spec coverage:** `MatchState`/`PlayerState`/`resolveFire` (the spine named across `docs/multiplayer-arch/`) — Tasks 1–6. `main.ts` off module-globals — Task 7. Team-generic data model (D2) — Tasks 1–2 tested with 2v2 and 3v1. Classic + HP + No-Turn behavior preserved — Tasks 4, 5, 7. Out-of-scope items (turn timer D3, seeded planets D4, N-player render, lobby teams, networking) are deliberately excluded per Global Constraints and remain consistent with the spine.
- **DOM-free check:** `matchState.ts`, `turnQueue.ts`, `resolveFire.ts` import only from `../sim/*`, `../math/Context`, and sibling pure modules — verify no Pixi/DOM import sneaks in (it would break the Architecture-B server reuse).
- **Type consistency:** `Team`, `PlayerState`, `MatchState`, `RoundLayout`, `FireIntent`, `ShotResolution`, `resolveFire`, `createMatch`, `beginRound`, `worldFor`, `buildTurnQueue`, `nextActive`, `buildLocalLayout` are used with identical signatures across tasks. `firstShooterNextRound`/`matchWinner` keep their existing `matchLogic.ts` signatures.
- **No-turn nuance:** the reducer does not track "bullet in flight"; the orchestration layer (`main.ts` here, the server later) gates concurrent fires. In `main.ts`, `setBusy` + the per-call `shooter.alive` guard plus the reducer's own guards preserve the current one-shot-at-a-time feel.
