# Frontend Redesign — Phase 3: Online UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerequisite:** Phase 2 (`2026-07-03-frontend-redesign-p2-nvn-server.md`) is merged. Before executing any task, verify the Phase 2 interfaces this plan consumes (`NetworkGame.onLobby/onMatchStarting/send*`, `LobbySnapshot`, `lobbyState.round1Seed`) against the landed code — they were specified in the Phase 2 plan, not read from an implementation.

**Goal:** Replace the `OnlineParity` stopgap with the designed online experience: nickname + create/join screens, the arena-as-waiting-room (real round-1 terrain, roster columns, collapsible host-editable config drawer, server-mediated reroll), the server-synced 3-2-1 countdown + zoom, an NvN game HUD (own panel + team strip), a minimal spectator view, and reconnect states.

**Architecture:** Mirrors Phase 1's pattern exactly: `NetworkGame` (vanilla TS) drives a plain store (`netLobbyStore`) through the Phase 2 event surface; React components are pure store readers. One `ArenaStage` instance spans waiting room → countdown → play (ADR-0003); the waiting-room terrain is computed client-side from `round1Seed` + config with the same pure functions the server uses (`generatePlanets`/`computeSpawns` — deterministic by construction).

**Tech Stack:** React 19, TypeScript strict, Vitest 3 + jsdom + @testing-library/react (per-file `// @vitest-environment jsdom`), existing `createStore`/`useStore`, Pixi via `ArenaStage` only.

## Global Constraints

- **ADR-0002:** two teams RED/BLUE, open NvN (cap 5/team); roster UI is list-based, never two fixed slots; auto-place is server-side — the client only renders and offers "Switch team"; Start enabled when both teams ≥ 1 (server re-validates).
- **ADR-0003:** waiting room renders the REAL round-1 terrain from `lobbyState.round1Seed` at 0.87 scale; NO numeric arena readouts; config lives in a collapsible drawer that never obscures the arena; terrain morph IS the guest's change feedback (plus a brief field flash); seed string never shown online — only the Reroll action (host); countdown is server-authoritative (`matchStarting.startAt`), uncancelable; zoom 0.87 → 1 is the same CSS transform as local.
- Terminology: Host / Guest / Spectator in all copy ("Waiting for host to start…", "Spectating · WOLF").
- Nickname: localStorage key `curvecombat.nickname`; asked once on the online path; 1–12 chars, default "Player".
- Reconnect UX: self-reconnecting → blocking overlay "Reconnecting…"; peer disconnected → non-blocking banner "NAME disconnected — waiting up to 30s" (from `peerStatus`), cleared on reconnect.
- Spectator view: game screen with input panels replaced by read-only status, "Spectating · CODE" badge, Leave button (→ landing). No spectator lists/chat.
- Hash routes unchanged: `#room=CODE` is the only online entry; `#join` added for the code-entry screen; `#online` for the create/join choice.
- `NetworkGame`'s legacy DOM Start button and `prompt()` calls are DELETED this phase (React owns them now).
- Gate at every commit: `npm test && npx tsc --noEmit`.

**Files created (overview):**

```
src/app/net/netLobbyStore.ts        NetLobbyState + bridge from NetworkGame events
src/app/net/arenaPreview.ts         pure: (config, seed, roster) → RoundLayout (client mirror of server layout)
src/app/screens/OnlineChoice.tsx    nickname + Create Room / Join Room        (#online)
src/app/screens/JoinRoom.tsx        4-char code entry, auto-submit            (#join)
src/app/screens/OnlineFlow.tsx      waiting room → countdown → play → spectate (#room=CODE)
src/app/screens/RosterColumns.tsx   two team columns + switch/host badges
src/app/screens/NetCountdown.tsx    startAt-driven wrapper over CountdownOverlay
src/app/hud/TeamStrip.tsx           compact per-player status rows (online HUD)
src/app/net/ReconnectOverlays.tsx   self-blocking overlay + peer banner
```

**Files modified:** `routes.ts` (+`#online`, `#join`), `App.tsx`, `LandingScreen.tsx` (Play Online → `#online`), `ConfigPanel.tsx` (add `readOnly` + `hideSeedRow` props), `NetworkGame.ts` (delete DOM button/prompt paths), `theme.css`. **Deleted:** `src/app/screens/OnlineParity.tsx`.

---

### Task 1: Routes + nickname + OnlineChoice + JoinRoom

