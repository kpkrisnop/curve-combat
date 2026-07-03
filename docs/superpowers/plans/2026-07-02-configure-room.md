# configureRoom — Online Match Configuration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the online room owner choose mode, rounds, noTurn, and turnSeconds before starting. Currently `roomManager.ts` hardcodes `{ mode: "classic", rounds: 3, noTurn: false, ...arenaDefaults() }` for every room and there is no protocol message to change it. This makes HP mode, custom rounds, the noTurn modifier, and the custom turn timer all dead in online play.

**Architecture:** One new client message (`configureRoom`) carries the subset of `MatchConfig` that is owner-settable. The server validates owner + pre-start, mutates `room.config`, and broadcasts an updated `lobbyState` (which gains an optional `config` field). `NetworkGame` reads its config from a constructor parameter (populated by `main.ts` from `matchConfig`) and sends `configureRoom` before `startMatch`.

**Tech Stack:** TypeScript, Zod (protocol), Vitest.

---

## Global Constraints

- Only `mode`, `rounds`, `noTurn`, and `turnSeconds` are sent — map/scatter are arenaDefaults and not player-configurable in this plan.
- No schema breakage: `lobbyState.config` is optional — existing clients that don't read it continue to work.
- Run `npm test && npx tsc --noEmit` after every commit.
- Server typecheck: `cd server && npx tsc --noEmit` after every server commit (uses `server/tsconfig.json`).

---

## File Map

| File | Change |
|------|--------|
| `src/net/protocol.ts` | Add `configureRoom` client msg; add `config` to `lobbyState` server msg |
| `server/roomManager.ts` | Add `setConfig(code, byPlayerId, partial)` method |
| `server/index.ts` | Handle `configureRoom`; broadcast updated `lobbyState` |
| `src/net/NetworkGame.ts` | Accept `config` constructor param; send `configureRoom` before `startMatch` |
| `src/game/main.ts` | Pass `matchConfig` to `NetworkGame` constructor |
| `src/net/protocol.test.ts` | Add round-trip tests for `configureRoom` and updated `lobbyState` |

---

## Task 1: Protocol — `configureRoom` + `lobbyState.config`

**Files:** `src/net/protocol.ts`, `src/net/protocol.test.ts`

### What to add to `src/net/protocol.ts`

Add this Zod schema alongside the other client schemas (after `fireIntent`):

```ts
const configureRoom = z.object({
  type: z.literal("configureRoom"),
  mode: z.enum(["classic", "hp"]),
  rounds: z.union([z.literal(3), z.literal(5)]),
  noTurn: z.boolean(),
  turnSeconds: z.number().int().min(15).max(120),
});
```

Add it to `clientSchema`:

```ts
const clientSchema = z.discriminatedUnion("type", [join, startMatch, fireIntent, reconnect, configureRoom]);
```

Add `config` to `lobbyState` (optional so existing code is not broken):

```ts
const lobbyState = z.object({
  type: z.literal("lobbyState"),
  players: z.array(z.object({ id: z.string(), name: z.string(), team: z.enum(["red", "blue"]) })),
  ownerId: z.string(),
  spectators: z.array(z.object({ id: z.string(), name: z.string() })),
  config: z.object({
    mode: z.enum(["classic", "hp"]),
    rounds: z.union([z.literal(3), z.literal(5)]),
    noTurn: z.boolean(),
    turnSeconds: z.number(),
  }).optional(),
});
```

- [ ] **Step 1** — Add `configureRoom` schema and add it to `clientSchema` discriminated union.
- [ ] **Step 2** — Add optional `config` field to `lobbyState` schema.
- [ ] **Step 3** — Run `npm test && npx tsc --noEmit`. Expect: all pass.
- [ ] **Step 4** — Add test cases to `src/net/protocol.test.ts`:

```ts
it("configureRoom round-trips", () => {
  const msg = { type: "configureRoom", mode: "hp", rounds: 5, noTurn: true, turnSeconds: 45 } as const;
  expect(parseClientMessage(msg)).toEqual(msg);
});

it("lobbyState with config round-trips", () => {
  const msg = {
    type: "lobbyState",
    players: [],
    ownerId: "p1",
    spectators: [],
    config: { mode: "hp", rounds: 5, noTurn: false, turnSeconds: 30 },
  } as const;
  expect(parseServerMessage(msg)).toEqual(msg);
});
```

- [ ] **Step 5** — Run `npm test`. Expect: all pass including new tests.
- [ ] **Step 6** — Commit:

```bash
git add src/net/protocol.ts src/net/protocol.test.ts
git commit -m "feat(net): configureRoom client msg + lobbyState.config field in protocol"
```

---

## Task 2: Server — `RoomManager.setConfig` + `configureRoom` handler

**Files:** `server/roomManager.ts`, `server/index.ts`

### `server/roomManager.ts`

Add a `setConfig` method to `RoomManager`. It validates that: the caller is the owner, the room exists, and the match has not yet started.

```ts
setConfig(
  code: string,
  byPlayerId: string,
  partial: { mode: "classic" | "hp"; rounds: 3 | 5; noTurn: boolean; turnSeconds: number },
): void {
  const room = this.rooms.get(code);
  if (!room) throw new Error("no such room");
  if (room.ownerId !== byPlayerId) throw new Error("only the owner can configure");
  if (room.engine !== null) throw new Error("cannot configure after match starts");
  room.config = { ...room.config, ...partial };
}
```

### `server/index.ts`

Add a handler for `configureRoom` after the `reconnect` block (before the "requires room" section):

```ts
// ── configureRoom ──────────────────────────────────────────────────────────
if (msg.type === "configureRoom") {
  const room = conn.room ? rooms.get(conn.room) : undefined;
  if (!room || !conn.playerId) return send(ws, { type: "error", code: "no-room", message: "join first" });
  try {
    rooms.setConfig(room.code, conn.playerId, {
      mode: msg.mode,
      rounds: msg.rounds,
      noTurn: msg.noTurn,
      turnSeconds: msg.turnSeconds,
    });
    broadcast(room.code, {
      ...rosterMsg(room),
      config: { mode: room.config.mode, rounds: room.config.rounds, noTurn: room.config.noTurn, turnSeconds: room.config.turnSeconds ?? 60 },
    });
  } catch (e) {
    send(ws, { type: "error", code: "configure-failed", message: (e as Error).message });
  }
  return;
}
```

Note: `rosterMsg(room)` already returns a `lobbyState`-shaped object. We spread it and add `config` to the same broadcast.

- [ ] **Step 1** — Add `setConfig()` to `RoomManager`.
- [ ] **Step 2** — Add `configureRoom` handler in `server/index.ts` (before the `startMatch` block).
- [ ] **Step 3** — Run `npm test && npx tsc --noEmit && cd server && npx tsc --noEmit`. Expect: all pass.
- [ ] **Step 4** — Commit:

```bash
git add server/roomManager.ts server/index.ts
git commit -m "feat(server): configureRoom handler — setConfig on RoomManager, broadcast updated lobbyState"
```

---

## Task 3: Client — `NetworkGame` sends `configureRoom` + `main.ts` passes config

**Files:** `src/net/NetworkGame.ts`, `src/game/main.ts`

### `src/net/NetworkGame.ts`

Add a fourth constructor parameter with a default:

```ts
import { arenaDefaults } from "../game/arenaDefaults";
import type { MatchConfig } from "../game/matchLogic";

// In class body, add field:
private config: MatchConfig;

// Constructor:
constructor(
  private client: ServerClient,
  private renderer: GameRenderer,
  private ui: GameUI,
  config?: Partial<MatchConfig>,
) {
  this.config = {
    mode: "classic", rounds: 3, noTurn: false, turnSeconds: 60, role: "online",
    ...arenaDefaults(),
    ...config,
  };
}
```

