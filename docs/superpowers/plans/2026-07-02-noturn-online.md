# No-Turn Mode Online — Concurrent Server Shots

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make No-Turn mode work in online multiplayer. Currently `MatchEngine.fire()` guards with a single `busy: boolean` flag that blocks any second shot while the first is animating. In No-Turn mode both players fire independently, so the guard must be per-player, not global.

**Architecture:** Replace `pending: MatchState | null` in `MatchEngine` with `inFlight: Map<string, string>` (playerId → latex). `fire()` checks only whether _this player_ is already in flight (and, in turn-based mode, whether _anyone_ is). A new `resolvePlayerShot(playerId, latex)` re-resolves against live state at commit time (same "commit against live state" pattern that local no-turn uses in `main.ts`). `server/index.ts` tracks per-player shot timers and calls `resolvePlayerShot` on expiry. `NetworkGame` manages per-player busy state so the UI correctly enables/disables each fire button.

**Prerequisite:** `configureRoom` must already be merged (plan `2026-07-02-configure-room.md`) so `noTurn: true` can reach the server and be stored in `room.config`.

**Tech Stack:** TypeScript, Vitest.

---

## Global Constraints

- `src/sim/*` and `src/game/*` stay DOM-free (Node-safe).
- `MatchEngine` must remain backward-compatible for turn-based mode: one in-flight shot blocks any other shot (same as today).
- Re-resolve at commit time (not at fire time) to match the local no-turn approach in `main.ts`. This prevents stale-state hits when two shots overlap.
- Run `npm test && npx tsc --noEmit` after every commit.
- Server typecheck: `cd server && npx tsc --noEmit` after every server commit.

---

## File Map

| File | Change |
|------|--------|
| `server/matchEngine.ts` | Replace `pending` with `inFlight: Map<string, string>`; add `resolvePlayerShot()`; update `fire()` |
| `server/index.ts` | Per-player shot timer map (`shotTimers`); call `resolvePlayerShot` on expiry; handle concurrent round-end |
| `src/net/NetworkGame.ts` | Track `myBusy: boolean`; disable fire button on send; re-enable on next `matchState` when alive |
| `server/integration.test.ts` | Extend existing test or add new test for no-turn concurrent shots |

---

## Task 1: MatchEngine — per-player in-flight tracking

**File:** `server/matchEngine.ts`

### Full replacement plan

Replace the current `pending: MatchState | null` and `roundLoser: Team | null` fields and the three methods that touch them (`get busy`, `fire`, `resolvePending`, `skipActiveTurn`) with the following.

**New fields:**

```ts
private inFlight = new Map<string, string>(); // playerId → latex
private roundLoser: Team | null = null;
```

**Updated `fire()`:**

```ts
fire(playerId: string, latex: string): FireOk | FireErr {
  // Turn-based: any in-flight shot blocks all firing.
  // No-Turn: only this player's own in-flight shot blocks them.
  if (this.state.config.noTurn) {
    if (this.inFlight.has(playerId)) return { ok: false, code: "mid-animation" };
  } else {
    if (this.inFlight.size > 0) return { ok: false, code: "mid-animation" };
  }
  const res = resolveFire(this.state, { playerId, latex });
  if (res.rejected) return { ok: false, code: res.rejected };
  this.inFlight.set(playerId, latex);
  return { ok: true, firerId: playerId, shot: res.shot!, duration: shotDuration(res.shot!) };
}
```

Note: `resolveFire` is still called at fire-time to compute the shot path for animation. The result is used for `shot` and `duration` only — the actual state commit happens in `resolvePlayerShot`.

**New `resolvePlayerShot()`:**

```ts
/**
 * Commit one player's in-flight shot against the current live state.
 * Re-resolves the latex (same commit-against-live-state approach as local no-turn).
 * If the player is now dead or their shot is otherwise rejected, it's a no-op.
 */
resolvePlayerShot(playerId: string): MatchState {
  const latex = this.inFlight.get(playerId);
  this.inFlight.delete(playerId);
  if (!latex) return this.state;
  const res = resolveFire(this.state, { playerId, latex });
  if (res.rejected) return this.state; // player eliminated mid-flight — shot doesn't count
  this.state = res.next;
  if (res.roundLoser) this.roundLoser = res.roundLoser;
  return this.state;
}
```

