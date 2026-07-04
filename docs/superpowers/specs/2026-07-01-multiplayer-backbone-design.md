# Multiplayer Backbone — Design Spec

**Date:** 2026-07-01
**Status:** Approved design — ready for implementation plan
**Related:** Architecture **B** ([B-arena-authoritative-server.canvas](../../multiplayer-arch/B-arena-authoritative-server.canvas)),
decisions **D1–D3** ([B-decisions.md](../../multiplayer-arch/B-decisions.md)),
the merged **match-state spine** (`src/game/{matchState,turnQueue,resolveFire}.ts`).
Runs in **parallel** with the Arena Settings Panel session (coordination contract below).

---

## Goal

Make Graph War playable online with friends: two (later 2–10) people open a shared
link on their own devices and play a shared match, with an **authoritative Node
server** that reuses the pure match-state spine as the single source of truth.

## What is already decided (not re-opened here)

From the B canvas + B-decisions:
- **Architecture B:** the server runs the pure spine authoritatively; clients are
  thin (input + render), sending `fireIntent{latex}` and rendering from snapshots.
- **Hosting (D1):** Node server in a Proxmox LXC, exposed via Cloudflare Tunnel;
  `wss://` with TLS at the CF edge; app-level ping/pong keepalive (~30s) for CF's
  ~100s idle cutoff.
- **Team-generic (D2):** the spine is already team-generic; the server inherits it.
- **Server-authoritative turn timer (D3):** `turnSeconds`, server-owned clock.
- **Reconnect:** 30s grace + `rejoinToken`. **Spectators:** allowed.

This spec pins the engineering details the canvas left conceptual.

---

## 1. Server-authoritative timing model (the core)

The server is the **single writer** of `MatchState` and owns all timing via **its
own timers** — it never waits on a client ack, so a mid-fire disconnect cannot
stall a room.

One shot:
1. Client sends `fireIntent{latex}`.
2. Server validates (turn? alive? not friendly-fire? room not mid-animation?),
   compiles the LaTeX on Node, calls `resolveFire` against the **current**
   `MatchState` → `{ next, shot }`.
3. Server computes duration from the deterministic physics:
   `duration = xLength(shot.samples) / X_VELOCITY_WORLD`.
4. Server broadcasts `shotPlayback{firerId, shot, duration}` **immediately** →
   clients animate.
5. Server starts a `duration` timer. **On fire**, it broadcasts the post-shot
   `matchState` (HP/crater/elimination applied, turn advanced, or
   `phase: "between"/"over"`).

Properties this yields:
- **Disconnect-robust:** timers are server-owned; a dropped client never blocks
  the room.
- **No-Turn concurrency is safe by construction:** Node is single-threaded and the
  server is the sole writer, so each `fireIntent` resolves against live state
  atomically — the stale-snapshot problem solved locally cannot occur server-side.
- **One clock:** duration derives from physics (not wall-clock), so every client's
  animation and the server's turn-gate stay in lockstep with no extra messages.

## 2. Module structure & shared-code packaging

**Server (`server/`, ~300 LOC):**
```
server/
  index.ts        — ws server, connection routing, message dispatch, ping/pong keepalive
  RoomManager.ts  — Map<code, Room>; create/join/leave, TTL, owner, rejoinTokens, spectators
  MatchEngine.ts  — per room: owns MatchState, wraps resolveFire/beginRound,
                    owns turn/round timers, validates every fireIntent
```

**Shared code (imported by both browser and Node):**
- `src/net/protocol.ts` *(new)* — typed message union + zod schemas; single source
  of the wire format, imported by `ServerClient` and the server.
- The spine (`src/sim/*`, `src/math/Context.ts`,
  `src/game/{matchState,turnQueue,resolveFire,matchLogic,hpLogic}.ts`) is imported
  **directly** by the server (already DOM-free).

**Packaging:** a **tsconfig path-alias** (`server/tsconfig.json`), not npm
workspaces — the spine is already isolated, so a workspace split is unneeded
ceremony. Server runs via `tsx` in dev, an `esbuild` bundle in prod. A stray DOM
import in a shared module would fail the server build immediately (natural guard).

**Forced refactor:** move `X_VELOCITY_WORLD` from `GameRenderer` into a shared
`src/sim/timing.ts` so the renderer's animation and the server's turn-gate use the
identical constant, plus the shared `xLength(samples)` helper.

## 3. Protocol

Envelope: `{ type, ...payload }`, a discriminated union on `type`, zod-validated in
`protocol.ts`.

**Client → Server**
| type | payload |
|------|---------|
| `join` | `{ room, name, asSpectator? }` |
| `reconnect` | `{ room, playerId, token }` |
| `teamSwap` | `{ team: "red" \| "blue" }` |
| `ready` | `{ ready: boolean }` |
| `startMatch` | `{}` (owner only) |
| `fireIntent` | `{ latex }` |
| `rematch` | `{}` |

**Server → Client**
| type | payload |
|------|---------|
| `joined` | `{ playerId, token, role, ownerId }` |
| `lobbyState` | `{ players[], config, ownerId }` |
| `shotPlayback` | `{ firerId, shot, duration }` — sent immediately on resolve |
| `matchState` | `{ state }` — full authoritative snapshot, server-only fields stripped |
| `error` | `{ code, message }` |

