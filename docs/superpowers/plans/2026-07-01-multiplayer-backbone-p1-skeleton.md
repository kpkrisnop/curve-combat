# Multiplayer Backbone — Phase 1 (Walking Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One **1v1 Classic** match, played by two browser tabs over a WebSocket to an authoritative Node server, end-to-end on localhost.

**Architecture:** The Node server owns `MatchState` as the single writer and reuses the pure spine (`resolveFire`/`beginRound`) + the arena generator (`planetScatter`). Clients send `fireIntent{latex}` and render from server snapshots. The server owns all timing via its own timers (never waits on client acks). Per the design spec [2026-07-01-multiplayer-backbone-design.md](../specs/2026-07-01-multiplayer-backbone-design.md).

**Tech Stack:** TypeScript (strict), Node + `ws`, `zod` (message validation), `tsx` (dev run), Vitest, PixiJS (client, unchanged).

## Global Constraints

- **DOM-free shared code:** `src/sim/*`, `src/net/protocol.ts`, and the spine stay DOM/Pixi-free (the server imports them). Only `ServerClient.ts`, `NetworkGame.ts`, `GameRenderer`, `GameUI`, `main.ts` touch the DOM.
- **TypeScript strict** — `npx tsc --noEmit` (client) and `npx tsc -p server/tsconfig.json --noEmit` (server) both clean.
- **Server is the single writer of `MatchState`** and owns timers; it never blocks on a client.
- **Reuse, don't re-derive:** round setup uses `generatePlanets(seed, boundsFromMap(map), computeSpawns(map, teamSize), scatter)` + `arenaDefaults()`. The server mints the per-round `seed`.
- **Scope = skeleton:** 1v1, Classic mode only, turn-based only, local dev only. **Out of scope (later phases):** reconnect, spectators, teams (teamSize>1), No-Turn, HP mode over the wire, the D3 turn timer, and Cloudflare-Tunnel deploy.
- Test: `npx vitest run <path>`. Typecheck client: `npx tsc --noEmit`. Run server (dev): `npm run server`.

---

## File Structure

**New — shared (DOM-free):**
- `src/sim/timing.ts` — `X_VELOCITY_WORLD`, `xLength(samples)`, `shotDuration(shot)`.
- `src/net/protocol.ts` — zod-validated message union + `parseClientMessage`/`parseServerMessage`.

**New — server:**
- `server/tsconfig.json` — strict, references shared `src/` modules.
- `server/matchEngine.ts` — per-room authoritative engine over the spine.
- `server/roomManager.ts` — room lifecycle (create/join/start/roster).
- `server/index.ts` — `ws` server: dispatch messages, broadcast, own the shot/round timers.

**New — client:**
- `src/net/ServerClient.ts` — browser WS client (typed send + event emitter).
- `src/net/NetworkGame.ts` — wires `ServerClient` → `GameRenderer`/`GameUI` for the `/#room=` route.

**Modified:**
- `src/game/GameRenderer.ts` — import `X_VELOCITY_WORLD` from `../sim/timing` (remove its local copy).
- `src/game/matchLogic.ts` — narrow `role` to `"local" | "online"`.
- `src/game/main.ts` — route `/#room=CODE` → `NetworkGame`.
- `package.json` — add `ws`, `zod`, `tsx`, `@types/ws`; add `"server"` script.

---

### Task 1: Shared timing module

**Files:**
- Create: `src/sim/timing.ts`
- Test: `src/sim/timing.test.ts`
- Modify: `src/game/GameRenderer.ts` (import the constant instead of defining it)

**Interfaces:**
- Produces: `X_VELOCITY_WORLD: number`; `xLength(samples: TrajectorySample[]): number`; `shotDuration(shot: ShotResult): number` (seconds).

- [ ] **Step 1: Write the failing test**

