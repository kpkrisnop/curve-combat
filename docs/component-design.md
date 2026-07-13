# CurveCombat — Component Design (Simulation Layer)

> Resolves the open questions in [architecture-decisions.md §9](./architecture-decisions.md).
> Scope: the **pure simulation layer** and the narrow interfaces it exposes to the
> Input and Render layers. This is the part not covered by the grapher prototype
> currently being built (`src/graph`, `src/ui`, `src/math`).

**Status:** Design — ready to implement after the grapher prototype stabilises.
**Last updated:** 2026-06-21

---

## 0. Grounding in existing code

The grapher prototype already establishes two pieces the engine builds on directly, so
the design reuses them rather than reinventing:

- **`Camera`** (`src/graph/Camera.ts`) — owns the world↔screen transform. The simulation
  works **entirely in world coordinates**; the renderer uses `Camera` to project. The
  engine never imports `Camera`.
- **`evaluateAll(rows) → Map<id, RowResult>`** (`src/math/Context.ts`) — the bridge from
  input to math. It evaluates every expression row together (Desmos-style), so constants
  (`a = 10`) and user function definitions (`f(x) = 2x`) declared in any row resolve when
  compiling curves in other rows. Each curve `RowResult` carries `fn: (x) => number` — the
  only thing the engine ever sees. `fn` returns `NaN` for undefined/non-real/non-finite
  points; the engine treats `NaN` as "no point here" (a gap), exactly as
  `GraphRenderer.drawCurves` already does. The engine never touches LaTeX or the row model —
  the game layer pulls the active shooter's `fn` out of the `RowResult` and hands it to
  `fire()` (§7).

> **Stack note (reconciled):** the architecture doc originally named **math.js** for
> evaluation and **MathLive** for input; the code instead uses **@cortex-js/compute-engine**
> (parses LaTeX directly, no fragile LaTeX→text step) with a **MathQuill** input field. This
> is now locked in across a rewrite, and §2/§5 of the architecture doc have been corrected to
> match. No impact on the engine, which only ever sees the compiled `(x) => number` closure.

---

## 1. Module boundaries & folder structure

```
src/
  math/        Context.ts: evaluateAll(rows)→RowResult (exists). Input→fn bridge.
  graph/       Camera + GraphRenderer (exists). Pure render/view.
  ui/          ExpressionPanel (exists). DOM widgets.
  sim/         ← NEW. The pure, deterministic engine. No DOM/Pixi/MathLive imports.
    types.ts        Shared value types: Vec2, World, Unit, Terrain, TurnState.
    trajectory.ts   Trajectory abstraction + sampler.
    collision.ts    Point-stream collision against units/terrain/bounds.
    world.ts        World state container + soldier-as-origin transform.
    turn.ts         Turn system + win-state (Stage B).
    rng.ts          Seeded RNG (deterministic).
    engine.ts       Orchestrates: fire(fn) → ShotResult.
  game/        ← NEW (later). Glue: wires sim ↔ GraphRenderer ↔ ExpressionPanel.
```

**Rule:** `sim/*` must be importable and testable in Node with no browser. The only
dependency direction allowed is `game/ → {sim, graph, ui, math}`. `sim` depends on nothing
but `sim`.

---

## 2. The `Trajectory` abstraction (§4 resolved)

A `Trajectory` is a **producer of a sampled point stream in world coordinates**. It is the
single thing collision consumes, so every shot type reduces to one collision pathway.

```ts
// sim/types.ts
export interface Vec2 { x: number; y: number; }

// sim/trajectory.ts
export interface TrajectorySample {
  p: Vec2;          // world-space point
  t: number;        // parameter value that produced it (x for f(x); t for parametric)
  gap: boolean;     // true => discontinuity BEFORE this point (do not connect to prev)
}

export interface Trajectory {
  /** Lazily yields samples in firing order. Bounded by the caller (see sampler). */
  sample(opts: SampleOptions): Iterable<TrajectorySample>;
  kind: "function" | "parametric" | "piecewise" | "region";
}

export interface SampleOptions {
  /** World bounds the shot may exist in; sampling stops at the far edge. */
  bounds: Bounds;
  /** Max world-space step between adjacent samples before subdivision kicks in. */
  maxStepWorld: number;   // default derived from world units, ~0.05
  /** Hard cap on samples to guarantee termination near asymptotes. */
  maxSamples: number;     // default 20_000
  /** Firing direction: soldiers facing left fire along decreasing x. */
  dir: 1 | -1;
}

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }
```

