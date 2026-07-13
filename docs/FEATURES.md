# CurveCombat — Feature Roadmap

Each group below is independently implementable in the listed order.
Later groups may depend on earlier ones (noted in Dependencies).

---

## Group 1 · Physics & Animation Overhaul
**Status:** Not started | **Blocks:** HP Mode, No-Turn Mode

### What it is
Replace the current fixed-time shot animation (1200 ms flat) with a
constant-x-velocity model, and introduce a slope-at-impact damage value
used by HP mode.

### Decisions made
- Animation advances at a fixed world-x units per second (not wall-clock).
  A long or winding curve takes more real time than a short one.
  Starting value: **6 world-units/sec** (tunable constant `X_VELOCITY_WORLD`).
  A field-crossing shot (~24 x-units wide) takes ~4 seconds; a short arc
  covering 4 x-units takes ~0.7 seconds.
- Damage is derived from `|dy/dx|` at the exact impact point (two samples
  bracketing the hit), not accumulated over the path.
- Damage formula (used by HP mode, ignored in Classic VS):
  `dmg = clamp(5 + 35 · tanh(|slope| / 2), 5, 50)`
  — slope 0 → 5 dmg (floor), slope 1 → ~26 dmg, slope ∞ → 50 dmg (cap).
  Produces 2–7 hits per round depending on trajectory skill.
- **No curve preview** — blind fire is intentional; the challenge is knowing
  your functions well enough to aim without seeing the curve first.

### Key changes
- `GameRenderer.playShot` — remove `SHOT_DURATION_MS`; add `X_VELOCITY_WORLD`;
  derive animation duration as `xLength / X_VELOCITY_WORLD` where `xLength`
  is the total x-distance covered by the shot's sample path.
- `engine.fire` / `ShotResult` — add `impactSlope: number` field; compute
  using the two trajectory samples that bracket the hit point.
- `trajectory.ts` — no change needed.

### Open questions
- What x-velocity feels right in play? Start at 6, tune after first playtest.

---

## Group 2 · Classic VS Mode (N-round, single-hit) + Tutorial
**Status:** Not started | **Depends on:** nothing (builds on current codebase)

### What it is
The current game is already single-hit, but it has no match structure.
Classic VS adds: configurable round count (3 or 5), per-player win counters,
a between-round screen, a match winner declaration, and a first-run tutorial.

### Decisions made
- Players choose round count (3 or 5) in the lobby.
- A round ends on a direct hit. The surviving player scores 1 point.
- The match ends when one player reaches the majority (2/3 or 3/5).
- **Between rounds:** 2-second splash overlay — "Round X of N · RED 1 — BLUE 0"
  — then field resets (new planet seed, random player positions).
- **Turn order between rounds:** the loser of the previous round shoots first
  next round (gives the loser initiative as a small comeback mechanic).
- **Scoreboard:** a centered pill between the two HUD panels always shows
  `RED 1 — BLUE 0 · Round 2/3` during the match.
- **Tutorial (first run only):** before the first match ever, a skippable
  overlay walks RED through one real shot:
  1. "You are the RED dot — type a function of x to fire."
  2. Player types anything → "Press Enter or Fire to shoot."
  3. Shot plays out on the real field.
  4. Tutorial ends; match begins normally.
  Stored in `localStorage` (`curvecombat.tutorialDone`) so it only runs once.
  No tutorial in subsequent sessions.

### Key changes
- `main.ts` — add `MatchConfig { mode, rounds }`, `redScore`, `blueScore`,
  `currentRound`; move reset logic into `nextRound()`; add `startTutorial()`.
- `GameUI.ts` — scoreboard pill element; between-round splash overlay;
  tutorial overlay with step progression.
- `index.html` — scoreboard, splash, tutorial DOM elements.

### Open questions
- None — all decisions above are confirmed.

---

## Group 3 · HP Mode
**Status:** Not started | **Depends on:** Group 1 (physics/damage value)

