# Group 1 · Physics & Animation Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 1200 ms shot animation with constant x-velocity, and add `impactSlope` to `ShotResult` for use by HP Mode (Group 3).

**Architecture:** Two independent, minimal changes. Task 1 is pure simulation logic (no DOM/Pixi) and is fully unit-testable. Task 2 is a renderer change (Pixi) with no viable unit test — verified manually. Neither change affects game rules; the current one-hit-kill behaviour is untouched. `impactSlope` is computed and returned but not consumed until Group 3.

**Tech Stack:** TypeScript, Vite 8, Vitest 3, Pixi.js 8. Run tests with `npm test`. Run the dev server with `npm run dev`.

## Global Constraints

- TypeScript strict mode — no `any`, no implicit `any`.
- Test runner: Vitest (`npm test`). All existing tests must remain green after every task.
- `impactSlope` is a required field on `ShotResult` — not optional. Callers that don't care about it (Classic VS) simply ignore it.
- Do not add a live curve preview at any point — blind fire is intentional design.
- Do not change `SHOT_DURATION_MS` usages in `dustPuff`, `explode`, or `flashDud` — those are impact FX timings, not travel time.

---

## File Map

| File | Change |
|---|---|
| `src/sim/types.ts` | Add `impactSlope: number` to `ShotResult` |
| `src/sim/engine.ts` | Compute `impactSlope` from bracketing samples; add to return value |
| `src/sim/engine.test.ts` | Add 3 new tests for `impactSlope` |
| `src/game/GameRenderer.ts` | Replace `SHOT_DURATION_MS` constant with x-velocity duration computed per-shot |

---

