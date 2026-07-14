# Multiplayer Backbone — Phase 2 Design Spec

**Date:** 2026-07-02
**Status:** Approved design — ready for implementation plan
**Base:** Phase 1 (`f977e16`, `main`) — walking skeleton, 121 tests, 1v1 end-to-end verified.
**Related:** [Phase 1 spec](2026-07-01-multiplayer-backbone-design.md), [B-decisions.md](../../multiplayer-arch/B-decisions.md), [progress ledger](../../../.superpowers/sdd/progress.md)

---

## Goal

Harden the Phase 1 skeleton for real friend sessions: reconnect gracefully after
network drops, support spectators joining at any time (with catch-up), clean up
abandoned rooms automatically, and close the socket on page navigation so tabs
don't leak open connections.

---

## Scope

Four features, two implementation tasks (server-first, then client):

1. **Reconnect** — `rejoinToken` + 30s server-side grace + auto-reconnect loop in
   `ServerClient` + sessionStorage fallback for page refreshes.
2. **Spectators** — `asSpectator` join flag; spectators receive all broadcasts; a
   spectator joining a match already in progress gets an immediate catch-up
   `matchState` snapshot. No grace period for spectators.
3. **Room lifecycle** — 10-min idle TTL on every room (resets on join + match-start);
   re-start guard in `RoomManager.start()`.
4. **Socket lifecycle** — `NetworkGame.close()` called on `beforeunload`; marks the
   close as deliberate so auto-reconnect does not fire.

Out of scope: N-player HUD/rendering generalisation (Phase 3), turn timer (D3,
Phase 3), deploy (Phase 4).

---

## 1. Protocol additions (`src/net/protocol.ts`)

### New client message

```
reconnect { room: string, playerId: string, token: string }
```

### Updated server messages

| Message | Change |
|---------|--------|
| `joined` | gains `token: string` — the rejoin credential, minted (or refreshed) by the server on every successful join or reconnect |
| `lobbyState` | gains `spectators: Array<{ id: string; name: string }>` |
| `peerStatus` *(new)* | `{ playerId: string; name: string; connected: boolean }` — broadcast to the room when a player drops or rejoins mid-match |

All existing message shapes (`shotPlayback`, `matchState`, `fireIntent`, `startMatch`,
`join`) are unchanged.

---

## 2. Server state machine

### 2a. `Room` struct additions (`server/roomManager.ts`)

```ts
rejoinTokens: Map<string, string>        // playerId → token
graceTimers:  Map<string, ReturnType<typeof setTimeout>>  // playerId → 30s handle
ttlTimer:     ReturnType<typeof setTimeout> | null        // 10-min idle handle
spectators:   Array<{ id: string; name: string }>
```

### 2b. `RoomManager` new methods

| Method | Responsibility |
|--------|---------------|
| `generateToken(code, playerId): string` | Mint a `crypto.randomUUID()` token, store in `rejoinTokens` |
| `startGrace(code, playerId, onExpire)` | Start a 30s `setTimeout`; store handle in `graceTimers` |
| `cancelGrace(code, playerId)` | Clear the handle; delete from `graceTimers` |
| `rejoin(code, playerId, token): Room \| null` | Validate token (constant-time compare via `timingSafeEqual`), cancel grace, mint a fresh token, return room; return `null` if token invalid or grace expired |
| `startTTL(code, onExpire)` | Start a 10-min `setTimeout`; cancel any prior handle first |
| `resetTTL(code)` | Convenience: re-calls `startTTL` (used on join + match-start) |
| `joinSpectator(code, name): string` | Add to `room.spectators`, return a generated id. No token, no team, no grace. |

**Re-start guard:** `start()` throws `"match already in progress"` if
`room.engine !== null`.

**`join()`** calls `generateToken` and `resetTTL` after adding the player.

### 2c. `index.ts` handler changes

**`join` handler:**
- Call `rooms.join()` (unchanged logic).
- Send `joined { playerId, token, ownerId }` (token is new).
- Broadcast `lobbyState` (unchanged).
- Call `rooms.resetTTL(code)`.

**New `reconnect` handler:**
- Call `rooms.rejoin(code, playerId, token)`.
- On `null` (invalid/expired): send `error { code: "rejoin-failed", message: "..." }`.
- On success: set `conn.playerId`, `conn.room`; send `joined` (fresh token);
  broadcast updated `lobbyState`; if match in progress, send current
  `matchState` snapshot directly to the rejoining connection (not broadcast).
  Broadcast `peerStatus { playerId, name, connected: true }` to the room.

**`join` with `asSpectator: true`:**
- Call `rooms.joinSpectator(code, name)`.
- Set `conn.isSpectator = true` on the connection struct.
- Send `joined { playerId: spectatorId, token: "", ownerId }` (empty token — no rejoin for spectators).
- Broadcast `lobbyState` (updated spectator list).
- If match in progress: send current `matchState` snapshot directly to the spectator (catch-up).

**`close` handler (replaces current immediate-remove logic):**
- Remove from `conns`.
- If spectator: remove from `room.spectators`, broadcast updated `lobbyState`. Done.
- If player:
  - Call `rooms.startGrace(code, playerId, onExpire)`.
  - Broadcast `peerStatus { playerId, name, connected: false }`.
  - `onExpire`: broadcast `error { code: "opponent-timed-out", message: "Opponent timed out — room closed." }`, then `rooms.remove(code)`.