```ts
// src/sim/timing.test.ts
import { describe, it, expect } from "vitest";
import { X_VELOCITY_WORLD, xLength, shotDuration } from "./timing";
import type { ShotResult, TrajectorySample } from "./types";

function sample(x: number): TrajectorySample {
  return { p: { x, y: 0 }, x, gap: false };
}

describe("timing", () => {
  it("xLength sums absolute x-distance across samples", () => {
    const s = [sample(-9), sample(-6), sample(0), sample(3)];
    expect(xLength(s)).toBeCloseTo(12); // 3 + 6 + 3
  });

  it("xLength is 0 for fewer than two samples", () => {
    expect(xLength([])).toBe(0);
    expect(xLength([sample(1)])).toBe(0);
  });

  it("shotDuration = xLength / X_VELOCITY_WORLD", () => {
    const shot = { samples: [sample(-9), sample(3)], hit: { kind: "bounds", at: { x: 3, y: 0 }, sampleIndex: 1 }, impactSlope: 0 } as ShotResult;
    expect(shotDuration(shot)).toBeCloseTo(12 / X_VELOCITY_WORLD);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/timing.test.ts`
Expected: FAIL — `Cannot find module './timing'`.

- [ ] **Step 3: Write the implementation**

First find the current constant: `grep -n "X_VELOCITY_WORLD" src/game/GameRenderer.ts` — note its value (the FEATURES doc says **6**). Use that exact value.

```ts
// src/sim/timing.ts
import type { ShotResult, TrajectorySample } from "./types";

/** Shot animation speed: world-x units per second. A field-crossing shot (~24 x-units) ≈ 4s. */
export const X_VELOCITY_WORLD = 6;

/** Total absolute x-distance a shot's sample path covers. */
export function xLength(samples: TrajectorySample[]): number {
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    total += Math.abs(samples[i].x - samples[i - 1].x);
  }
  return total;
}

/** Animation duration in seconds, derived from the shot's path length. */
export function shotDuration(shot: ShotResult): number {
  return xLength(shot.samples) / X_VELOCITY_WORLD;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/timing.test.ts`
Expected: PASS. If `X_VELOCITY_WORLD` differs from the renderer's value, use the renderer's value and update the test's expectation.

- [ ] **Step 5: Wire GameRenderer to the shared constant**