**Files:**
- Modify: `src/app/routes.ts` + test, `src/app/App.tsx`, `src/app/screens/LandingScreen.tsx`
- Create: `src/app/net/nickname.ts`, `src/app/screens/OnlineChoice.tsx`, `src/app/screens/JoinRoom.tsx`
- Test: `src/app/screens/JoinRoom.test.tsx`, extend `src/app/routes.test.ts`

**Interfaces:**

```ts
// nickname.ts
export function getNickname(): string;              // localStorage "curvecombat.nickname" ?? "Player"
export function setNickname(n: string): void;       // trimmed, sliced to 12 chars
// routes.ts — Route union gains { screen: "online" } and { screen: "join" }
```

- [ ] **Step 1: Failing tests.** Routes: `parseRoute("#online").screen === "online"`, `parseRoute("#join").screen === "join"`. JoinRoom: renders one text input; typing `wolf` auto-uppercases and, on the 4th character, sets `location.hash` to `#room=WOLF`; non-letters are stripped.

```tsx
// JoinRoom.test.tsx (essence)
// @vitest-environment jsdom
it("auto-submits a 4-letter code uppercased", () => {
  location.hash = "";
  render(<JoinRoom />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "wo1lf" } });
  expect(location.hash).toBe("#room=WOLF");
});
```

- [ ] **Step 2: Implement.**
  - `routes.ts`: add the two literals before the landing fallback.
  - `nickname.ts` per interface.
  - `OnlineChoice.tsx`: spacetime layer, nickname `<input>` (controlled, persisted via `setNickname` on change), two `gw-btn`s — "Create Room" generates a 4-letter code (`Array.from({length:4},()=>A–Z)`) and sets `#room=CODE`; "Join Room" sets `#join`. No tests mandated (dumb screen; JoinRoom covers the interesting logic).
  - `JoinRoom.tsx`: single large input (`maxLength 4`, CSS class `gw-code-entry`), value filtered `/[^a-z]/gi` → uppercased; when `length === 4` set `location.hash = "#room=" + value`. "Back" link → `#online`.
  - `LandingScreen.tsx`: Play Online button now just `location.hash = "#online"` (delete the prompt block).
  - `App.tsx`: route the two new screens.
  - `theme.css`: `.gw-code-entry { font-family: var(--gw-font-mono); font-size: 64px; letter-spacing: 0.4em; text-align: center; width: 5ch; background: var(--gw-surface-2); border: 1px solid var(--gw-border-strong); border-radius: var(--gw-radius-lg); color: var(--gw-text-code); padding: 12px 0 12px 0.4em; }`
- [ ] **Step 3: Gate + commit.** `git commit -m "feat(app): online choice + join-by-code screens, nickname persistence, routes"`

---

### Task 2: netLobbyStore + arenaPreview (pure logic, no UI)

**Files:**
- Create: `src/app/net/netLobbyStore.ts`, `src/app/net/arenaPreview.ts`
- Test: `src/app/net/netLobbyStore.test.ts`, `src/app/net/arenaPreview.test.ts`

**Interfaces:**

```ts
// netLobbyStore.ts
export type NetPhase = "connecting" | "lobby" | "countdown" | "play" | "spectating";
export interface NetLobbyState {
  phase: NetPhase;
  roomCode: string;
  myId: string | null;
  hostId: string | null;
  amHost: boolean;             // derived: myId === hostId
  amSpectator: boolean;
  players: { id: string; name: string; team: "red" | "blue" }[];
  spectators: { id: string; name: string }[];
  config: PanelConfig;         // Phase 1's PanelConfig (mode/rounds/noTurn/turnSeconds/map/scatter)
  round1Seed: number | null;
  startAt: number | null;
  configFlash: number;         // increments on every guest-visible config change (drives the flash)
  peerDown: { name: string; deadline: number } | null;
  selfReconnecting: boolean;
  error: string | null;
}
export function initialNetLobbyState(roomCode: string): NetLobbyState;
export const netLobbyStore: Store<NetLobbyState>;
/** Wire a NetworkGame's Phase-2 event surface into the store. Returns an unwire fn. */
export function bindNetworkGame(net: NetworkGame, myIdProvider: () => string | null): () => void;

// arenaPreview.ts — client mirror of the server's round-1 layout (deterministic)
export function buildArenaPreview(config: { map: MapConfig; scatter: ScatterConfig },
                                  seed: number,
                                  counts: { red: number; blue: number }): RoundLayout;
```

