# Turn Timer (D3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-enforced (online) and client-enforced (local) turn clock. Default 60 s, adjustable in 5 s steps from the lobby. Server broadcasts a `turnDeadline` epoch timestamp in `MatchState`; clients render a live countdown. On expiry the active player's turn is skipped (dud/advance) and the next player fires.

**Architecture:** A new pure function `skipTurn(state) → MatchState` in `matchState.ts` advances `activePlayerId` without a shot. `MatchState` gains `turnDeadline: number | null` (null = no timer active). `MatchConfig` gains optional `turnSeconds: number` (default 60). The server manages one `setTimeout` per room in `server/index.ts` and patches `turnDeadline` onto snapshots before broadcasting. The local game (`main.ts`) manages a client-side `setTimeout`. `NetworkGame` renders a countdown via `setInterval` from the deadline.

**Tech Stack:** TypeScript, Vitest, `ws` (server), browser WebSocket + `setInterval`/`setTimeout`.

**Scope note:** Online rooms currently use server-default config (no `configureRoom` message exists). `turnSeconds` in lobby affects local games via `configRouter` hash. Online games use `state.config.turnSeconds ?? 60`. Both paths share `turnDeadline` in `MatchState`.

---

## Global Constraints

- `src/game/matchState.ts`, `src/game/matchLogic.ts`, `src/game/turnQueue.ts` stay DOM-free and Node-safe.
- `skipTurn` is pure: takes `MatchState`, returns new `MatchState`. No side effects.
- Server timer lives exclusively in `server/index.ts`. `MatchEngine.skipActiveTurn()` is a thin wrapper over `skipTurn`.
- `turnDeadline` is display-only on the client; game logic is driven by the timer callback, not the timestamp.
- `turnSeconds` is optional everywhere; all callers fall back to `60`.
- Turn timer is **turn-based only**: skip when `state.config.noTurn === true` or `state.activePlayerId === null`.
- Run `npm test && npx tsc --noEmit && npx tsc -p server/tsconfig.json --noEmit` after every commit. Count must not drop.

---

## File Map

| File | Change |
|------|--------|
| `src/game/matchLogic.ts` | Add `turnSeconds?: number` to `MatchConfig` |
| `src/game/matchState.ts` | Add `turnDeadline: number \| null`; export `skipTurn`; update `createMatch`/`beginRound` |
| `server/matchEngine.ts` | Add `skipActiveTurn(): MatchState` |
| `server/index.ts` | `turnTimers` map; arm/cancel/fire helpers; patch `turnDeadline` before broadcasting |
| `src/game/configRouter.ts` | Serialize/deserialize `turnSeconds` under key `tt` |
| `index.html` | Add ±5 s stepper DOM in lobby |
| `src/ui/LobbyScreen.ts` | Track `turnSeconds`; include in `handleStart()` config |
| `src/game/main.ts` | Client-side turn timer for local games |
| `src/net/NetworkGame.ts` | Countdown from `turnDeadline`; clear on `close()` |

---

## Task 1: `skipTurn` + `turnDeadline` in `MatchState`

**Files:** `src/game/matchLogic.ts`, `src/game/matchState.ts`

### Step 1 — Add `turnSeconds` to `MatchConfig`

In `src/game/matchLogic.ts`, add one optional field to the interface:

```ts
export interface MatchConfig {
  mode: "classic" | "hp";
  noTurn: boolean;
  rounds: 3 | 5;
  turnSeconds?: number;   // ← add this line
  roomCode?: string;
  role?: "local" | "online";
  map: MapConfig;
  scatter: ScatterConfig;
  teamSize: 1 | 2 | 3 | 4 | 5;
}
```

- [ ] **Step 2 — Add `turnDeadline` to `MatchState` and implement `skipTurn`**

In `src/game/matchState.ts`:

Add the import (already there but confirm): `import { nextActive } from "./turnQueue";`

Add `turnDeadline: number | null;` to `MatchState`:

```ts
export interface MatchState {
  config: MatchConfig;
  players: PlayerState[];
  planets: Planet[];
  bounds: Bounds;
  turnQueue: string[];
  activePlayerId: string | null;
  scores: Record<Team, number>;
  round: number;
  phase: MatchPhase;
  winner: Team | null;
  turnDeadline: number | null;   // ← add this line
}
```

Update `createMatch` to initialise it:

```ts
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
  turnDeadline: null,   // ← add this line
};
```

Update `beginRound` likewise — add `turnDeadline: null` to its return object.

Add the exported `skipTurn` function at the bottom of the file:

```ts
/**
 * Advance the active player's turn without a shot (timer-expiry skip).
 * No-op in no-turn mode or when there is no active player.
 */
export function skipTurn(state: MatchState): MatchState {
  if (state.config.noTurn || state.activePlayerId === null) return state;
  const next = nextActive(
    state.turnQueue,
    state.activePlayerId,
    (id) => state.players.find((p) => p.id === id)?.alive ?? false,
  );
  return { ...state, activePlayerId: next, turnDeadline: null };
}
```

- [ ] **Step 3 — Typecheck**

```bash
npx tsc --noEmit && npx tsc -p server/tsconfig.json --noEmit
```

Expected: no errors (the optional `turnSeconds` and new `turnDeadline` field cause no downstream breakage because existing object literals don't need it, but `createMatch`/`beginRound` callers do need the field — the compiler will flag any spreads that reconstruct `MatchState` without `turnDeadline`). Fix any flag.

- [ ] **Step 4 — Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5 — Commit**

```bash
git add src/game/matchLogic.ts src/game/matchState.ts
git commit -m "feat(game): turnSeconds in MatchConfig; turnDeadline + skipTurn in MatchState"
```

---

## Task 2: `MatchEngine.skipActiveTurn()` + server turn timer

**Files:** `server/matchEngine.ts`, `server/index.ts`

- [ ] **Step 1 — Add `skipActiveTurn` to `MatchEngine`**

In `server/matchEngine.ts`, add the import at the top:

```ts
import { skipTurn } from "../src/game/matchState";
```

Add the method to the class (after `beginNextRound`):

```ts
/** Skip the active player's turn (timer expiry). No-op if busy or not turn-based. */
skipActiveTurn(): MatchState {
  if (this.pending) return this.state;
  this.state = skipTurn(this.state);
  return this.state;
}
```

- [ ] **Step 2 — Typecheck server**

```bash
npx tsc -p server/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3 — Add turn timer infrastructure to `server/index.ts`**

Add a module-level map after the existing `rm` declaration:

```ts
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
```

Add two helpers just before the `createServer` call:

```ts
function cancelTurnTimer(code: string): void {
  const t = turnTimers.get(code);
  if (t !== undefined) { clearTimeout(t); turnTimers.delete(code); }
}

/** Patch a wall-clock deadline onto state and arm the server turn timer. */
function armTurnTimer(code: string, state: MatchState, eng: MatchEngine): MatchState {
  cancelTurnTimer(code);
  if (state.phase !== "play" || state.activePlayerId === null || state.config.noTurn) {
    return { ...state, turnDeadline: null };
  }
  const ms = (state.config.turnSeconds ?? 60) * 1000;
  const deadline = Date.now() + ms;
  turnTimers.set(
    code,
    setTimeout(() => {
      turnTimers.delete(code);
      const next = eng.skipActiveTurn();
      const patched = armTurnTimer(code, next, eng);
      broadcast(code, { type: "matchState", state: patched });
    }, ms),
  );
  return { ...state, turnDeadline: deadline };
}
```

- [ ] **Step 4 — Wire `armTurnTimer` into existing broadcast sites**

Find every place `server/index.ts` broadcasts `{ type: "matchState", state }` after a match is running and wrap the state with `armTurnTimer`. There are three sites:

**After `startMatch`** (where the initial snapshot is broadcast):

```ts
// Before (approx):
broadcast(room.code, { type: "matchState", state });
```

Change to:

```ts
const patched = armTurnTimer(room.code, state, room.engine!);
broadcast(room.code, { type: "matchState", state: patched });
```

**After `resolvePending()`** (the post-shot state):

```ts
// Before:
const state = rm.engine.resolvePending();
broadcast(room.code, { type: "matchState", state });
```

Change to:

```ts
const raw = rm.engine.resolvePending();
const patched = armTurnTimer(room.code, raw, rm.engine);
broadcast(room.code, { type: "matchState", state: patched });
```

**After `beginNextRound()`**:

```ts
// Before:
broadcast(room.code, { type: "matchState", state: rm2.engine.beginNextRound() });
```

Change to:

```ts
const nextRound = rm2.engine.beginNextRound();
const patched2 = armTurnTimer(room.code, nextRound, rm2.engine);
broadcast(room.code, { type: "matchState", state: patched2 });
```

- [ ] **Step 5 — Cancel timer on `fireIntent`**

In the `fireIntent` handler, add `cancelTurnTimer(conn.room!)` as the very first line inside the handler (before the busy/engine checks):

```ts
if (msg.type === "fireIntent") {
  cancelTurnTimer(conn.room!);   // ← add
  // ... rest of handler unchanged
}
```

- [ ] **Step 6 — Cancel timer on disconnect / room close**

In the disconnect handler / room teardown, add `cancelTurnTimer(conn.room!)`. Find the line that broadcasts `opponent-timed-out` and add the cancel before it:

```ts
cancelTurnTimer(code);
broadcast(code, { type: "error", code: "opponent-timed-out", message: "Opponent timed out — room closed." });
```

- [ ] **Step 7 — Typecheck + full test suite**

```bash
npm test && npx tsc --noEmit && npx tsc -p server/tsconfig.json --noEmit
```

Expected: all pass.

- [ ] **Step 8 — Commit**

```bash
git add server/matchEngine.ts server/index.ts
git commit -m "feat(server): per-room turn timer — skipActiveTurn, armTurnTimer, turnDeadline broadcast"
```

---

## Task 3: `configRouter` serialization + lobby stepper

**Files:** `src/game/configRouter.ts`, `index.html`, `src/ui/LobbyScreen.ts`

- [ ] **Step 1 — Add `tt` key to `configToHash`**

In `src/game/configRouter.ts`, update `configToHash`:

```ts
export function configToHash(c: MatchConfig): string {
  const { map, scatter, teamSize } = c;
  const tt = c.turnSeconds ?? 60;
  return (
    `#game?mode=${c.mode}&rounds=${c.rounds}&noTurn=${c.noTurn}&tt=${tt}` +
    `&w=${n(map.width)}&h=${n(map.height)}` +
    `&rmn=${n(scatter.rMin)}&rmx=${n(scatter.rMax)}` +
    `&gmn=${n(scatter.gapMin)}&gmx=${n(scatter.gapMax)}` +
    `&sc=${n(scatter.spawnClearance)}&fm=${n(scatter.fieldMargin)}` +
    `&mp=${scatter.maxPlanets}&ts=${teamSize}`
  );
}
```

Update `parseConfigFromHash` to read it:

```ts
const turnSeconds = Math.round(clampNum(p.get("tt"), 15, 120, 60) / 5) * 5; // snap to 5s grid
```

And include it in the return:

```ts
return { mode, rounds, noTurn, turnSeconds, role: "local", map, scatter, teamSize };
```

Also update `DEFAULT_CONFIG` constant at the top of `configRouter.ts`:

```ts
const DEFAULT_CONFIG: MatchConfig = {
  mode: "classic",
  rounds: 3,
  noTurn: false,
  turnSeconds: 60,
  role: "local",
  ...arenaDefaults(),
};
```

- [ ] **Step 2 — Add stepper DOM to `index.html`**

Find the No-Turn row in the lobby config section. Add the stepper after it, before the Actions block:

```html
        <!-- Turn Timer -->
        <div class="lobby-turn-timer-row" style="display:flex;align-items:center;gap:10px;margin:8px 0">
          <p class="lobby-label" style="margin:0;white-space:nowrap">Turn Timer</p>
          <button id="lobby-timer-down" type="button"
            style="border:1px solid #263041;background:transparent;color:#cdd9e5;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:1rem">−</button>
          <span id="lobby-timer-val"
            style="min-width:42px;text-align:center;color:#cdd9e5;font-size:0.9rem">60 s</span>
          <button id="lobby-timer-up" type="button"
            style="border:1px solid #263041;background:transparent;color:#cdd9e5;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:1rem">+</button>
          <small style="color:#5e7081;font-size:11px">(turn-based only · min 15 s)</small>
        </div>
```

- [ ] **Step 3 — Wire stepper in `LobbyScreen.ts`**

Add a field:

```ts
private turnSeconds = 60;
private timerDownBtn: HTMLButtonElement;
private timerUpBtn: HTMLButtonElement;
private timerValEl: HTMLElement;
```

In the constructor (after existing querySelector calls):

```ts
this.timerDownBtn = root.querySelector<HTMLButtonElement>("#lobby-timer-down")!;
this.timerUpBtn   = root.querySelector<HTMLButtonElement>("#lobby-timer-up")!;
this.timerValEl   = root.querySelector<HTMLElement>("#lobby-timer-val")!;

this.timerDownBtn.addEventListener("click", () => this.adjustTimer(-5));
this.timerUpBtn.addEventListener("click",   () => this.adjustTimer(+5));
```

Add the helper method:

```ts
private adjustTimer(delta: number): void {
  this.turnSeconds = Math.max(15, Math.min(120, this.turnSeconds + delta));
  this.timerValEl.textContent = `${this.turnSeconds} s`;
}
```

Update `handleStart()` to include `turnSeconds`:

```ts
private handleStart(): void {
  const config: MatchConfig = {
    mode: this.selectedMode,
    rounds: this.selectedRounds,
    noTurn: this.noTurnCheckbox.checked,
    turnSeconds: this.turnSeconds,
    role: "local",
    ...this.settings.getSettings(),
  };
  this.startCb?.(config);
}
```

- [ ] **Step 4 — Typecheck + tests**

```bash
npm test && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 5 — Commit**

```bash
git add src/game/configRouter.ts index.html src/ui/LobbyScreen.ts
git commit -m "feat(lobby): turn-timer stepper; configRouter serializes turnSeconds (tt)"
```

---

## Task 4: Local game turn timer in `main.ts`

**Files:** `src/game/main.ts`

- [ ] **Step 1 — Read `main.ts`**

Search for the `onFire` callback and the `nextRound` function to understand where each turn begins. Identify where `ui.setTurn(activeTurn, ...)` is called — that's when the turn starts and the timer should arm.

- [ ] **Step 2 — Add timer state**

Near the top of the module (alongside other module-globals like `busy`, `redBusy`, etc.), add:

```ts
let turnTimer: ReturnType<typeof setTimeout> | null = null;
```

Add helpers (local to module):

```ts
function cancelLocalTurnTimer(): void {
  if (turnTimer !== null) { clearTimeout(turnTimer); turnTimer = null; }
}

function armLocalTurnTimer(): void {
  cancelLocalTurnTimer();
  if (!matchConfig || matchConfig.noTurn) return;
  const ms = (matchConfig.turnSeconds ?? 60) * 1000;
  turnTimer = setTimeout(() => {
    turnTimer = null;
    // Skip the active player: just advance the turn without a shot.
    if (matchConfig) {
      activeMatch = skipTurn(activeMatch!);
      activeTurn = (activeMatch.activePlayerId
        ? activeMatch.players.find((p) => p.id === activeMatch!.activePlayerId)?.team ?? activeTurn
        : activeTurn);
      ui!.setTurn(activeTurn, "");
      armLocalTurnTimer();
    }
  }, ms);
}
```

Note: `activeMatch` and `matchConfig` are whatever the current match-state variable names are in `main.ts`. Adapt the names to match.

- [ ] **Step 3 — Arm timer after turn changes**

Find every place `ui.setTurn(activeTurn, ...)` is called (end of `onFire` for the non-hit path, after `nextRound` resets, etc.) and add `armLocalTurnTimer()` after each.

Cancel the timer at the top of `onFire` (before the busy check):

```ts
async function onFire(player: "red" | "blue", latex: string) {
  cancelLocalTurnTimer();
  // ... rest unchanged
```

Re-arm at the end of `onFire` when the round continues (after `ui.setTurn(activeTurn, ...)`):

```ts
armLocalTurnTimer();
```

Also cancel on match end / "over" phase (where `ui.showWin` is called).

- [ ] **Step 4 — Import `skipTurn`**

At the top of `main.ts`, add:

```ts
import { skipTurn } from "./matchState";
```

- [ ] **Step 5 — Typecheck + tests**

```bash
npm test && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 6 — Commit**

```bash
git add src/game/main.ts
git commit -m "feat(game): local turn timer — arm/cancel on each turn; skipTurn on expiry"
```

---

## Task 5: Client countdown in `NetworkGame`

**Files:** `src/net/NetworkGame.ts`

- [ ] **Step 1 — Add countdown state**

Add a field to the class:

```ts
private countdownInterval: ReturnType<typeof setInterval> | null = null;
```

- [ ] **Step 2 — Update `render()` to drive countdown**

At the top of `render(state: MatchState)`, manage the interval:

```ts
private render(state: MatchState): void {
  // --- countdown ---
  if (this.countdownInterval !== null) {
    clearInterval(this.countdownInterval);
    this.countdownInterval = null;
  }
  if (state.turnDeadline !== null && state.phase === "play" && state.activePlayerId !== null) {
    const tick = () => {
      const secs = Math.max(0, Math.ceil(((state.turnDeadline as number) - Date.now()) / 1000));
      this.ui.setStatus(`⏱ ${secs} s`);
    };
    tick();
    this.countdownInterval = setInterval(tick, 500);
  } else {
    this.ui.setStatus("");
  }
  // --- rest of render (unchanged below) ---
  const red = state.players.find((p) => p.team === "red")!;
  // ...
```

- [ ] **Step 3 — Clear on `close()`**

In the `close()` method of `NetworkGame`, add:

```ts
if (this.countdownInterval !== null) {
  clearInterval(this.countdownInterval);
  this.countdownInterval = null;
}
```

- [ ] **Step 4 — Typecheck + full suite**

```bash
npm test && npx tsc --noEmit && npx tsc -p server/tsconfig.json --noEmit
```

Expected: all pass.

- [ ] **Step 5 — Commit**

```bash
git add src/net/NetworkGame.ts
git commit -m "feat(net): client countdown from turnDeadline in NetworkGame"
```

---

## Self-Review

**Spec coverage:**
- D3 `turnSeconds` in `MatchConfig` → Task 1 + Task 3. ✓
- Lobby stepper (±5s, min 15) → Task 3. ✓
- Server enforces on expiry (skip + broadcast) → Task 2. ✓
- `turnDeadline` in `matchState` for client countdown → Task 1. ✓
- Turn-based only (no-op in no-turn mode) → `skipTurn` guard, `armTurnTimer` guard. ✓
- Client countdown → Task 5. ✓
- Local game enforcement → Task 4. ✓
- Timer cancelled on `fireIntent` → Task 2 Step 5. ✓
- Serialisation via hash → Task 3 Step 1. ✓

**Known limitation:** Online rooms use server-default config; `turnSeconds` from lobby only flows into local games and future `configureRoom` support. Online games always run 60 s timer (the default).
