# Spec — Shooting Prototype (Stage A)

**Date:** 2026-06-21
**Status:** Design approved — ready for implementation planning
**Related:** [architecture-decisions.md](../../architecture-decisions.md),
[component-design.md](../../component-design.md)

> Build the first playable Graph War loop: a single soldier fires a typed math function;
> the projectile traces the resulting curve in world space, detonates on the first target it
> touches, and the round is won when every target is cleared. Runs as an **isolated entry**
> alongside the existing grapher so it never collides with the in-flight grapher work.

---

## 1. Goal & success criteria

A player can: type a function → press Fire → watch a projectile trace the curve from the
soldier → see it destroy the first target it hits (or miss) → clear all targets to win →
reset and play again.

**Done when:**
- Typing a valid function and firing animates a projectile along the world-anchored curve.
- The shot stops at the **first** target or playfield edge it reaches.
- Hitting a target removes it; clearing all targets shows a win banner with the shot count.
- A function undefined at the soldier's position fires a visible **dud** (no crash).
- The `sim/` engine is pure, deterministic, and unit-tested in Node with no browser.

---

## 2. Locked design decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Projectile behavior | **Animated traversal** — dot rides the curve over ~1.2 s; collision resolves at contact. |
| 2 | Firing direction | **Fixed toward the enemy/targets.** No per-shot direction UI. |
| 3 | Hit rule | **Stops at first contact** (target or bounds). |
| 4 | MVP scope | **Targets + bounds only.** No obstacles/terrain in this cut. |
| 5 | Aiming | **Blind fire** — nothing is drawn until Fire; the curve appears as the projectile traces it. |
| 6 | Integration | **Isolated entry** (`game.html`) — reuses shared modules read-only; touches no grapher files. |
| 7 | Firing transform | **World-anchored with vertical bump** (see §4). |
| 8 | Undefined-at-soldier | **Dud** — the player adapts the function; the engine never auto-mirrors. |

---

## 3. Architecture & files

Everything new lives in folders the grapher session does not touch. Reuse is **read-only**.

```
game.html                  ← NEW standalone Vite entry (the shooter runs here)
src/
  sim/                     ← NEW. Pure engine. No DOM / Pixi / MathQuill imports.
    types.ts               Vec2, Bounds, Target, Soldier, World, Hit, ShotResult
    trajectory.ts          FunctionTrajectory: world-anchored adaptive sampler
    collision.ts           detectCollision: first-hit over the sample stream
    engine.ts              fire(world, fn) → ShotResult
  game/                    ← NEW. Browser glue + UI + render.
    main.ts                entry: input → fire → animate → world update → win check
    GameRenderer.ts        own Pixi app on Camera: grid, soldier, targets, trail, FX
    GameUI.ts              single MathInput + Fire button, shots counter, win/reset
  graph/Camera.ts          REUSED, unchanged
  ui/MathInput.ts          REUSED, unchanged
  math/Context.ts          REUSED (evaluateAll on a single row), unchanged
```

**Dependency rule:** `sim` imports only `sim`. `game` imports `{ sim, graph/Camera,
ui/MathInput, math/Context }`. Nothing imports `game` or `sim` back into the grapher.

**Why isolated entry:** another session is actively editing `index.html`, `main.ts`,
`GraphRenderer.ts`, `ExpressionPanel.ts`. A separate `game.html` + `src/game/` means zero
merge-conflict surface. Merging the shooter into the main app as a "mode" is a trivial later
step once the grapher settles.

---

## 4. The firing transform (world-anchored)

The function lives in **absolute world coordinates**. A soldier contributes only its
position, its facing, and a **vertical offset** so the curve passes through it. There is **no
horizontal shift and no per-side reflection** of the function.

```
yOffset = soldier.y − f(soldier.x)          // computed once; if undefined → DUD
y(x)    = f(x) + yOffset                     // f evaluated at TRUE world x
```

The shot samples world x from `soldier.x` toward the enemy (`dir ∈ {+1,-1}`) and terminates
where `f` leaves its domain, exits bounds, or hits a target.

**Worked example (the canonical case):** soldier at `(4, 0)` firing `sqrt(x)` leftward.
`yOffset = 0 − sqrt(4) = −2`, so the drawn curve is `sqrt(x) − 2`. Marching left:
`(4,0) → (1,−1) → (0,−2)`, then it **stops at `(0,−2)`** because `sqrt` is undefined for
`x < 0`.

**Consequences (decided):**
- Domain edges / asymptotes sit at fixed world positions, identical for both sides — only the
  vertical offset differs per soldier.
- A function undefined at `soldier.x`, or that ends before reaching the enemy, is a **dud**.
  The player adapts by composing a function defined at their position (e.g. `sqrt(x+4)`).
  This deliberately replaces auto-mirroring; the original "won't draw on one side" worry is
  answered by the player working in world coordinates, not by the engine flipping anything.

---

## 5. The engine (`sim/`) — pure & deterministic

### 5.1 Types (`types.ts`)

```ts
interface Vec2   { x: number; y: number; }
interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }
interface Target { id: string; pos: Vec2; radius: number; }
interface Soldier { pos: Vec2; dir: 1 | -1; }          // dir = which way world x marches
interface World  { soldier: Soldier; targets: Target[]; bounds: Bounds; }

interface TrajectorySample { p: Vec2; x: number; gap: boolean; } // gap = break before this point
type HitKind = "target" | "bounds" | "expired" | "dud";
interface Hit { kind: HitKind; at: Vec2; targetId?: string; sampleIndex: number; }
interface ShotResult { samples: TrajectorySample[]; hit: Hit; } // samples truncated at impact
```

