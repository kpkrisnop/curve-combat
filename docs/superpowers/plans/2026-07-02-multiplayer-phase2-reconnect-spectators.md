# Multiplayer Phase 2 — Reconnect, Spectators, Room Lifecycle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Phase 1 multiplayer skeleton with graceful reconnect (auto-retry + sessionStorage), anytime spectator join with catch-up, room idle TTL, and proper socket close on nav-away.

**Architecture:** Server-first (Task 1), then client (Task 2). Task 1 extends the protocol, RoomManager, and index.ts; Task 2 wires auto-reconnect into ServerClient and session lifecycle into NetworkGame. The two tasks share a clean boundary: Task 2 depends only on the protocol types from Task 1, not on server internals.

**Tech Stack:** TypeScript, Vitest, `ws` (server), browser WebSocket API (client), Node.js `crypto` (timingSafeEqual / randomUUID), `sessionStorage` (browser).

## Global Constraints

- DOM-free boundary: `server/`, `src/net/protocol.ts`, `src/sim/*`, `src/game/{matchState,turnQueue,resolveFire}.ts` must never import Pixi/DOM. Verify after every commit: `npx tsc -p server/tsconfig.json --noEmit`.
- Server is the sole writer of `MatchState`. `MatchEngine` is never called from client code.
- Token must never be `console.log`-ged.
- Spectators cannot fire; `fireIntent` from a spectator `Conn` must be rejected.
- Run `npm test` after every commit and confirm the count is ≥ the previous count.

---

## File Map

| File | Change |
|------|--------|
| `src/net/protocol.ts` | Add `reconnect` client msg; add `token` to `joined`; add `spectators` to `lobbyState`; add `peerStatus` server msg |
| `src/net/protocol.test.ts` | Add round-trip tests for all new shapes |
| `server/roomManager.ts` | Extend `Room` struct; add token/grace/TTL/spectator methods; re-start guard |
| `server/roomManager.test.ts` | Add tests for all new methods |
| `server/index.ts` | Updated join (token + TTL); new `reconnect` handler; spectator catch-up; graceful close → grace timer; double-start guard; spectator fire guard |
| `server/integration.test.ts` | Update disconnect test; add reconnect / spectator / double-start / spectator-fire tests |
| `src/net/ServerClient.ts` | Add `deliberateClose` flag; `setReconnectHandler`; 28s auto-reconnect loop |
| `src/net/ServerClient.test.ts` | Update `joined` shape in existing test; add auto-reconnect tests with MockWS |
| `src/net/NetworkGame.ts` | Token + sessionStorage; `beforeunload` + `close()`; `peerStatus` handler; page-refresh rejoin with `rejoin-failed` fallback |

---

## Task 1 — Protocol + Server

**Files:**
- Modify: `src/net/protocol.ts`
- Modify: `src/net/protocol.test.ts`
- Modify: `src/net/ServerClient.test.ts` (update `joined` fixture — token is now required)
- Modify: `server/roomManager.ts`
- Modify: `server/roomManager.test.ts`
- Modify: `server/index.ts`
- Modify: `server/integration.test.ts`

**Interfaces produced (Task 2 depends on these):**
- `ClientMessage` union now includes `reconnect`
- `ServerMessage` union now includes `peerStatus`
- `joined` carries `token: string`
- `lobbyState` carries `spectators: Array<{ id: string; name: string }>`
- `ServerClient.on("peerStatus", handler)` — new event type
- `ServerClient.on("joined", m)` — `m.token` is now present

---

### Step 1 — Write failing protocol tests

- [ ] Open `src/net/protocol.test.ts` and add tests for the four protocol changes. Add these after the existing four tests:

```typescript
it("round-trips a reconnect client message", () => {
  const msg = { type: "reconnect", room: "WOLF", playerId: "p1", token: "tok-abc" } as const;
  expect(parseClientMessage(JSON.parse(encode(msg)))).toEqual(msg);
});

it("round-trips a joined server message with token", () => {
  const msg = { type: "joined", playerId: "p1", ownerId: "p1", token: "tok-abc" } as const;
  expect(parseServerMessage(JSON.parse(encode(msg)))).toEqual(msg);
});

it("round-trips a lobbyState with spectators", () => {
  const msg = {
    type: "lobbyState",
    players: [{ id: "p1", name: "Ann", team: "red" as const }],
    ownerId: "p1",
    spectators: [{ id: "s1", name: "Eve" }],
  } as const;
  expect(parseServerMessage(JSON.parse(encode(msg)))).toEqual(msg);
});

it("round-trips a peerStatus server message", () => {
  const msg = { type: "peerStatus", playerId: "p1", name: "Ann", connected: false } as const;
  expect(parseServerMessage(JSON.parse(encode(msg)))).toEqual(msg);
});
```

- [ ] Run: `npm test -- protocol`
- [ ] Expected: 4 new tests fail with "unknown type" / parse errors. Original 4 pass.

---

### Step 2 — Implement protocol changes

- [ ] Replace `src/net/protocol.ts` with:

```typescript
// src/net/protocol.ts
import { z } from "zod";
import type { ShotResult } from "../sim/types";
import type { MatchState } from "../game/matchState";

// ── Client → Server ──────────────────────────────────────────────────────────
const join = z.object({ type: z.literal("join"), room: z.string(), name: z.string(), asSpectator: z.boolean().optional() });
const reconnect = z.object({ type: z.literal("reconnect"), room: z.string(), playerId: z.string(), token: z.string() });
const startMatch = z.object({ type: z.literal("startMatch") });
const fireIntent = z.object({ type: z.literal("fireIntent"), latex: z.string() });
const clientSchema = z.discriminatedUnion("type", [join, startMatch, fireIntent, reconnect]);
export type ClientMessage = z.infer<typeof clientSchema>;

// ── Server → Client ──────────────────────────────────────────────────────────
const joined = z.object({ type: z.literal("joined"), playerId: z.string(), ownerId: z.string(), token: z.string() });
const lobbyState = z.object({
  type: z.literal("lobbyState"),
  players: z.array(z.object({ id: z.string(), name: z.string(), team: z.enum(["red", "blue"]) })),
  ownerId: z.string(),
  spectators: z.array(z.object({ id: z.string(), name: z.string() })),
});
const shotPlayback = z.object({
  type: z.literal("shotPlayback"),
  firerId: z.string(),
  shot: z.custom<ShotResult>(),
  duration: z.number(),
});
const matchStateMsg = z.object({ type: z.literal("matchState"), state: z.custom<MatchState>() });
const errorMsg = z.object({ type: z.literal("error"), code: z.string(), message: z.string() });
const peerStatus = z.object({ type: z.literal("peerStatus"), playerId: z.string(), name: z.string(), connected: z.boolean() });
const serverSchema = z.discriminatedUnion("type", [joined, lobbyState, shotPlayback, matchStateMsg, errorMsg, peerStatus]);
export type ServerMessage = z.infer<typeof serverSchema>;

export function parseClientMessage(raw: unknown): ClientMessage {
  return clientSchema.parse(raw);
}
export function parseServerMessage(raw: unknown): ServerMessage {
  return serverSchema.parse(raw);
}
export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}
```

- [ ] Run: `npm test -- protocol`
- [ ] Expected: all 8 protocol tests pass.

---

### Step 3 — Fix ServerClient.test.ts for new `joined` shape

The existing test calls `handleRaw` with a `joined` message missing `token`. After the protocol change, `parseServerMessage` will reject it and the handler will never fire, causing the test to fail.

- [ ] In `src/net/ServerClient.test.ts`, update the `joined` fixture to include `token`:

```typescript
(c as any).handleRaw(encode({ type: "joined", playerId: "p1", ownerId: "p1", token: "tok-x" }));
expect(got).toHaveBeenCalledWith({ type: "joined", playerId: "p1", ownerId: "p1", token: "tok-x" });
```

- [ ] Run: `npm test -- ServerClient`
- [ ] Expected: the single existing test passes.

---

### Step 4 — Write failing RoomManager unit tests

- [ ] Open `server/roomManager.test.ts` and add these tests after the existing three:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RoomManager } from "./roomManager";

// ... existing three tests above ...

