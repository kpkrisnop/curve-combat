# Leave / Forfeit + Camera-Zoom Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Leave/Forfeit controls across all four arena states, make in-match departure remove one player (Match continues; opponent wins only when a Team is emptied) with a "someone quit" toast, and change the pre-game→play transition from a CSS element-scale to a coordinate-plane camera zoom.

**Architecture:** Two independent milestones. **Milestone A (Leave/Forfeit)** adds one client→server `forfeit` message; the server's `MatchEngine` gains `removePlayer()` and `RoomManager` gains `forfeit()`, both reusing the existing turn-queue (`nextActive`) and round-win (`every(!alive)`) machinery; the in-match disconnect grace converges onto the same removal path; the client surfaces Leave/Quit buttons in the shared `Footer` and shows a toast by diffing removed players out of successive `MatchState`s. **Milestone B (Camera Zoom)** replaces the `transform: scale()` on `.arena-stage` with a renderer-owned `requestAnimationFrame` tween of `cam.scale = fitContain × factor`.

**Tech Stack:** TypeScript, React, Vite, Pixi.js v8, Zod (wire protocol), `ws` (server), Vitest + Testing Library.

## Global Constraints

- Wire messages are Zod discriminated unions in `src/net/protocol.ts`; **client and server change together** — never one side alone.
- `src/sim/` and `src/game/` stay Node-safe and deterministic (no DOM, no browser APIs) — the server imports them.
- Online is server-authoritative: the client renders server `MatchState`; it never self-advances phase/turns/scores.
- Root `tsc` does NOT cover `server/`. After any server change run **`npx tsc -p server/tsconfig.json`**.
- The full Vitest suite is flaky under parallel load on this cloud-synced filesystem. **Run one file at a time** (`npx vitest run <path>`) and re-run a failure in isolation before treating it as real. Server integration tests (real countdown delays) are the most sensitive.
- TDD: failing test first, minimal code, green, commit. Frequent commits.
- Copy is placeholder-quality by design (user will polish later): `window.confirm` for the quit dialog and a plain text toast are acceptable.

---

## Milestone A — Leave / Forfeit

### Task 1: Add the `forfeit` client→server wire message

**Files:**
- Modify: `src/net/protocol.ts:35` (add to `clientSchema` union)
- Test: `src/net/protocol.test.ts`

**Interfaces:**
- Produces: `ClientMessage` now includes `{ type: "forfeit" }`. Server (Task 4) and client (Task 6) both rely on this literal.

- [ ] **Step 1: Write the failing test**

Add to `src/net/protocol.test.ts`:

```ts
import { parseClientMessage } from "./protocol";

it("parses a forfeit message", () => {
  expect(parseClientMessage({ type: "forfeit" })).toEqual({ type: "forfeit" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/net/protocol.test.ts -t "forfeit"`
Expected: FAIL (Zod: no matching discriminator for `"forfeit"`).

- [ ] **Step 3: Add the schema**

In `src/net/protocol.ts`, after the `setName` line (`:34`):

```ts
const forfeit = z.object({ type: z.literal("forfeit") });
```

Then add `forfeit` to the union on `:35`:

```ts
const clientSchema = z.discriminatedUnion("type", [join, startMatch, fireIntent, reconnect, configureRoom, switchTeam, rerollArena, setName, forfeit]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/net/protocol.test.ts -t "forfeit"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/net/protocol.ts src/net/protocol.test.ts
git commit -m "feat(net): add forfeit client message"
```

---

### Task 2: `MatchEngine.removePlayer()` — remove one player, resolve round/match

**Files:**
- Modify: `server/matchEngine.ts` (add import of `matchWinner` + `nextActive`; add `removePlayer`)
- Test: `server/matchEngine.test.ts`

**Interfaces:**
- Consumes: `MatchState` shape from `src/game/matchState.ts`; `nextActive` from `src/game/turnQueue.ts`; `matchWinner` from `src/game/matchLogic.ts`.
- Produces: `MatchEngine.removePlayer(playerId: string): MatchState`. Removes the player from the engine's roster AND the live state; if a Team is left with zero players → `phase:"over"`, `winner`=other team; else if the removal empties a Team's *alive* set for the current round → award the round (scores++, `phase:"between"` or `"over"` via `matchWinner`); else continue, advancing `activePlayerId` if the leaver was active. Task 3 (`RoomManager.forfeit`) calls this.

- [ ] **Step 1: Write the failing tests**

Add to `server/matchEngine.test.ts` (a fixed seed keeps spawns deterministic):

