# Pre-game Disconnect & Nickname Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two online pre-game bugs — (A) the player's chosen nickname is never persisted to `localStorage`, and (B) a disconnected lobby player lingers in the roster for 30 s and can be dragged into a match — by persisting the nickname on rename and removing lobby players immediately on disconnect with owner-transfer.

**Architecture:** Bug B is fixed server-side in `roomManager.ts` (new `removeFromLobby` method holding the removal/owner-transfer/empty-teardown logic) wired into the `ws.on('close')` handler in `server/index.ts`, which now branches: **lobby (`engine === null`) → immediate removal**; **in-match (`engine !== null`) → unchanged 30 s grace + teardown**. Bug A is a one-line client fix in `OnlineFlow.tsx` calling the already-existing `setNickname()`.

**Tech Stack:** TypeScript, Vitest, `ws` (WebSocket), React + Testing Library.

## Global Constraints

- `src/sim/` and `src/math/` stay Node-safe, deterministic, side-effect-free — **do not touch them in this plan**.
- **No wire-protocol change.** Reuse the existing `lobbyState` message for the roster update; do not add or alter any Zod message schema. (`peerStatus` remains used by the in-match path only.)
- After **any** change under `server/`, run the separate server typecheck: `npx tsc -p server/tsconfig.json`.
- The full Vitest suite is flaky under parallel load on this cloud-synced filesystem. **Run each changed test file in isolation** (`npx vitest run <path>`) before trusting a failure.
- Owner transfer target = **next player in roster order** (`room.players[0]` after the leaver is spliced out).
- In-match host/opponent disconnect behavior stays **exactly as-is** (30 s grace → room teardown). This plan changes the lobby path only.

---

### Task 1: `RoomManager.removeFromLobby` — immediate lobby removal + owner transfer

**Files:**
- Modify: `server/roomManager.ts` (add a method to the `RoomManager` class, near `rejoin`/`cancelGrace` around line 160)
- Test: `server/roomManager.test.ts`

**Interfaces:**
- Consumes: existing `Room` fields — `players: RoomPlayer[]`, `ownerId: string`, `engine`, `rejoinTokens: Map`, `graceTimers: Map`; existing methods `get`, `cancelGrace`, `relayout`, `remove`.
- Produces: `removeFromLobby(code: string, playerId: string): { roomGone: boolean }` — used by Task 2. `roomGone` is `true` only when the room was torn down because it became empty.

- [ ] **Step 1: Write the failing tests**

Append to `server/roomManager.test.ts` (inside the top-level file, e.g. after the existing `describe("RoomManager", ...)` block):

```ts
describe("RoomManager.removeFromLobby (Bug B)", () => {
  it("removes the player from the roster and keeps the room", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "Ann");
    const b = m.join("WOLF", "Bo");
    const res = m.removeFromLobby("WOLF", b.playerId);
    expect(res.roomGone).toBe(false);
    const room = m.get("WOLF")!;
    expect(room.players.map((p) => p.id)).toEqual([a.playerId]);
  });

  it("transfers ownership to the next player in roster order when the owner leaves", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "Ann"); // owner
    const b = m.join("WOLF", "Bo");
    expect(m.get("WOLF")!.ownerId).toBe(a.playerId);
    m.removeFromLobby("WOLF", a.playerId);
    expect(m.get("WOLF")!.ownerId).toBe(b.playerId);
  });

  it("tears the room down when the last player leaves", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "Ann");
    const res = m.removeFromLobby("WOLF", a.playerId);
    expect(res.roomGone).toBe(true);
    expect(m.get("WOLF")).toBeUndefined();
  });

  it("is a no-op once the match has started (engine !== null)", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "Ann");
    const b = m.join("WOLF", "Bo");
    m.start("WOLF", a.playerId); // engine now set
    const res = m.removeFromLobby("WOLF", b.playerId);
    expect(res.roomGone).toBe(false);
    expect(m.get("WOLF")!.players.map((p) => p.id)).toContain(b.playerId);
  });

  it("clears the leaver's grace timer and rejoin token", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "Ann");
    const b = m.join("WOLF", "Bo");
    const graceFn = vi.fn();
    m.startGrace("WOLF", b.playerId, graceFn);
    m.removeFromLobby("WOLF", b.playerId);
    // token gone → rejoin must fail
    expect(m.rejoin("WOLF", b.playerId, b.token)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/roomManager.test.ts`
Expected: FAIL — `m.removeFromLobby is not a function`.

- [ ] **Step 3: Implement `removeFromLobby`**

In `server/roomManager.ts`, add this method to the `RoomManager` class (place it right after `cancelGrace`, before `rejoin`):