describe("RoomManager Phase 2", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("join returns a non-empty token", () => {
    const m = new RoomManager();
    const { token } = m.join("WOLF", "Ann");
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
  });

  it("rejoin with valid token succeeds and returns a fresh token", () => {
    const m = new RoomManager();
    const { playerId, token } = m.join("WOLF", "Ann");
    const result = m.rejoin("WOLF", playerId, token);
    expect(result).not.toBeNull();
    expect(result!.token).toBeTruthy();
    expect(result!.token).not.toBe(token); // fresh token issued
  });

  it("rejoin with wrong token returns null", () => {
    const m = new RoomManager();
    const { playerId } = m.join("WOLF", "Ann");
    expect(m.rejoin("WOLF", playerId, "bad-token")).toBeNull();
  });

  it("rejoin after grace expires returns null", () => {
    const m = new RoomManager();
    const { playerId, token } = m.join("WOLF", "Ann");
    const onExpire = vi.fn();
    m.startGrace("WOLF", playerId, onExpire);
    vi.advanceTimersByTime(30_001);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(m.rejoin("WOLF", playerId, token)).toBeNull();
  });

  it("cancelGrace prevents the expiry callback from firing", () => {
    const m = new RoomManager();
    const { playerId } = m.join("WOLF", "Ann");
    const onExpire = vi.fn();
    m.startGrace("WOLF", playerId, onExpire);
    m.cancelGrace("WOLF", playerId);
    vi.advanceTimersByTime(30_001);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("start throws if called twice on the same room", () => {
    const m = new RoomManager();
    const { playerId: a } = m.join("WOLF", "Ann");
    m.join("WOLF", "Bo");
    m.start("WOLF", a);
    expect(() => m.start("WOLF", a)).toThrow(/already in progress/i);
  });

  it("joinSpectator adds to spectators list", () => {
    const m = new RoomManager();
    m.join("WOLF", "Ann");
    const id = m.joinSpectator("WOLF", "Eve");
    expect(id).toBeTruthy();
    expect(m.get("WOLF")!.spectators).toEqual([{ id, name: "Eve" }]);
  });

  it("TTL fires after 10 minutes", () => {
    const m = new RoomManager();
    m.join("WOLF", "Ann");
    const onExpire = vi.fn();
    m.startTTL("WOLF", onExpire);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("startTTL resets a previously running TTL", () => {
    const m = new RoomManager();
    m.join("WOLF", "Ann");
    const first = vi.fn(), second = vi.fn();
    m.startTTL("WOLF", first);
    vi.advanceTimersByTime(5 * 60 * 1000); // halfway
    m.startTTL("WOLF", second); // reset
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("remove clears TTL and grace timers", () => {
    const m = new RoomManager();
    const { playerId } = m.join("WOLF", "Ann");
    const ttlFn = vi.fn(), graceFn = vi.fn();
    m.startTTL("WOLF", ttlFn);
    m.startGrace("WOLF", playerId, graceFn);
    m.remove("WOLF");
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(ttlFn).not.toHaveBeenCalled();
    expect(graceFn).not.toHaveBeenCalled();
  });
});
```

- [ ] Run: `npm test -- roomManager`
- [ ] Expected: existing 3 tests pass; all 9 new Phase 2 tests fail.

---

### Step 5 — Implement RoomManager changes

- [ ] Replace `server/roomManager.ts` with:

```typescript
// server/roomManager.ts
import { timingSafeEqual, randomUUID } from "crypto";
import { MatchEngine, type RoomPlayer } from "./matchEngine";
import { arenaDefaults } from "../src/game/arenaDefaults";
import type { MatchConfig } from "../src/game/matchLogic";
import type { MatchState, Team } from "../src/game/matchState";

export interface Room {
  code: string;
  players: RoomPlayer[];
  ownerId: string;
  config: MatchConfig;
  engine: MatchEngine | null;
  rejoinTokens: Map<string, string>;
  graceTimers: Map<string, ReturnType<typeof setTimeout>>;
  ttlTimer: ReturnType<typeof setTimeout> | null;
  spectators: Array<{ id: string; name: string }>;
}

let counter = 0;
const nextId = () => `p${++counter}`;
const TTL_MS = 10 * 60 * 1000;
const GRACE_MS = 30 * 1000;

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined { return this.rooms.get(code); }

  remove(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      if (room.ttlTimer) clearTimeout(room.ttlTimer);
      for (const h of room.graceTimers.values()) clearTimeout(h);
    }
    this.rooms.delete(code);
  }

  join(code: string, name: string): { room: Room; playerId: string; token: string } {
    const existing = this.rooms.get(code);
    if (existing && existing.players.length >= 2) throw new Error("room full");
    let room = existing;
    const id = nextId();
    if (!room) {
      room = {
        code, players: [], ownerId: id,
        config: { mode: "classic", rounds: 3, noTurn: false, ...arenaDefaults() },
        engine: null,
        rejoinTokens: new Map(), graceTimers: new Map(),
        ttlTimer: null, spectators: [],
      };
      this.rooms.set(code, room);
    }
    const team: Team = room.players.some((p) => p.team === "red") ? "blue" : "red";
    room.players.push({ id, name, team });
    const token = randomUUID();
    room.rejoinTokens.set(id, token);
    return { room, playerId: id, token };
  }

  startTTL(code: string, onExpire: () => void): void {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.ttlTimer) clearTimeout(room.ttlTimer);
    room.ttlTimer = setTimeout(() => {
      room.ttlTimer = null;
      onExpire();
    }, TTL_MS);
  }

  startGrace(code: string, playerId: string, onExpire: () => void): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const handle = setTimeout(() => {
      room.graceTimers.delete(playerId);
      onExpire();
    }, GRACE_MS);
    room.graceTimers.set(playerId, handle);
  }

  cancelGrace(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const h = room.graceTimers.get(playerId);
    if (h !== undefined) { clearTimeout(h); room.graceTimers.delete(playerId); }
  }

  rejoin(code: string, playerId: string, token: string): { room: Room; token: string } | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const stored = room.rejoinTokens.get(playerId);
    if (!stored || !safeEq(stored, token)) return null;
    this.cancelGrace(code, playerId);
    const fresh = randomUUID();
    room.rejoinTokens.set(playerId, fresh);
    return { room, token: fresh };
  }

  joinSpectator(code: string, name: string): string {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    const id = nextId();
    room.spectators.push({ id, name });
    return id;
  }

  start(code: string, byPlayerId: string): MatchState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.ownerId !== byPlayerId) throw new Error("only the owner can start");
    if (room.engine !== null) throw new Error("match already in progress");
    room.engine = new MatchEngine(room.config, room.players);
    return room.engine.snapshot();
  }
}
```

- [ ] Run: `npm test -- roomManager`
- [ ] Expected: all 12 tests pass (3 original + 9 new).
- [ ] Run: `npx tsc -p server/tsconfig.json --noEmit`
- [ ] Expected: no errors.

---

### Step 6 — Implement index.ts changes

- [ ] Replace `server/index.ts` with:

```typescript
// server/index.ts
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager, type Room } from "./roomManager";
import { parseClientMessage, encode, type ServerMessage } from "../src/net/protocol";

interface Conn { ws: WebSocket; playerId?: string; room?: string; isSpectator?: boolean }