**Send sequence:**
1. `fireIntent` → validate. **If a duration timer is pending (room mid-animation),
   reject** — this is the input gate; no client can jump the queue.
2. Resolve → broadcast `shotPlayback{shot, duration}` immediately → clients animate.
3. Start `duration` timer. On fire → broadcast post-shot `matchState`.
4. Clients animate the shot, then swap their mirror to the new `matchState`.

`roundEnd`/`matchEnd` are **not** separate messages — carried by `matchState.phase`
→ `"between"`/`"over"`; the client shows the splash/banner off that transition
(same as local).

## 4. Client `Local` / `Network` split

A **match-driver** abstraction keeps the render/HUD layer identical online or off:
- **`LocalDriver`** — current behavior (`resolveFire` locally, `await playShot`,
  commit, render). Local hot-seat.
- **`NetworkDriver`** — sends `fireIntent` via `ServerClient`; on `shotPlayback`
  animates, on `matchState` swaps the mirror. Never calls `resolveFire`.

Shared interface: `fire(team, latex)` + events `onShotPlayback(firerId, shot,
duration)`, `onState(matchState)`, `onError`. `main.ts` picks the driver from the
route: `/#` → lobby; local start → `LocalDriver`; `/#room=WOLF` → `NetworkDriver`.

`MatchConfig.role` collapses from `"host"|"guest"|"local"` to **`"local" |
"online"`** (Architecture B has no host/guest; clients are equal peers of the
authoritative server).

## 5. Dev harness & deploy

- **Dev:** `npm run dev` (Vite client :5173) + `npm run server` (`tsx` server
  :3001). Two tabs → `localhost:5173/#room=TEST`, `ServerClient` → `ws://localhost:3001`.
- **WS URL:** Vite env var — dev `ws://localhost:3001`, prod `wss://<domain>/ws`.
- **Deploy:** server in Proxmox LXC; `cloudflared` maps a hostname → `localhost:3001`;
  static client via CF Pages or the same tunnel; ping/pong keepalive ~30s; origin
  check on the WS handshake.

## Build phasing (skeleton-first)

1. **Walking skeleton:** shared `protocol.ts` + `timing.ts`; server
   (index/RoomManager/MatchEngine) for a **1v1 turn-based** match; `ServerClient` +
   `NetworkDriver`; two-tab dev → one networked match end-to-end.
2. Reconnect (`rejoinToken` + 30s grace) + spectators.
3. Teams / No-Turn over the network + server-authoritative turn timer (D3).
4. Deploy via Cloudflare Tunnel + keepalive + prod WS URL.

## Coordination with the Arena Settings Panel session — LANDED

The Arena Settings work is **done** (branch `feature/design-foundation-arena-panel`,
verified: tsc clean, 103 tests). Its final `MatchConfig` shape and integration points
are the ground truth for this plan — see
[MatchConfig-shape.md](../../multiplayer-arch/MatchConfig-shape.md).

- `MatchConfig` already carries `roomCode?` and `role?` plus the gameplay extensions
  `map: MapConfig`, `scatter: ScatterConfig`, `teamSize: 1|2|3|4|5`. All fields
  round-trip through `configRouter` (validated + clamped; safe for the server to
  accept client-proposed room hashes). Do **not** add fields inside
  `MapConfig`/`ScatterConfig` (serialized positionally-by-key).
- The backbone's only `matchLogic.ts` change is **narrowing `role` to `"local" |
  "online"`** — a server-owned field, not serialized in the hash, so the change is
  localized.
- **Server round setup** reuses the front-end's pure generator (do not re-derive):
  ```ts
  // src/sim/planetScatter.ts — Node + browser safe
  generatePlanets(seed, boundsFromMap(map), computeSpawns(map, teamSize), scatter)
  ```
  plus `arenaDefaults()` (`src/game/arenaDefaults.ts`). The server **mints the
  per-round `seed`** and broadcasts the resulting `Planet[]`; the `MatchEngine`
  round-setup path parallels the client's `buildLocalLayout` but is server-owned.
- **Base branch:** the backbone builds **on top of** the arena work — branch off it
  (after it merges to `main`), not off the bare spine, so `planetScatter.ts`,
  `arenaDefaults.ts`, and the final `MatchConfig` are present.

## Out of scope / deferred

- N-player **rendering/HUD** generalization (cross-cutting; required before the
  teams phase — noted as a dependency, not built here).
- Accounts, persistence, matchmaking, leaderboards (RAM-only rooms for v1).
- The Lockstep (C) and Party-Link (A) architectures.

## Testing strategy

- **Unit:** `protocol.ts` schema round-trips; `MatchEngine` turn/round transitions
  and the input-gate (fireIntent rejected mid-animation) via a fake clock;
  `RoomManager` join/leave/TTL/reconnect. All headless (the engine is pure).
- **Integration (local):** two Node WS clients against the server → a full 1v1
  match; then two browser tabs.
- **Manual/browser:** two tabs locally, then two devices through the tunnel.