In `maybeShowStartButton`, change the click handler to send `configureRoom` before `startMatch`:

```ts
btn.addEventListener("click", () => {
  this.client.send({
    type: "configureRoom",
    mode: this.config.mode,
    rounds: this.config.rounds,
    noTurn: this.config.noTurn,
    turnSeconds: this.config.turnSeconds ?? 60,
  });
  this.client.send({ type: "startMatch" });
  this.removeStartButton();
});
```

In the `lobbyState` handler, display the room config (mode/rounds) in the status bar so the guest can see what the owner has set:

```ts
this.client.on("lobbyState", (m) => {
  if (m.type !== "lobbyState") return;
  this.ownerId = m.ownerId;
  const me = m.players.find((p) => p.id === this.myId);
  if (me) this.myTeam = me.team;
  if (m.config) {
    const modeLabel = m.config.mode === "hp" ? "HP Mode" : "Classic";
    const noTurnLabel = m.config.noTurn ? " · No-Turn" : "";
    this.ui.setStatus(`${modeLabel} · ${m.config.rounds} rounds · ${m.config.turnSeconds}s${noTurnLabel}`);
  }
  this.maybeShowStartButton();
});
```

### `src/game/main.ts`

In `startNetworkGame`, pass `matchConfig` to `NetworkGame`:

Find:
```ts
const net = new NetworkGame(new ServerClient(WS_URL), renderer!, ui!);
```

Replace with:
```ts
const net = new NetworkGame(new ServerClient(WS_URL), renderer!, ui!, matchConfig);
```

- [ ] **Step 1** — Add `config` constructor param to `NetworkGame` with default.
- [ ] **Step 2** — Update `maybeShowStartButton` click handler to send `configureRoom` first.
- [ ] **Step 3** — Update `lobbyState` handler to display config status.
- [ ] **Step 4** — Update `startNetworkGame` in `main.ts` to pass `matchConfig`.
- [ ] **Step 5** — Run `npm test && npx tsc --noEmit`. Expect: all pass.
- [ ] **Step 6** — Commit:

```bash
git add src/net/NetworkGame.ts src/game/main.ts
git commit -m "feat(net): NetworkGame sends configureRoom before startMatch; lobby shows room config"
```

---

## Task 4: Browser smoke test

- [ ] Start dev server: `npm run dev`
- [ ] Start WS server: `node --loader ts-node/esm server/index.ts` (or `npm run server`)
- [ ] Open Tab A: `http://localhost:5173` → lobby → select HP Mode, 5 rounds → "Start Locally" → note config applied. Then navigate to `#room=TEST1`. The `matchConfig` from the lobby session carries over.
- [ ] Open Tab B: `http://localhost:5173/#room=TEST1` → join.
- [ ] In Tab A (owner), click "Start Match". Verify HP mode + 5 rounds + correct turn timer are active (matchState shows `config.mode === "hp"`, `config.rounds === 5`).
- [ ] Verify classic still works (Tab A: lobby → Classic → local play — no regression).
- [ ] Document result. Commit any fixes.

---

## Self-Review

**Spec coverage:**
- `configureRoom` protocol message exists and validates ✓
- Server handler validates owner + pre-start ✓
- `room.config` is mutated on `configureRoom` ✓
- Updated `lobbyState` (with `config`) is broadcast to all room members ✓
- Guest sees config summary in status bar ✓
- Owner's "Start" sends `configureRoom` then `startMatch` ✓
- `matchConfig` from lobby flows into `NetworkGame` constructor ✓
- No schema breakage: `lobbyState.config` is optional ✓

**Known limitation:** If the user navigates to `#room=WOLF` directly without going through the lobby first, `matchConfig` will be the module-level default (Classic/3 rounds). The lobby → Start Online path would require a future UI addition. This plan covers the protocol and server; the config value at the client comes from whatever the last lobby session set.