export function createServer(port: number): { close: () => Promise<void> } {
  const wss = new WebSocketServer({ port });
  const rooms = new RoomManager();
  const conns = new Set<Conn>();

  const send = (ws: WebSocket, msg: ServerMessage) => ws.send(encode(msg));
  const broadcast = (code: string, msg: ServerMessage) => {
    for (const c of conns) if (c.room === code && c.ws.readyState === WebSocket.OPEN) send(c.ws, msg);
  };
  const rosterMsg = (room: Room): ServerMessage => ({
    type: "lobbyState",
    players: room.players.map((p) => ({ id: p.id, name: p.name, team: p.team })),
    ownerId: room.ownerId,
    spectators: room.spectators.map((s) => ({ id: s.id, name: s.name })),
  });
  const makeTTLExpiry = (code: string) => () => {
    for (const c of conns) if (c.room === code) c.ws.terminate();
    rooms.remove(code);
  };

  wss.on("connection", (ws) => {
    const conn: Conn = { ws };
    conns.add(conn);

    ws.on("message", (buf) => {
      let msg;
      try { msg = parseClientMessage(JSON.parse(buf.toString())); }
      catch { return send(ws, { type: "error", code: "bad-message", message: "unparseable" }); }

      // ── join ─────────────────────────────────────────────────────────────
      if (msg.type === "join") {
        if (msg.asSpectator) {
          const room = rooms.get(msg.room);
          if (!room) return send(ws, { type: "error", code: "join-failed", message: "room not found" });
          try {
            const id = rooms.joinSpectator(msg.room, msg.name);
            conn.playerId = id; conn.room = msg.room; conn.isSpectator = true;
            send(ws, { type: "joined", playerId: id, token: "", ownerId: room.ownerId });
            broadcast(msg.room, rosterMsg(room));
            if (room.engine) send(ws, { type: "matchState", state: room.engine.snapshot() });
          } catch (e) {
            send(ws, { type: "error", code: "join-failed", message: (e as Error).message });
          }
          return;
        }
        try {
          const { room, playerId, token } = rooms.join(msg.room, msg.name);
          conn.playerId = playerId; conn.room = msg.room;
          send(ws, { type: "joined", playerId, token, ownerId: room.ownerId });
          broadcast(msg.room, rosterMsg(room));
          rooms.startTTL(msg.room, makeTTLExpiry(msg.room));
        } catch (e) {
          send(ws, { type: "error", code: "join-failed", message: (e as Error).message });
        }
        return;
      }

      // ── reconnect ─────────────────────────────────────────────────────────
      if (msg.type === "reconnect") {
        const result = rooms.rejoin(msg.room, msg.playerId, msg.token);
        if (!result) return send(ws, { type: "error", code: "rejoin-failed", message: "token invalid or grace expired" });
        conn.playerId = msg.playerId; conn.room = msg.room;
        const { room, token: fresh } = result;
        const player = room.players.find((p) => p.id === msg.playerId);
        send(ws, { type: "joined", playerId: msg.playerId, token: fresh, ownerId: room.ownerId });
        send(ws, rosterMsg(room));
        if (room.engine) send(ws, { type: "matchState", state: room.engine.snapshot() });
        broadcast(msg.room, {
          type: "peerStatus", playerId: msg.playerId,
          name: player?.name ?? "Player", connected: true,
        });
        return;
      }

      const room = conn.room ? rooms.get(conn.room) : undefined;
      if (!room || !conn.playerId) return send(ws, { type: "error", code: "no-room", message: "join first" });

      // ── startMatch ────────────────────────────────────────────────────────
      if (msg.type === "startMatch") {
        if (room.engine !== null)
          return send(ws, { type: "error", code: "already-started", message: "match already in progress" });
        try {
          const state = rooms.start(room.code, conn.playerId);
          rooms.startTTL(room.code, makeTTLExpiry(room.code));
          broadcast(room.code, { type: "matchState", state });
        } catch (e) {
          send(ws, { type: "error", code: "start-failed", message: String((e as Error).message) });
        }
        return;
      }

      // ── fireIntent ────────────────────────────────────────────────────────
      if (msg.type === "fireIntent") {
        if (conn.isSpectator)
          return send(ws, { type: "error", code: "not-a-player", message: "spectators cannot fire" });
        const engine = room.engine;
        if (!engine) return send(ws, { type: "error", code: "not-started", message: "no match" });
        const r = engine.fire(conn.playerId, msg.latex);
        if (!r.ok) return send(ws, { type: "error", code: r.code, message: r.code });
        broadcast(room.code, { type: "shotPlayback", firerId: r.firerId, shot: r.shot, duration: r.duration });
        setTimeout(() => {
          const rm = rooms.get(room.code);
          if (!rm || !rm.engine) return;
          const state = rm.engine.resolvePending();
          broadcast(room.code, { type: "matchState", state });
          if (state.phase === "between") {
            setTimeout(() => {
              const rm2 = rooms.get(room.code);
              if (!rm2 || !rm2.engine) return;
              broadcast(room.code, { type: "matchState", state: rm2.engine.beginNextRound() });
            }, 2000);
          }
        }, r.duration * 1000);
        return;
      }
    });

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

      const player = room.players.find((p) => p.id === conn.playerId);
      const name = player?.name ?? "Player";
      broadcast(conn.room, { type: "peerStatus", playerId: conn.playerId!, name, connected: false });

      const code = conn.room;
      rooms.startGrace(code, conn.playerId!, () => {
        const rm = rooms.get(code);
        if (rm) broadcast(code, { type: "error", code: "opponent-timed-out", message: "Opponent timed out — room closed." });
        rooms.remove(code);
      });
    });
  });

  return {
    close: () => new Promise<void>((res) => {
      for (const c of conns) c.ws.terminate();
      wss.close(() => res());
    }),
  };
}

