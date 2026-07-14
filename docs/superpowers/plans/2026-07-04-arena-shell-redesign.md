# Arena Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the pre-game and in-game arena UI (Local + Online) as one CSS grid-of-cards shell with a full-bleed grid, drawn play boundary, on-map name badges, a full-width footer, a fixed config gear, and collapse the online entry flow onto the landing page.

**Architecture:** Design spec `docs/superpowers/specs/2026-07-04-arena-shell-redesign-design.md` is authoritative — read it first. Most logic already exists (§13): collision already resolves against `world.bounds`; `switchTeam`/`rerollArena` messages exist; `fitContain` derives scale. Net-new = one protocol message (`setName`), one server refactor (`relayout`), and client render/layout work. The lo-fi layout reference is `scratchpad/curvecombat-wireframes.html` (delete on integration).

**Tech Stack:** React + TypeScript, Vite, Pixi.js (arena/graph renderers), Zustand-style stores, `ws` server (`server/`), Zod protocol schemas, Vitest + @testing-library/react.

## Global Constraints

- Tests: `npm test` (= `vitest run`); single file: `npx vitest run <path>`; single test: `npx vitest run <path> -t "<name>"`.
- Build / typecheck gate: `npm run build` (= `tsc --noEmit && vite build`). Must pass before a task is "done".
- Phones gated at ≥1024px landscape (`PhoneGate`) — design desktop/landscape only.
- One shared gutter token (GAP) reused as grid `gap` AND page padding — every gap equal.
- Single source of truth: the drawn boundary rectangle == the `bounds` the sim collides against (`boundsFromMap(config.map)`). Never a separate constant.
- Empty sides are legal (no minimum-per-side guard). Any roster change → full terrain+position reroll.
- Follow existing file/test patterns. Do not restructure unrelated code.

## Loop Engineering (execution protocol)