**Remove `resolvePending()` and `get busy`; update `skipActiveTurn()`:**

```ts
get busy(): boolean { return this.inFlight.size > 0; }

skipActiveTurn(): MatchState {
  if (this.inFlight.size > 0) return this.state;
  this.state = skipTurn(this.state);
  return this.state;
}
```

Keep `beginNextRound()` unchanged.

- [ ] **Step 1** — Replace `pending: MatchState | null` with `inFlight: Map<string, string>()`.
- [ ] **Step 2** — Replace `fire()` with the per-player version above.
- [ ] **Step 3** — Add `resolvePlayerShot()`.
- [ ] **Step 4** — Remove `resolvePending()`. Update `get busy` and `skipActiveTurn()`.
- [ ] **Step 5** — Run `npm test && npx tsc --noEmit`. Some test failures expected (server/index.ts still calls `resolvePending`). Fix compilation errors.
- [ ] **Step 6** — Commit engine only:

```bash
git add server/matchEngine.ts
git commit -m "refactor(server): MatchEngine — per-player inFlight map, resolvePlayerShot, drop resolvePending"
```

---

## Task 2: Server index — per-player shot timers

**File:** `server/index.ts`

### Replace `resolvePending` call with `resolvePlayerShot`

Currently `fireIntent` handler:

```ts
setTimeout(() => {
  const rm = rooms.get(room.code);
  if (!rm || !rm.engine) return;
  const raw = rm.engine.resolvePending();
  ...
}, r.duration * 1000);
```

The `setTimeout` fires once per shot. In no-turn mode, two shots may be in-flight simultaneously, each with its own timer. The timer callback must commit only the shot that _this_ timer belongs to.

Replace the inner body with `resolvePlayerShot(firerId)`:

```ts
const firerId = r.firerId;
setTimeout(() => {
  const rm = rooms.get(room.code);
  if (!rm || !rm.engine) return;
  const raw = rm.engine.resolvePlayerShot(firerId);
  const patched = armTurnTimer(room.code, raw, rm.engine);
  broadcast(room.code, { type: "matchState", state: patched });
  if (raw.phase === "between") {
    setTimeout(() => {
      const rm2 = rooms.get(room.code);
      if (!rm2 || !rm2.engine) return;
      const nextRound = rm2.engine.beginNextRound();
      const patched2 = armTurnTimer(room.code, nextRound, rm2.engine);
      broadcast(room.code, { type: "matchState", state: patched2 });
    }, 2000);
  }
}, r.duration * 1000);
```

**Concurrent round-end:** If both shots resolve and both claim `phase === "between"`, the second `beginNextRound()` call inside the nested `setTimeout` will be called on a room that already started a new round. Guard in `beginNextRound` is not needed — `MatchEngine.beginNextRound()` always advances cleanly. The double 2000ms between-round timer is benign: the second fires against a fresh state that is already in "play", so the broadcast is redundant but not harmful.

Optionally: add a `if (raw.phase === "between" && !rm.engine.busy)` guard to skip the between-round transition if the other shot is still in-flight (wait for it to resolve first). This is cleaner but optional for this plan. Keep it simple: emit on each resolution.

- [ ] **Step 1** — Capture `firerId` before the `setTimeout`.
- [ ] **Step 2** — Replace `rm.engine.resolvePending()` with `rm.engine.resolvePlayerShot(firerId)`.
- [ ] **Step 3** — Run `npm test && npx tsc --noEmit && cd server && npx tsc --noEmit`. Expect: all pass.
- [ ] **Step 4** — Commit:

```bash
git add server/index.ts
git commit -m "feat(server): per-player shot timers using resolvePlayerShot for no-turn concurrent shots"
```

---

## Task 3: NetworkGame — per-player busy state

**File:** `src/net/NetworkGame.ts`