if (process.env.VITEST === undefined) {
  const port = Number(process.env.PORT ?? 3001);
  createServer(port);
  console.log(`CurveCombat server on ws://localhost:${port}`);
}
```

- [ ] Run: `npx tsc -p server/tsconfig.json --noEmit`
- [ ] Expected: no errors.

---

### Step 7 — Update and extend integration tests

The existing disconnect test checks for `error { code: "opponent-left" }`, which no longer fires immediately — it's now a `peerStatus` + 30s grace. Update it and add four new integration tests.

- [ ] Replace `server/integration.test.ts` with:

```typescript
// server/integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { createServer } from "./index";
import { encode, parseServerMessage, type ServerMessage } from "../src/net/protocol";

function open(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  return new Promise((res) => ws.on("open", () => res(ws)));
}

function next(ws: WebSocket, type: string): Promise<ServerMessage> {
  return new Promise((res, rej) => {
    const cleanup = () => { ws.off("message", on); ws.off("close", onClose); ws.off("error", onErr); };
    const on = (buf: Buffer) => {
      const m = parseServerMessage(JSON.parse(buf.toString()));
      if (m.type === type) { cleanup(); res(m); }
    };
    const onClose = () => { cleanup(); rej(new Error(`ws closed waiting for ${type}`)); };
    const onErr = (e: Error) => { cleanup(); rej(e); };
    ws.on("message", on);
    ws.once("close", onClose);
    ws.once("error", onErr);
  });
}

describe("server integration (Phase 1 regression)", () => {
  it("two clients join, owner starts, a fire yields shotPlayback then matchState", async () => {
    const port = 3400 + Math.floor(Math.random() * 200);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    a.send(encode({ type: "join", room: "TEST", name: "Ann" }));
    const aJoined = await next(a, "joined");
    expect((aJoined as any).token).toBeTruthy();
    b.send(encode({ type: "join", room: "TEST", name: "Bo" }));
    await next(b, "joined");

    a.send(encode({ type: "startMatch" }));
    const started = await next(a, "matchState");
    expect((started as any).state.phase).toBe("play");

    const activeId = (started as any).state.activePlayerId;
    const shooter = activeId === (aJoined as any).playerId ? a : b;
    shooter.send(encode({ type: "fireIntent", latex: "0" }));
    const playback = await next(shooter, "shotPlayback");
    expect((playback as any).duration).toBeGreaterThan(0);
    const after = await next(shooter, "matchState");
    expect(["play", "between", "over"]).toContain((after as any).state.phase);

    a.close(); b.close();
    await server.close();
  });
});

describe("server integration (Phase 2)", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it("disconnect sends peerStatus{connected:false}; grace expire tears down room", async () => {
    const port = 3450 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);
    a.send(encode({ type: "join", room: "DROP", name: "Ann" })); await next(a, "joined");
    b.send(encode({ type: "join", room: "DROP", name: "Bo" }));  await next(b, "joined");
    a.send(encode({ type: "startMatch" })); await next(a, "matchState");

    const statusP = next(b, "peerStatus");
    a.close();
    const status = await statusP;
    expect((status as any).connected).toBe(false);
    expect((status as any).name).toBe("Ann");

    // Advance past 30s grace — b should receive "opponent-timed-out" error
    const errP = next(b, "error");
    vi.advanceTimersByTime(30_001);
    const err = await errP;
    expect((err as any).code).toBe("opponent-timed-out");

    b.close(); await server.close();
  });

  it("player reconnects within grace — peer gets peerStatus{connected:true} + snapshot", async () => {
    const port = 3500 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    a.send(encode({ type: "join", room: "RJN", name: "Ann" }));
    const aJoined = await next(a, "joined");
    const { playerId: aId, token: aToken } = aJoined as any;

    b.send(encode({ type: "join", room: "RJN", name: "Bo" }));
    await next(b, "joined");
    a.send(encode({ type: "startMatch" }));
    await next(a, "matchState");

    // A disconnects
    const statusDownP = next(b, "peerStatus");
    a.close();
    const statusDown = await statusDownP;
    expect((statusDown as any).connected).toBe(false);

    // A reconnects before grace expires
    const a2 = await open(port);
    a2.send(encode({ type: "reconnect", room: "RJN", playerId: aId, token: aToken }));

    const [rejoined, snap, statusUp] = await Promise.all([
      next(a2, "joined"),
      next(a2, "matchState"),
      next(b, "peerStatus"),
    ]);

    expect((rejoined as any).playerId).toBe(aId);
    expect((rejoined as any).token).not.toBe(aToken); // fresh token
    expect((snap as any).state.phase).toBe("play");
    expect((statusUp as any).connected).toBe(true);

    a2.close(); b.close(); await server.close();
  });

  it("spectator joining mid-match receives catch-up matchState", async () => {
    const port = 3550 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);
    a.send(encode({ type: "join", room: "SPEC", name: "Ann" })); await next(a, "joined");
    b.send(encode({ type: "join", room: "SPEC", name: "Bo" }));  await next(b, "joined");
    a.send(encode({ type: "startMatch" })); await next(a, "matchState");

    const s = await open(port);
    s.send(encode({ type: "join", room: "SPEC", name: "Eve", asSpectator: true }));
    const sJoined = await next(s, "joined");
    expect((sJoined as any).token).toBe(""); // spectators get empty token
    const snap = await next(s, "matchState");
    expect((snap as any).state.phase).toBe("play");

    a.close(); b.close(); s.close(); await server.close();
  });

  it("owner calling startMatch twice gets already-started error", async () => {
    const port = 3600 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);
    a.send(encode({ type: "join", room: "DBL", name: "Ann" })); await next(a, "joined");
    b.send(encode({ type: "join", room: "DBL", name: "Bo" }));  await next(b, "joined");
    a.send(encode({ type: "startMatch" })); await next(a, "matchState");
    a.send(encode({ type: "startMatch" }));
    const err = await next(a, "error");
    expect((err as any).code).toBe("already-started");

    a.close(); b.close(); await server.close();
  });

  it("spectator sending fireIntent gets not-a-player error", async () => {
    const port = 3650 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port), s = await open(port);
    a.send(encode({ type: "join", room: "SPF", name: "Ann" })); await next(a, "joined");
    b.send(encode({ type: "join", room: "SPF", name: "Bo" }));  await next(b, "joined");
    a.send(encode({ type: "startMatch" })); await next(a, "matchState");
    s.send(encode({ type: "join", room: "SPF", name: "Eve", asSpectator: true }));
    await next(s, "joined");
    await next(s, "matchState"); // catch-up snapshot
    s.send(encode({ type: "fireIntent", latex: "0" }));
    const err = await next(s, "error");
    expect((err as any).code).toBe("not-a-player");

    a.close(); b.close(); s.close(); await server.close();
  });
});
```

- [ ] Run: `npm test -- integration`
- [ ] Expected: all integration tests pass (1 regression + 5 new).

---

### Step 8 — Full suite + DOM-free check + commit

- [ ] Run: `npm test`
- [ ] Expected: ≥ 133 tests pass (121 original + 12 new). Zero failures.
- [ ] Run: `npx tsc -p server/tsconfig.json --noEmit`
- [ ] Expected: no errors.
- [ ] Commit:

```bash
git add src/net/protocol.ts src/net/protocol.test.ts \
        src/net/ServerClient.test.ts \
        server/roomManager.ts server/roomManager.test.ts \
        server/index.ts server/integration.test.ts
