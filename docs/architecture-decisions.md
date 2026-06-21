# Graph War — Architecture Decisions

> A browser-based, math-driven artillery game inspired by Graphwar. Players fire by
> typing a mathematical function; the projectile travels along the resulting curve.
> Goal: rebuild the original with high-quality graphics and a Desmos-style input,
> then extend it with new shot types and online multiplayer.

**Status:** Design phase (prototype not yet started)
**Last updated:** 2026-06-21

---

## 1. Project Goal & Phasing

| Phase | Target | Description |
|-------|--------|-------------|
| **P0 — Prototype** | Validate core loop | Single shooter firing at static targets, then grow to hot-seat 2-player. Prove: math input → curve render → trajectory → collision. |
| **P1 — Shippable game** | Publish | A polished, playable game built on the prototype's foundation. |

**Decision:** Build P0 first to de-risk the uncertain parts (math input, curve rendering,
collision), then evolve the same codebase toward P1 without a rewrite.

**Rationale:** The risky unknowns are concentrated in the core firing loop. Proving that
loop early validates the whole concept cheaply; everything else (menus, networking, art)
is comparatively well-understood work.

---

## 2. Three-Layer Architecture

The system is split into three independent layers communicating through narrow interfaces.

```
┌─────────────────────────────────────────────────┐
│  INPUT LAYER     MathQuill field → LaTeX string  │
│                  → Compute Engine → Trajectory   │
├─────────────────────────────────────────────────┤
│  SIMULATION      Pure, deterministic game logic. │
│  (the "engine")  Knows: world, units, turns,     │
│                  trajectory sampling, collision. │
│                  No rendering, no DOM. Just data. │
├─────────────────────────────────────────────────┤
│  RENDER LAYER    PixiJS. Reads sim state, draws  │
│                  the plane, curves, units, FX.   │
└─────────────────────────────────────────────────┘
```

**Decision:** Strictly separate **Input**, **Simulation**, and **Render**. The simulation
layer has no knowledge of the DOM, MathLive, or PixiJS.

**Rationale:** Each layer can be understood, changed, and tested independently. The
simulation can be unit-tested with no browser. The renderer can be upgraded (2D → 2.5D)
without touching game logic. The input widget can be swapped without affecting either.

---

## 3. Deterministic, Pure Simulation

**Decision:** The simulation layer is **pure and deterministic** — identical inputs always
produce identical outputs, with no hidden state, no randomness outside a seeded RNG, and no
side effects.

**Rationale:** This is the foundation for **online multiplayer (P1, see §8)**. A
deterministic engine can later run authoritatively on a server: clients send their function,
the server computes the canonical outcome, and clients render it. Designing for this now
avoids a costly rewrite later. It also makes the engine trivially testable and replayable.

---

## 4. Generic `Trajectory` Abstraction

**Decision:** The projectile path is modeled as a generic **`Trajectory`** — a producer of a
sampled stream of points — *not* hardcoded as `y = f(x)`. Collision detection consumes this
generic point stream and is agnostic to how the path was generated.

**Rationale:** Enables planned **new shot types (P1, see §8)** without changing the collision
or rendering code:

- `y = f(x)` — the classic function shot (P0).
- Parametric `(x(t), y(t))` — paths that loop, curl, or move vertically.
- Piecewise functions — different behavior across domains.
- Inequalities — produce a blast *region* rather than a single line.

All of these reduce to "a set/stream of points to test for collisions," so the engine only
needs one collision pathway.

---

## 5. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | **TypeScript** | Type-safe interfaces between layers; critical once multiplayer and new shot types arrive. |
| Build tool | **Vite** | Instant dev server, near-zero config — ideal for fast prototyping. |
| Rendering | **PixiJS** (WebGL) | High-quality "clean modern 2D" now; smooth upgrade path to 2.5D effects later. |
| Math input | **MathQuill** (`@edtr-io/mathquill`) | Desmos-style live notation rendering (the #1 requirement). Swapped in from MathLive; isolated behind `ui/MathInput.ts` so the input library can change in one file. |
| Math evaluation | **@cortex-js/compute-engine** | Parses MathQuill's LaTeX directly (no fragile LaTeX→text step) and compiles expressions into fast, sampleable functions. Decoupled from the input widget. |
| Testing | **Vitest** | Integrates with Vite; unit-tests the pure simulation layer with no browser. |

**Key decoupling:** MathQuill (input rendering) and the Compute Engine (evaluation) are
independent. The simulation only ever receives a compiled `(x) => number` function, so the
input UI can change without affecting game logic.

---

## 6. Visual Direction

**Decision:** Start with **clean, modern 2D** (PixiJS/WebGL) — smooth anti-aliased curves,
glowing projectile trails, particle explosions, polished UI — on a 2D Cartesian plane. Evolve
toward **stylized 2.5D** (parallax, lighting, shadows, juicier effects) after the prototype
proves out.

**Rationale:** Keeps the beloved 2D gameplay of the original intact while looking far better
than it. PixiJS renders fast in-browser and supports the later 2.5D upgrade without a rewrite.

---

## 7. Prototype Scope (P0)

**In scope:**

1. **Stage A — Single shooter, static targets:** One soldier, a few stationary targets, one
   obstacle. Type a function in the MathLive field, watch the curve trace from the soldier
   (treated as the local origin), detect hits/misses against targets, terrain, and bounds.
2. **Stage B — Hot-seat 2-player:** Two soldiers on one screen, turn-based, friendly fire on,
   win when the opponent is eliminated. No networking.

**Explicitly out of scope for P0:** online multiplayer, new shot types, power-ups, level
editor, accounts, persistence. The architecture (§3, §4) accommodates these later.

---

## 8. Planned Future Functionality (P1+)

Prioritized by the user; **not** built in the prototype, but the architecture is designed to
support them cleanly:

- **New shot types** — parametric paths, piecewise functions, and inequalities (blast
  regions). Enabled by the `Trajectory` abstraction (§4).
- **Online multiplayer** — real-time networked matches with an authoritative server.
  Enabled by the deterministic pure simulation (§3).

---

## 9. Open Questions / Not Yet Decided

These are deferred to the detailed component design (next step):

- Exact `Trajectory` / collision interface signatures.
- Trajectory sampling resolution and handling of discontinuities/asymptotes (e.g. `tan(x)`,
  `1/x`).
- Coordinate system bounds and the soldier-as-local-origin transform details.
- Turn system and win-state representation for Stage B.
- Project/folder structure and module boundaries.
- Damage model (instant-hit vs. explosion radius).