In no-turn mode, both HUD panels must stay enabled (both players fire independently). The fire button for the local player should be disabled only while _their own_ shot is in-flight.

### Changes

Add a `myBusy` field:

```ts
private myBusy = false;
```

In `start()`, update the `onFire` handler to set `myBusy`:

```ts
this.ui.onFire((_player, latex) => {
  if (this.myBusy) return;
  this.myBusy = true;
  if (this.myTeam) this.ui.setBusy(this.myTeam, true);
  this.client.send({ type: "fireIntent", latex });
});
```

In `render()`, re-enable the local player's button when the new `matchState` arrives and the player is still alive:

```ts
private render(state: MatchState): void {
  this.lastState = state;
  // Re-enable local player fire button if they were busy.
  if (this.myBusy) {
    const me = state.players.find((p) => p.id === this.myId);
    if (me) {
      this.myBusy = false;
      this.ui.setBusy(me.team, false);
    }
  }
  // ... (rest of render unchanged)
```

In `render()`, update the no-turn mode check. Currently:

```ts
const active = state.players.find((p) => p.id === state.activePlayerId);
if (active) this.ui.setTurn(active.team);
else this.ui.setNoTurnMode(true);
```

This already calls `setNoTurnMode(true)` when `activePlayerId === null` (no-turn mode). That's correct — keep it unchanged.

- [ ] **Step 1** — Add `myBusy = false` field.
- [ ] **Step 2** — Update `onFire` handler to guard on `myBusy` and set it + `setBusy`.
- [ ] **Step 3** — Add re-enable logic at the top of `render()`.
- [ ] **Step 4** — Run `npm test && npx tsc --noEmit`. Expect: all pass.
- [ ] **Step 5** — Commit:

```bash
git add src/net/NetworkGame.ts
git commit -m "feat(net): NetworkGame per-player busy state for no-turn concurrent fire"
```

---

## Task 4: Integration test

**File:** `server/integration.test.ts`

Add a test that verifies two clients can fire concurrently in no-turn mode:

```ts
it("no-turn: both players can fire concurrently without rejection", async () => {
  // Create server, two clients join, start match with noTurn: true
  // Client A sends configureRoom { noTurn: true, ... }, then startMatch
  // Both clients fire immediately
  // Neither should receive a "mid-animation" error
  // Both should eventually receive matchState
});
```

The test only needs to verify:
1. No `error { code: "mid-animation" }` for the second shot
2. Both players eventually receive a `matchState` broadcast after their shots resolve

Adapt the existing integration test structure (`server/integration.test.ts`) to add this case.

- [ ] **Step 1** — Write the no-turn concurrent shot test.
- [ ] **Step 2** — Run `npm test`. Expect: new test passes.
- [ ] **Step 3** — Commit:

```bash
git add server/integration.test.ts
git commit -m "test(server): no-turn concurrent shots — both players fire without rejection"
```

---

## Task 5: Browser smoke test

- [ ] Start dev server + WS server.
- [ ] Open two tabs on `#room=TEST2`.
- [ ] In lobby before joining: select **No-Turn** checkbox → navigate to room. (Or: select No-Turn in lobby, start local game once to set `matchConfig.noTurn = true`, then navigate to room.)
- [ ] Tab A fires immediately after start; Tab B also fires immediately.
- [ ] Verify: both shots animate simultaneously; no "mid-animation" rejection; after both resolve, match continues.
- [ ] Verify: classic mode still works correctly (no regression from refactor).

---

## Self-Review

**Spec coverage:**
- `MatchEngine.fire()` gates per-player in no-turn (`inFlight.has(playerId)`) ✓
- `MatchEngine.fire()` gates globally in turn-based (`inFlight.size > 0`) ✓
- `resolvePlayerShot()` re-resolves at commit time against live state ✓
- Server per-player timer calls `resolvePlayerShot(firerId)` ✓
- `NetworkGame` disables local player's button on fire, re-enables on next `matchState` ✓
- `setNoTurnMode(true)` already called in `render()` when `activePlayerId === null` ✓
- All existing tests still pass after `resolvePending` removal ✓