git commit -m "feat(net): Phase 2 server — reconnect token, 30s grace, spectators, room TTL, re-start guard"
```

---

## Task 2 — Client

**Files:**
- Modify: `src/net/ServerClient.ts`
- Modify: `src/net/ServerClient.test.ts`
- Modify: `src/net/NetworkGame.ts`

**Interfaces consumed from Task 1:**
- `ClientMessage` includes `reconnect { room, playerId, token }`
- `ServerMessage` includes `peerStatus { playerId, name, connected }`
- `joined` carries `token: string`

**Interfaces produced:**
- `ServerClient.setReconnectHandler(fn: () => void): void`
- `ServerClient.close(): void` — sets deliberate-close flag; auto-reconnect will NOT fire
- `NetworkGame.close(): void` — deliberate close; clears beforeunload; does not clear sessionStorage

---

### Step 9 — Write failing ServerClient auto-reconnect tests

- [ ] Open `src/net/ServerClient.test.ts`. Add the MockWS class and three new tests after the existing one:

```typescript
import { it, expect, vi, describe, beforeEach } from "vitest";
import { ServerClient } from "./ServerClient";
import { encode } from "./protocol";

// ── existing test ─────────────────────────────────────────────────────────────
it("dispatches parsed server messages to type handlers", () => {
  const c = new ServerClient("ws://x");
  const got = vi.fn();
  c.on("joined", got);
  (c as any).handleRaw(encode({ type: "joined", playerId: "p1", ownerId: "p1", token: "tok-x" }));
  expect(got).toHaveBeenCalledWith({ type: "joined", playerId: "p1", ownerId: "p1", token: "tok-x" });
});