### 5.2 Trajectory (`trajectory.ts`)

`FunctionTrajectory(fn, soldier)` yields samples along `y(x) = fn(x) + yOffset` (§4):

- **Dud guard:** if `fn(soldier.x)` is not finite, yield nothing; the engine returns
  `hit.kind = "dud"`.
- **Adaptive step:** nominal world-x step `maxStepWorld ≈ 0.04`, marching `dir`. Bisect a
  segment up to `MAX_BISECT ≈ 6` times when `|Δy|` exceeds the step, so thin targets between
  samples are not skipped.
- **Gaps:** emit `gap: true` when `fn(x)` is non-finite, or when `|Δy|` after max bisection
  still exceeds an asymptote threshold (`≈ 50 × maxStepWorld`) — handles `tan(x)`, `1/x`.
- **Termination:** stop at the `bounds` edge or a `maxSamples ≈ 20_000` cap (asymptote
  guard). A gap that ends the defined region (e.g. `sqrt` past its domain) terminates the
  shot at the last finite point.

### 5.3 Collision (`collision.ts`)

`detectCollision(samples, world) → Hit` walks the stream segment-by-segment. For each
segment `a → b` where **neither endpoint is a gap**, test in priority order and return the
earliest hit along the segment:

1. **Bounds** — segment exits `world.bounds` → `kind:"bounds"`.
2. **Target** — segment passes within `target.radius` of `target.pos` (segment–circle
   distance) → `kind:"target"`, `targetId` set.

**Self-immunity:** the first `selfClearDist ≈ 0.5` world units off the muzzle are ignored
(prevents instant self-detonation; matters once units can be hit in 2P).
**First hit wins**; the projectile stops there and `samples` is truncated to the impact.
If the stream ends with no hit → `kind:"expired"` at the last point (a clean miss).

### 5.4 Entry point (`engine.ts`)

```ts
function fire(world: World, fn: (x: number) => number): ShotResult;
```

Pure: same `(world, fn)` ⇒ identical `ShotResult`. No side effects; `world` is not mutated
(the caller removes the hit target and re-checks win state).

---

## 6. Game layer (`game/`) & flow

### 6.1 Default world (seed)

- Soldier on the left, e.g. `pos (-8, 0)`, `dir = +1` (fires toward +x).
- 3–4 targets, `radius ≈ 0.4`, scattered on the right (positive x) within bounds.
- Bounds `x ∈ [-12, 12]`, `y ∈ [-7, 7]`.
- Hint text suggests globally-defined functions (`x^2/8`, `sin(x)`) so the first shot is not
  a dud; domain-limited functions (`sqrt`, `ln`) are the player's to place.

### 6.2 Renderer (`GameRenderer.ts`)

Owns its **own** Pixi `Application` (separate from the grapher's), built on the shared
`Camera`:

- **Fixed camera** framed to the playfield — it's an aiming surface, not a pannable grapher.
- Layers: grid + axes (same `niceStep` approach as the grapher), soldier marker, target
  circles, **progressive trail** (a `Graphics` polyline drawn up to the animation head), and
  explosion / miss FX.
- **Blind fire:** nothing curve-related is drawn until Fire. On fire, a projectile dot rides
  `ShotResult.samples` over ~1.2 s, extending the trail behind it; gaps break the polyline.

### 6.3 UI (`GameUI.ts`)

- A single `MathInput` (reused) + a **Fire** button; **Enter** also fires.
- A shots-used counter; a win banner ("Cleared in N shots") on victory; a **Reset** button
  that re-seeds the world and clears the canvas.

### 6.4 Flow (`main.ts`)

1. Player types LaTeX → on Fire/Enter: `evaluateAll([{ id: "shot", latex }])` → pull the
   curve `RowResult.fn`.
2. `engine.fire(world, fn)` → `ShotResult`.
3. `GameRenderer` animates the dot along `samples`; on reaching `hit`:
   - `target` → explosion FX, remove that target from `world.targets`, re-check win.
   - `bounds` / `expired` → small "miss" puff.
   - `dud` → brief "undefined here" flash, no projectile travel.
4. Increment the shot counter. If `world.targets` is empty → win banner.
5. Reset re-seeds and clears.

---

## 7. Testing

`sim/*` is browser-free, so it is unit-tested directly with **Vitest**:

- **trajectory:** vertical anchor passes through the soldier; `sqrt` worked example ends at
  the domain edge; `1/x` and `tan(x)` emit gaps; dud when `fn(soldier.x)` is undefined;
  `maxSamples` terminates.
- **collision:** known hit/miss geometries; first-hit ordering (bounds vs target);
  self-immunity near the muzzle; gap segments never collide.
- **determinism:** same `(world, fn)` ⇒ identical `ShotResult`.

> ⚠️ **Coordination note:** adding Vitest edits `package.json` / the lockfile — the one file
> that could lightly collide with the grapher session. Add it as a focused commit; any
> conflict is a trivial dependency-line merge.

---

## 8. Out of scope (deferred)

Obstacles / terrain; hot-seat 2-player and turn system; HP / explosion-radius damage (targets
are instakill here); new shot types (parametric / piecewise / inequalities); online
multiplayer; persistence. The `Trajectory` / `Hit` / `ShotResult` shapes already accommodate
these — see [component-design.md](../../component-design.md) §§3–9.