```ts
import { MatchEngine, type RoomPlayer } from "./matchEngine";
import { arenaDefaults } from "../src/game/arenaDefaults";
import type { MatchConfig } from "../src/game/matchLogic";

const cfg = (over: Partial<MatchConfig> = {}): MatchConfig =>
  ({ mode: "classic", rounds: 3, noTurn: false, teamSize: 1, ...arenaDefaults(), ...over });

describe("MatchEngine.removePlayer", () => {
  it("1v1: removing the red player ends the match, blue wins", () => {
    const players: RoomPlayer[] = [
      { id: "r1", name: "R", team: "red" },
      { id: "b1", name: "B", team: "blue" },
    ];
    const eng = new MatchEngine(cfg(), players, () => 123);
    const s = eng.removePlayer("r1");
    expect(s.phase).toBe("over");
    expect(s.winner).toBe("blue");
    expect(s.players.some((p) => p.id === "r1")).toBe(false);
  });

  it("2v2: removing one red player continues the match (no winner)", () => {
    const players: RoomPlayer[] = [
      { id: "r1", name: "R1", team: "red" },
      { id: "r2", name: "R2", team: "red" },
      { id: "b1", name: "B1", team: "blue" },
      { id: "b2", name: "B2", team: "blue" },
    ];
    const eng = new MatchEngine(cfg({ teamSize: 2 }), players, () => 123);
    const s = eng.removePlayer("r1");
    expect(s.phase).toBe("play");
    expect(s.winner).toBeNull();
    expect(s.players.filter((p) => p.team === "red").map((p) => p.id)).toEqual(["r2"]);
    expect(s.turnQueue).not.toContain("r1");
  });

  it("advances the active turn when the active player is removed", () => {
    const players: RoomPlayer[] = [
      { id: "r1", name: "R1", team: "red" },
      { id: "r2", name: "R2", team: "red" },
      { id: "b1", name: "B1", team: "blue" },
      { id: "b2", name: "B2", team: "blue" },
    ];
    const eng = new MatchEngine(cfg({ teamSize: 2 }), players, () => 123);
    // round 1 starts red-first: activePlayerId === "r1"
    const s = eng.removePlayer("r1");
    expect(s.activePlayerId).not.toBe("r1");
    expect(s.activePlayerId).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/matchEngine.test.ts -t removePlayer`
Expected: FAIL ("removePlayer is not a function").

- [ ] **Step 3: Implement `removePlayer`**

In `server/matchEngine.ts`, extend the imports on line 2-4:

```ts
import { createMatch, beginRound, skipTurn, type MatchState, type PlayerState, type Team, type RoundLayout } from "../src/game/matchState";
import { resolveFire } from "../src/game/resolveFire";
import { firstShooterNextRound, matchWinner, type MatchConfig } from "../src/game/matchLogic";
import { nextActive } from "../src/game/turnQueue";
```

Add this method inside the `MatchEngine` class (e.g. after `resolvePlayerShot`):

```ts
  /**
   * Remove a player from the match for good (Forfeit or grace-expired disconnect).
   * The player leaves the engine roster (so future rounds shrink) and the live
   * state. If their Team is left with zero players the opposing Team wins the
   * Match immediately; if the removal wipes the Team's alive set for the current
   * round, that round is awarded (matchWinner may then end the Match); otherwise
   * the round continues and the active turn advances past the leaver.
   */
  removePlayer(playerId: string): MatchState {
    this.players = this.players.filter((p) => p.id !== playerId);
    this.inFlight.delete(playerId);

    const s = this.state;
    const players = s.players.filter((p) => p.id !== playerId);
    const teams: Team[] = ["red", "blue"];

    // 1) A Team with zero players → other Team wins the Match now.
    const emptyTeam = teams.find((t) => players.filter((p) => p.team === t).length === 0);
    if (emptyTeam) {
      const winner: Team = emptyTeam === "red" ? "blue" : "red";
      this.state = { ...s, players, turnQueue: s.turnQueue.filter((id) => id !== playerId), activePlayerId: null, phase: "over", winner };
      this.roundLoser = null;
      return this.state;
    }

    // 2) Team still has players but all of one Team are now not-alive → round over.
    const roundLoser = teams.find((t) => {
      const tp = players.filter((p) => p.team === t);
      return tp.length > 0 && tp.every((p) => !p.alive);
    });
    if (roundLoser) {
      const winnerTeam: Team = roundLoser === "red" ? "blue" : "red";
      const scores = { ...s.scores, [winnerTeam]: s.scores[winnerTeam] + 1 };
      const winner = matchWinner(scores.red, scores.blue, s.config.rounds);
      this.state = {
        ...s, players, turnQueue: s.turnQueue.filter((id) => id !== playerId),
        scores, phase: winner ? "over" : "between", winner,
        activePlayerId: winner ? null : s.activePlayerId,
      };
      this.roundLoser = roundLoser;
      return this.state;
    }

    // 3) Round continues. Advance the active turn if the leaver was active
    //    (compute the next id off the ORIGINAL queue so ordering is preserved).
    let activePlayerId = s.activePlayerId;
    if (activePlayerId === playerId) {
      activePlayerId = nextActive(
        s.turnQueue, playerId,
        (id) => id !== playerId && (players.find((p) => p.id === id)?.alive ?? false),
      );
    }
    this.state = { ...s, players, turnQueue: s.turnQueue.filter((id) => id !== playerId), activePlayerId };
    return this.state;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/matchEngine.test.ts -t removePlayer`
Expected: PASS (all three)

- [ ] **Step 5: Typecheck the server**