// ── MockWS for auto-reconnect tests ─────────────────────────────────────────
class MockWS {
  static instances: MockWS[] = [];
  onopen: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sent: string[] = [];
  readyState = 1; // OPEN
  constructor(public url: string) { MockWS.instances.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  triggerOpen() { this.readyState = 1; this.onopen?.(); }
  triggerError(e: Event = new Event("error")) { this.onerror?.(e); }
}

describe("ServerClient auto-reconnect", () => {
  beforeEach(() => {
    MockWS.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWS);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("auto-reconnect fires on unexpected close and calls reconnectFn after WS opens", async () => {
    const c = new ServerClient("ws://test");
    const reconnectFn = vi.fn();
    c.setReconnectHandler(reconnectFn);

    // Connect
    const connectP = c.connect();
    MockWS.instances[0].triggerOpen();
    await connectP;

    // Simulate unexpected close (not deliberate)
    MockWS.instances[0].close();

    // Advance 1s to trigger first retry
    await vi.advanceTimersByTimeAsync(1100);

    // Second WS instance should exist; trigger its open
    expect(MockWS.instances.length).toBeGreaterThan(1);
    MockWS.instances[MockWS.instances.length - 1].triggerOpen();
    await Promise.resolve();

    expect(reconnectFn).toHaveBeenCalledOnce();
  });

  it("deliberate close does NOT trigger auto-reconnect", async () => {
    const c = new ServerClient("ws://test");
    const reconnectFn = vi.fn();
    c.setReconnectHandler(reconnectFn);

    const connectP = c.connect();
    MockWS.instances[0].triggerOpen();
    await connectP;

    c.close(); // deliberate

    await vi.advanceTimersByTimeAsync(5000);
    expect(MockWS.instances.length).toBe(1); // no new connection
    expect(reconnectFn).not.toHaveBeenCalled();
  });

  it("emits error event after 28s without successful reconnect", async () => {
    const c = new ServerClient("ws://test");
    c.setReconnectHandler(vi.fn());
    const errHandler = vi.fn();
    c.on("error", errHandler);

    const connectP = c.connect();
    MockWS.instances[0].triggerOpen();
    await connectP;

    MockWS.instances[0].close(); // unexpected drop

    // All retries fail (no triggerOpen called)
    await vi.advanceTimersByTimeAsync(28_001);

    // Flush any remaining microtasks
    await Promise.resolve();

    expect(errHandler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", code: "reconnect-failed" })
    );
  });
});
```

- [ ] Run: `npm test -- ServerClient`
- [ ] Expected: original test passes; 3 new tests fail.

---

### Step 10 — Implement ServerClient auto-reconnect

- [ ] Replace `src/net/ServerClient.ts` with:

```typescript
// src/net/ServerClient.ts
import { parseServerMessage, encode, type ClientMessage, type ServerMessage } from "./protocol";

type Handler = (msg: ServerMessage) => void;

export class ServerClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();
  private deliberateClose = false;
  private reconnecting = false;
  private reconnectFn: (() => void) | null = null;

  constructor(private url: string) {}

  on(type: ServerMessage["type"], handler: Handler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  setReconnectHandler(fn: () => void): void {
    this.reconnectFn = fn;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) { this.ws.onclose = null; this.ws.close(); }
      this.ws = new WebSocket(this.url);
      let settled = false;
      this.ws.onopen = () => {
        settled = true;
        this.ws!.onclose = () => this.handleClose();
        resolve();
      };
      this.ws.onerror = (e) => { if (!settled) { settled = true; reject(e); } };
      this.ws.onmessage = (ev) => this.handleRaw(typeof ev.data === "string" ? ev.data : "");
      this.ws.onclose = () => { if (!settled) { settled = true; reject(new Error("closed")); } };
    });
  }

  private handleClose(): void {
    if (this.deliberateClose || !this.reconnectFn || this.reconnecting) return;
    void this.autoReconnect();
  }

  private async autoReconnect(): Promise<void> {
    this.reconnecting = true;
    const deadline = Date.now() + 28_000;
    while (Date.now() < deadline && !this.deliberateClose) {
      await new Promise<void>((r) => setTimeout(r, 1000));
      if (this.deliberateClose) break;
      try {
        await this.connect();
        this.reconnecting = false;
        this.reconnectFn?.();
        return;
      } catch {
        // retry
      }
    }
    this.reconnecting = false;
    if (!this.deliberateClose) {
      this.dispatch({ type: "error", code: "reconnect-failed", message: "Could not reconnect to server." });
    }
  }

  private dispatch(msg: ServerMessage): void {
    for (const h of this.handlers.get(msg.type) ?? []) h(msg);
  }

  handleRaw(raw: string): void {
    let msg: ServerMessage;
    try { msg = parseServerMessage(JSON.parse(raw)); } catch { return; }
    this.dispatch(msg);
  }

  send(msg: ClientMessage): void {
    this.ws?.send(encode(msg));
  }

  close(): void {
    this.deliberateClose = true;
    this.ws?.close();
  }
}
```

> **Note:** `handleRaw` is now `public` (was `private`) so the existing test can still call `(c as any).handleRaw(...)`. The `(c as any)` cast still works.

- [ ] Run: `npm test -- ServerClient`
- [ ] Expected: all 4 tests pass.

---

### Step 11 — Implement NetworkGame changes

- [ ] Replace `src/net/NetworkGame.ts` with:

```typescript
// src/net/NetworkGame.ts
import type { ServerClient } from "./ServerClient";
import type { GameRenderer } from "../game/GameRenderer";
import type { GameUI } from "../game/GameUI";
import type { MatchState, Team } from "../game/matchState";

const SESSION_KEY = "curvecombat-session";

export class NetworkGame {
  private myTeam: Team | null = null;
  private myId: string | null = null;
  private myToken: string | null = null;
  private ownerId: string | null = null;
  private startBtn: HTMLButtonElement | null = null;
  private room = "";
  private name = "";
  private readonly boundClose = () => this.close();

  constructor(private client: ServerClient, private renderer: GameRenderer, private ui: GameUI) {}

  async start(room: string, name: string): Promise<void> {
    this.room = room;
    this.name = name;

    window.addEventListener("beforeunload", this.boundClose);

    this.client.on("joined", (m) => {
      if (m.type !== "joined") return;
      this.myId = m.playerId;
      this.myToken = m.token;
      this.ownerId = m.ownerId;
      if (m.token) this.storeSession();
      this.maybeShowStartButton();
      this.client.setReconnectHandler(() =>
        this.client.send({ type: "reconnect", room: this.room, playerId: this.myId!, token: this.myToken! })
      );
    });
    this.client.on("lobbyState", (m) => {
      if (m.type !== "lobbyState") return;
      this.ownerId = m.ownerId;
      const me = m.players.find((p) => p.id === this.myId);
      if (me) this.myTeam = me.team;
      this.maybeShowStartButton();
    });
    this.client.on("shotPlayback", (m) => {
      if (m.type === "shotPlayback") void this.renderer.playShot(m.shot);
    });
    this.client.on("matchState", (m) => {
      if (m.type !== "matchState") return;
      this.removeStartButton();
      this.render(m.state);
    });
    this.client.on("peerStatus", (m) => {
      if (m.type !== "peerStatus") return;
      this.ui.setStatus(m.connected ? "" : "Opponent disconnected — waiting up to 30s…");
    });
    this.client.on("error", (m) => {
      if (m.type !== "error") return;
      if (m.code === "rejoin-failed") {
        this.clearSession();
        this.client.send({ type: "join", room: this.room, name: this.name });
        return;
      }
      this.ui.setStatus(m.message);
    });

    this.ui.onFire((_player, latex) => this.client.send({ type: "fireIntent", latex }));

    await this.client.connect();

    const saved = this.loadSession();
    if (saved) {
      this.client.send({ type: "reconnect", room: this.room, playerId: saved.playerId, token: saved.token });
    } else {
      this.client.send({ type: "join", room: this.room, name: this.name });
    }
  }

