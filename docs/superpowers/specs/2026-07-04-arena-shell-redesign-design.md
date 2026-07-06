# Arena Shell Redesign (Pre-game + In-game, Local + Online) — Design Spec

**Date:** 2026-07-04
**Branch:** `feature/frontend-redesign-p3`
**Status:** Approved design — ready for implementation plan
**Related:** ADR 0001 (React UI rebuild), ADR 0002 (NvN two-team model),
ADR 0003 (arena-as-waiting-room). Extends `2026-07-01-arena-settings-panel-design.md`
(map-size semantics) and revises its render model (see §4).
Source of truth for layout: throwaway prototype
`scratchpad/graphwar-wireframes.html` (delete on integration).

---

## 1. Problem & Goal

The current lobby/match UI has structural bugs (from `MY_VISUAL_UI_REVIEW.md`):

- The arena config panel floats **over** the map and overlaps it.
- The scaled-down map has **unequal letterbox padding**.
- The landing → online flow has a dead-end `/#online` page where name entry is
  impossible for URL-joiners.
- Start Match lives **inside** the settings panel (hidden when panel is closed).
- Name tags are unclear; side-switching and reroll behaviors are incomplete.
- In-game UI is lop-sided with unclear status.

**Goal:** one consistent **grid-of-cards shell** shared by all four arena states
(Pre-game Local, Pre-game Online, In-game Local, In-game Online), with a full-bleed
spacetime grid, an explicitly drawn world boundary, name badges on soldiers, a
full-width footer, and a fixed arena-config gear. Collapse the online entry flow onto
the landing page.

This is a UI/layout redesign. It does **not** change the netcode, generator, or match
rules — only where things render and how state changes are triggered.

---

## 2. Design Principles

1. **One shell, four states.** Pre-game and In-game are the same grid; In-game simply
   drops the settings affordance and swaps the footer contents.
2. **Grid of cards.** MAP, optional SIDE PANEL, and FOOTER are rounded-rectangle
   component cards on a CSS grid. **One gutter value** is reused as the grid `gap`
   **and** the page padding, so every gap — between cards and from cards to the page
   edge — is equal.
3. **Grid ≠ boundary.** The spacetime grid is ambient and fills the viewport to every
   edge; the **play boundary** is a drawn rectangle, decoupled from the screen edge.
4. **Fixed chrome.** The arena-config gear sits at a constant screen position and never
   moves with the map.
5. **Resize-ready.** Tall equations must be accommodated: the footer/input can grow and
   the map shrinks to fit.
6. **Phones gated.** `PhoneGate` already blocks < 1024px / portrait, so only a
   desktop/landscape layout is designed.

---

## 3. Layout Shell (arena pages)

CSS grid on a full-viewport container:

```
padding = GAP ; gap = GAP            (GAP is a single shared token, ~16–18px)
grid-template-columns:  1fr                      (settings closed)
                        1fr  <panelWidth>        (settings open)
grid-template-rows:     minmax(0, 1fr)           (MAP row — shrinks to fit)
                        minmax(<footerMin>, auto)(FOOTER row — grows for tall input)
```

- **MAP card** — `grid-column: 1`, `grid-row: 1`. Transparent background so the grid
  shows through. Contains the drawn world boundary + soldiers/badges + (in-game) the
  round-status element.
- **SIDE PANEL card** — `grid-column: 2`, `grid-row: 1`. Only present when settings are
  open. Because it is a real grid column, the map column **shrinks in width** (height
  unchanged) and **all gutters stay equal** — the panel never overlaps map or footer.
- **FOOTER card** — `grid-column: 1 / -1`, `grid-row: 2`. Spans the full width beneath
  both columns.

The spacetime grid backdrop is a full-bleed layer **behind** the cards. Raise its
line opacity from today's near-invisible value until it clearly reads (fixes Landing
issue #1 too, since it's the same backdrop).

---

## 4. MAP: grid vs. boundary (revises the settings-panel spec)

Prior model (`2026-07-01-arena-settings-panel-design.md`): the fixed world rectangle is
scaled contain-fit and **only that rectangle's grid is drawn** — different devices see
letterboxing.

**New model:**

- The world is still a logical `width × height` rectangle scaled uniformly (contain-fit)
  to determine its **on-screen size** — geometry stays identical across devices.
