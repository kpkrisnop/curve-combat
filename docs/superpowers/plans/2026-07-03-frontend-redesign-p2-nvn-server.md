# Frontend Redesign — Phase 2: NvN Server & Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server and protocol implement ADR-0002 (open NvN, exactly two teams, online-only) and the server half of ADR-0003 (round-1 seed broadcast early, live config, server-mediated reroll, synchronized `matchStarting` countdown) — with the existing client (`OnlineParity`) still functioning at 1v1 parity until Phase 3 replaces it.

**Architecture:** The match engine (`src/game/matchState.ts`, `server/matchEngine.ts`) is already team-generic — `turnQueue`, `livingEnemies`, roster-mapped spawns, injectable `seedFn`. Phase 2 therefore touches: `src/net/protocol.ts` (new messages/fields), `server/roomManager.ts` (NvN seating, round-1 seed lifecycle, lock), `server/index.ts` (handlers + delayed start), plus NvN verification tests against the engine and a thin client-side event surface on `NetworkGame` for Phase 3 to consume. No React/UI work in this phase.

**Tech Stack:** TypeScript (strict), zod 4 (protocol), ws 8, Vitest 3, tsx (server runner). Tests: `npm test`; server typecheck: `npx tsc -p server/tsconfig.json --noEmit` (verify this project file exists — earlier plans used it; if absent, plain `npx tsc --noEmit` covers server since `server/` compiles with the root config via tests).

## Global Constraints

- **ADR-0002:** exactly two teams RED/BLUE; open NvN sizes (practical cap: 5 per team — `MatchConfig.teamSize` is typed `1|2|3|4|5`); NvN is online-only; auto-place joiner onto the smaller team; self-service team switch; Start requires both teams ≥ 1 player.
- **ADR-0003 (server half):** server mints the round-1 seed at room creation; regenerates it on any arena-param change and on host reroll; broadcasts it in `lobbyState`; `configureRoom` is legal until the countdown begins (supersedes "locked once guest joins"); Start → `matchStarting { startAt: now + 3000 }` broadcast → engine starts at `startAt`; countdown is not cancelable; config/seating/reroll are rejected once locked; joiners during countdown or play become Spectators.
- Terminology: **Host** in all new user-facing strings and doc comments; `ownerId` stays as the internal field name.
- Rounds 2+ keep D4 behavior: fresh random server seed per round (`MatchEngine.beginNextRound` via `seedFn` — unchanged).
- Existing reconnect/grace/TTL/spectator behavior (30s grace, 10min TTL) must keep passing their existing tests.
- Backward compatibility within this phase: `lobbyState`'s new fields are additive (`optional()` in zod) so the Phase 1 client keeps parsing; `configureRoom` keeps `map`/`scatter` optional so the old client's payload stays valid.
- Gate at every commit: `npm test && npx tsc --noEmit`.

**Files touched (overview):** `src/net/protocol.ts` + test · `server/roomManager.ts` + test · `server/index.ts` + `server/integration.test.ts` · `server/matchEngine.ts` (verify/extend layout for uneven teams) + engine NvN tests · `src/net/NetworkGame.ts` + test (event surface only).

---

### Task 1: Protocol v2 — NvN + arena + countdown messages

**Files:**
- Modify: `src/net/protocol.ts`
- Test: `src/net/protocol.test.ts`

**Interfaces:**
- Consumes: existing zod schema structure (discriminated unions on `type`).
- Produces (client→server): `switchTeam { team: "red"|"blue" }`, `rerollArena {}` (type-only), `configureRoom` gains optional `map { width, height }` and `scatter { rMin, rMax, gapMin, gapMax, spawnClearance, fieldMargin, maxPlanets }`.
- Produces (server→client): `matchStarting { startAt: number }`; `lobbyState` gains optional `round1Seed: number` and its `config` object gains optional `map`/`scatter` (same shapes).

- [ ] **Step 1: Write the failing tests** — append to `src/net/protocol.test.ts`:

```ts
describe("protocol v2 (NvN + arena + countdown)", () => {
  it("parses switchTeam and rerollArena client messages", () => {
    expect(parseClientMessage({ type: "switchTeam", team: "blue" }).type).toBe("switchTeam");
    expect(parseClientMessage({ type: "rerollArena" }).type).toBe("rerollArena");
    expect(() => parseClientMessage({ type: "switchTeam", team: "green" })).toThrow();
  });

  it("configureRoom accepts optional map + scatter and still accepts the old shape", () => {
    const old = { type: "configureRoom", mode: "classic", rounds: 3, noTurn: false, turnSeconds: 60 };
    expect(parseClientMessage(old).type).toBe("configureRoom");
    const withArena = {
      ...old,
      map: { width: 24, height: 14 },
      scatter: { rMin: 0.8, rMax: 2, gapMin: 0.5, gapMax: 2, spawnClearance: 2, fieldMargin: 0.5, maxPlanets: 12 },
    };
    const parsed = parseClientMessage(withArena);
    if (parsed.type === "configureRoom") expect(parsed.map?.width).toBe(24);
  });

  it("parses matchStarting and lobbyState with round1Seed", () => {
    expect(parseServerMessage({ type: "matchStarting", startAt: 123 }).type).toBe("matchStarting");
    const lobby = parseServerMessage({
      type: "lobbyState", players: [], ownerId: "p1", spectators: [], round1Seed: 42,
    });
    if (lobby.type === "lobbyState") expect(lobby.round1Seed).toBe(42);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/net/protocol.test.ts` — FAIL (unknown discriminator values).

- [ ] **Step 3: Implement.** In `src/net/protocol.ts`:

```ts
const mapShape = z.object({ width: z.number().min(8).max(60), height: z.number().min(6).max(40) });
const scatterShape = z.object({
  rMin: z.number().min(0.3).max(4), rMax: z.number().min(0.3).max(4),
  gapMin: z.number().min(0).max(6), gapMax: z.number().min(0).max(6),
  spawnClearance: z.number().min(0).max(5), fieldMargin: z.number().min(0).max(3),
  maxPlanets: z.number().int().min(1).max(24),
});
const switchTeam = z.object({ type: z.literal("switchTeam"), team: z.enum(["red", "blue"]) });
const rerollArena = z.object({ type: z.literal("rerollArena") });
```

Extend `configureRoom` with `map: mapShape.optional(), scatter: scatterShape.optional()`. Add `switchTeam, rerollArena` to `clientSchema`. Add:

```ts
const matchStarting = z.object({ type: z.literal("matchStarting"), startAt: z.number() });
```

Extend `lobbyState` with `round1Seed: z.number().optional()` and extend its `config` object with `map: mapShape.optional(), scatter: scatterShape.optional()`. Add `matchStarting` to `serverSchema`.