Run: `npx tsc -p server/tsconfig.json`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add server/matchEngine.ts server/matchEngine.test.ts
git commit -m "feat(server): MatchEngine.removePlayer for forfeit/disconnect removal"
```

---

### Task 3: `RoomManager.forfeit()` — roster removal + owner transfer + engine drive

**Files:**
- Modify: `server/roomManager.ts` (add `forfeit`)
- Test: `server/roomManager.test.ts`

**Interfaces:**
- Consumes: `MatchEngine.removePlayer` (Task 2).
- Produces: `RoomManager.forfeit(code: string, playerId: string): { state: MatchState | null; roomGone: boolean; removed: { name: string; team: Team } | null }`. No-op (`state:null`) if the room is absent or still in the lobby (`engine === null`). Task 4 (index handler) and Task 5 (disconnect convergence) call this.

- [ ] **Step 1: Write the failing test**

Add to `server/roomManager.test.ts`:

```ts
describe("RoomManager.forfeit", () => {
  it("removes an in-match player and drives the engine", () => {
    const rooms = new RoomManager();
    rooms.join("WOLF", "Red");   // p? red
    rooms.join("WOLF", "Blue");  // p? blue
    const room = rooms.get("WOLF")!;
    const redId = room.players.find((p) => p.team === "red")!.id;
    rooms.lock("WOLF");
    rooms.start("WOLF", room.ownerId);

    const res = rooms.forfeit("WOLF", redId);

    expect(res.removed).toEqual({ name: expect.any(String), team: "red" });
    expect(res.state?.phase).toBe("over");
    expect(res.state?.winner).toBe("blue");
    expect(room.players.some((p) => p.id === redId)).toBe(false);
  });

  it("is a no-op in the lobby (no engine)", () => {
    const rooms = new RoomManager();
    const { playerId } = rooms.join("WOLF", "Red");
    expect(rooms.forfeit("WOLF", playerId)).toEqual({ state: null, roomGone: false, removed: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/roomManager.test.ts -t forfeit`
Expected: FAIL ("forfeit is not a function")

- [ ] **Step 3: Implement `forfeit`**

In `server/roomManager.ts`, add after `removeFromLobby` (`:187`):

```ts
  /**
   * In-match removal (Forfeit or grace-expired disconnect). Drops the player
   * from the roster, clears their grace/token, transfers ownership if they were
   * the owner, drives the engine's removePlayer(), and tears the room down if it
   * becomes empty. No-op (`state:null`) in the lobby — pre-match departures use
   * removeFromLobby(). Returns the new MatchState + who left for the caller to
   * broadcast.
   */
  forfeit(code: string, playerId: string): { state: MatchState | null; roomGone: boolean; removed: { name: string; team: Team } | null } {
    const room = this.rooms.get(code);
    if (!room || room.engine === null) return { state: null, roomGone: false, removed: null };
    const player = room.players.find((p) => p.id === playerId);
    const removed = player ? { name: player.name, team: player.team } : null;
    this.cancelGrace(code, playerId);
    room.rejoinTokens.delete(playerId);
    const wasOwner = room.ownerId === playerId;
    room.players = room.players.filter((p) => p.id !== playerId);
    const state = room.engine.removePlayer(playerId);
    if (room.players.length === 0) {
      this.remove(code);
      return { state, roomGone: true, removed };
    }
    if (wasOwner) room.ownerId = room.players[0].id;
    return { state, roomGone: false, removed };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/roomManager.test.ts -t forfeit`
Expected: PASS

- [ ] **Step 5: Typecheck the server**

Run: `npx tsc -p server/tsconfig.json`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add server/roomManager.ts server/roomManager.test.ts
git commit -m "feat(server): RoomManager.forfeit — in-match roster removal"
```

---

### Task 4: Server handles the `forfeit` message + guards the stale close

**Files:**
- Modify: `server/index.ts` (add `forfeit` branch in `ws.on("message")`; guard the in-match `ws.on("close")` against an already-removed player)
- Test: manual (server integration tests are flaky here — see Global Constraints). A scripted check is in Step 4.

**Interfaces:**
- Consumes: `RoomManager.forfeit` (Task 3); existing `armTurnTimer`, `broadcast`, `cancelTurnTimer`.

- [ ] **Step 1: Add the `forfeit` message branch**

In `server/index.ts`, after the `fireIntent` branch closes (`:261`, the `}` before the `});` that ends `ws.on("message")`), add:

```ts
      // ── forfeit ───────────────────────────────────────────────────────────
      if (msg.type === "forfeit") {
        if (conn.isSpectator) return; // spectators just close their socket to leave
        if (!room.engine) return; // not in a match — nothing to forfeit
        const res = rooms.forfeit(room.code, conn.playerId);
        if (!res.state) return;
        if (res.roomGone) {
          cancelTurnTimer(room.code);
          for (const c of conns) if (c.room === room.code) c.ws.terminate();
          return;
        }
        const rm = rooms.get(room.code);
        if (!rm || !rm.engine) return;
        const patched = armTurnTimer(room.code, res.state, rm.engine);
        broadcast(room.code, { type: "matchState", state: patched });
        return;
      }
```

- [ ] **Step 2: Guard the stale in-match close**

In `server/index.ts`, in the in-match branch of `ws.on("close")` (after the lobby `if (room.engine === null) { … return; }` block, at `:301`), insert a guard **before** the `peerStatus` broadcast:

```ts
      // ── In-match: keep peerStatus + 30 s grace → forfeit removal.
      // If the player was already removed (explicit forfeit just ran), this
      // close is a no-op — nothing left to grace.
      if (!room.players.some((p) => p.id === conn.playerId)) return;
      const player = room.players.find((p) => p.id === conn.playerId);
```

(The existing `const player = …` line that immediately follows becomes redundant — replace it with the version above so `player` is declared once.)

- [ ] **Step 3: Typecheck the server**

Run: `npx tsc -p server/tsconfig.json`
Expected: no errors

- [ ] **Step 4: Manual verification (two browser tabs)**

Run `npm run server` and `npm run dev`. Open two tabs, create a 1v1 online match, start it. In the red tab, trigger a forfeit (wired in Task 9 — until then, in the browser console: `netLobbyStore` is not exposed, so verify after Task 9). Minimal server-only check now: with `wscat`/a script, join two players, `startMatch`, then send `{"type":"forfeit"}` from one and confirm the other receives a `matchState` with `phase:"over"`. Expected: room does not emit `opponent-timed-out`; the survivor gets a won match.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts
git commit -m "feat(server): handle forfeit message + guard stale in-match close"
```

---

### Task 5: Converge in-match disconnect onto the forfeit path

**Files:**
- Modify: `server/index.ts` (replace the in-match grace-expiry teardown with `rooms.forfeit`)

**Interfaces:**
- Consumes: `RoomManager.forfeit` (Task 3).

- [ ] **Step 1: Replace the grace-expiry body**

In `server/index.ts`, the in-match `startGrace` callback currently reads (`:305-310`):

```ts
      rooms.startGrace(code, conn.playerId!, () => {
        cancelTurnTimer(code);
        const rm = rooms.get(code);
        if (rm) broadcast(code, { type: "error", code: "opponent-timed-out", message: "Opponent timed out — room closed." });
        rooms.remove(code);
      });
```

Replace it with:

```ts
      rooms.startGrace(code, conn.playerId!, () => {
        const res = rooms.forfeit(code, conn.playerId!);
        if (!res.state) return;
        if (res.roomGone) {
          cancelTurnTimer(code);
          for (const c of conns) if (c.room === code) c.ws.terminate();
          return;
        }
        const rm = rooms.get(code);
        if (!rm || !rm.engine) return;
        const patched = armTurnTimer(code, res.state, rm.engine);
        broadcast(code, { type: "matchState", state: patched });
      });
```

- [ ] **Step 2: Typecheck the server**

Run: `npx tsc -p server/tsconfig.json`
Expected: no errors

- [ ] **Step 3: Run the existing server suites in isolation**

Run: `npx vitest run server/integration.test.ts`
Then: `npx vitest run server/roomManager.test.ts`
Expected: PASS. If a countdown-timing test flakes, re-run that file alone before treating it as a regression. If a test asserted the old `"opponent-timed-out"` teardown, update it to expect a post-removal `matchState` (a 1v1 disconnect now yields `phase:"over"`, opponent wins).

- [ ] **Step 4: Commit**

```bash
git add server/index.ts server/integration.test.ts
git commit -m "feat(server): in-match disconnect converges onto forfeit removal"
```

---

### Task 6: Client — `sendForfeit`, forfeit toast via state diff

**Files:**
- Modify: `src/net/NetworkGame.ts` (add `sendForfeit`; diff removed players in `render`)
- Modify: `src/app/net/netLobbyStore.ts` (add `forfeitNotice` field)
- Test: `src/net/NetworkGame.test.ts`

**Interfaces:**
- Consumes: `netLobbyStore`.
- Produces: `NetworkGame.sendForfeit(): void` (Task 9 calls it); `NetLobbyState.forfeitNotice: string | null` (Task 10 renders it).

- [ ] **Step 1: Add the store field**

In `src/app/net/netLobbyStore.ts`, add to the `NetLobbyState` interface (after `peerDown`, `:33`):

```ts
  /** Transient "<name> quit" toast text; cleared by the UI after a few seconds. */
  forfeitNotice: string | null;
```

And to `initialNetLobbyState` return (after `peerDown: null,`, `:64`):

```ts
    forfeitNotice: null,
```

- [ ] **Step 2: Write the failing test**

Add to `src/net/NetworkGame.test.ts` (follow the file's existing harness for constructing a `NetworkGame` with a fake client/renderer/ui; the assertion is on the store):

```ts
import { netLobbyStore, initialNetLobbyState } from "../app/net/netLobbyStore";

it("sets a forfeit notice when a player disappears from matchState", () => {
  netLobbyStore.set(initialNetLobbyState("WOLF"));
  const net = makeNetworkGame(); // existing test helper in this file
  const base = { /* minimal MatchState */ } as any;
  // First state: two players present.
  (net as any).render({ ...base, players: [{ id: "r1", name: "Red", team: "red", alive: true }, { id: "b1", name: "Blue", team: "blue", alive: true }] });
  // Second state: r1 gone (forfeited).
  (net as any).render({ ...base, players: [{ id: "b1", name: "Blue", team: "blue", alive: true }] });
  expect(netLobbyStore.get().forfeitNotice).toBe("Red quit");
});
```

> If `makeNetworkGame`/a minimal `MatchState` factory don't already exist in this test file, reuse whatever the existing `render`-driving tests use; keep the state object minimal but include the fields `render()` reads (`players`, `round`, `phase`, `scores`, `config`, `bounds`, `activePlayerId`, `turnDeadline`).

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/net/NetworkGame.test.ts -t "forfeit notice"`
Expected: FAIL (`forfeitNotice` stays null)

- [ ] **Step 4: Implement the diff + `sendForfeit`**

In `src/net/NetworkGame.ts`, add the method (near `requestStart`, `:202`):

```ts
  sendForfeit(): void {
    this.client.send({ type: "forfeit" });
  }
```

In `render(state)`, right after `const prevRound = this.lastState?.round;` (`:232`) and before `this.lastState = state;` (`:233`):

```ts
    // A player id present last frame but gone now = forfeit / grace-expired
    // disconnect (elimination keeps players in the array with alive:false, so a
    // true disappearance is always a removal). Surface a transient toast.
    const removed = (this.lastState?.players ?? []).filter(
      (p) => !state.players.some((q) => q.id === p.id),
    );
    if (removed.length > 0) {
      netLobbyStore.set({ forfeitNotice: `${removed[0].name} quit`, peerDown: null });
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/net/NetworkGame.test.ts -t "forfeit notice"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/net/NetworkGame.ts src/app/net/netLobbyStore.ts src/net/NetworkGame.test.ts
git commit -m "feat(net): sendForfeit + forfeit-notice toast via matchState diff"
```

---

### Task 7: `Footer` — Leave / Leave Room / Quit Match buttons

**Files:**
- Modify: `src/app/hud/Footer.tsx` (add `onLeave` prop; render the button per mode; confirm on `ingame`)
- Test: `src/app/hud/Footer.test.tsx`

**Interfaces:**
- Produces: `FooterProps.onLeave?: () => void`. `ingame` wraps it in `window.confirm("Quit match?")`; `pregame-*` call it directly. Tasks 8 & 9 supply `onLeave`.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/hud/Footer.test.tsx`:

```ts
it("pregame-local renders a Leave button that calls onLeave without confirm", () => {
  const onLeave = vi.fn();
  render(<Footer mode="pregame-local" onStart={vi.fn()} onLeave={onLeave} />);
  fireEvent.click(screen.getByRole("button", { name: /leave/i }));
  expect(onLeave).toHaveBeenCalledTimes(1);
});

it("ingame Quit Match confirms before calling onLeave", () => {
  const onLeave = vi.fn();
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<Footer mode="ingame" onLeave={onLeave} />);
  fireEvent.click(screen.getByRole("button", { name: /quit match/i }));
  expect(confirmSpy).toHaveBeenCalled();
  expect(onLeave).toHaveBeenCalledTimes(1);
  confirmSpy.mockRestore();
});

it("ingame Quit Match does nothing if the confirm is dismissed", () => {
  const onLeave = vi.fn();
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Footer mode="ingame" onLeave={onLeave} />);
  fireEvent.click(screen.getByRole("button", { name: /quit match/i }));
  expect(onLeave).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/hud/Footer.test.tsx -t "Leave|Quit"`
Expected: FAIL (no such buttons)

- [ ] **Step 3: Add the prop**

In `src/app/hud/Footer.tsx`, add to `FooterProps` (after `mode`, `:36`):

```ts
  /** Leave/Quit action. ingame confirms first; pregame calls directly. */
  onLeave?: () => void;
```

- [ ] **Step 4: Render the ingame Quit button**

Replace the `ingame` block (`:64-70`) with:

```tsx
  if (props.mode === "ingame") {
    const quit = () => { if (window.confirm("Quit match?")) props.onLeave?.(); };
    return (
      <div className="comp footer footer--ingame" data-testid="arena-footer">
        <HudBar makeInput={props.makeInput} singleTeam={props.singleTeam} />
        <button type="button" className="gw-btn footer-leave" onClick={quit}>
          Quit Match
        </button>
      </div>
    );
  }
```

- [ ] **Step 5: Render the pregame Leave button**

In the pregame `return` (`:89`), add the button as the first child inside `.footer--pregame` (before the `showWaiting` ternary):

```tsx
    <div className="comp footer footer--pregame" data-testid="arena-footer">
      <button type="button" className="gw-btn footer-leave" onClick={props.onLeave}>
        {props.mode === "pregame-online" ? "Leave Room" : "Leave"}
      </button>
      {showWaiting ? (
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/hud/Footer.test.tsx`
Expected: PASS (new + existing)

- [ ] **Step 7: Commit**

```bash
git add src/app/hud/Footer.tsx src/app/hud/Footer.test.tsx
git commit -m "feat(hud): Leave/Leave Room/Quit Match buttons in Footer"
```

---

### Task 8: Wire local Leave / Quit

**Files:**
- Modify: `src/app/screens/LocalFlow.tsx` (pass `onLeave` to both footers)
- Test: `src/app/screens/LocalFlow.test.tsx`

**Interfaces:**
- Consumes: `Footer.onLeave` (Task 7); `hudController.requestReset()` (routes through the existing dispose+`location.hash=""` navigation wired at `LocalFlow.tsx:46`).

- [ ] **Step 1: Write the failing test**

Add to `src/app/screens/LocalFlow.test.tsx` (the file already mocks `ArenaStage`):

```ts
it("pregame Leave navigates back to landing", () => {
  location.hash = "#game";
  render(<LocalFlow initial={someConfig} />);
  fireEvent.click(screen.getByRole("button", { name: /^leave$/i }));
  expect(location.hash === "" || location.hash === "#").toBe(true);
});
```

> Reuse the test file's existing `initial` config fixture (or its equivalent). `hudController.requestReset()` calls the `onReset` callback, which sets `location.hash = ""`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/screens/LocalFlow.test.tsx -t "Leave"`
Expected: FAIL (no Leave button wired / no handler)

- [ ] **Step 3: Wire the footers**

In `src/app/screens/LocalFlow.tsx`, import is already present (`hudController`). Change the two footer render lines (`:109` and `:111`):

```tsx
      {phase === "config" && <Footer mode="pregame-local" onStart={onStart} onLeave={() => hudController.requestReset()} />}
```

```tsx
      {phase === "play" && (<><Footer mode="ingame" onLeave={() => hudController.requestReset()} /><HudOverlays /></>)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/screens/LocalFlow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/LocalFlow.tsx src/app/screens/LocalFlow.test.tsx
git commit -m "feat(app): wire local Leave/Quit Match to landing"
```

---

### Task 9: Wire online Leave Room / Quit Match (forfeit)

**Files:**
- Modify: `src/app/screens/OnlineFlow.tsx` (pass `onLeave` to both footers; ingame sends forfeit)
- Test: `src/app/screens/OnlineFlow.test.tsx`

**Interfaces:**
- Consumes: `Footer.onLeave` (Task 7); `NetworkGame.sendForfeit` (Task 6); `hudController.requestReset()` (wired at `OnlineFlow.tsx:75` to `location.hash = ""`).

- [ ] **Step 1: Write the failing test**

Add to `src/app/screens/OnlineFlow.test.tsx` (the file already mocks `ArenaStage` and drives phases via `netLobbyStore`):

```ts
it("ingame Quit Match sends forfeit then navigates away", () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  // drive store into play phase as the existing play-phase tests do
  render(<OnlineFlow code="WOLF" />);
  // ...set netLobbyStore to phase:"play", amSpectator:false, matchPlayers with myId...
  fireEvent.click(screen.getByRole("button", { name: /quit match/i }));
  expect(fakeNet.sendForfeit).toHaveBeenCalledTimes(1); // fakeNet from the file's NetworkGame mock
  confirmSpy.mockRestore();
});
```

> Match the file's existing pattern for putting the store into `play` and for spying on the mocked `NetworkGame`. If the mock doesn't expose `sendForfeit`, add it to the `vi.mock("../../net/NetworkGame", …)` factory alongside the other methods.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/screens/OnlineFlow.test.tsx -t "Quit Match"`
Expected: FAIL

- [ ] **Step 3: Wire the pregame footer**

In `src/app/screens/OnlineFlow.tsx`, add `onLeave` to the `pregame-online` Footer (`:337-346`):

```tsx
          <Footer
            mode="pregame-online"
            isHost={amHost}
            onStart={onStart}
            startDisabled={!bothTeamsFilled}
            name={myName}
            onNameChange={onFooterNameChange}
            onSwitchSide={onFooterSwitchSide}
            roomCode={roomCode}
            onLeave={() => hudController.requestReset()}
          />
```

- [ ] **Step 4: Wire the ingame footer**

Change the ingame Footer (`:376`):

```tsx
          <Footer
            mode="ingame"
            singleTeam={myTeam ?? undefined}
            onLeave={() => { netRef.current?.sendForfeit(); hudController.requestReset(); }}
          />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/screens/OnlineFlow.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/screens/OnlineFlow.tsx src/app/screens/OnlineFlow.test.tsx
git commit -m "feat(app): wire online Leave Room + Quit Match (forfeit)"
```

---

### Task 10: Render the forfeit toast

**Files:**
- Modify: `src/app/net/ReconnectOverlays.tsx` (render `forfeitNotice`; auto-clear)
- Test: `src/app/net/ReconnectOverlays.test.tsx`

**Interfaces:**
- Consumes: `netLobbyStore.forfeitNotice` (Task 6).

- [ ] **Step 1: Write the failing test**

Add to `src/app/net/ReconnectOverlays.test.tsx`:

```ts
it("shows the forfeit notice when set", () => {
  netLobbyStore.set({ forfeitNotice: "Red quit" });
  render(<ReconnectOverlays />);
  expect(screen.getByText(/red quit/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/net/ReconnectOverlays.test.tsx -t "forfeit notice"`
Expected: FAIL

- [ ] **Step 3: Render + auto-clear**

In `src/app/net/ReconnectOverlays.tsx`, subscribe to the field and render a banner (reuse the existing `reconnect-overlay--banner` styling). Add near the other `useStore` calls:

```tsx
  const forfeitNotice = useStore(netLobbyStore, (s) => s.forfeitNotice);

  useEffect(() => {
    if (!forfeitNotice) return;
    const t = setTimeout(() => netLobbyStore.set({ forfeitNotice: null }), 4000);
    return () => clearTimeout(t);
  }, [forfeitNotice]);
```

Then render it (e.g. alongside the `peerDown` banner return, or as an extra element before it):

```tsx
  if (forfeitNotice) {
    return (
      <div className="reconnect-overlay reconnect-overlay--banner" role="status" aria-live="polite">
        {forfeitNotice}
      </div>
    );
  }
```

> Ensure `useEffect`/`useStore` are imported. If a `peerDown` banner and a `forfeitNotice` could both be active, render whichever the file's structure makes simplest — a stacked pair is fine; prettiness is deferred.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/net/ReconnectOverlays.test.tsx`
Expected: PASS

- [ ] **Step 5: Full milestone typecheck + build**

Run: `npm run build`
Expected: `tsc --noEmit` clean, Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/net/ReconnectOverlays.tsx src/app/net/ReconnectOverlays.test.tsx
git commit -m "feat(app): render transient forfeit toast"
```

---

## Milestone B — Camera-Zoom Transition

### Task 11: `GameRenderer` zoom factor + `animateZoom`

**Files:**
- Modify: `src/game/GameRenderer.ts` (add `zoomFactor`; multiply into `recomputeEffectiveBounds`; add `setZoomFactor` + `animateZoom`; export a pure `zoomedCamScale` + `easeInOutCubic`)
- Test: `src/game/GameRenderer.test.ts`

**Interfaces:**
- Produces: pure `zoomedCamScale(map, w, h, factor): number` and `easeInOutCubic(t: number): number` (exported, tested); `GameRenderer.setZoomFactor(f)` and `GameRenderer.animateZoom(to, durationMs?)`. Task 12 (`ArenaStage`) calls `setZoomFactor`/`animateZoom`.

- [ ] **Step 1: Write the failing tests**

Add to `src/game/GameRenderer.test.ts`:

```ts
import { zoomedCamScale, easeInOutCubic } from "./GameRenderer";

describe("zoomedCamScale", () => {
  it("is fitContain scale times the factor", () => {
    const map = { width: 20, height: 12 };
    const full = zoomedCamScale(map, 800, 600, 1);
    expect(zoomedCamScale(map, 800, 600, 0.87)).toBeCloseTo(full * 0.87, 6);
  });
});

describe("easeInOutCubic", () => {
  it("pins endpoints and midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/GameRenderer.test.ts -t "zoomedCamScale|easeInOutCubic"`
Expected: FAIL (not exported)

- [ ] **Step 3: Add the pure helpers + wire the factor**

In `src/game/GameRenderer.ts`, add near the other exported pure helpers (top-level, not in the class):

```ts
/** Camera pixels-per-world-unit that fits the map, scaled by a zoom factor (<1 = zoomed out). */
export function zoomedCamScale(map: MapConfig, canvasW: number, canvasH: number, factor: number): number {
  return fitContain(map, canvasW, canvasH).scale * factor;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
```

Add a field to the class (near `map`, `:138`):

```ts
  /** Visual zoom multiplier on the fit-to-frame camera scale (1 = arena fills frame). */
  private zoomFactor = 1;
  private zoomRaf: number | null = null;
```

Change `recomputeEffectiveBounds` (`:240`) to:

```ts
    cam.scale = zoomedCamScale(this.map, cam.width, cam.height, this.zoomFactor);
```

Add the setter + tween as class methods:

```ts
  /** Set the zoom factor and redraw immediately (no animation). */
  setZoomFactor(factor: number): void {
    this.zoomFactor = factor;
    this.recomputeEffectiveBounds();
    if (this.world) { this.drawStatic(); this.drawPlanets(); this.drawField(); }
  }

  /** Tween the zoom factor to `to` over `durationMs`, redrawing each frame. */
  animateZoom(to: number, durationMs = 900): void {
    if (this.zoomRaf !== null) cancelAnimationFrame(this.zoomRaf);
    const from = this.zoomFactor;
    if (from === to) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      this.setZoomFactor(from + (to - from) * easeInOutCubic(t));
      if (t < 1) { this.zoomRaf = requestAnimationFrame(step); }
      else { this.zoomRaf = null; }
    };
    this.zoomRaf = requestAnimationFrame(step);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/GameRenderer.test.ts`
Expected: PASS (new + existing)

- [ ] **Step 5: Commit**

```bash
git add src/game/GameRenderer.ts src/game/GameRenderer.test.ts
git commit -m "feat(graph): camera zoom factor + animateZoom tween"
```

---

### Task 12: `ArenaStage` drives camera zoom instead of CSS transform

**Files:**
- Modify: `src/app/arena/ArenaStage.tsx` (drop the CSS `transform`; drive `setZoomFactor`/`animateZoom` off the `scale` prop)
- Test: `src/app/arena/ArenaStage.test.tsx`

**Interfaces:**
- Consumes: `GameRenderer.setZoomFactor`, `GameRenderer.animateZoom` (Task 11).

- [ ] **Step 1: Write the failing test**

Add to `src/app/arena/ArenaStage.test.tsx` (the file already builds a fake renderer via the `factory` seam — extend the fake with `setZoomFactor`/`animateZoom` spies):

```ts
it("sets the initial zoom factor on ready and animates on scale change", async () => {
  const setZoomFactor = vi.fn();
  const animateZoom = vi.fn();
  const r = { app: { resize: vi.fn() }, setZoomFactor, animateZoom } as any;
  const { rerender } = render(<ArenaStage scale={0.87} onReady={vi.fn()} factory={() => r} />);
  await waitFor(() => expect(setZoomFactor).toHaveBeenCalledWith(0.87));
  rerender(<ArenaStage scale={1} onReady={vi.fn()} factory={() => r} />);
  await waitFor(() => expect(animateZoom).toHaveBeenCalledWith(1));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/arena/ArenaStage.test.tsx -t "zoom factor"`
Expected: FAIL

- [ ] **Step 3: Rewrite ArenaStage**

Replace `src/app/arena/ArenaStage.tsx` body so the host div has no `transform`, and add an effect that sets zoom on mount and animates on change:

```tsx
export function ArenaStage({ scale, onReady, factory }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const readyScaleRef = useRef(scale); // captures the scale at mount for the initial (un-animated) zoom

  useEffect(() => {
    let cancelled = false;
    void acquireRenderer(hostRef.current!, factory).then((r) => {
      if (cancelled) return;
      rendererRef.current = r;
      r.setZoomFactor(readyScaleRef.current); // initial zoom, no animation
      onReadyRef.current(r);
      requestAnimationFrame(() => { if (!cancelled) r.app.resize?.(); });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate the coordinate-plane zoom whenever the target scale changes.
  useEffect(() => {
    rendererRef.current?.animateZoom(scale);
  }, [scale]);

  // (keep the existing ResizeObserver effect verbatim)

  return (
    <div className="arena-frame">
      <div ref={hostRef} className="arena-stage" />
    </div>
  );
}
```

> Keep the existing `ResizeObserver` effect (`ArenaStage.tsx:33-48`) unchanged. The only removals are the inline `style={{ transform … }}` and the transition.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/arena/ArenaStage.test.tsx`
Expected: PASS (new + existing `scale={1}` tests — they now just don't apply a CSS transform, which those tests don't assert on)

- [ ] **Step 5: Commit**

```bash
git add src/app/arena/ArenaStage.tsx src/app/arena/ArenaStage.test.tsx
git commit -m "feat(arena): drive transition via camera zoom, not CSS transform"
```

---

### Task 13: Remove the dead CSS transform

**Files:**
- Modify: `src/app/theme.css:66` (`.arena-stage`)

**Interfaces:** none.

- [ ] **Step 1: Strip the transform**

In `src/app/theme.css`, change `.arena-stage` (`:66`) from:

```css
.arena-stage { position: absolute; inset: 0; transform-origin: 50% 46%; }
```

to:

```css
.arena-stage { position: absolute; inset: 0; }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/theme.css
git commit -m "chore(css): drop unused arena-stage transform-origin"
```

---

### Task 14: Manual visual verification + docs check

**Files:** none (verification only).

- [ ] **Step 1: Run both servers**

```bash
npm run server   # terminal 1
npm run dev      # terminal 2
```

- [ ] **Step 2: Verify the transition**

Open a local match. In the config/countdown phase the **canvas fills the whole arena frame** (grid to the edges, arena boundary inset ~87%, no blank margins). On match start the coordinate plane **zooms in smoothly (~900ms)** until the arena fills the frame. Confirm no blank letterbox appears at any point. If it visibly hitches on the zoom, apply the fallback noted in `docs/adr/0006-camera-zoom-transition.md` (scale existing planet sprites during the tween instead of re-rasterizing) — out of scope for this plan unless observed.

- [ ] **Step 3: Verify leave/forfeit end-to-end**

- Local pre-game: **Leave** → landing (no confirm).
- Local in-game: **Quit Match** → confirm → landing.
- Online pre-game (two tabs): **Leave Room** → leaver returns to landing; the other tab keeps the room (ownership transfers if the host left).
- Online in-game 1v1: **Quit Match** → confirm → leaver to landing; the opponent immediately sees a won match; the other tab shows a **"… quit"** toast; no `opponent-timed-out` error.
- Online in-game 2v2: one player quits → match continues 1v2; survivors see the toast.

- [ ] **Step 4: Confirm the docs are consistent**

`CONTEXT.md` (Leave/Forfeit), `docs/adr/0005-forfeit-per-player-removal.md`, and `docs/adr/0006-camera-zoom-transition.md` already describe this work — skim them against what shipped and fix any drift.

---

## Self-Review Notes

- **Spec coverage:** Leave (local/online pre-game) → Tasks 7–9. Forfeit removal + team-empty win → Tasks 2–4. Disconnect convergence → Task 5. Toast → Tasks 6, 10. Camera zoom → Tasks 11–13. All grill decisions covered.
- **Type consistency:** `removePlayer(playerId): MatchState` (Task 2) is consumed by `forfeit` (Task 3) which returns `{ state, roomGone, removed }` consumed by Tasks 4–5. `sendForfeit()` (Task 6) consumed by Task 9. `onLeave?: () => void` (Task 7) consumed by Tasks 8–9. `setZoomFactor`/`animateZoom` (Task 11) consumed by Task 12.
- **Milestones are independent:** Milestone B (Tasks 11–13) touches only the renderer/stage/CSS and can ship before or after Milestone A.
- **Known deferrals (not blockers):** the win-screen detail text still says "Direct hit."/"Out of HP." on a forfeit win (cosmetic); the forfeit toast renders for players via `ReconnectOverlays` but not for spectators (spectators keep their existing overlay Leave). Both are polish-later per the user.