  close(): void {
    window.removeEventListener("beforeunload", this.boundClose);
    this.client.close();
  }

  private storeSession(): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ room: this.room, playerId: this.myId, token: this.myToken }));
  }

  private clearSession(): void {
    sessionStorage.removeItem(SESSION_KEY);
  }

  private loadSession(): { playerId: string; token: string } | null {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      return s.room === this.room && s.playerId && s.token ? { playerId: s.playerId, token: s.token } : null;
    } catch { return null; }
  }

  private maybeShowStartButton(): void {
    if (this.startBtn) return;
    if (!this.myId || !this.ownerId || this.myId !== this.ownerId) return;
    const btn = document.createElement("button");
    btn.textContent = "Start Match";
    btn.style.cssText =
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
      "padding:16px 32px;font-size:1.4rem;font-weight:bold;cursor:pointer;" +
      "background:#e74c3c;color:#fff;border:none;border-radius:8px;z-index:9999;";
    btn.addEventListener("click", () => {
      this.client.send({ type: "startMatch" });
      this.removeStartButton();
    });
    document.body.appendChild(btn);
    this.startBtn = btn;
  }

  private removeStartButton(): void {
    if (this.startBtn) { this.startBtn.remove(); this.startBtn = null; }
  }

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
}
```

---

### Step 12 — Full suite + typecheck + commit

- [ ] Run: `npm test`
- [ ] Expected: ≥ 136 tests pass (133 after Task 1 + 3 new ServerClient tests). Zero failures.
- [ ] Run: `npx tsc -p server/tsconfig.json --noEmit`
- [ ] Expected: no errors.
- [ ] Run: `npx tsc --noEmit` (client + shared)
- [ ] Expected: no errors.

- [ ] Commit:

```bash
git add src/net/ServerClient.ts src/net/ServerClient.test.ts src/net/NetworkGame.ts
git commit -m "feat(net): Phase 2 client — auto-reconnect loop, sessionStorage rejoin, beforeunload close, peerStatus UX"
```

---

### Step 13 — Browser smoke

Two-terminal setup:

```bash
# Terminal 1
npm run server

# Terminal 2
npm run dev
```

- [ ] Open Tab A and Tab B both at `http://localhost:5173/#room=SMOKE`, enter names, owner clicks Start Match.
- [ ] With a match in progress, close Tab A (Cmd+W). Tab B should show "Opponent disconnected — waiting up to 30s…".
- [ ] Reopen `http://localhost:5173/#room=SMOKE` in a new tab (Tab A′). It should reconnect automatically (no name entry needed if sessionStorage is present from a prior session; otherwise enter name and if token is stale it falls back to a fresh join). Tab B should show the status clear.
- [ ] Open a third tab at the same URL with no prior session as spectator: type a different name, DO NOT click Start. Verify this tab receives the match state and can observe but cannot fire. (Spectator join needs the `asSpectator` flag — for manual testing, either modify the URL handler or test via the integration test above.)
- [ ] Verify `npm test` still passes after smoke.

---

## Self-Review

### Spec coverage check

| Spec requirement | Covered |
|-----------------|---------|
| `rejoinToken` + 30s grace | Steps 5–8 (`RoomManager.rejoin` + `startGrace`) |
| Auto-reconnect loop (28s, 1s intervals) | Steps 9–10 (`ServerClient.autoReconnect`) |
| sessionStorage for page-refresh rejoin | Step 11 (`NetworkGame.storeSession/loadSession`) |
| `rejoin-failed` → fallback to `join` | Step 11 (error handler in `NetworkGame`) |
| Spectators: anytime join + catch-up snapshot | Steps 6–7 (`index.ts` join with `asSpectator`) |
| Spectators in `lobbyState` | Steps 2 + 5 (`protocol.ts` + `rosterMsg`) |
| Spectator fire rejected | Step 6 (`fireIntent` guard in `index.ts`) |
| Room TTL 10 min | Steps 5–6 (`RoomManager.startTTL` + `makeTTLExpiry`) |
| Re-start guard | Steps 5–6 (`room.engine !== null` check) |
| `NetworkGame.close()` on nav-away | Step 11 (`beforeunload` → `this.close()`) |
| Deliberate close suppresses auto-reconnect | Steps 9–10 (`deliberateClose` flag) |
| `peerStatus` broadcast on disconnect/reconnect | Steps 6–7 (index.ts close handler + reconnect handler) |
| `peerStatus` UX in `NetworkGame` | Step 11 (`ui.setStatus`) |
| DOM-free boundary preserved | All commits include `tsc -p server/tsconfig.json` check |
| Token not logged | `randomUUID()` never passed to `console.log` in plan code |

All spec requirements accounted for. ✓
