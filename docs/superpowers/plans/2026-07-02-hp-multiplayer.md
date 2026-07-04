# HP Mode in Multiplayer — Client Rendering

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server already resolves HP mode correctly through `resolveFire` — `MatchState.players[*].hp` is authoritative and decremented per hit. Close the client-side gap: HP bars update on every `matchState` broadcast, floating damage numbers appear after a target hit in HP mode, and the win-condition text is correct for each mode.

**Architecture:** `NetworkGame` stores a reference to the last rendered `MatchState` (`lastState`) so the `shotPlayback` handler can know the current mode and team assignments when computing damage. All changes are confined to `src/net/NetworkGame.ts`.

**Tech Stack:** TypeScript, `async/await` for the `shotPlayback` → `showFloatingDamage` sequence.

---

## Global Constraints

- No server changes. No protocol changes.
- All changes in `src/net/NetworkGame.ts` only.
- `computeDamage` is imported from `src/game/hpLogic.ts` (already exists, pure).
- `ShotResult.hit.kind === "target"` is the guard for showing damage (same as local game).
- Run `npm test && npx tsc --noEmit` after every commit.

---

## File Map

| File | Change |
|------|--------|
| `src/net/NetworkGame.ts` | Add `lastState`; update `render()` for HP bars + win text; update `shotPlayback` handler for damage numbers |

---

## Task 1: Store `lastState` + HP bars in `render()`

**Files:** `src/net/NetworkGame.ts`

- [ ] **Step 1 — Add `lastState` field**

Add a private field to the class:

```ts
private lastState: MatchState | null = null;
```

- [ ] **Step 2 — Update `render()` to store state and call `updateHp()`**

Find the existing `render(state: MatchState)` method. Its current body:

```ts
private render(state: MatchState): void {
  const red = state.players.find((p) => p.team === "red")!;
  const blue = state.players.find((p) => p.team === "blue")!;
  const viewTeam: Team = this.myTeam ?? "red";
  const viewer = state.players.find((p) => p.team === viewTeam && p.alive) ?? red;
  this.renderer.setMap(state.config.map);
  this.renderer.setWorld(
    { soldier: { pos: viewer.pos, dir: viewTeam === "red" ? 1 : -1 }, bounds: state.bounds,
      targets: state.players.filter((p) => p.team !== viewTeam && p.alive).map((p) => ({ id: p.id, pos: p.pos, radius: 0.1 })),
      planets: state.planets },
    viewTeam, red.pos, blue.pos,
  );
  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (active) this.ui.setTurn(active.team);
  else this.ui.setNoTurnMode(true);
  this.ui.updateScoreboard(state.scores.red, state.scores.blue, state.round, state.config.rounds);
  if (state.phase === "over" && state.winner) this.ui.showWin(state.winner, "Direct hit.");
}
```

Replace with:

```ts
private render(state: MatchState): void {
  this.lastState = state;

  const red = state.players.find((p) => p.team === "red")!;
  const blue = state.players.find((p) => p.team === "blue")!;
  const viewTeam: Team = this.myTeam ?? "red";
  const viewer = state.players.find((p) => p.team === viewTeam && p.alive) ?? red;
  this.renderer.setMap(state.config.map);
  this.renderer.setWorld(
    { soldier: { pos: viewer.pos, dir: viewTeam === "red" ? 1 : -1 }, bounds: state.bounds,
      targets: state.players.filter((p) => p.team !== viewTeam && p.alive).map((p) => ({ id: p.id, pos: p.pos, radius: 0.1 })),
      planets: state.planets },
    viewTeam, red.pos, blue.pos,
  );

  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (active) this.ui.setTurn(active.team);
  else this.ui.setNoTurnMode(true);

  this.ui.updateScoreboard(state.scores.red, state.scores.blue, state.round, state.config.rounds);

  if (state.config.mode === "hp") {
    this.ui.updateHp(red.hp, blue.hp);
  }

  if (state.phase === "over" && state.winner) {
    const detail = state.config.mode === "hp" ? "Out of HP." : "Direct hit.";
    this.ui.showWin(state.winner, detail);
  }
}
```

- [ ] **Step 3 — Add `computeDamage` import**

At the top of `src/net/NetworkGame.ts`, add:

```ts
import { computeDamage } from "../game/hpLogic";
```

- [ ] **Step 4 — Typecheck + tests**

```bash
npm test && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 5 — Commit**

```bash
git add src/net/NetworkGame.ts
git commit -m "feat(net): HP bars + correct win text in NetworkGame.render()"
```

---

## Task 2: Floating damage numbers in `shotPlayback` handler

**Files:** `src/net/NetworkGame.ts`

- [ ] **Step 1 — Locate the `shotPlayback` handler**

In `start()`, find:

```ts
this.client.on("shotPlayback", (m) => {
  if (m.type === "shotPlayback") void this.renderer.playShot(m.shot);
});
```

- [ ] **Step 2 — Replace with async handler that shows damage**

```ts
this.client.on("shotPlayback", (m) => {
  if (m.type !== "shotPlayback") return;
  void (async () => {
    await this.renderer.playShot(m.shot);
    if (
      this.lastState?.config.mode === "hp" &&
      m.shot.hit.kind === "target" &&
      m.shot.hit.at
    ) {
      const dmg = computeDamage(m.shot.impactSlope);
      const firer = this.lastState.players.find((p) => p.id === m.firerId);
      if (firer) {
        const targetTeam: Team = firer.team === "red" ? "blue" : "red";
        this.renderer.showFloatingDamage(m.shot.hit.at, dmg, targetTeam);
      }
    }
  })();
});
```

Note: `hit.at` is defined on the `Hit` type when `kind === "target"`. The guard `m.shot.hit.at` handles it; TypeScript may still narrow via `kind` — check the `Hit` type in `src/sim/types.ts` and cast if needed:
- If `Hit` is a discriminated union with `kind: "target"` having `at: Vec2`, use `m.shot.hit.kind === "target"` as the guard and access `(m.shot.hit as any).at` or the correct narrowed type.

- [ ] **Step 3 — Typecheck**

```bash
npx tsc --noEmit
```

Fix any `Hit` type narrowing issues. The `Hit` interface at `src/sim/types.ts:69–74` has `at?: Vec2` (optional) or is a discriminated union — match the actual definition.

- [ ] **Step 4 — Full suite**

```bash
npm test && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 5 — Commit**

```bash
git add src/net/NetworkGame.ts
git commit -m "feat(net): floating damage numbers in HP mode shotPlayback"
```

---

## Task 3: Browser smoke test

- [ ] **Step 1 — Start dev server + WS server**

```bash
npm run dev
```

In another terminal:

```bash
npm run server
```

(or however the server is started — check `package.json` scripts)

- [ ] **Step 2 — Open two browser tabs and create a room in HP mode**

Tab A: `http://localhost:5173` → lobby → select **HP Mode** → Start Locally (local test first).

Verify:
- HP bars appear (100 / 100 at round start)
- After a hit: HP bar drops; floating damage number appears
- After a player reaches 0 HP: match-over shows "Out of HP." (not "Direct hit.")

- [ ] **Step 3 — Online HP mode**

Tab A: `http://localhost:5173/#room?code=test1`
Tab B: `http://localhost:5173/#room?code=test1`

Start match (note: server always uses Classic mode by default — this is the known limitation; server HP mode would require a `configureRoom` message not yet implemented). Verify Classic still works correctly (no regression).

Document result.

- [ ] **Step 4 — Commit if any fixes needed, then tag done**

```bash
git add src/net/NetworkGame.ts
git commit -m "fix(net): <describe any fix>"
```

---

## Self-Review

**Spec coverage:**
- HP bars update from `matchState` broadcast → `render()` calls `ui.updateHp()`. ✓
- HP reset each round → `matchState` carries fresh HP per `beginRound`; `render()` reads it. ✓
- Floating damage number on target hit → `shotPlayback` async handler. ✓
- Correct win text per mode → `detail` variable in `render()`. ✓
- No server changes / no protocol changes → confirmed, only `NetworkGame.ts` changed. ✓

**Known limitation:** Online server always starts in Classic mode (hardcoded room config). HP mode over the network requires a future `configureRoom` protocol message so the owner can set mode before starting. This plan closes the rendering gap; when `configureRoom` is added, online HP will work end-to-end automatically.