### What it is
Each player starts a round with 100 HP. Shots deal damage based on slope
at impact. A round ends when a player hits 0 HP. Match structure mirrors
Classic VS (N rounds, most rounds wins).

### Decisions made
- 100 HP per round, resets at round start.
- Damage formula (from Group 1): `dmg = clamp(5 + 35 · tanh(|slope| / 2), 5, 50)`
  — slope 0 → 5 dmg (floor), slope 1 → ~26 dmg, slope ∞ → 50 dmg (cap).
  Expect 2–7 hits per round.
- Turn structure stays the same as Classic VS unless No-Turn modifier is active.
- Win condition per round: first player to reach 0 HP loses the round.
- **Minimum damage floor: 5** — a hit always hurts regardless of slope.
- No chip damage on near-misses — only direct hits deal damage.

### Key changes
- `main.ts` — add `redHP`, `blueHP` per-round state; apply damage on
  `shot.hit.kind === "target"` using `shot.impactSlope`; round ends at 0 HP.
- `GameUI.ts` / `index.html` — HP bar under each player's HUD panel,
  colored in player color, draining left-to-right; current HP shown as
  a number (e.g. `74 HP`).
- `GameRenderer` — floating damage number (`-23`) animates upward from
  the impact point and fades out over ~600 ms.

### Open questions
- None — all decisions above are confirmed.

---

## Group 4 · No-Turn Mode
**Status:** Not started | **Depends on:** Group 1 (animation model)

### What it is
A match modifier (not a standalone mode) that removes turn order. Both
players fire independently as fast as they want. Works with either
Classic VS or HP Mode scoring.

### Decisions made
- One bullet per player in-flight at a time. Fire button re-enables the
  moment the player's own bullet resolves (hit or out of bounds).
- Both bullets coexist on screen simultaneously, each in the player's color.
- Both damage values apply if both bullets hit simultaneously in HP mode.
- **No friendly fire** — a bullet cannot hit the player who fired it.
- Hot-seat: both HUD panels active at all times; no `inactive` dimming.
  Each player watches their own input and fires independently.
- Selected in the lobby as a checkbox modifier alongside the base mode.

### Key changes
- `main.ts` — replace single `busy` / `activeTurn` with `redBusy` /
  `blueBusy`; remove turn gating entirely when No-Turn is active.
- `GameUI.ts` — both HUD panels remain active (no `inactive` class toggle).
- `GameRenderer` — second dedicated trail layer (`trailLayerBlue`) for the
  guest's bullet; both layers animate concurrently via the same ticker.
- Multiplayer: host resolves both bullets' physics; broadcasts world state
  after each resolution event (see Group 6).

### Open questions
- None — all decisions above are confirmed.

---

## Group 5 · Lobby & Game Setup Screen
**Status:** Not started | **Depends on:** nothing (pure UI)

### What it is
A pre-game screen (hash-routed SPA) replacing the immediate game start.
One player creates a room with settings; the other joins via room code or
shared URL. Local hot-seat available without any room code.

### Decisions made
- **Single page, hash routing:** `index.html` is the only page.
  `main.ts` becomes a router: `/#lobby` (default) → `LobbyScreen`;
  `/#game?room=WOLF` → `GameScreen`.
- **Lobby flow:**
  1. Landing: "Play Locally" and "Play Online" buttons.
  2. Play Locally → mode cards (Classic VS / HP Mode) + No-Turn checkbox
     + round picker (3 or 5) → "Start" → `/#game` (no server).
  3. Play Online → "Create Room" → 4-letter human-readable code generated
     (e.g. `WOLF`) → host sees waiting screen with large room code +
     copyable URL (`https://curvecombat.app/#game?room=WOLF`) → guest opens
     URL → auto-joins → host presses "Start".
- Settings locked once guest joins. Guest sees read-only match config.
- Same dark theme as the game. Mode cards show one-line descriptions.
- Room code displayed large and copyable on the waiting screen.

### MatchConfig type
```ts
interface MatchConfig {
  mode: "classic" | "hp";
  noTurn: boolean;
  rounds: 3 | 5;
  roomCode?: string;           // undefined = local hot-seat
  role?: "host" | "guest" | "local";
}
```