In `src/game/GameRenderer.ts`, delete the local `const X_VELOCITY_WORLD = ...` and add `import { X_VELOCITY_WORLD } from "../sim/timing";`. Run `npx tsc --noEmit` (clean) and `npx vitest run` (all pass — the renderer isn't unit-tested but must still compile).

- [ ] **Step 6: Commit**

```bash
git add src/sim/timing.ts src/sim/timing.test.ts src/game/GameRenderer.ts
git commit -m "feat(net): shared timing module (X_VELOCITY_WORLD, xLength, shotDuration)"
```

---

### Task 2: Wire protocol (typed messages + zod)

**Files:**
- Modify: `package.json` (add `zod`)
- Create: `src/net/protocol.ts`
- Test: `src/net/protocol.test.ts`

**Interfaces:**
- Produces (skeleton subset): `ClientMessage` and `ServerMessage` discriminated unions; `parseClientMessage(raw: unknown): ClientMessage`; `parseServerMessage(raw: unknown): ServerMessage`; `encode(msg): string` (JSON). Types below are exact.

- [ ] **Step 1: Add zod**

Run: `npm install zod`
Expected: `zod` appears in `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

```ts
// src/net/protocol.test.ts
import { describe, it, expect } from "vitest";
import { parseClientMessage, parseServerMessage, encode } from "./protocol";

describe("protocol", () => {
  it("round-trips a fireIntent client message", () => {
    const msg = { type: "fireIntent", latex: "x^2" } as const;
    expect(parseClientMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });

  it("round-trips a shotPlayback server message", () => {
    const shot = { samples: [], hit: { kind: "bounds", at: { x: 0, y: 0 }, sampleIndex: 0 }, impactSlope: 0 };
    const msg = { type: "shotPlayback", firerId: "p1", shot, duration: 2 } as const;
    expect(parseServerMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });

  it("rejects an unknown client message type", () => {
    expect(() => parseClientMessage({ type: "nope" })).toThrow();
  });

  it("rejects a fireIntent missing latex", () => {
    expect(() => parseClientMessage({ type: "fireIntent" })).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/net/protocol.test.ts`
Expected: FAIL — `Cannot find module './protocol'`.

- [ ] **Step 4: Write the implementation**

`ShotResult`/`MatchState` are passed through as opaque payloads (already validated by the pure engine that produced them), typed via the existing interfaces; only the envelope + primitive fields are zod-checked.

```ts
// src/net/protocol.ts
import { z } from "zod";
import type { ShotResult } from "../sim/types";
import type { MatchState } from "../game/matchState";

// ── Client → Server ──────────────────────────────────────────────────────────
const join = z.object({ type: z.literal("join"), room: z.string(), name: z.string() });
const startMatch = z.object({ type: z.literal("startMatch") });
const fireIntent = z.object({ type: z.literal("fireIntent"), latex: z.string() });
const clientSchema = z.discriminatedUnion("type", [join, startMatch, fireIntent]);
export type ClientMessage = z.infer<typeof clientSchema>;

// ── Server → Client ──────────────────────────────────────────────────────────
// Opaque payloads (shot, state) are produced by the trusted engine; not deep-validated.
const joined = z.object({ type: z.literal("joined"), playerId: z.string(), ownerId: z.string() });
const lobbyState = z.object({
  type: z.literal("lobbyState"),
  players: z.array(z.object({ id: z.string(), name: z.string(), team: z.enum(["red", "blue"]) })),
  ownerId: z.string(),
});
const shotPlayback = z.object({
  type: z.literal("shotPlayback"),
  firerId: z.string(),
  shot: z.custom<ShotResult>(),
  duration: z.number(),
});
const matchStateMsg = z.object({ type: z.literal("matchState"), state: z.custom<MatchState>() });
const errorMsg = z.object({ type: z.literal("error"), code: z.string(), message: z.string() });
const serverSchema = z.discriminatedUnion("type", [joined, lobbyState, shotPlayback, matchStateMsg, errorMsg]);
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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/net/protocol.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/net/protocol.ts src/net/protocol.test.ts
git commit -m "feat(net): typed WS protocol with zod validation (skeleton subset)"
```

---

### Task 3: Server `MatchEngine`

**Files:**
- Create: `server/matchEngine.ts`
- Test: `server/matchEngine.test.ts`

**Interfaces:**
- Consumes: `createMatch`, `beginRound`, `type MatchState`, `type PlayerState`, `type Team`, `type RoundLayout` from `../src/game/matchState`; `resolveFire`, `type FireIntent` from `../src/game/resolveFire`; `firstShooterNextRound`, `type MatchConfig` from `../src/game/matchLogic`; `generatePlanets`, `computeSpawns`, `boundsFromMap` from `../src/sim/planetScatter`; `shotDuration` from `../src/sim/timing`.
- Produces:
  - `interface RoomPlayer { id: string; name: string; team: Team }`
  - `class MatchEngine` with:
    - `constructor(config: MatchConfig, players: RoomPlayer[], seedFn?: () => number)`
    - `snapshot(): MatchState` — current committed state
    - `fire(playerId: string, latex: string): { ok: true; firerId: string; shot: ShotResult; duration: number } | { ok: false; code: string }`
    - `resolvePending(): MatchState` — apply the pending resolution (call when the shot's duration elapses); returns the new committed state
    - `beginNextRound(): MatchState` — set up the next round after a `"between"` phase
    - `get busy(): boolean` — true while a shot is mid-flight (input gate)

Round setup mirrors `buildLocalLayout` but the seed is injected (`seedFn`, default random) so tests are deterministic. 1v1 skeleton: exactly one red + one blue `RoomPlayer`.

- [ ] **Step 1: Write the failing test**

```ts
// server/matchEngine.test.ts
import { describe, it, expect } from "vitest";
import { MatchEngine, type RoomPlayer } from "./matchEngine";
import { arenaDefaults } from "../src/game/arenaDefaults";
import type { MatchConfig } from "../src/game/matchLogic";

function config(): MatchConfig {
  return { mode: "classic", rounds: 3, noTurn: false, ...arenaDefaults() };
}
const PLAYERS: RoomPlayer[] = [
  { id: "A", name: "Ann", team: "red" },
  { id: "B", name: "Bo", team: "blue" },
];

describe("MatchEngine", () => {
  it("builds a 1v1 play state: both alive, red active, planets generated", () => {
    const e = new MatchEngine(config(), PLAYERS, () => 12345);
    const s = e.snapshot();
    expect(s.phase).toBe("play");
    expect(s.players.map((p) => p.id).sort()).toEqual(["A", "B"]);
    expect(s.activePlayerId).toBe("A"); // red first
    expect(s.planets.length).toBeGreaterThan(0);
  });

  it("rejects a fire when it isn't the player's turn", () => {
    const e = new MatchEngine(config(), PLAYERS, () => 1);
    const r = e.fire("B", "0");
    expect(r.ok).toBe(false);
  });

  it("accepts a valid fire, returns shot+duration, and gates further fires until resolved", () => {
    const e = new MatchEngine(config(), PLAYERS, () => 1);
    const r = e.fire("A", "0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.duration).toBeGreaterThan(0);
    expect(e.busy).toBe(true);
    // input gate: another fire while mid-flight is rejected
    expect(e.fire("B", "0").ok).toBe(false);
  });

  it("after resolvePending, the outcome is applied and the turn passes (on a miss)", () => {
    const e = new MatchEngine(config(), PLAYERS, () => 1);
    // A flat 0 shot: hit-or-miss depends on layout; either way, if it doesn't end
    // the round the turn passes and busy clears.
    const r = e.fire("A", "x^2"); // parabola off the top → bounds (a miss)
    expect(r.ok).toBe(true);
    const s = e.resolvePending();
    expect(e.busy).toBe(false);
    expect(s.activePlayerId).toBe("B");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/matchEngine.test.ts`
Expected: FAIL — `Cannot find module './matchEngine'`.

- [ ] **Step 3: Write the implementation**

```ts
// server/matchEngine.ts
import { createMatch, beginRound, type MatchState, type PlayerState, type Team, type RoundLayout } from "../src/game/matchState";
import { resolveFire } from "../src/game/resolveFire";
import { firstShooterNextRound, type MatchConfig } from "../src/game/matchLogic";
import { generatePlanets, computeSpawns, boundsFromMap } from "../src/sim/planetScatter";
import { shotDuration } from "../src/sim/timing";
import type { ShotResult } from "../src/sim/types";

export interface RoomPlayer { id: string; name: string; team: Team }

type FireOk = { ok: true; firerId: string; shot: ShotResult; duration: number };
type FireErr = { ok: false; code: string };

export class MatchEngine {
  private state: MatchState;
  private pending: MatchState | null = null;
  private roundLoser: Team | null = null;

  constructor(
    private config: MatchConfig,
    private players: RoomPlayer[],
    private seedFn: () => number = () => (Math.random() * 0xffffffff) >>> 0,
  ) {
    this.state = createMatch(config, this.layout(seedFn(), "red"), boundsFromMap(config.map), "red");
  }

  /** Server-authoritative round layout: mint planets from the seed, seat each RoomPlayer on a spawn column. */
  private layout(seed: number, firstTeam: Team): RoundLayout {
    const bounds = boundsFromMap(this.config.map);
    const spawns = computeSpawns(this.config.map, this.config.teamSize);
    const planets = generatePlanets(seed, bounds, spawns, this.config.scatter);
    const left = spawns.filter((s) => s.x < 0);
    const right = spawns.filter((s) => s.x > 0);
    let li = 0, ri = 0;
    const roster: PlayerState[] = this.players.map((p) => ({
      id: p.id, name: p.name, team: p.team,
      pos: { ...(p.team === "red" ? left[li++] : right[ri++]) },
      hp: 100, alive: true,
    }));
    void firstTeam; // firstTeam handled by createMatch/beginRound turnQueue
    return { players: roster, planets };
  }

  get busy(): boolean { return this.pending !== null; }

  snapshot(): MatchState { return this.state; }

  fire(playerId: string, latex: string): FireOk | FireErr {
    if (this.busy) return { ok: false, code: "mid-animation" };
    const res = resolveFire(this.state, { playerId, latex });
    if (res.rejected) return { ok: false, code: res.rejected };
    this.pending = res.next;
    this.roundLoser = res.roundLoser ?? null;
    return { ok: true, firerId: playerId, shot: res.shot!, duration: shotDuration(res.shot!) };
  }

  /** Apply the mid-flight resolution once its duration elapses. */
  resolvePending(): MatchState {
    if (this.pending) { this.state = this.pending; this.pending = null; }
    return this.state;
  }

  /** Start the next round after a "between" phase (loser shoots first). */
  beginNextRound(): MatchState {
    const first = this.roundLoser ? firstShooterNextRound(this.roundLoser) : "red";
    this.state = beginRound(this.state, this.layout(this.seedFn(), first), first);
    this.roundLoser = null;
    return this.state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/matchEngine.test.ts`
Expected: PASS. (If `x^2` doesn't produce a `bounds` miss under the default 24×14 map, use a latex known to miss from red's spawn, e.g. `10` — a constant far above; keep the assertion on `activePlayerId === "B"`.)

- [ ] **Step 5: Commit**

```bash
git add server/matchEngine.ts server/matchEngine.test.ts
git commit -m "feat(server): authoritative per-room MatchEngine over the pure spine"
```

---

### Task 4: Server `RoomManager`

**Files:**
- Create: `server/roomManager.ts`
- Test: `server/roomManager.test.ts`

**Interfaces:**
- Consumes: `MatchEngine`, `type RoomPlayer` from `./matchEngine`; `arenaDefaults`, `type MatchConfig` from the game modules.
- Produces:
  - `interface Room { code: string; players: RoomPlayer[]; ownerId: string; engine: MatchEngine | null }`
  - `class RoomManager` with `join(code, name): { room: Room; playerId: string }` (creates the room if absent; first joiner is owner + red, second is blue), `start(code, byPlayerId): MatchState` (owner-only; builds the `MatchEngine`), `get(code): Room | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// server/roomManager.test.ts
import { describe, it, expect } from "vitest";
import { RoomManager } from "./roomManager";

describe("RoomManager", () => {
  it("first joiner owns the room and is red; second is blue", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "Ann");
    const b = m.join("WOLF", "Bo");
    const room = m.get("WOLF")!;
    expect(room.ownerId).toBe(a.playerId);
    expect(room.players.find((p) => p.id === a.playerId)!.team).toBe("red");
    expect(room.players.find((p) => p.id === b.playerId)!.team).toBe("blue");
  });

  it("only the owner can start, and start builds an engine in play phase", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "Ann");
    const b = m.join("WOLF", "Bo");
    expect(() => m.start("WOLF", b.playerId)).toThrow();
    const state = m.start("WOLF", a.playerId);
    expect(state.phase).toBe("play");
    expect(m.get("WOLF")!.engine).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/roomManager.test.ts`
Expected: FAIL — `Cannot find module './roomManager'`.

- [ ] **Step 3: Write the implementation**

```ts
// server/roomManager.ts
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
}

let counter = 0;
const nextId = () => `p${++counter}`;

export class RoomManager {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined { return this.rooms.get(code); }

  join(code: string, name: string): { room: Room; playerId: string } {
    let room = this.rooms.get(code);
    const id = nextId();
    if (!room) {
      room = { code, players: [], ownerId: id, config: { mode: "classic", rounds: 3, noTurn: false, ...arenaDefaults() }, engine: null };
      this.rooms.set(code, room);
    }
    const team: Team = room.players.some((p) => p.team === "red") ? "blue" : "red";
    room.players.push({ id, name, team });
    return { room, playerId: id };
  }

  start(code: string, byPlayerId: string): MatchState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.ownerId !== byPlayerId) throw new Error("only the owner can start");
    room.engine = new MatchEngine(room.config, room.players);
    return room.engine.snapshot();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/roomManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/roomManager.ts server/roomManager.test.ts
git commit -m "feat(server): RoomManager — join/create/owner-start lifecycle"
```

---

### Task 5: WS server (`server/index.ts`) + build wiring + integration test

**Files:**
- Create: `server/index.ts`, `server/tsconfig.json`
- Modify: `package.json` (add `ws`, `tsx`, `@types/ws`; add `"server"` script)
- Test: `server/integration.test.ts`

**Interfaces:**
- Consumes: `RoomManager`, `parseClientMessage`, `encode`, protocol types.
- Produces: an exported `createServer(port: number)` returning `{ close(): Promise<void> }` so the test can boot it on an ephemeral port; `server/index.ts` also self-starts on `PORT ?? 3001` when run directly.
- **Timing wiring (the core behavior):** on a valid `fireIntent` → broadcast `shotPlayback{shot,duration}` immediately → `setTimeout(duration*1000)` → `engine.resolvePending()` → broadcast `matchState`. If that state's `phase === "between"`, `setTimeout(2000)` → `engine.beginNextRound()` → broadcast `matchState`.

- [ ] **Step 1: Add deps + server script + tsconfig**

Run: `npm install ws tsx && npm install -D @types/ws`
Then add to `package.json` `scripts`: `"server": "tsx server/index.ts"`.
Create `server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "types": ["node"], "esModuleInterop": true, "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 2: Write the failing integration test**

```ts
// server/integration.test.ts
import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { createServer } from "./index";
import { encode, parseServerMessage, type ServerMessage } from "../src/net/protocol";

function open(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  return new Promise((res) => ws.on("open", () => res(ws)));
}
function next(ws: WebSocket, type: string): Promise<ServerMessage> {
  return new Promise((res) => {
    const on = (buf: Buffer) => {
      const m = parseServerMessage(JSON.parse(buf.toString()));
      if (m.type === type) { ws.off("message", on); res(m); }
    };
    ws.on("message", on);
  });
}

describe("server integration (1v1 skeleton)", () => {
  it("two clients join, owner starts, a fire yields shotPlayback then matchState", async () => {
    const port = 3400 + Math.floor(Math.random() * 200);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    a.send(encode({ type: "join", room: "TEST", name: "Ann" }));
    const aJoined = await next(a, "joined");
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/integration.test.ts`
Expected: FAIL — `Cannot find module './index'` (or `createServer` undefined).

- [ ] **Step 4: Write the implementation**

```ts
// server/index.ts
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager, type Room } from "./roomManager";
import { parseClientMessage, encode, type ServerMessage } from "../src/net/protocol";

interface Conn { ws: WebSocket; playerId?: string; room?: string }

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
  });

  wss.on("connection", (ws) => {
    const conn: Conn = { ws };
    conns.add(conn);
    ws.on("message", (buf) => {
      let msg;
      try { msg = parseClientMessage(JSON.parse(buf.toString())); }
      catch { return send(ws, { type: "error", code: "bad-message", message: "unparseable" }); }

      if (msg.type === "join") {
        const { room, playerId } = rooms.join(msg.room, msg.name);
        conn.playerId = playerId; conn.room = msg.room;
        send(ws, { type: "joined", playerId, ownerId: room.ownerId });
        broadcast(msg.room, rosterMsg(room));
        return;
      }
      const room = conn.room ? rooms.get(conn.room) : undefined;
      if (!room || !conn.playerId) return send(ws, { type: "error", code: "no-room", message: "join first" });

      if (msg.type === "startMatch") {
        try {
          const state = rooms.start(room.code, conn.playerId);
          broadcast(room.code, { type: "matchState", state });
        } catch (e) { send(ws, { type: "error", code: "start-failed", message: String((e as Error).message) }); }
        return;
      }

      if (msg.type === "fireIntent") {
        const engine = room.engine;
        if (!engine) return send(ws, { type: "error", code: "not-started", message: "no match" });
        const r = engine.fire(conn.playerId, msg.latex);
        if (!r.ok) return send(ws, { type: "error", code: r.code, message: r.code });
        broadcast(room.code, { type: "shotPlayback", firerId: r.firerId, shot: r.shot, duration: r.duration });
        setTimeout(() => {
          const state = engine.resolvePending();
          broadcast(room.code, { type: "matchState", state });
          if (state.phase === "between") {
            setTimeout(() => broadcast(room.code, { type: "matchState", state: engine.beginNextRound() }), 2000);
          }
        }, r.duration * 1000);
        return;
      }
    });
    ws.on("close", () => conns.delete(conn));
  });

  return {
    close: () => new Promise<void>((res) => wss.close(() => res())),
  };
}

// Self-start when run directly (npm run server).
if (process.env.VITEST === undefined) {
  const port = Number(process.env.PORT ?? 3001);
  createServer(port);
  console.log(`CurveCombat server on ws://localhost:${port}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/integration.test.ts`
Expected: PASS. Then `npx tsc -p server/tsconfig.json --noEmit` — clean.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/index.ts server/tsconfig.json server/integration.test.ts
git commit -m "feat(server): WS server with authoritative shot/round timing + integration test"
```

---

### Task 6: Browser `ServerClient`

**Files:**
- Create: `src/net/ServerClient.ts`
- Test: `src/net/ServerClient.test.ts`

**Interfaces:**
- Produces: `class ServerClient` with `constructor(url: string)`, `on(type, handler)` (subscribe to a `ServerMessage` type), `send(msg: ClientMessage)`, `connect(): Promise<void>`, `close()`. Uses the browser `WebSocket` global. Message parsing goes through `parseServerMessage`.

- [ ] **Step 1: Write the failing test** (verifies dispatch logic with a fake socket — no real network)

```ts
// src/net/ServerClient.test.ts
import { describe, it, expect, vi } from "vitest";
import { ServerClient } from "./ServerClient";
import { encode } from "./protocol";

it("dispatches parsed server messages to type handlers", () => {
  const c = new ServerClient("ws://x");
  const got = vi.fn();
  c.on("joined", got);
  // simulate an inbound message frame
  (c as any).handleRaw(encode({ type: "joined", playerId: "p1", ownerId: "p1" }));
  expect(got).toHaveBeenCalledWith({ type: "joined", playerId: "p1", ownerId: "p1" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/net/ServerClient.test.ts`
Expected: FAIL — `Cannot find module './ServerClient'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/net/ServerClient.ts
import { parseServerMessage, encode, type ClientMessage, type ServerMessage } from "./protocol";

type Handler = (msg: ServerMessage) => void;

export class ServerClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();

  constructor(private url: string) {}

  on(type: ServerMessage["type"], handler: Handler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (ev) => this.handleRaw(typeof ev.data === "string" ? ev.data : "");
    });
  }

  private handleRaw(raw: string): void {
    let msg: ServerMessage;
    try { msg = parseServerMessage(JSON.parse(raw)); } catch { return; }
    for (const h of this.handlers.get(msg.type) ?? []) h(msg);
  }

  send(msg: ClientMessage): void {
    this.ws?.send(encode(msg));
  }

  close(): void { this.ws?.close(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/net/ServerClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net/ServerClient.ts src/net/ServerClient.test.ts
git commit -m "feat(net): browser ServerClient (typed send + message dispatch)"
```

---

### Task 7: Network game path + route + `role` narrowing (manual browser smoke)

**Files:**
- Modify: `src/game/matchLogic.ts` (`role: "local" | "online"`)
- Create: `src/net/NetworkGame.ts`
- Modify: `src/game/main.ts` (route `/#room=CODE` → `NetworkGame`)

**Interfaces:**
- Consumes: `ServerClient`; `GameRenderer`, `GameUI`; `shotDuration` is server-side only (client derives nothing — it animates the `shot` it receives).
- Produces: `class NetworkGame` with `constructor(client: ServerClient, renderer: GameRenderer, ui: GameUI)` and `start(room, name)`: joins, renders `matchState` snapshots, animates `shotPlayback`, and sends `fireIntent` from the local player's HUD.

This task has no unit test (DOM + live socket); its gate is `tsc` + `npm test` staying green **and** a two-tab manual smoke.

- [ ] **Step 1: Narrow `role`**

In `src/game/matchLogic.ts`, change `role?: "host" | "guest" | "local";` to `role?: "local" | "online";`. Run `npx tsc --noEmit`; fix any now-invalid `role` literals (search `role:` — `configRouter`/`main.ts` default to `"local"`, which stays valid).

- [ ] **Step 2: Implement `NetworkGame`**

```ts
// src/net/NetworkGame.ts
import type { ServerClient } from "./ServerClient";
import type { GameRenderer } from "../game/GameRenderer";
import type { GameUI } from "../game/GameUI";
import type { MatchState, Team } from "../game/matchState";

export class NetworkGame {
  private myTeam: Team | null = null;
  private myId: string | null = null;

  constructor(private client: ServerClient, private renderer: GameRenderer, private ui: GameUI) {}

  async start(room: string, name: string): Promise<void> {
    this.client.on("joined", (m) => { if (m.type === "joined") this.myId = m.playerId; });
    this.client.on("lobbyState", (m) => {
      if (m.type !== "lobbyState") return;
      const me = m.players.find((p) => p.id === this.myId);
      if (me) this.myTeam = me.team;
    });
    this.client.on("shotPlayback", (m) => {
      if (m.type === "shotPlayback") void this.renderer.playShot(m.shot);
    });
    this.client.on("matchState", (m) => {
      if (m.type === "matchState") this.render(m.state);
    });
    this.ui.onFire((_player, latex) => this.client.send({ type: "fireIntent", latex }));
    await this.client.connect();
    this.client.send({ type: "join", room, name });
  }

  private render(state: MatchState): void {
    const red = state.players.find((p) => p.team === "red")!;
    const blue = state.players.find((p) => p.team === "blue")!;
    const viewTeam: Team = this.myTeam ?? "red";
    const viewer = state.players.find((p) => p.team === viewTeam && p.alive) ?? red;
    this.renderer.setWorld(
      { soldier: { pos: viewer.pos, dir: viewTeam === "red" ? 1 : -1 }, bounds: state.bounds,
        targets: state.players.filter((p) => p.team !== viewTeam && p.alive).map((p) => ({ id: p.id, pos: p.pos, radius: 0.1 })),
        planets: state.planets },
      viewTeam, red.pos, blue.pos,
    );
    this.ui.updateScoreboard(state.scores.red, state.scores.blue, state.round, state.config.rounds);
    if (state.phase === "over" && state.winner) this.ui.showWin(state.winner, "Direct hit.");
  }
}
```

> A `startMatch` button hookup can reuse the lobby "Start"; for the skeleton, either the owner clicks an existing Start control that sends `{ type: "startMatch" }`, or add a temporary button. Keep it minimal — the goal is proving the loop, not polished lobby UX (that's the other track).

- [ ] **Step 3: Route `/#room=CODE` in `main.ts`**

Add to the router: if the hash has a `room=` param, construct `GameRenderer` + `GameUI` (as `startGame` does), then `new NetworkGame(new ServerClient(WS_URL), renderer, ui).start(room, name)` where `WS_URL` comes from `import.meta.env.VITE_WS_URL ?? "ws://localhost:3001"` and `name` is a prompt or a default. Do not remove the existing local path.

- [ ] **Step 4: Typecheck + full test suite**

Run: `npx tsc --noEmit` (client) and `npx tsc -p server/tsconfig.json --noEmit` (server) — both clean.
Run: `npm test` — all suites green (client + server).

- [ ] **Step 5: Two-tab manual smoke**

Terminal 1: `npm run server`. Terminal 2: `npm run dev`.
Open two tabs at `http://localhost:5173/#room=TEST`. Confirm: both join (roster updates), owner starts, the field renders with server-generated planets, the active player fires, **both tabs** animate the same shot, the turn passes, and a hit ends the round/match with the banner. No console errors beyond a missing favicon.

- [ ] **Step 6: Commit**

```bash
git add src/game/matchLogic.ts src/net/NetworkGame.ts src/game/main.ts
git commit -m "feat(net): NetworkGame + /#room route; role -> local|online (skeleton playable)"
```

---

## Self-Review Notes

- **Spec coverage (Phase 1):** timing model (Task 3 `fire`/`resolvePending` + Task 5 timers) · server single-writer authority (Tasks 3–5) · protocol subset (Task 2) · module structure & path-alias packaging (Task 5 tsconfig) · client Local/Network split via `NetworkGame` + route (Task 7) · dev harness (Task 7 Step 5) · reuse of `planetScatter`/`arenaDefaults` (Task 3). Deferred items (reconnect, spectators, teams, No-Turn, HP-over-wire, D3 timer, deploy) are explicitly out of scope for this phase.
- **DOM-free check:** `timing.ts`, `protocol.ts`, and all `server/*` import only `../src/{sim,game}` pure modules + `ws`/`zod` — no Pixi/DOM.
- **Type consistency:** `MatchEngine.fire` returns `{ ok, firerId, shot, duration }`, consumed identically by `server/index.ts` and asserted in the integration test; `ServerMessage`/`ClientMessage` unions are the single source used by server, `ServerClient`, and `NetworkGame`.
- **Known follow-ups for Phase 2+:** reconnect tokens, spectators, `RoomManager` TTL/cleanup, teams (teamSize>1 seating already supported by `computeSpawns`), No-Turn (server drops the turn-gate, per-player in-flight flags), HP mode over the wire, the D3 turn timer, and Cloudflare-Tunnel deploy + keepalive.