## Task 1: Add `impactSlope` to `ShotResult`

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/engine.ts`
- Modify: `src/sim/engine.test.ts`

**Interfaces:**
- Produces: `ShotResult.impactSlope: number` — consumed by Task 2 (renderer ignores it) and eventually by Group 3 HP Mode.

---

- [ ] **Step 1: Add `impactSlope` to the `ShotResult` interface**

Open `src/sim/types.ts`. Replace the `ShotResult` interface:

```ts
export interface ShotResult {
  /** Samples in firing order, truncated at the point of impact. */
  samples: TrajectorySample[];
  hit: Hit;
  /**
   * |dy/dx| at the impact point, computed from the two samples bracketing the
   * hit. Zero for non-target hits (planet, bounds, dud). Used by HP Mode to
   * compute damage: steeper angle = faster bullet = more damage.
   */
  impactSlope: number;
}
```

- [ ] **Step 2: Write the failing tests**

Open `src/sim/engine.test.ts`. Add this `describe` block after the existing one:

```ts
describe("fire — impactSlope", () => {
  it("is 0 for a flat horizontal hit (slope = 0)", () => {
    // fn = () => 0 → the anchored curve is y=0 everywhere
    // soldier at (-8, 0), target at (0, 0, r=0.4) → direct hit
    const result = fire(world(), () => 0);
    expect(result.hit.kind).toBe("target");
    expect(result.impactSlope).toBeCloseTo(0, 2);
  });

  it("is ~1 for a 45-degree diagonal hit (slope = 1)", () => {
    // fn = (x) => x → yOffset = 0 - (-8) = 8 → anchored curve: y = x + 8
    // at x=2, y=10 → place target at (2, 10)
    const w = world({
      targets: [{ id: "diag", pos: { x: 2, y: 10 }, radius: 0.4 }],
    });
    const result = fire(w, (x) => x);
    expect(result.hit.kind).toBe("target");
    expect(result.impactSlope).toBeCloseTo(1, 1);
  });

  it("is 0 for a non-target hit (planet block)", () => {
    const w = world({
      planets: [{ id: "p1", pos: { x: -4, y: 0 }, radius: 1, craters: [] }],
    });
    const result = fire(w, () => 0);
    expect(result.hit.kind).toBe("planet");
    expect(result.impactSlope).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests — expect failures**

```bash
npm test
```

Expected output includes:
```
FAIL  src/sim/engine.test.ts
  fire — impactSlope
    × is 0 for a flat horizontal hit (slope = 0)
    × is ~1 for a 45-degree diagonal hit (slope = 1)
    × is 0 for a non-target hit (planet block)
```

(TypeScript will also error because `impactSlope` is missing from the return value in `engine.ts`.)

- [ ] **Step 4: Implement `impactSlope` in `engine.ts`**

Open `src/sim/engine.ts`. Replace the entire file with:

```ts
import { detectCollision, type CollisionOptions } from "./collision";
import { sampleTrajectory, type SampleOptions } from "./trajectory";
import type { ShotResult, TrajectorySample, Hit, World } from "./types";

export interface FireOptions extends SampleOptions, CollisionOptions {}

/**
 * Fire one shot: turn a compiled curve into a world-space trajectory, find the
 * first impact, and return the truncated path plus the hit. Pure and
 * deterministic — identical (world, fn) always produce identical results, and
 * `world` is never mutated (the caller removes a destroyed target and re-checks
 * the win state). See component-design.md §7 and the spec §5.4.
 */
export function fire(
  world: World,
  fn: (x: number) => number,
  opts: FireOptions = {},
): ShotResult {
  const samples = sampleTrajectory(fn, world.soldier, world.bounds, opts);

  if (samples.length === 0) {
    return {
      samples: [],
      hit: { kind: "dud", at: world.soldier.pos, sampleIndex: 0 },
      impactSlope: 0,
    };
  }

  const hit = detectCollision(samples, world, opts);

  // Truncate the path at the impact: keep samples up to the hit segment's start,
  // then end exactly on the impact point (for target / bounds hits).
  const truncated = samples.slice(0, hit.sampleIndex + 1);
  if (hit.kind === "target" || hit.kind === "planet" || hit.kind === "bounds") {
    truncated.push({ p: hit.at, x: hit.at.x, gap: false });
  }

  return { samples: truncated, hit, impactSlope: computeImpactSlope(samples, hit) };
}

/**
 * Compute |dy/dx| at the impact point using the trajectory sample immediately
 * before the hit and the hit point itself. Only meaningful for target hits;
 * returns 0 for all other hit kinds.
 */
function computeImpactSlope(samples: TrajectorySample[], hit: Hit): number {
  if (hit.kind !== "target" || hit.sampleIndex < 0 || hit.sampleIndex >= samples.length) {
    return 0;
  }
  const prev = samples[hit.sampleIndex];
  const dx = hit.at.x - prev.x;
  if (Math.abs(dx) < 1e-10) return 50; // near-vertical: cap at 50
  return Math.abs((hit.at.y - prev.p.y) / dx);
}
```

- [ ] **Step 5: Run the tests — expect all green**

```bash
npm test
```

Expected output:
```
✓ src/sim/engine.test.ts (10 tests)
✓ src/sim/collision.test.ts
✓ src/sim/trajectory.test.ts
✓ src/game/firePipeline.test.ts
```

All tests green. No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/engine.ts src/sim/engine.test.ts
git commit -m "feat(sim): add impactSlope to ShotResult for HP Mode damage"
```

---

## Task 2: X-Velocity Animation in `GameRenderer`

**Files:**
- Modify: `src/game/GameRenderer.ts`

**Interfaces:**
- Consumes: `ShotResult.samples` (already present); the new `impactSlope` field is ignored here — `GameRenderer` only animates.
- Produces: nothing new for downstream — this is a renderer-only change.

---

- [ ] **Step 1: Read the current `playShot` method**

Open `src/game/GameRenderer.ts`. Find the constant at the top:

```ts
const SHOT_DURATION_MS = 1200;
```

And the `playShot` method (line ~235). The animation uses:
```ts
const progress = Math.min(1, (performance.now() - start) / SHOT_DURATION_MS);
```

You will replace `SHOT_DURATION_MS` with a per-shot duration derived from the path's x-length.

- [ ] **Step 2: Replace `SHOT_DURATION_MS` with `X_VELOCITY_WORLD`**

In `src/game/GameRenderer.ts`, make these two changes:

**Change 1** — replace the constant at the top of the file:
```ts
// Remove:
const SHOT_DURATION_MS = 1200;

// Add:
/** World-units per second the bullet travels along the x-axis. */
const X_VELOCITY_WORLD = 6;
/** Minimum animation duration in ms — prevents instant flicker on zero-length shots. */
const MIN_SHOT_MS = 200;
```

**Change 2** — replace the start of the `playShot` method. The method currently starts with:
```ts
playShot(result: ShotResult): Promise<void> {
  this.trailLayer.clear();
  this.fxLayer.clear();
  const trailColor = this.activeColor();

  return new Promise((resolve) => {
    if (result.hit.kind === "dud" || result.samples.length < 2) {
      this.flashDud(this.world.soldier.pos);
      window.setTimeout(resolve, 350);
      return;
    }

    const samples = result.samples;
    const start = performance.now();
```

Replace with:
```ts
playShot(result: ShotResult): Promise<void> {
  this.trailLayer.clear();
  this.fxLayer.clear();
  const trailColor = this.activeColor();

  return new Promise((resolve) => {
    if (result.hit.kind === "dud" || result.samples.length < 2) {
      this.flashDud(this.world.soldier.pos);
      window.setTimeout(resolve, 350);
      return;
    }

    const samples = result.samples;

    // Compute total x-distance of the shot path (skip gap segments).
    let xLength = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      if (!samples[i + 1].gap) {
        xLength += Math.abs(samples[i + 1].x - samples[i].x);
      }
    }
    const shotDurationMs = Math.max(MIN_SHOT_MS, (xLength / X_VELOCITY_WORLD) * 1000);

    const start = performance.now();
```

**Change 3** — inside the `tick` function, replace the one line that references `SHOT_DURATION_MS`:
```ts
// Remove:
const progress = Math.min(1, (performance.now() - start) / SHOT_DURATION_MS);

// Add:
const progress = Math.min(1, (performance.now() - start) / shotDurationMs);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 4: Start the dev server and manually verify animation speed**

```bash
npm run dev
```

Open `http://localhost:5173` in the browser.

**Test A — long shot:**
- RED types `0` (flat horizontal line — crosses the whole field)
- Fire. The bullet should take roughly **3–4 seconds** to cross from RED's position (~x=-12) to BLUE's position (~x=+12), covering ~24 world-units at 6/sec.

**Test B — short shot:**
- Reset. RED types `100` (very steep vertical offset — bullet will quickly exit at the top)
- Fire. The bullet should resolve noticeably faster than a flat-line shot (small x-travel before hitting the top boundary).

**Test C — dud:**
- Reset. RED types `\sqrt{x}` (undefined at negative x).
- Fire. A brief flash appears and the turn ends in ~350 ms — no travel animation. This is unaffected by the change.

- [ ] **Step 5: Commit**

```bash
git add src/game/GameRenderer.ts
git commit -m "feat(renderer): animate shot at constant x-velocity instead of fixed 1200ms"
```

---

## Self-Review

**Spec coverage check (§3):**
- ✅ §3.1 Animation model: `X_VELOCITY_WORLD = 6`, `xLength` computed from samples, duration = `xLength / X_VELOCITY_WORLD`. `MIN_SHOT_MS` guards zero-length edge case.
- ✅ §3.2 Impact slope: `impactSlope` added to `ShotResult`; formula uses bracketing samples; non-target hits return 0; cap at 50 for near-vertical.
- ✅ §3.3 No curve preview: not touched anywhere.

**Placeholder scan:** None found.

**Type consistency:**
- `ShotResult.impactSlope: number` defined in Task 1 → referenced in Task 2 (`result.impactSlope` exists but is unused in the renderer — TS will not complain about unused struct fields).
- `computeImpactSlope(samples, hit)` takes `TrajectorySample[]` and `Hit` — both imported in `engine.ts` ✅.
- `result.samples` consumed in Task 2 — same type as always (`TrajectorySample[]`) ✅.

**Open questions from spec §10:**
- "Does 6 world-units/sec feel right?" — answered by Task 2 Step 4 manual test. Tune `X_VELOCITY_WORLD` if needed.