- [ ] **Step 1: Failing tests.**
  - `bindNetworkGame`: with a stub NetworkGame exposing `onLobby`/`onMatchStarting` registration, emit a `LobbySnapshot` → store gains players/config/round1Seed and `phase: "lobby"`; emit again with a different `mode` → `configFlash` incremented; emit `matchStarting(startAt)` → `phase: "countdown"`, `startAt` set.
  - `buildArenaPreview`: same seed+config+counts → identical planets on two calls; players split red-left (x<0) / blue-right (x>0); uneven counts (2 red, 1 blue) produce 3 players.
- [ ] **Step 2: Implement.**
  - `arenaPreview.ts`: `const bounds = boundsFromMap(config.map); const teamSize = Math.max(counts.red, counts.blue, 1) as 1|2|3|4|5; const spawns = computeSpawns(config.map, teamSize); const planets = generatePlanets(seed, bounds, spawns, config.scatter);` then deal `counts.red` left-spawns and `counts.blue` right-spawns to placeholder `PlayerState`s (`hp: 100, alive: true`, ids `r1…/b1…`). This mirrors `MatchEngine.layout` — add a comment cross-referencing it and a test-enforced contract note.
  - `netLobbyStore.ts`: straightforward store writes per event; `configFlash` increments only when the incoming config differs (`JSON.stringify` compare is fine at this size); `phase` transitions: joined→lobby (first snapshot), matchStarting→countdown, first `matchState` (Task 4 wires it)→play.
- [ ] **Step 3: Gate + commit.** `git commit -m "feat(net): netLobbyStore bridge + deterministic client-side arena preview"`

---

### Task 3: RosterColumns + ConfigPanel readOnly variant + drawer styles

**Files:**
- Create: `src/app/screens/RosterColumns.tsx`
- Modify: `src/app/screens/ConfigPanel.tsx` (props: `readOnly?: boolean`, `hideSeedRow?: boolean`), `src/app/theme.css`
- Test: `src/app/screens/RosterColumns.test.tsx`, extend `src/app/screens/ConfigPanel.test.tsx`

**Interfaces:**

```tsx
<RosterColumns
  players={NetLobbyState["players"]} myId={string|null} hostId={string|null}
  locked={boolean}                       // countdown/play: hide switch affordance
  onSwitch={(team: "red"|"blue") => void}
/>
// Renders .roster-col.is-red (left) and .roster-col.is-blue (right); my row highlighted;
// host row gets a ♛ badge; the OTHER column shows a "Switch to RED/BLUE" button unless locked or that team is full (5).
```

- [ ] **Step 1: Failing tests.** RosterColumns: renders one row per player in the right column by team; host badge present on host row; clicking "Switch to BLUE" calls `onSwitch("blue")`; button absent when `locked` or target team has 5 players. ConfigPanel: with `readOnly`, every input/button inside is `disabled` and the seed row is absent when `hideSeedRow`.
- [ ] **Step 2: Implement.** ConfigPanel: wrap in `<fieldset disabled={readOnly}>` (one mechanism, all controls) and gate the seed row on `!hideSeedRow`. RosterColumns per the interface. Styles: `.roster-col { position: absolute; bottom: 18px; width: 220px; z-index: 6; display: flex; flex-direction: column; gap: 6px; } .roster-col.is-red { left: 18px; } .roster-col.is-blue { right: 18px; } .roster-row { … gw-card compressed …; } .roster-row.is-me { border-color: var(--gw-accent); }` plus a `@keyframes gw-config-flash` white-border pulse used by Task 4.
- [ ] **Step 3: Gate + commit.** `git commit -m "feat(app): roster columns with switch/host badges; ConfigPanel readOnly + hidden seed variants"`

---

### Task 4: OnlineFlow — the arena-as-waiting-room

**Files:**
- Create: `src/app/screens/OnlineFlow.tsx`, `src/app/screens/NetCountdown.tsx`
- Modify: `src/app/App.tsx` (route `#room=` → OnlineFlow), `src/net/NetworkGame.ts` (delete `maybeShowStartButton`/`removeStartButton` and the `prompt()`; matchState → also set `netLobbyStore` phase "play")
- Delete: `src/app/screens/OnlineParity.tsx`
- Test: `src/app/screens/NetCountdown.test.tsx`, `src/app/screens/OnlineFlow.test.tsx` (store-driven, ArenaStage + NetworkGame mocked)

