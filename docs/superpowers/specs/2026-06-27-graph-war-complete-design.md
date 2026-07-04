# Graph War — Complete Game Design Spec
**Date:** 2026-06-27
**Status:** Approved by user

---

## 1. Overview

Graph War is a 2-player hot-seat browser game where each player fires by
typing a mathematical function. The projectile travels along the resulting
curve through a world of destructible terrain (Planets). This spec covers
everything needed to take the current prototype to a shippable, multi-mode,
multiplayer game.

### Current state (prototype)
- 2-player hot-seat, single device
- Turn-based: RED then BLUE alternating
- One-hit win condition
- Destructible Planets with Craters
- Fixed 1200 ms shot animation
- No match structure, no lobby, no multiplayer

---

## 2. Implementation Order

```
Group 1 · Physics & Animation Overhaul    ←── foundational, do first
Group 2 · Classic VS Mode + Tutorial      ←── establishes match structure
Group 5 · Lobby & Game Setup              ←── can run in parallel with Group 2
Group 3 · HP Mode                         ←── needs Groups 1 + 2
Group 4 · No-Turn Mode                    ←── needs Groups 1 + 2
Group 6 · Multiplayer                     ←── needs Groups 2–5 all stable
```

---

## 3. Group 1 · Physics & Animation Overhaul

### 3.1 Animation model
Replace the fixed 1200 ms timer with **constant x-velocity**.

- Bullet advances at `X_VELOCITY_WORLD = 6` world-units/sec (tunable constant).
- Animation duration = `xLength / X_VELOCITY_WORLD` where `xLength` is the
  total x-distance covered by the shot's sample path.
- A field-crossing shot (~24 x-units) takes ~4 s; a short arc (4 x-units) ~0.7 s.

**Change in `GameRenderer.playShot`:**
Remove `SHOT_DURATION_MS`. Compute `xLength` by summing `|samples[i+1].x - samples[i].x|`
over non-gap segments. Drive the animation ticker with `xLength / X_VELOCITY_WORLD`.

### 3.2 Impact slope & damage value
After a bullet resolves on a target, compute `impactSlope`:

```ts
// Find the two samples bracketing the hit point, compute finite difference
impactSlope = Math.abs((s[i+1].p.y - s[i].p.y) / (s[i+1].p.x - s[i].p.x))
```

Add `impactSlope: number` to `ShotResult`. This value is computed always but
only consumed by HP Mode — Classic VS ignores it (one-hit-kill stays).

**Damage formula (HP Mode):**
```ts
dmg = Math.round(Math.min(50, Math.max(5, 5 + 35 * Math.tanh(impactSlope / 2))))
```
- slope 0   → 5 dmg (floor)
- slope 0.5 → ~17 dmg
- slope 1   → ~26 dmg
- slope 2   → ~40 dmg
- slope ∞   → 50 dmg (cap)
- Expected hits per round: 2–7 depending on trajectory skill.

### 3.3 No curve preview
Blind fire is intentional — the challenge is knowing functions well enough
to aim without a preview. Do not add live curve preview.

---

## 4. Group 2 · Classic VS Mode + Tutorial

### 4.1 MatchConfig
```ts
interface MatchConfig {
  mode: "classic" | "hp";
  noTurn: boolean;
  rounds: 3 | 5;
  roomCode?: string;           // undefined = local hot-seat
  role?: "host" | "guest" | "local";
}
```
All game logic reads from `MatchConfig` instead of hard-coded defaults.

### 4.2 Match structure
- `redScore`, `blueScore`, `currentRound` added to game state.
- A round ends on a direct hit (Classic VS) or when a player hits 0 HP (HP Mode).
- Scorer gets +1. Match ends when a player reaches majority (2/3 or 3/5).
  Ties are structurally impossible with odd round counts — one player always
  reaches majority before all rounds are exhausted.
- **Between rounds:** 2-second splash overlay — "Round X of N · RED 1 — BLUE 0"
  — then field resets: new planet seed + random player positions.
- **Turn order:** loser of the previous round shoots first next round
  (small comeback mechanic).

### 4.3 Scoreboard
Centered pill element between the two HUD panels, always visible during
a match. Shows: `RED 1 — BLUE 0 · Round 2/3`.

### 4.4 Tutorial (first run only)
Triggered before the very first match. Stored in `localStorage` key
`graphwar.tutorialDone`. Skip-able at any step.

Steps (sequential overlays on the real game field):
1. "You are the RED dot. Type a function of x to fire."
   → waits for any input in RED's math field
2. "Press Enter or the Fire button to shoot."
   → waits for fire action
3. Shot plays out normally on the real field.
4. Tutorial ends; match begins.

After tutorial completes, `localStorage.setItem('graphwar.tutorialDone', '1')`.

---

## 5. Group 3 · HP Mode

### 5.1 Round mechanics
- Each round: `redHP = blueHP = 100`.
- On each hit: `targetHP -= dmg` (from damage formula in §3.2).
- Round ends when `targetHP <= 0`. Attacker scores +1 round.
- HP resets to 100 at the start of every round.
- Turn structure unchanged from Classic VS unless No-Turn modifier active.

### 5.2 HUD additions
- HP bar under each player's input panel.
  - Color: player color (red / blue).
  - Drains left-to-right as HP decreases.
  - Numeric label: `74 HP`.
- Floating damage number on hit: `-23` animates upward from impact point,
  fades out over ~600 ms.

### 5.3 Damage floor
Minimum 5 damage per hit regardless of slope. A hit always hurts.
No chip damage on near-misses — direct hits only.