- [ ] **Step 4: Run tests + typecheck.** `npx vitest run src/net/protocol.test.ts && npx tsc --noEmit` — PASS (NetworkGame's exhaustive handlers may need a no-op `matchStarting` case if it switches on message type — if tsc flags it, add `if (m.type === "matchStarting") return;` placeholder; Task 5 replaces it).

- [ ] **Step 5: Commit.** `git add src/net/protocol.ts src/net/protocol.test.ts src/net/NetworkGame.ts && git commit -m "feat(net): protocol v2 — switchTeam, rerollArena, arena params in configureRoom, matchStarting, round1Seed"`

---

### Task 2: RoomManager — NvN seating, round-1 seed lifecycle, lock

**Files:**
- Modify: `server/roomManager.ts`
- Test: `server/roomManager.test.ts`

**Interfaces:**
- Consumes: existing `Room`, `join`, `joinSpectator`, `rejoin`, `setConfig`, `start` (read the current implementations first — this task rewrites seating and extends the rest).
- Produces (new/changed on `RoomManager`):

```ts
join(code, name): { room; playerId; token }        // auto-places onto the smaller team (red on tie);
                                                    // if room is locked OR both teams full (5v5) → throws "room locked"/"room full"
switchTeam(code, playerId, team: Team): void        // throws if locked, unknown player, or team already has 5
setConfig(code, byPlayerId, partial): void          // partial gains optional map/scatter; regenerates round1Seed
                                                    // when map or scatter changed; throws if locked or engine !== null
reroll(code, byPlayerId): number                    // host-only; new round1Seed; returns it; throws if locked
lock(code): void                                    // sets room.locked = true (called at countdown start)
canStart(code): boolean                             // both teams ≥ 1 player
start(code, byPlayerId): MatchState                 // as today, plus: passes a seedFn yielding room.round1Seed
                                                    // on the FIRST call, then random (rounds 2+ stay D4-random)
// Room gains: locked: boolean; round1Seed: number  (minted at creation)
```

- [ ] **Step 1: Read the current file** (`server/roomManager.ts`) end to end. The existing 1v1 test "rejects a third joiner (room full)" and "first joiner owns the room and is red; second is blue" will be REPLACED by NvN equivalents — that is intentional and sanctioned; keep every other existing test green.

- [ ] **Step 2: Write the failing tests** — replace the two obsolete tests and append:

```ts
describe("RoomManager NvN (ADR-0002)", () => {
  it("auto-places joiners onto the smaller team, red on tie", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A"); // red (tie)
    const b = m.join("WOLF", "B"); // blue (smaller)
    const c = m.join("WOLF", "C"); // red or blue — tie again → red
    const room = m.get("WOLF")!;
    const team = (id: string) => room.players.find((p) => p.id === id)!.team;
    expect(team(a.playerId)).toBe("red");
    expect(team(b.playerId)).toBe("blue");
    expect(team(c.playerId)).toBe("red");
    expect(room.players).toHaveLength(3);
  });

  it("switchTeam moves a player; capped at 5 per team; blocked when locked", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A");
    m.join("WOLF", "B");
    m.switchTeam("WOLF", a.playerId, "blue");
    expect(m.get("WOLF")!.players.find((p) => p.id === a.playerId)!.team).toBe("blue");
    m.lock("WOLF");
    expect(() => m.switchTeam("WOLF", a.playerId, "red")).toThrow(/locked/i);
  });

  it("mints round1Seed at creation; setConfig with arena params regenerates it; without them it doesn't", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A");
    const room = m.get("WOLF")!;
    const s0 = room.round1Seed;
    expect(typeof s0).toBe("number");
    m.setConfig("WOLF", a.playerId, { mode: "hp", rounds: 5, noTurn: false, turnSeconds: 60 });
    expect(room.round1Seed).toBe(s0);                       // mode change: same terrain
    m.setConfig("WOLF", a.playerId, {
      mode: "hp", rounds: 5, noTurn: false, turnSeconds: 60,
      scatter: { ...room.config.scatter, maxPlanets: 5 },
    });
    expect(room.round1Seed).not.toBe(s0);                   // terrain params changed: new seed
  });

  it("reroll is host-only and returns a fresh seed; blocked when locked", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A");
    const b = m.join("WOLF", "B");
    const s0 = m.get("WOLF")!.round1Seed;
    expect(() => m.reroll("WOLF", b.playerId)).toThrow(/host/i);
    const s1 = m.reroll("WOLF", a.playerId);
    expect(s1).not.toBe(s0);
    m.lock("WOLF");
    expect(() => m.reroll("WOLF", a.playerId)).toThrow(/locked/i);
  });

  it("canStart requires both teams non-empty; join throws when locked", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A");
    expect(m.canStart("WOLF")).toBe(false);                 // 1v0
    m.join("WOLF", "B");
    expect(m.canStart("WOLF")).toBe(true);
    m.lock("WOLF");
    expect(() => m.join("WOLF", "C")).toThrow(/locked/i);
    void a;
  });

  it("start uses round1Seed for round 1 — same seed, same planets across two identical rooms", () => {
    const m = new RoomManager();
    m.join("WOLF", "A"); const w2 = m.join("WOLF", "B");
    m.join("BEAR", "C"); const b2 = m.join("BEAR", "D");
    // Force both rooms to the same seed, then start with each room's host.
    m.get("WOLF")!.round1Seed = 777;
    m.get("BEAR")!.round1Seed = 777;
    const s1 = m.start("WOLF", m.get("WOLF")!.ownerId);
    const s2 = m.start("BEAR", m.get("BEAR")!.ownerId);
    expect(s1.planets).toEqual(s2.planets);
    void w2; void b2;
  });
});
```

- [ ] **Step 3: Run to verify failure**, then implement in `server/roomManager.ts`:
  - `Room` gains `locked: boolean` (false) and `round1Seed: number` (`(Math.random() * 0xffffffff) >>> 0` at creation).
  - `join`: replace the `players.length >= 2 → throw "room full"` guard with: throw `"room locked"` if `room.locked || room.engine !== null`; throw `"room full"` only when the smaller team already has 5. Team pick: `const red = count("red"), blue = count("blue"); const team = red <= blue ? "red" : "blue";`
  - `switchTeam(code, playerId, team)`: validate room, not locked, player exists, target team `< 5`; mutate `player.team`.
  - `setConfig`: accept optional `map`/`scatter` in the partial; keep the owner + pre-start guards and add a `locked` guard; after merging, if the call included `map` or `scatter`, remint `round1Seed`.
  - `reroll(code, byPlayerId)`: room exists, `byPlayerId === ownerId` (error message mentions "host"), not locked/started; remint and return `round1Seed`.
  - `lock(code)` / `canStart(code)` as specified.
  - `start`: construct the engine with a first-call seed — `let first = room.round1Seed; const seedFn = () => { if (first !== null) { const s = first; first = null as never; return s; } return (Math.random() * 0xffffffff) >>> 0; }` — passed as `MatchEngine`'s existing third constructor arg. **Verify first** that `MatchEngine`'s constructor uses `seedFn()` for the initial round-1 layout (it does for `beginNextRound`; confirm the constructor path — if the constructor takes a pre-built layout instead, thread the seed to wherever round 1's `layout(seed)` call happens and note it in your report). Also set `room.config.teamSize = Math.min(5, Math.max(count("red"), count("blue"))) as 1|2|3|4|5` before building the engine so spawn columns fit the larger team.

- [ ] **Step 4: Run the full suite** — the two replaced tests plus all Phase-2-reconnect tests must be green. `npm test && npx tsc --noEmit`.

- [ ] **Step 5: Commit.** `git commit -m "feat(server): NvN seating with auto-place + switchTeam, round1Seed lifecycle, room lock, seeded round-1 start"`

---

### Task 3: Server handlers — switchTeam, rerollArena, live config broadcast, countdown start

**Files:**
- Modify: `server/index.ts`
- Test: `server/integration.test.ts`

**Interfaces:**
- Consumes: Task 1 messages, Task 2 RoomManager API.
- Produces: `rosterMsg(room)` now always includes `config` (with `map`/`scatter`) and `round1Seed`; `startMatch` handler broadcasts `matchStarting` then starts the engine 3000ms later; `switchTeam`/`rerollArena` handlers.

- [ ] **Step 1: Write the failing integration tests** (follow the existing `server/integration.test.ts` harness style — real ws clients against `createServer` on an ephemeral port; read two existing tests first to copy the connect/collect helpers):
  1. *lobbyState carries terrain:* join two players → latest `lobbyState` has `round1Seed` (number) and `config.map.width` = 24.
  2. *switchTeam rebroadcasts:* player B sends `{ type: "switchTeam", team: "red" }` → both clients receive `lobbyState` with B on red.
  3. *rerollArena (host) changes the seed; non-host gets an error:* capture `round1Seed` s0 → host sends `rerollArena` → new `lobbyState.round1Seed !== s0`; guest sends it → receives `{ type: "error", code: "reroll-failed" }`.
  4. *start is a countdown:* host sends `startMatch` → both clients receive `matchStarting` with `startAt` ≈ now+3000 (±500ms) and NO `matchState` yet; with fake-timer or a ~3.2s wait (match the suite's existing async style), `matchState` with `phase: "play"` arrives; its `planets` equal `generatePlanets(round1Seed, …)` recomputed locally from the last `lobbyState` (import `generatePlanets`, `computeSpawns`, `boundsFromMap` from `../src/sim/planetScatter`).
  5. *late joiner during countdown becomes spectator:* after `startMatch`, a third client joins (no `asSpectator` flag) → receives `joined` and appears in `lobbyState.spectators`, not `players`.

- [ ] **Step 2: Run to verify failure**, then implement in `server/index.ts`:
  - Extend `rosterMsg(room)` to always attach `config: { mode, rounds, noTurn, turnSeconds: room.config.turnSeconds ?? 60, map: room.config.map, scatter: room.config.scatter }` and `round1Seed: room.round1Seed`. Delete the now-redundant hand-built lobbyState in the `configureRoom` handler — broadcast `rosterMsg(room)` instead.
  - `configureRoom` handler: pass `map: msg.map, scatter: msg.scatter` through to `setConfig`.
  - New handler `switchTeam`: `rooms.switchTeam(room.code, conn.playerId, msg.team)` → `broadcast(room.code, rosterMsg(room))`; errors → `{ code: "switch-failed" }`.
  - New handler `rerollArena`: `rooms.reroll(room.code, conn.playerId)` → broadcast `rosterMsg(room)`; errors → `{ code: "reroll-failed" }`.
  - Rewrite `startMatch` handler:

```ts
if (msg.type === "startMatch") {
  if (room.engine !== null || room.locked)
    return send(ws, { type: "error", code: "already-started", message: "match already in progress" });
  if (!rooms.canStart(room.code))
    return send(ws, { type: "error", code: "start-failed", message: "both teams need at least one player" });
  if (conn.playerId !== room.ownerId)
    return send(ws, { type: "error", code: "start-failed", message: "only the host can start" });
  rooms.lock(room.code);
  const startAt = Date.now() + 3000;
  broadcast(room.code, { type: "matchStarting", startAt });
  setTimeout(() => {
    const rm = rooms.get(room.code);
    if (!rm) return;
    try {
      const state = rooms.start(room.code, room.ownerId);
      rooms.startTTL(room.code, makeTTLExpiry(room.code));
      const patched = armTurnTimer(room.code, state, rm.engine!);
      broadcast(room.code, { type: "matchState", state: patched });
    } catch (e) {
      broadcast(room.code, { type: "error", code: "start-failed", message: String((e as Error).message) });
    }
  }, startAt - Date.now());
  return;
}
```

  - `join` handler: when `rooms.join` throws with a locked/full/started message and the client did NOT ask `asSpectator`, fall back to `joinSpectator` instead of erroring (this implements "joiners during countdown/play become Spectators"). Keep explicit `asSpectator: true` working as-is.

- [ ] **Step 3: Full gate + commit.** `npm test && npx tsc --noEmit` → `git commit -m "feat(server): live lobby terrain broadcast, switchTeam/reroll handlers, matchStarting countdown, late-joiner→spectator"`

---

### Task 4: Engine NvN verification (2v1, 2v2)

**Files:**
- Modify (only if tests expose gaps): `server/matchEngine.ts`, `src/game/turnQueue.ts`, `src/game/resolveFire.ts` guards
- Test: `server/matchEngine.nvn.test.ts` (new)

The engine is believed team-generic; this task PROVES it at NvN and fixes what falls out. Write the tests first; the implementation step may legitimately be a no-op.

- [ ] **Step 1: Write the tests** — `server/matchEngine.nvn.test.ts`, using `MatchEngine` directly with fixed seeds:
  1. *2v2 rotation:* roster r1,r2 (red) / b1,b2 (blue), turn-based classic. Assert `snapshot().turnQueue` alternates teams (r,b,r,b order per `buildTurnQueue`'s contract — read `src/game/turnQueue.ts` first and assert its actual interleaving), and after firing a guaranteed-miss (`latex: "99"` — a flat line above the field), `activePlayerId` advances to the next queue entry.
  2. *2v1 uneven spawns:* roster of 2 red + 1 blue constructs without error; all three players have distinct positions; red players sit at x<0, blue at x>0.
  3. *Team elimination ends the round (classic):* 2v1; fire a direct hit into the lone blue's y-position from red (compute a flat shot `latex: "0"` with a seed/scatter of `maxPlanets: 0` and spawns on the axis — mirror LocalGame.test's empty-field trick); after `resolvePlayerShot`, `phase === "between"` and `scores.red === 1`.
  4. *Partial elimination does NOT end the round:* 2v2 classic, kill one blue only → `phase === "play"`, victim `alive === false`, victim absent from `turnQueue` rotation thereafter (skipped turns).
  5. *HP mode per-player pools:* 2v2 hp; hit b1 once → b1.hp < 100, b2.hp === 100.

- [ ] **Step 2: Run.** Any failure here is a real ADR-0002 gap — fix minimally in the named engine files (most likely candidates: `buildTurnQueue`/`nextActive` skipping dead players, and `resolveFire`'s round-end condition being "all enemies dead" rather than "the one enemy dead"). Document each fix in the report; if everything passes untouched, say so explicitly.

- [ ] **Step 3: Full gate + commit.** `git commit -m "test(engine): NvN verification — rotation, uneven teams, team elimination, per-player HP"`

---

### Task 5: NetworkGame event surface for Phase 3

**Files:**
- Modify: `src/net/NetworkGame.ts`
- Test: `src/net/NetworkGame.test.ts` (create if absent, following `ServerClient.test.ts`'s MockWS style)

Phase 3's React lobby needs typed access to lobby/countdown events without NetworkGame knowing about React. Add a small event surface; change no existing behavior.

**Interfaces (produced):**

```ts
export interface LobbySnapshot {
  players: { id: string; name: string; team: "red" | "blue" }[];
  spectators: { id: string; name: string }[];
  hostId: string;
  myId: string | null;
  config?: { mode: "classic" | "hp"; rounds: 3 | 5; noTurn: boolean; turnSeconds: number;
             map?: { width: number; height: number }; scatter?: ScatterConfig };
  round1Seed?: number;
}
class NetworkGame {
  onLobby(cb: (s: LobbySnapshot) => void): void;        // fires on every lobbyState
  onMatchStarting(cb: (startAt: number) => void): void; // fires on matchStarting
  sendConfigure(partial: { mode; rounds; noTurn; turnSeconds; map?; scatter? }): void;
  sendSwitchTeam(team: "red" | "blue"): void;
  sendReroll(): void;
  requestStart(): void;                                  // sends startMatch (Phase 3 replaces the DOM button)
}
```

- [ ] **Step 1: Failing tests** — with a mock `ServerClient` (capture registered handlers, record `send` calls): (a) injecting a `lobbyState` message invokes the `onLobby` callback with mapped fields incl. `round1Seed`; (b) injecting `matchStarting` invokes `onMatchStarting(startAt)`; (c) `sendSwitchTeam("red")` sends `{ type: "switchTeam", team: "red" }`; same for `sendReroll`/`sendConfigure`/`requestStart`.
- [ ] **Step 2: Implement.** In the existing `lobbyState` handler, after current logic, build the snapshot and invoke the callback. Add a `matchStarting` handler that only invokes the callback (the DOM Start button and status-bar text stay untouched this phase). Add the four send helpers (`sendConfigure` merges over the constructor config like the current Start-button path does).
- [ ] **Step 3: Full gate + commit.** `git commit -m "feat(net): NetworkGame lobby/countdown event surface + send helpers for Phase 3"`

---

### Task 6: Two-browser smoke (stop criteria)

No Playwright scripting required — `npm run server` + `npm run dev`, two tabs on `/#room=TEST`:
- [ ] Both join; second tab lands on the opposite team (verify via websocket frames or server log)
- [ ] Host Start → both tabs still play a full 1v1 round (parity: old UI, countdown delay of 3s before the match snaps in is EXPECTED and acceptable this phase)
- [ ] Third tab joining mid-match becomes a spectator (sees the field, cannot fire)
- [ ] `git commit --allow-empty -m "test(server): Phase 2 two-browser smoke — NvN seating, countdown start, spectator fallback"`

## Self-Review

**Coverage vs ADRs:** ADR-0002 seating/switch/cap/canStart — Task 2; engine proof — Task 4. ADR-0003 server half: seed lifecycle + reroll (Task 2), lobbyState broadcast + matchStarting + lock + late-joiner→spectator (Task 3). Host terminology in new strings — Tasks 2–3. Phase-1 client parity — additive protocol (Task 1), untouched render path (Task 5), smoke (Task 6).
**Placeholders:** none; Tasks 2/4 contain deliberate verify-first steps where current code must be read before editing (constructor seed path, turnQueue contract) — these name exactly what to verify and where.
**Type consistency:** `round1Seed: number` everywhere; `switchTeam` carries explicit target team; `seedFn` reuses `MatchEngine`'s existing injectable; `LobbySnapshot.hostId` maps from wire `ownerId`.
**Known risk:** integration test #4 (countdown timing) is wall-clock sensitive — follow the suite's existing async/wait idiom rather than introducing fake timers into the ws harness.