**Behavior spec (the heart of ADR-0003):**
1. Mount: create `ServerClient` + `NetworkGame(client, renderer, hudController)` once the `ArenaStage` (scale 0.87) is ready; `bindNetworkGame`; `net.start(code, getNickname())`.
2. Whenever `(config, round1Seed, team counts)` change in the store and `phase === "lobby"`: `buildArenaPreview(...)` → `renderer.setMap(config.map)` → `renderer.setWorld(previewWorld, "red", firstRedPos, firstBluePos)` (build the preview `World` the same way `LocalGame.preview` does — read it first and mirror; if extraction of a shared helper is trivial, prefer extracting `previewWorld(layout, bounds)` into `src/game/localLayout.ts` and reusing it in both). Guests see the terrain morph on every host edit; additionally toggle the `gw-config-flash` class off `configFlash`.
3. Overlay chrome in `phase "lobby"`: big room code + "Copy link" button (`navigator.clipboard.writeText(location.origin + "/#room=" + code)`), `RosterColumns` (onSwitch → `net.sendSwitchTeam`), collapsible drawer (host: editable ConfigPanel `hideSeedRow` + "Reroll terrain" button → `net.sendReroll()`, changes debounced 250ms → `net.sendConfigure(...)`; guest: `readOnly` + status line "Waiting for host to start…"), host-only Start button — enabled when both teams ≥ 1, `onClick: net.requestStart()`. Drawer collapse toggle must leave the arena fully visible when open (drawer overlays the right edge only, same `.config-drawer` styles as local).
4. `phase "countdown"`: hide drawer/roster affordances (locked), render `NetCountdown startAt onDone={noop}` — phase flips to "play" when the first `matchState` arrives (server-authoritative), not from the local timer; scale stays 0.87 until "play".
5. `phase "play"`: scale 1 (zoom), `HudBar` + `HudOverlays` + `TeamStrip` (Task 5); NetworkGame's existing render path drives everything else.
6. `phase "spectating"` (set when `joined` reports the spectator path — detect via the store's `amSpectator` from `LobbySnapshot`): Task 5 renders the variant.

```tsx
// NetCountdown.tsx — complete
import { useEffect, useState } from "react";
export function NetCountdown({ startAt }: { startAt: number }) {
  const calc = () => Math.max(0, Math.ceil((startAt - Date.now()) / 1000));
  const [n, setN] = useState(calc);
  useEffect(() => {
    const iv = setInterval(() => setN(calc()), 200);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt]);
  if (n <= 0) return null;
  return (
    <div className="gw-overlay-center gw-countdown">
      <span key={n} className="gw-countdown-num">{n}</span>
    </div>
  );
}
```

- [ ] **Step 1: Failing tests.** NetCountdown with fake timers: `startAt = Date.now()+3000` renders "3", after 1s renders "2", after passing `startAt` renders nothing. OnlineFlow (mocks: `vi.mock` ArenaStage to a div that immediately calls `onReady(fakeRenderer)`, `vi.mock` NetworkGame): store in "lobby" with 2v1 roster → room code visible, Start disabled for guest / enabled for host with both teams filled; host drawer editable, guest's `fieldset` disabled; store→"countdown" hides the Start button and shows the countdown.
- [ ] **Step 2: Implement** per the behavior spec. Keep `OnlineFlow` a coordinator: preview math in `arenaPreview.ts`, store logic in `netLobbyStore.ts`, presentational bits in the Task 3 components.
- [ ] **Step 3: Delete `OnlineParity.tsx`**, remove NetworkGame's DOM button + prompt code paths (grep `maybeShowStartButton|removeStartButton|prompt\(` in `src/net/NetworkGame.ts`), update `App.tsx`.
- [ ] **Step 4: Gate + commit.** `git commit -m "feat(app): OnlineFlow — arena-as-waiting-room, live terrain morph, host drawer, synced countdown"`

---

### Task 5: NvN game HUD — TeamStrip + spectator view + reconnect overlays

**Files:**
- Create: `src/app/hud/TeamStrip.tsx`, `src/app/net/ReconnectOverlays.tsx`
- Modify: `src/app/screens/OnlineFlow.tsx` (integrate), `src/app/net/netLobbyStore.ts` (`matchPlayers` slice fed from NetworkGame's matchState callback; `peerDown`/`selfReconnecting` wiring), `src/net/NetworkGame.ts` (expose `onState(cb: (s: MatchState) => void)` and forward `peerStatus` + ServerClient reconnect events to callbacks instead of/in addition to `ui.setStatus`)
- Test: `src/app/hud/TeamStrip.test.tsx`, `src/app/net/ReconnectOverlays.test.tsx`

**Interfaces:**

```tsx
<TeamStrip players={PlayerState[]} myId={string|null} />
// One compact row per player, grouped red-left/blue-right above the HUD bar:
// name, ♥HP (hp mode), skull when !alive, ring highlight when id === activePlayerId. My row bolded.
// Online, HudBar renders ONLY my panel: <HudBar singleTeam={myTeam} makeInput?/> — add this optional
// prop to HudBar (renders one PlayerPanel + Scoreboard when set; unchanged dual layout when unset).
```

- [ ] **Step 1: Failing tests.** TeamStrip: 2v2 state renders 4 rows; dead player row has `.is-dead`; active player row has `.is-active`. HudBar: `singleTeam="blue"` renders exactly one Fire button and it is blue's. ReconnectOverlays: store `selfReconnecting: true` → blocking overlay text "Reconnecting…"; `peerDown: { name: "Ann", deadline }` → banner matching `/Ann disconnected/`; both null → renders nothing.
- [ ] **Step 2: Implement.** `HudBar` gains `singleTeam?: Team` (conditional render — do not fork the component). NetworkGame: add `onState` callback invoked at the top of the existing `render(state)`; map `peerStatus {connected:false}` → `peerDown` (deadline = `Date.now()+30_000`), `{connected:true}` → null; ServerClient's reconnect-in-progress signal → `selfReconnecting` (read `ServerClient.ts`'s reconnect handler surface first; if no event exists, set the flag in NetworkGame around the `rejoin` send and clear on next `joined`). Spectator variant in OnlineFlow: when `amSpectator`, render `TeamStrip` + Scoreboard + "Spectating · CODE" badge + Leave button (`location.hash = ""`), and no `HudBar`.
- [ ] **Step 3: Gate + commit.** `git commit -m "feat(app): NvN team strip, single-panel online HUD, spectator view, reconnect overlays"`

---

### Task 6: Browser validation (stop criteria)

`npm run server` + `npm run dev`, Playwright with three tabs. Do NOT report done until all pass:
- [ ] **Create/Join:** Tab A: landing → Play Online → nickname "Ann" → Create Room → waiting room shows big code + real terrain + Ann on a team. Tab B: Play Online → Join Room → type the code → auto-joins, appears on the OTHER team. Screenshot.
- [ ] **Live morph:** A drags "planet count" → B's terrain morphs live + drawer flash; B's panel is read-only. A clicks Reroll terrain → both terrains change identically (screenshot-compare A vs B).
- [ ] **Switch team:** B clicks "Switch to RED" → both rosters update; Start (A) disables (empty blue); B switches back → Start re-enables.
- [ ] **Synced countdown + continuity:** A presses Start → BOTH tabs show 3-2-1 within the same second; arena zooms; round-1 terrain identical to the waiting-room preview in both tabs (screenshot-compare).
- [ ] **NvN play:** with a third player joining pre-start (2v1), each tab shows only its own input panel + a 3-row TeamStrip; turn rotates across all three; eliminating one player of the 2-team leaves the round running.
- [ ] **Spectator:** Tab D joins mid-match → "Spectating · CODE", sees shots live, no Fire button; Leave returns to landing.
- [ ] **Reconnect:** reload Tab B mid-match → B shows "Reconnecting…" then resumes; A meanwhile shows "Bo disconnected — waiting up to 30s" and it clears.
- [ ] `git commit --allow-empty -m "test(app): Phase 3 browser validation — waiting room, morph, countdown sync, NvN HUD, spectator, reconnect"`

## Self-Review

**Coverage vs ADRs/decisions:** join-by-code (T1); nickname (T1); arena-as-waiting-room with real seed + no numerics + drawer-never-hides-arena + reroll action (T2/T4); guest live view w/ flash = terrain morph + drawer pulse (T2/T4); auto-place server-side w/ self-switch UI (T3); host-only Start gated on both teams (T4); server-synced uncancelable countdown, phase flip on first matchState (T4); NvN single-panel HUD + TeamStrip (T5); minimal spectator (T5); reconnect UX (T5); rosters-as-proto-HUD placement (T3 styles put columns at the HUD edges; the morph-to-panel animation is explicitly OUT — crossfade via shared placement per the grill session's fallback).
**Placeholders:** none; verify-first steps name their targets (`LocalGame.preview` world construction, `ServerClient` reconnect surface, Phase 2 interfaces at the top).
**Type consistency:** `PanelConfig` reused from Phase 1; `LobbySnapshot`/`NetLobbyState` field names match Phase 2's Task 5 exactly; `HudBar.singleTeam` is additive.
**Deferred (explicitly out):** roster→panel morph animation (crossfade suffices), spectator promotion, team chat, phone-width online layout.