### Key changes
- `main.ts` — hash router replaces direct `start()` call.
- New `src/ui/LobbyScreen.ts` — landing, mode picker, room create/join UI.
- New `src/ui/GameScreen.ts` — wraps current game logic; accepts `MatchConfig`.
- `index.html` — add lobby DOM skeleton; game DOM moves into GameScreen.

### Open questions
- None — all decisions above are confirmed.

---

## Group 6 · Multiplayer (Room-Based, Cross-Device)
**Status:** Not started | **Depends on:** Groups 2–5 all stable

### What it is
Players open the game on their own devices via a shared URL
(`/#game?room=WOLF`). Full game state syncs over a WebSocket backend.
Each player sees the shared field and controls only their own HUD.

### Architecture
- **Frontend:** Vite app deployed to Netlify / Vercel (free tier).
- **Backend:** Tiny WebSocket server (`server/index.ts`, ~100 lines) on
  Fly.io free tier. Manages rooms; relays typed events between clients.
  Does NOT run simulation.
- **Authority model:** Host's browser runs the full simulation (physics,
  collision, crater carving). Guest sends fire events; host resolves and
  broadcasts full world state back to both clients. Both animate identically.
- **URL scheme:** First client to connect with a room code becomes host;
  second becomes guest. `/#game?room=WOLF` — no separate host/guest URLs.

### Decisions made
- Rooms are ephemeral (30-minute TTL, destroyed on both disconnect).
- No reconnect flow for prototype — if a player drops, start a new room.
- Shots animate locally on host immediately; guest animation driven by
  incoming world-state broadcasts.
- No-Turn Mode: host resolves both bullets' physics; broadcasts world state
  after each resolution. Guest fires are relayed instantly to host.
- Guest's opponent HUD shows the last equation fired (read-only).

### Testing strategy
- **Local:** Two browser tabs → `localhost:5173/#game?room=TEST` against
  `localhost:3001` WebSocket dev server. No devices needed during development.
- **Real devices:** Deploy frontend to Netlify, server to Fly.io; share URL.

### Key changes
- New `server/index.ts` — WebSocket relay (~100 lines, Node + `ws`).
- New `src/net/RoomClient.ts` — typed WS client; emits events to GameScreen.
- `src/ui/GameScreen.ts` — `LocalGame` path (no RoomClient) and
  `NetworkGame` path (host wraps LocalGame + broadcasts; guest renders only).
- `GameUI.ts` — guest opponent HUD locked to read-only mode.

### Open questions
- Should spectators (3+ people in a room) be allowed? (Suggest: no for now.)
- Reconnect flow can be added in a future iteration.

---

## Implementation Order

```
Group 1 · Physics/Animation    ←── foundational, do first
Group 2 · Classic VS Mode      ←── simplest mode, establishes match structure
Group 5 · Lobby & Setup        ←── can be built in parallel with Group 2
Group 3 · HP Mode              ←── needs Group 1 + Group 2 structure
Group 4 · No-Turn Mode         ←── needs Group 1 + match structure
Group 6 · Multiplayer          ←── needs Groups 2–5 all stable
```

---

## Open Design Questions (cross-cutting)

- **Planet seed per round**: should each round use a new random planet layout,
  or keep the same layout for the whole match? (TBD)
- **Sound effects**: impact, fire, win — what's the priority? (TBD)

## Resolved Design Decisions (cross-cutting)

- **Curve preview**: NO — blind fire is intentional. The challenge is knowing
  your functions well enough to aim without a preview.
- **Mobile input**: Keep MathQuill, optimize for mobile (viewport tweaks).
  No custom keypad.
- **Onboarding**: First-run tutorial only (see Group 2). No persistent hints
  after tutorial completes.
- **Implementation order**: Bottom-up (Group 1 → 2 → 5 → 3 → 4 → 6).
  Multiplayer last, when all local modes are stable.
