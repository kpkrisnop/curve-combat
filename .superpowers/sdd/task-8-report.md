# Task 8 Report: LocalGame Controller + Seeded Layout

## Implemented

**Commit:** `df2aa9c` — `feat(game): LocalGame controller with preview/begin split, seeded layout, ticking turn timer`

**Files changed:**
- `src/game/localLayout.ts` — added optional `seed` param (inherited partial; matched brief exactly, no changes needed)
- `src/game/localLayout.test.ts` — seeded-layout determinism test (inherited; matched brief exactly)
- `src/game/LocalGame.ts` — created; full `preview/begin/dispose` class, timer, onFire handler, round/match end, tutorial
- `src/game/LocalGame.test.ts` — 4 tests (inherited; already had `// @vitest-environment jsdom`)
- `vite.config.ts` — added `pool: "vmThreads"` + `environmentOptions.jsdom.url` (see concerns)
- `src/app/SpacetimeBackground.test.tsx` — patched `matchMedia` guard for vmThreads compatibility

## Inherited vs Written

| File | Status |
|---|---|
| `localLayout.ts` | Inherited complete (seed param already applied) |
| `localLayout.test.ts` | Inherited complete (matching brief exactly) |
| `LocalGame.test.ts` | Inherited complete (jsdom directive on line 1) |
| `LocalGame.ts` | Written from scratch this session |
| `vite.config.ts` | Modified this session (vmThreads fix) |
| `SpacetimeBackground.test.tsx` | Patched this session |

## TDD Evidence

**RED → GREEN sequence:**
1. `localLayout.test.ts` — already GREEN on session start (seed param already in place)
2. `LocalGame.test.ts` — RED (module not found: `./LocalGame`) → created `LocalGame.ts` → blocked by jsdom/localStorage issue → GREEN after `pool: vmThreads` fix
3. Full suite: 30 files, 182 tests — all GREEN
4. `tsc --noEmit` — clean

## Import-Path Resolutions

All types (`World`, `Vec2`, `Bounds`, `ShotResult`) confirmed in `../sim/types` — matches brief's guess exactly. `MapConfig` consolidated from two imports to one (`import type { MatchConfig, MapConfig } from "./matchLogic"`). Removed unused `previewSeed` private field (tsc TS6133).

## Vitest vmThreads Fix

**Root cause:** Vitest 3.x defaults to `pool: 'forks'`. With forks, `// @vitest-environment jsdom` per-file overrides do not wire jsdom globals (including `localStorage`) into the test process's global scope — Node 22's own experimental `localStorage` stub appears instead (undefined). Switching to `pool: 'vmThreads'` enables true per-file environment isolation via VM modules. `SpacetimeBackground.test.tsx` needed a `matchMedia` existence guard since vmThreads jsdom doesn't pre-define it (forks inherited the host process's window stubs).

## Direct-Hit Test Analysis

Test: empty field (`maxPlanets: 0`), red fires `"0"` (y=0 flat line). `resolveFire` calls `fire(worldFor(state, shooter), fn)`. Red's soldier fires right (+x dir), BLUE is on the right at y≈0. `y=0` passes through BLUE's position → hit kind = "target" → `roundEnded: true` → `showSplash` called. Test passes as written — no investigation needed.

## Self-Review

- `LocalGame.ts` is a faithful port of `main.ts` logic; no game-logic mutations
- `preview()` guards `if (this.started) return` — idempotent for re-rolls
- `dispose()` clears both timer and splash timeout — no leaks in tests
- `handleRoundEnd` correctly gates `phase === 'over'` before `showWin`
- The `no-turn` double-commit path in `onFire` preserved from original
- `_previewSeed` removed (unused field, Task 11 can re-add when threading into `pick`)

## Concerns

1. **vmThreads pool change** is project-wide (affects all 30 test files). It's strictly safer for per-file environment isolation, but is a behavioral change to the test runner. All existing tests pass, including the server integration tests.
2. **`SpacetimeBackground.test.tsx` modified** — not in the brief's "do not modify" list, but it's an existing test. The patch is additive (guard only, not logic change).
3. Task 11 note: `preview(config, seed)` stores seed to the config call but doesn't thread it into `pick(spawns)` for player-dot positions. Per brief, that's intentional until Task 11 shows jumping.

---

## Fix Report (code-review finding, 2026-07-03)

**Reviewer finding:** `pool: "vmThreads"` was added to `vite.config.ts` as a global fix for `localStorage` being undefined in `LocalGame.test.ts`. vmThreads has documented memory-leak/isolation caveats and changing the pool for all 30 suites was wider than necessary.

**Root cause confirmed:** Under the default `forks` pool, the per-file `// @vitest-environment jsdom` directive does NOT wire jsdom's `localStorage` into `globalThis` in the test worker. Node's own (non-functional) experimental `localStorage` stub fires instead, causing `TypeError: Cannot read properties of undefined (reading 'setItem')` on the first `localStorage.setItem` call in `LocalGame.test.ts`'s `beforeEach`. This is a real forks/jsdom limitation — the Task 8 diagnosis was correct — but the fix was broader than needed.

**What was changed:**
1. `vite.config.ts` — removed `pool: "vmThreads"` (reverted to Vitest default `forks`).
2. `src/game/LocalGame.test.ts` — added a `beforeAll` at the top of the file that conditionally installs a Map-backed `localStorage` stub on `globalThis` if `localStorage` is `undefined`. Change is local to the one test file that needs it.
3. `src/app/SpacetimeBackground.test.tsx` — reverted the Task 8 `matchMedia` existence guard (`if (!window.matchMedia) { ... }`). That guard was only needed under vmThreads; under forks jsdom the `vi.spyOn(window, "matchMedia")` call works directly.

**Test commands and results:**
- `npm test` — 182/182 pass, 30/30 files pass (no failures).
- `npx tsc --noEmit` — clean, zero errors.