---

## 6. Group 4 · No-Turn Mode

### 6.1 Modifier behavior
No-Turn is a **match modifier** selected alongside a base mode
(Classic VS + No-Turn, or HP Mode + No-Turn).

- Removes turn gating (`activeTurn`) entirely.
- Replace single `busy` flag with `redBusy` / `blueBusy`.
- Each player's Fire button re-enables as soon as their own bullet resolves.
- Both players' bullets coexist on screen simultaneously (separate trail layers).
- Both damage values apply if bullets hit simultaneously in HP Mode.

### 6.2 Friendly fire
Disabled. A bullet cannot hit the player who fired it.

### 6.3 Hot-seat
Both HUD panels remain active at all times (no `inactive` CSS class toggle).
Each player watches their own panel and fires independently.

### 6.4 Renderer change
Add `trailLayerBlue` (second dedicated Graphics layer) alongside existing
`trailLayer` (RED). Both animate concurrently via the same Pixi ticker.

---

## 7. Group 5 · Lobby & Game Setup Screen

### 7.1 SPA routing
`index.html` is the only HTML file. `main.ts` becomes a hash router:
- `/#lobby` (default) → renders `LobbyScreen`
- `/#game?room=WOLF` → renders `GameScreen` with parsed `MatchConfig`

### 7.2 Lobby flow

**Play Locally path:**
1. Click "Play Locally"
2. Mode cards: Classic VS · HP Mode (mutually exclusive)
3. No-Turn checkbox modifier
4. Round picker: 3 or 5
5. "Start" → navigate to `/#game` with `MatchConfig { role: "local" }`

**Play Online path (host):**
1. Click "Play Online" → "Create Room"
2. Mode / No-Turn / rounds picker (same as local)
3. Server generates 4-letter code (e.g. `WOLF`)
4. Waiting screen: large room code + copyable full URL
   (`https://graphwar.app/#game?room=WOLF`)
5. Guest opens URL → auto-joins → host presses "Start"

**Play Online path (guest):**
1. Open shared URL `/#game?room=WOLF`
2. Auto-connects; sees read-only match config and "Waiting for host to start"
3. Host starts → game begins

### 7.3 UI details
- Same dark theme as the game.
- Mode cards show one-line description ("One hit per round · first to win 3 rounds").
- Settings locked once guest joins.
- Room code displayed in large monospace font with a copy-to-clipboard button.

### 7.4 New files
- `src/ui/LobbyScreen.ts` — all lobby UI logic
- `src/ui/GameScreen.ts` — wraps current game logic; accepts `MatchConfig`
- `main.ts` rewritten as hash router (~40 lines)

---

## 8. Group 6 · Multiplayer (Room-Based, Cross-Device)

### 8.1 Infrastructure
- **Frontend:** Vite app → Netlify or Vercel (free tier, static deploy).
- **Backend:** `server/index.ts` — Node.js + `ws` WebSocket server (~100 lines).
  Deploy to Fly.io free tier. Relays typed events only; does not simulate.

### 8.2 Authority model
- **Host** runs the full simulation (physics, collision, crater carving).
- **Guest** sends `{ type: "fire", latex: string }` events.
- Host resolves, then broadcasts `{ type: "worldState", state: WorldSnapshot }`
  to both clients after every resolution event.
- Both clients animate from the same world state. No divergence possible.

### 8.3 Room lifecycle
- First client to open `/#game?room=WOLF` → host role.
- Second client → guest role.
- Rooms are ephemeral: destroyed 30 minutes after creation or when both
  clients disconnect. No reconnect flow (prototype scope).

### 8.4 No-Turn in multiplayer
Host resolves both players' bullets. Guest fire events are relayed
immediately to host. Host broadcasts world state after each bullet resolution.
Guest animation is driven by incoming state broadcasts.

### 8.5 New files
- `server/index.ts` — WebSocket relay server
- `src/net/RoomClient.ts` — typed WS client; exposes `send(event)` and
  `on(type, handler)` to `GameScreen`
- `GameScreen.ts` — `LocalGame` path (no `RoomClient`) and `NetworkGame`
  path (host wraps `LocalGame` + broadcasts; guest renders only)

### 8.6 Testing strategy
- **Local dev:** Two browser tabs → `localhost:5173/#game?room=TEST`
  against `localhost:3001` WS dev server. No physical devices needed.
- **Real devices:** Deploy frontend + server; share URL.

---

## 9. Resolved Design Decisions (global)

| Topic | Decision |
|---|---|
| Curve preview | **No** — blind fire is the core skill test |
| Mobile input | Keep MathQuill; optimize viewport for mobile |
| Onboarding | First-run tutorial only; `localStorage` flag skips on repeat |
| Implementation order | Bottom-up: Groups 1 → 2 → 5 → 3 → 4 → 6 |
| No-Turn | Modifier, not standalone mode |
| Friendly fire | Disabled |
| Reconnect flow | Out of scope for prototype |
| Room TTL | 30 minutes ephemeral |
| Spectators | Not supported (prototype scope) |

---

## 10. Open Questions (to resolve during implementation)

| Topic | Question |
|---|---|
| Planet seed | New random layout each round, or same layout all match? |
| Sound effects | Priority and trigger points (fire, impact, win, round end)? |
| X-velocity tuning | Does 6 world-units/sec feel right in play? |
| Between-round first shooter | Confirmed: loser shoots first next round? |
| Server host | Fly.io confirmed for prototype? |
