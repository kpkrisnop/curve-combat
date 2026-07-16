# Handoff — F2 · Always play from the left (per-team view mirror)

**You are picking this up cold in a fresh session on the CurveCombat repo.**
Read this whole file, then the linked ADR, then start with the prototype step —
do **not** jump straight to implementation. This is the architecturally
sensitive one; the world-frame invariant below is load-bearing.

## What CurveCombat is (orientation)

Browser game: two teams (RED, BLUE) fire `y = f(x)` curves across a
planet-scattered arena. React + TS + Vite client, Pixi.js canvas, authoritative
WebSocket server for online play. Read `CLAUDE.md` (root) and `CONTEXT.md`
(glossary) first. Key existing facts:

- **`src/sim/`** is pure, deterministic, Node-safe — it runs identically on the
  server and every client. The server is the source of truth for online
  matches. Do not leak view concerns into it.
- **A fired curve is anchored to the shooter**, not to world coords
  (`src/sim/trajectory.ts`: `yOffset = soldier.y - fn(soldier.x)`), and marches
  world-x in `soldier.dir`. RED sits at negative x with `dir=+1` (fires
  rightward); BLUE sits at positive x with `dir=-1` (fires leftward).
- Rendering/camera: `src/game/GameRenderer.ts` (grid/axes/planets/badges/
  trajectory) and `src/app/arena/` + `Camera.ts`.

## The decision (already made — don't relitigate)

Full rationale: **`docs/adr/0008-per-team-play-perspective.md`**. Summary:

- Every viewer plays **from the left, firing rightward** — the experience RED
  has today. For a viewer on the world-right team (BLUE by default), the client
  **reflects the world about `x = 0`** (`x → -x`): perspective, x-axis
  numbering, planets, craters, enemy — all mirror.
- This is a **presentation transform only.** `sim` and the server stay in one
  un-mirrored **world frame**. The mirror lives entirely on the viewing client,
  applied at exactly two sites that must use the _same_ reflection:
  1. **Equation in:** player types `g(x)` in their view frame; since
     `x_world = -x_view`, substitute `x → -x` into the parsed function before
     it reaches the fire path. Vertical anchoring (`yOffset`) is unchanged.
  2. **Render out:** reflect the world→screen mapping about world `x = 0` so
     the world-frame trajectory, planets, and axis labels draw in the view
     frame.
- Reflect about `x = 0` (not the shooter): the two spawn columns are symmetric
  about the origin, so BLUE (`+X`) maps exactly onto RED's position (`-X`) and
  the axis numbering stays centered.

### Perspective rules (who sees what)

- **Online** (turn-based AND No-Turn): each client renders its **own team's**
  perspective, fixed for the whole match. No per-turn flipping. No-Turn needs
  no special case (each device is one team).
- **Local hotseat** (one shared screen): the active player alternates, so the
  **entire view flips horizontally each turn**, always showing the current
  shooter on the left.
- **Spectators** (no team): canonical **RED-left, un-mirrored**.
- **Waiting on opponent** (online turn-based): your view stays in _your_ frame.

## STEP 1 — Prototype in a real browser FIRST (required)

Two things must be _felt_, not reasoned about:

1. **The hotseat per-turn flip.** Does mirroring the whole arena every turn feel
   coherent or disorienting? What transition (instant vs. animated flip) makes
   it read as "now it's your turn, you're on the left"?
2. **Equation phase after `x → -x` substitution.** Fire the same function as
   both teams and confirm the mirrored player's curve behaves the way they
   expect writing-from-the-left, and that the drawn curve passes exactly through
   the drawn soldier (the two reflection sites agree).

Run: `npm run dev` (client), `npm run server` (WebSocket, port 3001) for online.
Prototype cheaply — a spike behind a flag or a throwaway branch is fine; the
goal is to answer the two questions above before committing to the real
implementation. Consider the `prototype` skill if available.

## STEP 2 — Implement (after the prototype)

Likely touch points (confirm against live code):

- `src/game/GameRenderer.ts` / `Camera.ts` — reflected world→screen mapping for
  a mirrored viewer. Grid/axes/planets/trajectory/badges all inherit it.
  `drawStatic()` (~line 292) and `toScreen`/`worldToScreenX` are the seams.
- The **client** fire path — substitute `x → -x` on the parsed function for a
  mirrored viewer, BEFORE the world-frame `fn` reaches `sim`. Find where the
  client turns field LaTeX into the fired function (`src/game/resolveFire.ts`,
  `src/net/NetworkGame.ts`, `src/game/LocalGame.ts`).
- Hotseat turn handling — flip the viewer's team each turn (`src/app/hud/`
  HUD/turn wiring; `FiringConsole.tsx` routes the active team).
- A single well-named helper for "is this viewer mirrored?" + the reflection,
  so both sites can't drift apart.

## Conventions & guardrails (from CLAUDE.md)

- **TDD.** Colocated `*.test.ts(x)` (Vitest). Write the failing test first.
- `npm test` (suite is **flaky under parallel load** on this cloud-synced FS —
  re-run a file alone before calling a failure a regression). One file:
  `npx vitest run <path>`.
- Client typecheck/build: `npm run build`. **Server typecheck is separate** —
  if you touch anything under `server/`, also run
  `npx tsc -p server/tsconfig.json`. (You should NOT need server changes — if
  you do, the mirror has leaked out of the client; stop and reconsider.)
- Online is **server-authoritative**: match phase/turns/state come from server
  messages. The client renders them; it must not self-advance authoritative
  state. The mirror is pure presentation on top of that.
- Keep `sim` Node-safe and deterministic. **Verify in a real browser** — the
  bug classes here (render timing, turn state, mirror agreement) are ones the
  unit suite misses.

## The one invariant to never break

`sim` and `server` only ever see **world-frame** functions and world-frame
results. If a test or a feature makes you want to pass a mirrored function or
mirrored coordinate into `sim`, you've taken a wrong turn — clients that mirror
differently would desync. The mirror is a client edge concern, full stop.

## Definition of done

- Each online client shows its own team on the left; sim/server untouched and
  still world-frame; two clients stay in sync.
- Hotseat flips coherently each turn (transition chosen from the prototype).
- Spectators see canonical RED-left.
- The drawn curve passes through the drawn soldier for a mirrored viewer (both
  reflection sites agree) — covered by a test.
- Prototype findings on the flip UX + phase feel recorded.