```ts
  /**
   * Pre-match player removal (Bug B). In the lobby a disconnect is immediate:
   * the player leaves `room.players`, their grace timer + rejoin token are
   * cleared, ownership transfers to the next player in roster order if they
   * were the owner, and the room is torn down if it becomes empty. Returns
   * `{ roomGone }` so the socket layer can re-broadcast the roster or terminate
   * the dead room's sockets. No-op (`roomGone:false`) once a match has started
   * (`engine !== null`) — in-match disconnects keep the grace/reconnect path.
   */
  removeFromLobby(code: string, playerId: string): { roomGone: boolean } {
    const room = this.rooms.get(code);
    if (!room) return { roomGone: false };
    if (room.engine !== null) return { roomGone: false };
    this.cancelGrace(code, playerId);
    room.rejoinTokens.delete(playerId);
    const wasOwner = room.ownerId === playerId;
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      this.remove(code);
      return { roomGone: true };
    }
    if (wasOwner) room.ownerId = room.players[0].id;
    this.relayout(code);
    return { roomGone: false };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/roomManager.test.ts`
Expected: PASS (all `removeFromLobby` cases green, existing cases still green).

- [ ] **Step 5: Server typecheck**

Run: `npx tsc -p server/tsconfig.json`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add server/roomManager.ts server/roomManager.test.ts
git commit -m "feat(server): removeFromLobby — immediate pre-game removal + owner transfer"
```

---

### Task 2: Wire `ws.on('close')` to remove lobby players immediately

**Files:**
- Modify: `server/index.ts:252-281` (the `ws.on("close", …)` handler)
- Test: `server/integration.test.ts`

**Interfaces:**
- Consumes: `rooms.removeFromLobby(code, playerId): { roomGone: boolean }` from Task 1; existing `rosterMsg(room)`, `broadcast(code, msg)`, `conns`, `cancelTurnTimer`, `rooms.startGrace`.
- Produces: (socket behavior only) — on a lobby disconnect, a fresh `lobbyState` is broadcast to the remaining players with the leaver gone and, if they were owner, a new `ownerId`.

- [ ] **Step 1: Write the failing test**

Append to `server/integration.test.ts` a new top-level `describe` (uses the existing `open`/`next` helpers at the top of the file; real timers — removal is synchronous, no grace delay to advance):

```ts
describe("server integration — lobby disconnect (Bug B)", () => {
  it("host leaving the lobby removes them from the roster and transfers ownership", async () => {
    const port = 3620 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    a.send(encode({ type: "join", room: "LOBBY", name: "Ann" })); // owner
    await next(a, "joined");
    b.send(encode({ type: "join", room: "LOBBY", name: "Bo" }));
    const bJoined = await next(b, "joined");
    const bId = (bJoined as any).playerId;

    const rosterP = next(b, "lobbyState");
    a.close();
    const roster = (await rosterP) as any;

    expect(roster.players).toHaveLength(1);
    expect(roster.players[0].id).toBe(bId);
    expect(roster.ownerId).toBe(bId);

    b.close();
    await server.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/integration.test.ts -t "host leaving the lobby"`
Expected: FAIL — the current handler broadcasts `peerStatus` (not `lobbyState`) and starts a grace timer, so `next(b, "lobbyState")` never resolves and the test errors with `ws closed waiting for lobbyState` (or times out).

- [ ] **Step 3: Replace the `ws.on('close')` handler**

In `server/index.ts`, replace the entire existing handler (lines ~252-281) with:

```ts
    ws.on("close", () => {
      conns.delete(conn);
      if (!conn.room) return;
      const room = rooms.get(conn.room);
      if (!room) return;

      if (conn.isSpectator) {
        room.spectators = room.spectators.filter((s) => s.id !== conn.playerId);
        broadcast(conn.room, rosterMsg(room));
        return;
      }

      // If the player already reconnected on a new socket, this close is stale — skip.
      const alreadyReconnected = [...conns].some(
        (c) => c.room === conn.room && c.playerId === conn.playerId && c.ws.readyState === WebSocket.OPEN,
      );
      if (alreadyReconnected) return;

      const code = conn.room;

      // ── Lobby (no match yet): remove immediately, transfer owner, drop empty room (Bug B).
      if (room.engine === null) {
        const { roomGone } = rooms.removeFromLobby(code, conn.playerId!);
        if (roomGone) {
          for (const c of conns) if (c.room === code) c.ws.terminate();
        } else {
          const updated = rooms.get(code);
          if (updated) broadcast(code, rosterMsg(updated));
        }
        return;
      }

      // ── In-match: keep peerStatus + 30 s grace → teardown (unchanged).
      const player = room.players.find((p) => p.id === conn.playerId);
      const name = player?.name ?? "Player";
      broadcast(code, { type: "peerStatus", playerId: conn.playerId!, name, connected: false });
      rooms.startGrace(code, conn.playerId!, () => {
        cancelTurnTimer(code);
        const rm = rooms.get(code);
        if (rm) broadcast(code, { type: "error", code: "opponent-timed-out", message: "Opponent timed out — room closed." });
        rooms.remove(code);
      });
    });
```

- [ ] **Step 4: Run the new test AND the existing disconnect test to verify both pass**

Run: `npx vitest run server/integration.test.ts`
Expected: PASS — the new lobby test passes, and the existing "disconnect sends peerStatus{connected:false}; grace expire tears down room" (which starts a match first, so it hits the in-match branch) still passes.
Note: if a timing-sensitive case flakes under load, re-run that single file alone before treating it as a regression.

- [ ] **Step 5: Server typecheck**

Run: `npx tsc -p server/tsconfig.json`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add server/index.ts server/integration.test.ts
git commit -m "fix(server): remove lobby players immediately on disconnect, transfer owner"
```

---

### Task 3: Persist the nickname to localStorage on rename (Bug A)

**Files:**
- Modify: `src/app/screens/OnlineFlow.tsx` (import at line 16; handler `onFooterNameChange` at lines ~230-239)
- Test: `src/app/screens/OnlineFlow.test.tsx` (nickname mock at lines ~48-50; add one test)

**Interfaces:**
- Consumes: existing `setNickname(n: string): void` from `src/app/net/nickname.ts` (writes `localStorage["curvecombat.nickname"]`, trimmed to 12 chars).
- Produces: (behavior only) — typing in the footer Name input immediately calls `setNickname(name)`; the debounced `sendSetName` network dispatch is unchanged.

- [ ] **Step 1: Extend the nickname mock and write the failing test**

In `src/app/screens/OnlineFlow.test.tsx`, update the existing mock (currently only mocks `getNickname`) to also mock `setNickname`:

```ts
vi.mock("../net/nickname", () => ({
  getNickname: vi.fn(() => "TestPlayer"),
  setNickname: vi.fn(),
}));
```

Add the import for the mocked fn and `fireEvent` near the other imports at the top of the file:

```ts
import { fireEvent } from "@testing-library/react";
import { setNickname } from "../net/nickname";
```

Add this test inside `describe("OnlineFlow", …)`:

```ts
  it("persists the nickname to localStorage when the footer Name input changes", async () => {
    await act(async () => {
      render(<OnlineFlow code="ROOM1" />);
    });
    act(() => {
      setLobbyState({
        phase: "lobby",
        roomCode: "ROOM1",
        players: BASE_PLAYERS,
        myId: "r1",
        hostId: "r1",
        amHost: true,
        amSpectator: false,
      });
    });
    const input = screen.getByLabelText(/name/i);
    fireEvent.change(input, { target: { value: "Zed" } });
    expect(setNickname).toHaveBeenCalledWith("Zed");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/screens/OnlineFlow.test.tsx -t "persists the nickname"`
Expected: FAIL — `setNickname` is never called (`expected "setNickname" to be called with "Zed"` / 0 calls).

- [ ] **Step 3: Import and call `setNickname` in the handler**

In `src/app/screens/OnlineFlow.tsx`, change the import at line 16 from:

```ts
import { getNickname } from "../net/nickname";
```

to:

```ts
import { getNickname, setNickname } from "../net/nickname";
```

Then update `onFooterNameChange` (lines ~230-239) to persist locally **immediately** (localStorage does not need the debounce — the debounce only throttles the network send):

```ts
  const onFooterNameChange = useCallback((name: string) => {
    setNickname(name); // persist locally right away; server send stays debounced
    const net = netRef.current;
    if (!net) return;
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => {
      nameDebounceRef.current = null;
      if (netLobbyStore.get().phase !== "lobby") return;
      net.sendSetName(name);
    }, 300);
  }, []);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/screens/OnlineFlow.test.tsx -t "persists the nickname"`
Expected: PASS.

- [ ] **Step 5: Run the full OnlineFlow test file to check for regressions**

Run: `npx vitest run src/app/screens/OnlineFlow.test.tsx`
Expected: PASS (existing tests still green). If a React/timer test flakes under load, re-run this file alone before treating it as a regression.

- [ ] **Step 6: Commit**

```bash
git add src/app/screens/OnlineFlow.tsx src/app/screens/OnlineFlow.test.tsx
git commit -m "fix(app): persist chosen nickname to localStorage on rename"
```

---

## Notes for the implementer

- Tasks are independent enough to land in any order, but **1 before 2** (Task 2 calls the method from Task 1).
- No `src/net/protocol.ts` change is required — verify you did not need one (if you find yourself editing a Zod schema, stop and re-read the plan).
- Final gate before wrapping up: `npm run build` (root `tsc --noEmit` + Vite) **and** `npx tsc -p server/tsconfig.json`.
- Reference diagram for the full lifecycle + agreed design: `docs/pregame-player-lifecycle.canvas`.