**TTL expiry callback:**
- Close (`terminate()`) any lingering `Conn` entries for that room code.
- Call `rooms.remove(code)`.

**`startMatch` handler** now catches the new `"match already in progress"` throw and
sends `error { code: "already-started" }`.

**`fireIntent` handler** — add an early guard: if `conn.isSpectator` send
`error { code: "not-a-player", message: "spectators cannot fire" }` and return.

**`Conn` interface** gains `isSpectator?: boolean` (false/undefined = player).

---

## 3. Client wiring

### 3a. `ServerClient` auto-reconnect

**New state:**
```ts
private deliberateClose = false
private reconnectFn: (() => void) | null = null
```

**`close()`** sets `deliberateClose = true` before closing the WS. The `onclose`
handler checks this flag and skips the retry loop if true.

**`setReconnectHandler(fn)`** — called by `NetworkGame` after a successful join.
Stores `fn` so the retry loop can re-authenticate after reconnecting the WS.

**Auto-reconnect loop** (fires from `ws.onclose` when `!deliberateClose`):
- Retry every ~1s for up to 28s (leaves a 2s buffer before the server's 30s grace expires).
- Each iteration: `connect()` → if successful, call `reconnectFn()`.
- On success (`joined` received): stop the loop, reset `deliberateClose = false`.
- On loop exhaustion (28s without success): emit a synthetic `error` message to
  registered handlers (`"reconnect-failed"`); set `deliberateClose = true`.

### 3b. `NetworkGame` lifecycle

**Token + session storage:**
- Every `joined` message handler stores `myToken` and writes
  `{ room, playerId: myId, token }` to `sessionStorage` under key `curvecombat-session`.
- `close()`: clears `sessionStorage["curvecombat-session"]`, sets `deliberateClose`
  on the client, removes the `beforeunload` listener, closes the WS.

**`start()` init path:**
1. Register `beforeunload → this.close()`.
2. Check `sessionStorage["curvecombat-session"]`:
   - If present and `session.room === currentRoom`: call `client.connect()` then
     `client.send({ type: "reconnect", room, playerId, token })`.
     The server responds with `joined` (fresh token) + `matchState`; the existing
     handlers pick these up naturally. If the server replies `error "rejoin-failed"`,
     the client falls back to `client.send({ type: "join", room, name })` (lobby)
     — `name` comes from the `NetworkGame.start(room, name)` argument, which the
     caller (the name-entry UI) always supplies.
   - Otherwise: normal `join` flow.
3. After receiving `joined` with a token, call
   `client.setReconnectHandler(() => client.send({ type: "reconnect", room, playerId: myId!, token: myToken! }))`.

**`peerStatus` handler:**
- `connected: false` → `ui.setStatus("Opponent disconnected — waiting up to 30s…")`.
- `connected: true`  → `ui.setStatus("")`.

**No changes to `GameRenderer` or `GameUI`.**

---

## 4. Implementation tasks (Approach A: server-first)

### Task 1 — Server + Protocol

Files: `src/net/protocol.ts`, `server/roomManager.ts`, `server/index.ts`

Deliverables:
- `reconnect` client message; `token` on `joined`; `spectators` on `lobbyState`; `peerStatus` server message.
- `Room` struct extended; all new `RoomManager` methods; re-start guard.
- `index.ts` updated handlers (join with token + TTL; reconnect; spectator join with catch-up; graceful close → grace timer; TTL expiry).
- New unit tests: rejoin token validation; grace expiry teardown; re-start guard; spectator catch-up; TTL cleanup; peerStatus broadcast.

### Task 2 — Client

Files: `src/net/ServerClient.ts`, `src/net/NetworkGame.ts`

Deliverables:
- `ServerClient`: `deliberateClose` flag; `setReconnectHandler`; 28s auto-reconnect loop.
- `NetworkGame`: token storage; sessionStorage write/read/clear; `beforeunload` handler; `peerStatus` → `ui.setStatus`; page-refresh rejoin path with `error` fallback to `join`.
- New unit/integration tests: auto-reconnect fires on unexpected close; deliberate close suppresses retry; sessionStorage cleared on `close()`; `peerStatus` updates status text.

---

## 5. Testing strategy

- **Unit:** `RoomManager` — token generation, `timingSafeEqual` validation, grace start/cancel/expire, TTL start/reset/expire, spectator join, re-start guard.
- **Unit:** `ServerClient` — auto-reconnect fires on unexpected close; stops after deliberate close; stops after 28s.
- **Integration:** Node WS clients — player drops and rejoins within 30s (match resumes); player drops and does not rejoin (room torn down after grace); spectator joins mid-match (receives catch-up snapshot); owner calls `startMatch` twice (second call errors).
- **Browser smoke:** two tabs play; one tab is closed then reopened to `/#room=CODE` within 30s → rejoin succeeds, match resumes. Spectator tab joins mid-match and sees correct state.

---

## 6. Invariants to preserve

- **DOM-free boundary:** `server/`, `src/net/protocol.ts`, `src/sim/*`, `src/game/{matchState,turnQueue,resolveFire}.ts` must never import Pixi/DOM. Verify: `npx tsc -p server/tsconfig.json --noEmit`.
- **Server is sole writer:** `MatchEngine` never called from client code.
- **Token never logged:** do not `console.log` the rejoin token.
- **Spectators never fire:** `fireIntent` from a spectator `Conn` (`isSpectator: true`) must be rejected with `error "not-a-player"`.