- **Architecture:** Manager (orchestrator) + Helpers (one subagent per task).
- **Per-task inner loop:** Reason (read named files + spec section) → Act (TDD: failing test → impl) → Observe (run the task's tests + `npm run build`).
- **Stop condition (checkable):** the task's tests pass AND `npm run build` passes.
- **Hard cap:** 3 attempts per task, then escalate to the manager with the failing output.
- **Maker-Checker:** Tasks A1, A2, B1 (server/protocol + collision-render, high stakes) get an independent code-review pass before their commit is accepted.
- **Logging/memory:** check the task's boxes as steps complete; record any deviation in a note under the task.

## Execution order & parallelism

- **Phase A (server)** and **Phase C (shell CSS)** touch disjoint trees (`server/` vs `src/app`) → may run in parallel.
- **Phases B, C, D, E** all touch `src/app` frontend (ArenaStage, hud.css, OnlineFlow) → run **sequentially** to avoid merge conflicts: B → C → D → E.
- **E2/E3 depend on A1/A2** (need `setName` + reroll-on-change). Do Phase A before Phase E.

Recommended sequence: A1, A2 → B1, B2 → C1, C2, C3 → D1, D2, D3 → E1, E2, E3.

---

## Phase A — Server & protocol

### Task A1: `setName` message — rename in room

**Files:**
- Modify: `src/net/protocol.ts` (add `setName` to client schema)
- Modify: `server/roomManager.ts` (add `setName` method)
- Modify: `server/index.ts` (route `setName` → `roomManager.setName` → broadcast `lobbyState`)
- Test: `src/net/protocol.test.ts`, `server/roomManager.test.ts`

**Interfaces:**
- Produces: client message `{ type: "setName", name: string }`; `RoomManager.setName(code: string, playerId: string, name: string): void` (updates `player.name`; empty/whitespace → keep existing/default).

- [ ] **Step 1: Write failing protocol test** in `src/net/protocol.test.ts`:

```ts
it("parses a setName client message", () => {
  const msg = { type: "setName", name: "Ada" };
  expect(clientSchema.parse(msg)).toEqual(msg);
});
```

- [ ] **Step 2: Run — expect FAIL** `npx vitest run src/net/protocol.test.ts -t "setName"` (unknown discriminator).

- [ ] **Step 3: Add schema** in `src/net/protocol.ts` next to `switchTeam`:

```ts
const setName = z.object({ type: z.literal("setName"), name: z.string() });
```
and add `setName` to the `clientSchema` discriminated union list.

- [ ] **Step 4: Run — expect PASS** (same command).

- [ ] **Step 5: Write failing roomManager test** in `server/roomManager.test.ts`:

```ts
it("setName updates the player and ignores blank", () => {
  const rm = new RoomManager();
  const { room, playerId } = rm.join("ROOM", "default-1");
  rm.setName("ROOM", playerId, "Ada");
  expect(room.players.find(p => p.id === playerId)!.name).toBe("Ada");
  rm.setName("ROOM", playerId, "   ");
  expect(room.players.find(p => p.id === playerId)!.name).toBe("Ada");
});
```
(Adjust to the real `join` return shape / room lookup used elsewhere in the file.)

- [ ] **Step 6: Run — expect FAIL** `npx vitest run server/roomManager.test.ts -t "setName"`.

- [ ] **Step 7: Implement `setName`** in `server/roomManager.ts` (mirror `switchTeam` guards):

```ts
setName(code: string, playerId: string, name: string): void {
  const room = this.rooms.get(code);
  if (!room) throw new Error("no such room");
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("unknown player");
  const trimmed = name.trim();
  if (trimmed.length > 0) player.name = trimmed.slice(0, 24);
}
```

- [ ] **Step 8: Run — expect PASS.**

- [ ] **Step 9: Route in `server/index.ts`** — in the client-message switch, add a `setName` case that calls `roomManager.setName(...)` then broadcasts `lobbyState` (copy the broadcast pattern used by `switchTeam`).

- [ ] **Step 10: Full gate** `npm test && npm run build`. Then **code-review** this task before commit.

- [ ] **Step 11: Commit** `git add -A && git commit -m "feat(net): setName message — rename in room"`.

### Task A2: `relayout` — reroll on every roster change

**Files:**
- Modify: `server/roomManager.ts` (extract `relayout`; call on join/switchTeam/removePlayer; keep `reroll` host-gated wrapper)
- Modify: `server/index.ts` (broadcast `lobbyState` after those mutations if not already)
- Test: `server/roomManager.test.ts`

**Interfaces:**
- Consumes: existing seed logic in `reroll` (fresh round-1 seed).
- Produces: `RoomManager.relayout(code: string): void` (picks a new round-1 seed, **not** host-gated). `reroll(code, byPlayerId)` keeps the `ownerId` check then delegates to `relayout`.

- [ ] **Step 1: Write failing test** — switching sides changes the round-1 seed:

```ts
it("switchTeam triggers a relayout (new seed) and allows emptying a side", () => {
  const rm = new RoomManager();
  const { playerId } = rm.join("ROOM", "p1");            // lands on a team
  const before = rm.roundSeed("ROOM");                    // helper: expose current round1 seed
  rm.switchTeam("ROOM", playerId, "blue");
  expect(rm.roundSeed("ROOM")).not.toBe(before);
  // side left behind is now empty — must not throw
});
```
(If no seed accessor exists, add a minimal `roundSeed(code)` getter or assert via the broadcast layer per existing test style.)

- [ ] **Step 2: Run — expect FAIL** `npx vitest run server/roomManager.test.ts -t "relayout"`.

- [ ] **Step 3: Extract `relayout`** from the body of `reroll` (the seed-refresh portion, lines ~166-209), remove the `ownerId` check from it, and have `reroll` do `if (room.ownerId !== byPlayerId) throw ...; this.relayout(code);`. Call `this.relayout(code)` at the end of `join`, `switchTeam`, and the player-removal path. Guard: do not relayout once `room.engine !== null` (match started).

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Ensure broadcasts** — in `server/index.ts`, confirm join/switchTeam/leave each broadcast `lobbyState` carrying the current seed+config so clients re-preview.

- [ ] **Step 6: Full gate** `npm test && npm run build`. Then **code-review** before commit.

- [ ] **Step 7: Commit** `git add -A && git commit -m "feat(server): relayout — reroll terrain+positions on any roster change"`.

---

## Phase B — Sim / render

### Task B1: Draw world boundary + grid to viewport (arena renderer)

**Files:**
- Modify: the arena renderer that draws planets/bounds (`src/game/GameRenderer.ts`; grid draw pattern in `src/graph/GraphRenderer.ts:171` `drawGrid`).
- Test: colocated renderer test (follow `src/game/*.test.ts` pattern) or a pure geometry test.

**Interfaces:**
- Consumes: `boundsFromMap(config.map)` (`src/sim/planetScatter.ts`), `fitContain(map, canvasW, canvasH)` (`src/sim/fitRect.ts`).
- Produces: a `drawBoundary()` that strokes the rect at `fitContain`-mapped `bounds` corners; grid fills the full canvas (already true in `GraphRenderer.drawGrid`).

- [ ] **Step 1: Read** the spec §4 + §13.1, `src/sim/fitRect.ts`, `src/sim/planetScatter.ts` (`boundsFromMap`), and the current arena renderer to find where planets are drawn.

- [ ] **Step 2: Write failing geometry test** asserting the drawn rect corners equal `fitContain` applied to bounds corners:

```ts
it("boundary rect maps sim bounds through fitContain", () => {
  const map = { width: 24, height: 14 } as MapConfig;      // use real MapConfig shape
  const t = fitContain(map, 800, 600);
  const b = boundsFromMap(map);
  const topLeft = worldToScreen(t, { x: b.minX, y: b.maxY });
  expect(topLeft.x).toBeGreaterThanOrEqual(0);
  // assert the 4 corners equal the transform applied to bounds corners
});
```
(Use the renderer's actual world→screen helper; if none is exported, export a pure `boundaryRectPx(map, canvasW, canvasH)` and test that.)

- [ ] **Step 3: Run — expect FAIL** `npx vitest run <test path> -t "boundary rect"`.

- [ ] **Step 4: Implement** `drawBoundary()` (stroke a rect at the fitContain-mapped bounds; neutral placeholder style, KP restyles later) and ensure the grid layer covers the whole canvas, not just the bounds. Call it in the draw loop after the grid, before planets.

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: Full gate** `npm test && npm run build`. Then **code-review** (single-source-of-truth: rect == sim bounds).

- [ ] **Step 7: Commit** `git add -A && git commit -m "feat(render): draw play boundary rect; grid fills viewport"`.

### Task B2: Resize reflow (ResizeObserver → recompute)

**Files:**
- Modify: `src/app/arena/ArenaStage.tsx` (observe the map card; feed new size to renderer).
- Modify: arena renderer (accept a resize → recompute `fitContain` → redraw).
- Test: `src/app/arena/*.test.ts(x)` or a renderer unit test that recompute changes the transform.

**Interfaces:**
- Consumes: B1's `fitContain`-based boundary; canvas element size.
- Produces: renderer `resize(canvasW, canvasH)` recomputes transform + redraws.

- [ ] **Step 1: Write failing test** — calling `resize` with new dims changes the mapped boundary rect (recomputed via fitContain).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** a `ResizeObserver` on the map-card element in `ArenaStage.tsx` that calls `renderer.resize(w, h)`; renderer recomputes `fitContain` and redraws grid+boundary+planets+dots.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(render): recompute fit on map-card resize"`.

---

## Phase C — Shell layout (grid of cards)

**Reference:** port structure/CSS from `scratchpad/curvecombat-wireframes.html` (`.comp`, `.gear`, grid template). Read spec §3, §5, §6.

### Task C1: Arena shell as CSS grid

**Files:**
- Modify: `src/app/arena/ArenaStage.tsx`, `src/app/hud/hud.css` (grid container + card classes).
- Test: `src/app/arena/ArenaStage.test.tsx` (render → assert grid regions present).

**Interfaces:**
- Produces: a shell with `grid-template-columns: 1fr` (closed) / `1fr <panel>` (open); `grid-template-rows: minmax(0,1fr) minmax(<footerMin>,auto)`; `padding: GAP; gap: GAP`. Slots: `map` (col 1 / row 1), `panel` (col 2 / row 1), `footer` (col 1 / -1 / row 2).

- [ ] **Step 1: Write failing test** — shell renders map, footer regions with the grid class; footer spans full width. Query by role/test-id.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the grid container + `.comp` card classes (rounded, one shared GAP). Map card background transparent (grid shows through); footer/panel opaque. Add the drawn boundary from B1 inside the map card.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(app): arena shell as CSS grid of cards"`.

### Task C2: Fixed config gear + settings as grid column

**Files:**
- Modify: `src/app/arena/ArenaStage.tsx`, `src/app/screens/ConfigPanel.tsx`, `hud.css`.
- Test: `src/app/screens/ConfigPanel.test.tsx` / ArenaStage test.

**Interfaces:**
- Consumes: C1 grid. Produces: fixed squircle gear at constant top-right screen position; toggling opens the SIDE PANEL as the second grid column (map column shrinks; gutters stay equal); panel reserves a top strip so the gear sits on it. Gear present pre-game only.

- [ ] **Step 1: Write failing test** — gear toggles a `settingsOpen` state; when open the grid has a second column and the panel is present; gear DOM position does not depend on open/closed (same style).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** — move Start OUT of ConfigPanel (it goes to footer, Task C3). Gear = icon-only squircle fixed top-right. Panel = grid column 2 with reserved top padding. Keep existing ConfigPanel field groups + Reroll.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(app): fixed config gear; settings as grid column"`.

### Task C3: Footer component (all states)

**Files:**
- Create: `src/app/hud/Footer.tsx` (absorb Start/input from `HudBar.tsx`).
- Modify: `src/app/arena/ArenaStage.tsx`, `src/app/hud/HudBar.tsx` (retire/fold), `hud.css`.
- Test: `src/app/hud/Footer.test.tsx`.

**Interfaces:**
- Produces: `<Footer mode="pregame-local"|"pregame-online"|"ingame" isHost hasInput ... />`. Pre-game local: `[Start]`. Pre-game online host: `[Start] | [Name] [Switch] | [Copy code][Copy link]`. Non-host: Start replaced by `Waiting for host…`. In-game: centered `[input][Fire]`. Footer row is `minmax(min,auto)` (grows for tall input).

- [ ] **Step 1: Write failing tests** — one per mode asserting the right controls: host shows Start; non-host hides Start and shows "Waiting for host…"; in-game centers input+Fire and shows no Start/name/switch.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `Footer.tsx` per interface; wire it into the shell footer slot; move the equation input (`MathField.tsx`) here for in-game.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(app): full-width footer for all arena states"`.

---

## Phase D — Badges & status

### Task D1: On-map name badges (retire roster columns)

**Files:**
- Modify: `src/app/hud/TeamStrip.tsx` → per-dot badge rendering; remove `src/app/screens/RosterColumns.tsx` from the shell.
- Modify: arena renderer / overlay layer to anchor badges to soldier dots (badge excluded from hitbox).
- Test: badge component/overlay test.

**Interfaces:**
- Consumes: roster from `lobbyState` (online) / local layout (`src/game/localLayout.ts`). Produces: a badge per soldier anchored to its dot; `size="lg"` pre-game, `size="sm"` in-game; badge geometry excluded from hit detection.

- [ ] **Step 1: Write failing test** — given a roster of N, N badges render with the right names/teams; badge is not part of the hitbox set.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** per-dot badges; remove RosterColumns from the arena shell.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(app): name badges on soldier dots; retire roster columns"`.

### Task D2: HP badge health bar

**Files:**
- Modify: badge component (from D1).
- Test: badge test.

**Interfaces:**
- Consumes: player HP (HP mode). Produces: badge shows a mini filled health bar + numeric HP when HP mode is on; hidden otherwise.

- [ ] **Step 1: Write failing test** — HP mode on → badge contains a bar element sized to HP% AND the numeric value; HP mode off → neither.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the mini bar + number.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(app): HP health bar in name badge"`.

### Task D3: Round status top-center (in-game)

**Files:**
- Modify: `src/app/hud/Overlays.tsx` (standalone top-center element).
- Test: `src/app/hud/*.test.tsx`.

**Interfaces:**
- Consumes: match/round state (`src/game/matchState.ts`). Produces: a standalone top-center status element (not a bar), in-game only.

- [ ] **Step 1: Write failing test** — in-game renders a top-center round-status element with round/score text; not rendered pre-game.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the element.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(app): standalone top-center round status"`.

---

## Phase E — IA / landing & name wiring

### Task E1: Remove online page; inline Create/Join on landing

**Files:**
- Modify: `src/app/screens/LandingScreen.tsx` (inline Create/Join under Play Online).
- Delete: `src/app/screens/OnlineChoice.tsx` (+ its test); rewire `App.tsx` routing.
- Reuse: `src/app/screens/JoinRoom.tsx` for the join-code input.
- Test: `src/app/screens/LandingScreen` test.

**Interfaces:**
- Produces: clicking Play Online expands an inline panel with Create Room + Join(code); the `/#online` route/page is gone. No name entry here.

- [ ] **Step 1: Write failing test** — Play Online toggles an inline panel containing Create + Join; landing has no name field; `#online` no longer resolves to OnlineChoice.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** inline panel; delete `OnlineChoice.tsx` + test; update `App.tsx` so `#online` (if kept) redirects to landing-with-panel-open, or is removed.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(app): inline Create/Join on landing; remove online page"`.

### Task E2: Name in room footer → setName (needs A1)

**Files:**
- Modify: `src/app/net/nickname.ts` (default on join), `src/app/screens/OnlineFlow.tsx` / net store (dispatch `setName`), `Footer.tsx` (name input).
- Test: OnlineFlow / Footer test.

**Interfaces:**
- Consumes: A1 `setName` message; `lobbyState` names. Produces: join sends default nickname; footer name input dispatches `setName` (debounced); badges reflect the updated name from `lobbyState`.

- [ ] **Step 1: Write failing test** — typing in the footer name input dispatches a `setName` message; a URL-joiner starts with a default nickname.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** default-nickname-on-join + debounced `setName` from footer.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(app): set name from room footer"`.

### Task E3: Switch-side in footer + reroll-on-change client (needs A2)

**Files:**
- Modify: `Footer.tsx` (switch control), `src/app/net/netLobbyStore.ts` (apply relayout'd `lobbyState`), `src/app/net/arenaPreview.ts` (re-preview on new seed).
- Test: `src/app/net/netLobbyStore.test.ts`.

**Interfaces:**
- Consumes: A2 relayout (server sends new seed in `lobbyState` on any change). Produces: footer Switch dispatches `switchTeam`; store re-previews terrain+positions from the new `lobbyState` seed; empty sides allowed.

- [ ] **Step 1: Write failing test** — a `lobbyState` with a new seed re-runs `buildArenaPreview` (new terrain+positions); Switch control dispatches `switchTeam`.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** store re-preview on seed change + footer Switch dispatch.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Gate** `npm test && npm run build`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(app): switch side in footer; re-preview on reroll"`.

---

## Self-Review (spec coverage)

- §3 shell grid → C1. §4/§13.1 boundary+grid → B1. §5 footer → C3. §6 gear+panel → C2.
- §7 badges → D1; HP bar → D2. §8 side-switch+reroll → A2 (server) + E3 (client). §9 round status → D3.
- §10 remove online page → E1; name-in-room → A1 + E2. §11 retire roster columns → D1.
- §13.1 collision (no change, render only) → B1. §13.2 relayout → A2. §13.3 setName → A1+E2. §13.4 resize → B2.
- Out of scope (§14): post-match summary, map transition animation, final styling — no tasks (correct).

All spec sections map to a task. No placeholders remain that block a helper (UI-internal tasks direct the helper to read the named current file + spec section + the prototype, which is the intended Manager+Helpers context-gathering step).
