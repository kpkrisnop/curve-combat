# Architecture B — Locked Decisions

Resolves the four blocking questions for implementing the **Arena** design
(authoritative headless server). See [B-arena-authoritative-server.canvas](B-arena-authoritative-server.canvas).

_Decided: 2026-06-30._

---

## D1 · Hosting — Proxmox LXC + Cloudflare Tunnel

The authoritative Node WebSocket server runs in an **LXC container on Proxmox**,
exposed to the internet through a **Cloudflare Tunnel** (`cloudflared`).

- No inbound ports opened on the host/router — the tunnel dials out.
- **TLS terminates at the Cloudflare edge.** The server speaks plain `ws`
  internally; clients connect to `wss://<your-domain>`.
- Static frontend can be served from Cloudflare Pages or the same tunnel.

**Implications / follow-ups:**
- Cloudflare proxied WebSockets enforce an **idle timeout (~100s)**. Add
  app-level **ping/pong keepalive** (~30s, both directions) or connections drop
  mid-match.
- `cloudflared` config maps `hostname (+ path) → localhost:<port>`.
- Origin checks on the WS handshake still matter (the tunnel forwards all
  traffic to that hostname).

---

## D2 · Team-generic from day one

`MatchState` is **always** team-based. **1v1 is just two teams of one** — there
is no separate code path for player count.

- Exactly **2 teams** (RED, BLUE), **1–5 players each → 2–10 total**.
- `turnQueue`, targeting (living enemies), and the win check all iterate
  teams/players generically. **Only rendering maps team → colour.**
- No `red*/blue*` scalar globals survive the refactor — everything is
  `players: PlayerState[]` grouped by `team`.

---

## D3 · Turn timer — 60s default, UI-adjustable in 5s steps

- `MatchConfig` gains **`turnSeconds: number`** (default **60**, min ~15, step **5**).
- Lobby exposes a **± 5s stepper**.
- **Server enforces:** on expiry the active player's turn auto-resolves as a
  **dud/skip** and `turnQueue` advances. Server is the clock (authoritative),
  clients render a countdown from a `turnDeadline` timestamp in `matchState`.
- **Turn-based only.** No-Turn mode has no per-turn timer — all living players
  fire freely (one bullet in flight each).

---

## D4 · New random planet layout each round (seeded, server-authoritative)

The server mints a **fresh seed per round** and broadcasts the resulting layout
to all clients (authoritative → trivially consistent). This replaces the
hand-authored 6-planet `seedPlanets()` in `src/game/main.ts` and finally builds
the "seeded-random Planet layouts" deferred in `architecture-decisions.md §10`.

**Layout style: free scatter** — unconstrained random placement across the
whole field (no mirror/point symmetry). Acceptable because terrain is
destructible (no layout is unwinnable) and it evens out over a best-of-N match.

**Density tuning is handed off to a separate prototype session.** Rather than
fixing a count/coverage model now, build a standalone tunable prototype that
exposes these knobs and lets KP dial them in by feel:
- **planet size range** `[rMin, rMax]`
- **distance-between-planets range** (min/max edge gap)
- (kept as constants, not primary knobs: spawn/muzzle clearance, field margins)

Full implementation + integration plan: [2026-07-01-arena-settings-panel](../superpowers/plans/2026-07-01-arena-settings-panel.md) — a shared pure `src/sim/planetScatter.ts` generator with player-adjustable `ScatterConfig` (rMin/rMax, gapMin/gapMax) driven from the lobby settings panel.

---

## Net new work these decisions created

| Source | New task |
|--------|----------|
| D1 | WS ping/pong keepalive; `cloudflared` ingress config; WS origin check |
| D2 | Confirm renderer/HUD generalise to N players per team (trail-layer pool) |
| D3 | `turnSeconds` in `MatchConfig`; lobby stepper; server turn clock + `turnDeadline` |
| D4 | Seeded procedural planet-scatter algorithm + playtest tuning |