### Function shot (P0)

`FunctionTrajectory(fn, soldier, dir)` samples **world x** outward from the soldier toward
the enemy, on a curve that is `fn` **vertically anchored** to pass through the soldier:
`yOffset = soldier.y - fn(soldier.x)` (computed once); each sample is
`{ x: soldier.x + dir*step, y: fn(x) + yOffset }`, where `dir ∈ {+1,-1}` is the facing
(which way world x marches). **`fn` is evaluated at true world x** (no horizontal shift), so
the curve's domain edges / asymptotes sit at fixed world positions and the shot simply ends
where `fn` becomes undefined — see §4. If `fn(soldier.x)` is undefined the anchor can't be
computed and the shot is a **dud**; choosing a function defined at one's position is on the
player.

### Future kinds (P1, no collision changes)

- **Parametric** `(x(t), y(t))` — walk `t`; same sample stream.
- **Piecewise** — concatenate sub-trajectories; `gap=true` at the seams.
- **Region (inequality)** — `kind:"region"`; collision switches to area test (§3.4).

---

## 3. Sampling & collision (§9: interface, resolution, discontinuities)

### 3.1 Adaptive sampling resolution

Fixed pixel-stepping (as in the prototype's `drawCurves`, 1px) is render-correct but
**not** simulation-correct: collisions must be deterministic and zoom-independent. So the
engine samples in **world space** with adaptive subdivision:

1. Step `t` so the nominal world step is `maxStepWorld`.
2. If `|Δy|` between two samples exceeds `maxStepWorld` (steep region), bisect up to
   `MAX_BISECT` (e.g. 6) times. This keeps the polyline within tolerance of the true curve
   so a thin target between samples is not skipped.
3. Stop at `bounds` edge or `maxSamples` (asymptote guard).

### 3.2 Discontinuity / asymptote handling

A sample is a **gap** (emit `gap:true`, never connect across it for collision or render)
when any holds:

- `fn(x)` is `NaN` / non-finite (e.g. `1/x` at 0, `log` of negative).
- `|Δy|` between adjacent samples after max bisection still exceeds an **asymptote
  threshold** (e.g. `> 50 * maxStepWorld`) — `tan(x)`, `1/x`. This mirrors the renderer's
  "huge vertical jump" break, but expressed in world units instead of `h*2` pixels so the
  two layers agree.

Collision **never tests a segment that spans a gap.** A projectile crossing an asymptote
simply terminates the shot at the last finite point (treated as flying off-world), matching
Graphwar's behaviour.

### 3.3 Collision against the point stream

```ts
// sim/collision.ts
export type HitKind = "unit" | "terrain" | "bounds" | "expired";

export interface Hit {
  kind: HitKind;
  at: Vec2;             // world point of impact
  unitId?: string;      // present when kind === "unit"
  sampleIndex: number;  // index in the stream (for trail truncation/render)
}

/** Walks the stream segment-by-segment; returns the FIRST hit or an "expired" terminus. */
export function detectCollision(
  samples: Iterable<TrajectorySample>,
  world: World,
): Hit;
```

Per segment `(a → b)` where neither endpoint is a gap, test in this priority order and
return the earliest hit along the segment:

1. **Bounds** — segment exits `world.bounds`.
2. **Terrain** — segment intersects any terrain shape (P0: axis-aligned rectangles /
   polylines; point-in-poly + segment-intersect).
3. **Unit** — segment passes within `unit.radius` of `unit.pos`
   (segment–circle distance). **The firing soldier is immune for the first `selfClearDist`
   world units** so a shot never self-detonates on launch.

First hit wins; the projectile stops there. If the stream ends with no hit, return
`{ kind: "expired" }` at the last point.

### 3.4 Region shots (P1 hook)

For `kind:"region"` the collision switches to: a unit is hit iff `unit.pos` satisfies the
inequality and lies within `bounds`. Same `Hit` output shape, so callers are unchanged.

### 3.5 Destructible terrain — Planets

A **Planet** is destructible circular terrain (glossary: `CONTEXT.md`; decision:
architecture-decisions.md §10). Unlike Targets, a Planet is not destroyed in one hit — each
impact carves a **crater** (empty space), and the Shot stops at the Planet's solid *meat*.

```ts
interface Crater { pos: Vec2; radius: number; }            // carved empty space
interface Planet { id: string; pos: Vec2; radius: number; craters: Crater[]; }
// World gains: planets: Planet[]
```

**Solidity is purely geometric — no connectivity rule.** A world point `p` is solid iff some
Planet `P` has `|p − P.pos| ≤ P.radius` AND `p` lies outside *every* crater of `P`
(`|p − c.pos| > c.radius` for all `c`). Detached islands of meat therefore stay solid; a
Planet is only "gone" once craters cover all of it.

**Collision integration.** Planet meat is tested by **point-in-meat sampling** of the
trajectory (not segment–circle, because a Planet circle contains empty crater regions). The
first sample inside meat is the impact; bisect between the previous empty point and that
sample to land the contact on the surface. This slots into the same first-contact walk as
Targets — earliest hit along the stream wins — adding `kind:"planet"` to `Hit`. Because
craters are empty, a Shot passes through existing craters and strikes meat behind them.

**Crater carving stays out of the pure engine.** `fire()` only *reports* the impact point;
the game layer carves the crater (`planet.craters.push({ pos: hit.at, radius: CRATER_RADIUS })`)
exactly as it removes a destroyed Target — keeping the engine pure and deterministic (§3 of
the architecture doc). Crater radius is a **fixed `0.8`** world units. Crater impacts do
**not** splash-damage Targets; a Planet hit is a miss that still consumes a shot.

---

## 4. Coordinate system & soldier-as-origin transform (§9 resolved)

- **One world coordinate space**, shared by sim and render, matching `Camera`'s world units
  (1 unit = 48 px at default scale). Y is up in world space (Camera already flips for
  screen).
- **World bounds**: a fixed play-field, default `x ∈ [-12, 12]`, `y ∈ [-7, 7]` (tunable;
  comfortably fills the default camera). Shots leaving bounds are `kind:"bounds"` hits.
- **World-anchored firing transform:** the function lives in **world coordinates**. A
  soldier contributes only its position and facing — *not* a local origin for the function.
  The curve is `f` evaluated at true world x, translated vertically so it passes through the
  soldier:

  ```
  y(x) = f(x) + (soldier.y − f(soldier.x))
  ```

  The shot samples world x from `soldier.x` toward the enemy (`dir ∈ {+1,-1}`) and
  terminates where `f` leaves its domain, exits bounds, or hits a target. There is **no
  reflection** of the function per side — both soldiers see the same world-space curve shape,
  each merely starting at its own position.

  *Worked example:* soldier at `(4, 0)` firing `sqrt(x)` leftward. `yOffset = 0 − sqrt(4) =
  −2`, so the drawn curve is `sqrt(x) − 2`. Marching left: `(4,0) → (1,−1) → (0,−2)`, then it
  **stops at `(0,−2)`** because `sqrt` is undefined for `x < 0`.

  **Consequence (decided):** a function undefined at `soldier.x` (or that ends before
  reaching the enemy) is a **dud**; the player adapts by shifting it (e.g. `sqrt(x+4)`). This
  deliberately replaces any auto-mirroring — the original "graph won't draw on one side"
  concern is answered by the player composing functions in absolute world coordinates, not by
  the engine flipping anything.

---

## 5. Turn system & win-state — Stage B (§9 resolved)

```ts
// sim/turn.ts
export interface Unit {
  id: string;
  team: 0 | 1;
  pos: Vec2;
  radius: number;     // collision + draw radius
  hp: number;
  alive: boolean;
}

export interface TurnState {
  units: Unit[];
  activeTeam: 0 | 1;
  phase: "aiming" | "resolving" | "over";
  winner: 0 | 1 | null;
}
```

- **Turn-based, alternating teams.** Active team fires one shot; engine resolves it fully
  (one `ShotResult`), applies damage, then advances `activeTeam` to the team with a living
  unit. Friendly fire is **on** (per P0 scope §7).
- **Win check** after every resolution: a team with no `alive` units loses;
  `phase:"over"`, `winner` set. Double-elimination on a single shot → draw (`winner:null`,
  `phase:"over"`).
- Hot-seat only — no networking. The deterministic resolution (one input → one
  `ShotResult`) is exactly the unit a server would later run authoritatively (§3 of arch
  doc), so Stage B is the multiplayer seam with no rewrite.

---

## 6. Damage model (§9 resolved)

**Decision: explosion radius, not pure instant-hit.** On a `unit`/`terrain`/`bounds` hit,
apply radial damage at `Hit.at`:

```
damage(unit) = maxDamage * clamp(1 - dist(unit.pos, Hit.at) / blastRadius, 0, 1)
```

- Defaults: `maxDamage = 50`, `blastRadius = 1.5` world units, `unit.hp = 100`
  (≈ two direct hits to kill; splash chips).
- `kind:"expired"` (flew off without impact) deals **no** damage — a clean miss.
- Falloff is linear and deterministic (no RNG), keeping the engine pure. A seeded
  `rng.ts` exists for any future stochastic effects (wind, crits) without breaking
  determinism.

**Rationale:** explosion radius gives skill expression (near-misses still matter) and is a
strict superset of instant-hit (`blastRadius→0`), so we never have to rework damage later.

---

## 7. Engine entry point — the whole loop in one call

```ts
// sim/engine.ts
export interface ShotResult {
  trajectory: TrajectorySample[];   // truncated at impact, for the renderer to draw the trail
  hit: Hit;
  damaged: { unitId: string; amount: number }[];
  nextState: TurnState;             // post-damage, post-turn-advance (pure: input unchanged)
}

/** Pure: same (world, activeUnit, fn, dir) ⇒ same ShotResult. No side effects. */
export function fire(
  world: World,
  fn: (x: number) => number,
  opts?: Partial<SampleOptions>,
): ShotResult;
```

The render/game layer calls `fire`, animates `trajectory` (drawing samples up to `hit`
with `Camera`), shows damage numbers, and swaps in `nextState`. Stage A is the same call
with a one-unit, no-turn-advance world.

---

## 8. Testing strategy (Vitest)

Because `sim/*` is pure and browser-free, it is unit-tested directly (add `vitest` as a dev
dependency when implementation starts — deferred now to avoid touching `package.json` while
the grapher build is in flight):

- `trajectory`: `y=x` is a straight diagonal; `sin(x)` sample count/extent; `1/x` and
  `tan(x)` emit gaps at the right places; `maxSamples` terminates.
- `collision`: known hit/miss geometries; self-immunity near launch; first-hit ordering
  (bounds vs terrain vs unit); gap segments never collide.
- `turn`/`damage`: falloff math; win/draw detection; turn advancement skips dead teams.
- **Determinism:** same inputs ⇒ byte-identical `ShotResult` (the multiplayer guarantee).

---

## 9. What this leaves open (intentionally)

- Exact terrain authoring/representation beyond P0 rectangles (heightmap vs polygons).
- Visual/animation tuning of the trail (render-layer concern, not engine).
- Wind/power-ups/new shot UIs — P1, but the `Trajectory`/`Hit`/`ShotResult` shapes above
  already accommodate them.
```
