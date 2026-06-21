# Graph War — Component Design (Simulation Layer)

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
- **`compileExpression(latex) → { fn: (x) => number, error }`** (`src/math/Expression.ts`)
  — the only bridge from input to math. The engine receives the compiled `fn`, never
  LaTeX. `fn` returns `NaN` for undefined/non-real/non-finite points; the engine treats
  `NaN` as "no point here" (a gap), exactly as `GraphRenderer.drawCurves` already does.

> **Stack note / deviation to reconcile:** the architecture doc names **math.js** for
> evaluation (§5), but the code uses **@cortex-js/compute-engine**, which parses MathLive's
> LaTeX directly with no fragile LaTeX→text step. This is a reasonable improvement. The
> architecture doc's §5 row should be updated to match. No impact on the engine, which only
> ever sees the compiled `(x) => number` closure.

---

## 1. Module boundaries & folder structure

```
src/
  math/        Expression compile (exists). Input→fn bridge.
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

`FunctionTrajectory(fn, origin, dir)` walks `x` outward from the soldier's origin,
emitting `{ x: origin.x + dir*dx, y: origin.y + fn(dx) }`. Note **`fn` is evaluated in the
soldier's local frame** (origin-relative), so a soldier always fires `y = f(x)` "from
itself" regardless of where it stands — see §4.

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

---

## 4. Coordinate system & soldier-as-origin transform (§9 resolved)

- **One world coordinate space**, shared by sim and render, matching `Camera`'s world units
  (1 unit = 48 px at default scale). Y is up in world space (Camera already flips for
  screen).
- **World bounds**: a fixed play-field, default `x ∈ [-12, 12]`, `y ∈ [-7, 7]` (tunable;
  comfortably fills the default camera). Shots leaving bounds are `kind:"bounds"` hits.
- **Soldier-as-local-origin:** each soldier has a world `pos`. When it fires `y = f(x)`,
  the curve is evaluated in the soldier's **local frame** and translated to world:
  `worldPoint = pos + dir * (dx, f(dx))` where `dx ≥ 0` grows away from the soldier and
  `dir ∈ {+1,-1}` is facing. This is the single transform; everything downstream is world
  space. (Rotated firing frames are a deliberate P1+ extension and not modelled now.)

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