- The **spacetime grid now paints the entire viewport**, extending past the world
  rectangle to every screen edge (no letterbox gaps; fixes Play-Local issue #2b).
- A **solid rectangle is drawn** at the scaled world bounds. This rectangle **is** the
  play boundary: **bullets collide with it**, not with the screen edge. Collision
  **already** resolves against this rectangle in the sim — this is a render change only
  (see §13.1). Style TBD by KP.
- The map is **fixed in place** — no pre-game ↔ game transition animation for now
  (revisit once stable).

---

## 5. FOOTER

Full-width card, bottom row. Left-aligned groups in pre-game; centered in-game.

**Pre-game Local:** `[ ▶ Start Match ]` only. (No name/switch/copy — those are online.)

**Pre-game Online — host:**
`[ ▶ Start Match ] │ [ Name input ] [ ⇄ Switch side ] │ [ ⧉ Copy code ] [ ⧉ Copy link ]`

**Pre-game Online — non-host:** identical **except Start is hidden**, replaced by a
`⏳ Waiting for host…` affordance. Name / Switch / copy remain.

**In-game (Local + Online):** `[ equation input (MathQuill) ] [ ▶ Fire ]`,
**centered horizontally**. No name/switch/copy, no Start.

**Resize:** the footer row is `minmax(footerMin, auto)`, not fixed. When a tall equation
needs more input height, the input and footer grow and the map row shrinks to fit. The
map, footer, and input must all handle this reflow cleanly.

This removes the current online **header** entirely (replaced by the footer) and moves
Start Match **out of** the settings panel (fixes Online-room issue: "Start is in the
settings panel").

---

## 6. SIDE PANEL + fixed gear (arena config)

- **Gear:** a single **fixed squircle** button (gear icon only) pinned at a constant
  **top-right screen position**. It does **not** move with the map card and is present
  in pre-game only (Local + Online). It is the only affordance to open/close settings.
- **Panel open:** the SIDE PANEL becomes the second grid column. It opens **beneath the
  fixed gear**; the panel **reserves a top strip** so the gear sits perfectly on top of
  the panel. The gear's screen position is identical open or closed.
- **Panel contents:** keep today's `ConfigPanel` groups as-is for now (mode, rounds,
  turn timer, map w/h, planet ranges, spawn clearance, count, seed) plus **Reroll**.
- **Reroll** regenerates **terrain AND all player positions** (see §8).
- Online panel and Local panel are **visually identical** (online may keep read-only /
  host-gated fields per existing `ConfigPanel readOnly` behavior).

---

## 7. Name badges + HP bar

- Every soldier renders as a **dot on the map** with a **name badge** anchored to it.
- Badge is **larger in pre-game**, **smaller in-game**. Badges are **excluded from the
  hitbox**.
- When a player joins, their dot appears on the map immediately.
- **HP mode:** the badge additionally shows a **mini health bar** (a small filled bar)
  **plus** a numeric HP value — not a number alone.

---

## 8. Side-switching + reroll coupling (settled)

- A player may **switch sides at any time in the lobby**, even if the side they leave
  becomes empty (some prefer to write equations from the other perspective). The switch
  control lives in the footer (§5).
- **Every roster change reroll rule:** any change to the roster — **join, leave, or
  switch side** — triggers a **full reroll of terrain AND all player positions**, so the
  layout always matches the current NvN (e.g. a `0v2` can arise transiently and the map
  re-fits). Reroll is also available manually from the panel.
- Because the map is expected to churn, keep the map **fixed in place** (§4) so a reroll
  reads as a clean swap, not a jarring re-layout.

---

## 9. In-game specifics

- **Round status** is a **standalone element, top-center** of the map (not a bar).
- HP mode shows the health bar in badges (§7).
- Footer = centered input + Fire (§5).
- No gear / no settings column.

---

## 10. Information architecture: remove the online page

- **Delete the standalone `/#online` choice page.** On the landing page, clicking
  **Play Online** reveals an **inline panel directly beneath the two buttons** with
  **Create Room** and **Join (code input)**. Collapsible.
- **Name entry moves off the landing/join flow and into the room footer** (§5). This
  fixes the URL-joiner bug (URL joiners never saw a name field): both button-joiners and
  URL-joiners land in the room and set their name there. Use the existing nickname
  default until they type one.

---

## 11. Roster presentation (confirmed)

The separate side **roster columns are removed**; every player is represented as a
**dot-with-badge on the map** (§7). `RosterColumns` is retired from the arena shell.
(Switch/host indication moves to the footer + badges.)

---

## 12. Impacted files (indicative, not a plan)

| Area | Files |
| --- | --- |
| Landing + online entry | `LandingScreen.tsx`; **delete** `OnlineChoice.tsx`; fold Create/Join into landing (reuse `JoinRoom.tsx`) |
| Shell / grid layout | `ArenaStage.tsx`, `LocalFlow.tsx`, `OnlineFlow.tsx`, `hud/hud.css` |
| Footer | new footer component; absorb `HudBar.tsx`; move Start/name/switch/copy here |
| Settings gear + panel | `ConfigPanel.tsx` (contents) + new fixed-gear + grid-column wiring |
| Map render (grid + boundary) | renderer (`arena/rendererSingleton.ts` / `GameRenderer`); collide against existing `bounds` (§13.1) |
| Badges + HP bar | `TeamStrip.tsx` → per-dot badges; retire `RosterColumns.tsx` |
| Name in room | new `setName` in `net/protocol.ts` + `server/roomManager.ts`; footer input; `net/nickname.ts` default (§13.3) |
| Reroll on any change | `server/roomManager.ts` `relayout` + call sites (§13.2); client re-preview via `net/arenaPreview.ts` |
| Input resize | `MathField.tsx`, footer + grid row sizing; ResizeObserver → `sim/fitRect.ts` (§13.4) |
| Round status | `hud/Overlays.tsx` (top-center element) |

---

## 13. Logic & wiring (design)

These are the non-UI changes the shell implies. Most are **small deltas on existing
infrastructure** — stated per item as current → delta → where → tests. Net-new surface
is small: one protocol message (`setName`), one server refactor (`relayout` + call
sites), and client render/resize work. **Collision needs no change.**

### 13.1 World-boundary collision — already exists (render-only change)

- **Current:** `detectCollision` (`src/sim/collision.ts`) already resolves bullet exits
  against `world.bounds` — a world-coord `Bounds` rect — via `segmentExitT`/`inside`.
  Bounds come from `boundsFromMap(config.map)` (`src/sim/planetScatter.ts`). Collision is
  already decoupled from the screen edge.
- **Delta (render):** the renderer must (a) paint the spacetime grid across the whole
  viewport, and (b) draw the `boundsFromMap(config.map)` rectangle at its
  `fitContain(...)`-scaled position as the visible boundary. **Single source of truth:**
  the drawn rectangle MUST be the same `bounds` the sim collides against — never a
  separate constant.
- **Tests:** drawn rect corners == `fitContain(bounds corners)`; grid layer covers the
  viewport beyond the rect.

### 13.2 Reroll on any roster change (server) — messages exist, behavior is the delta

- **Current:** protocol has `switchTeam` + `rerollArena`. `roomManager.switchTeam` only
  sets `player.team` (it already lets the source side empty — matches §8) and caps the
  target at `TEAM_CAP`. `roomManager.reroll` is **host-only** and picks a fresh round-1
  seed. Layout/positions are derived deterministically from seed + counts
  (`buildArenaPreview` / `MatchEngine.layout`).
- **Delta:** extract an internal `relayout(room)` (new round-1 seed → recompute) out of
  `reroll`, and call it after **every** roster mutation — `join`, `switchTeam`, and
  player removal/leave — then broadcast `lobbyState` (new seed + config + roster). This
  is server-internal and **not** host-gated; the host's manual `rerollArena` is the same
  `relayout` but keeps its ownership check **on the message handler only**.
- **Fork resolved:** internal relayout (any roster change) vs host-gated manual reroll →
  one shared `relayout`, gate only the manual message. No minimum-per-side guard (empty
  sides are legal, §8).
- **Tests:** `switchTeam` changes seed + rebroadcasts; join/leave trigger `relayout`;
  manual `rerollArena` stays host-only; transient `0v2` layouts are valid.

### 13.3 Name in room (protocol addition)

- **Current:** `join` carries `name`; `lobbyState.players[]` carries `name`; a default
  nickname generator exists (`src/app/net/nickname.ts`). No rename-in-room message.
- **Delta:** since name entry moves off the pre-join flow (§10), `join` sends the default
  nickname; add a `setName { name }` client message → `roomManager.setName` → update
  `player.name` → broadcast `lobbyState`. The footer name input (§5) dispatches
  `setName` (debounced). Badges read names from `lobbyState`.
- **Tests:** `setName` updates + rebroadcasts; empty/whitespace falls back to default;
  a URL-joiner gets a default name then can rename.

### 13.4 Resize reflow (client only)

- **Current:** `fitContain(map, canvasW, canvasH)` (`src/sim/fitRect.ts`) already derives
  the fit transform from canvas dimensions.
- **Delta:** observe the MAP card size (ResizeObserver); on change, recompute
  `fitContain` and redraw (grid, boundary rect, planets, dots/badges). The footer row is
  `minmax(min, auto)`, so a tall MathQuill input grows the footer, shrinks the map row,
  and the observer picks that up automatically.
- **Tests:** shrinking the map card recomputes `fitContain` and keeps the drawn rect ==
  sim bounds; growing the footer shrinks the map card and triggers a redraw.

---

## 14. Out of scope (YAGNI)

- Post-match summary (kill count, MVP, leaderboard) — explicitly not for MVP.
- Map pre-game ↔ game transition animation — deferred until layout is stable.
- Final visual styling of the world-boundary rectangle and badges — KP styles later.
- Any netcode/generator/rules changes.

---

## 15. Open questions

None blocking. Styling details (boundary rectangle, badge visuals, exact GAP token,
panel width) are KP's to finalize during implementation.
