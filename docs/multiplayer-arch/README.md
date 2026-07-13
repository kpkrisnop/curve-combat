# CurveCombat — Online Multiplayer Architecture Mockups

Three full-pipeline designs for taking CurveCombat online with friends (2–10 players, teams, invite link, desktop + tablet). Each is mocked up as its own Obsidian canvas — open the folder in Obsidian and double-click a `.canvas` file.

**The core gameplay never changes in any of them:** type a function → `engine.fire` traces the curve → collision resolves a hit. `src/sim/*` and `src/math/*` stay untouched. The designs differ **only in where the simulation runs and how state propagates.**

| Canvas                                                   | Authority                                              | Server                        | Bandwidth                | Reconnect / Spectators   | Effort                            | Best for                                      |
| -------------------------------------------------------- | ------------------------------------------------------ | ----------------------------- | ------------------------ | ------------------------ | --------------------------------- | --------------------------------------------- |
| **[A · Party Link](A-party-link-relay.canvas)**          | One player's **browser** (host)                        | Dumb relay (~120 LOC)         | Medium (world snapshots) | ✗ (host drop ends match) | **Lowest**                        | Casual friend sessions, ship in days          |
| **[B · Arena](B-arena-authoritative-server.canvas)** ⭐   | **Server** runs the engine                             | Authoritative Node (~300 LOC) | Medium (world snapshots) | ✓ both, free             | Medium                            | The **real product** — fair, robust, growable |
| **[C · Lockstep Mesh](C-lockstep-deterministic.canvas)** | **Shared ordered intent log** (every client simulates) | Sequencer (~100 LOC)          | **Tiny** (LaTeX only)    | ✓ via log replay         | Medium-high (determinism harness) | Max elegance / lowest bandwidth               |

## The shared spine (build this first, regardless of choice)

All three sit on one refactor that has nothing to do with networking:

1. **`src/game/MatchState.ts`** (new) — `MatchState`, `PlayerState`, `FireIntent`, and the reducer `resolveFire(state, intent) → { next, ShotResult }` that wraps `sim/engine.fire`.
2. Refactor **`src/game/main.ts`** — drop the module-global vars (`redBusy`, `bluePlayerPos`, …) and drive everything from a single `MatchState`.
3. **`ui/LobbyScreen.ts`** — team assignment (RED/BLUE, 1–5 each), N players, ready states.
4. **`game/configRouter.ts`** — carry `room`, `role`, and team sizes in the hash.

`World.targets` is **already an array**, so 2–10 players / teams works the moment `resolveFire` builds the world with "all living enemies" as targets. That's why this is a game-layer refactor, not an engine change.

## Recommendation

Build the **shared spine** → ship **A** to play with friends this week → graduate to **B** when you want it to be a durable product (fairness, reconnect, spectators, anti-cheat, and a clean path to accounts/matchmaking). **B** is where the original §3 "pure deterministic engine" decision finally pays off: the engine imports into Node unchanged. Keep **C** in your pocket as a bandwidth optimization (or a hybrid escape-hatch on top of B) if you ever want large spectator counts.

## On the React Native / iPad idea

Stay on the web. The current PixiJS + MathQuill app already runs in iPad Safari; RN would force a full rewrite of rendering, math input, and networking for little gain when the delivery model is "open a link." Revisit only if you specifically want App Store distribution.
