# Group 5 · Lobby & Game Setup Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen lobby that lets players choose game mode, rounds, and No-Turn before the game starts. Replace the hardcoded `MATCH_CONFIG` in `main.ts` with config flowing from the lobby.

**Architecture:** Single-page, two screens. `index.html` holds both `#lobby-screen` and `#game` divs. On load, lobby is shown and game is hidden. When the player clicks "Start Game," the lobby hides, game shows, and game init runs with the chosen `MatchConfig`. Hash routing (`/#game` vs `/`) keeps the URL meaningful and enables back-navigation. The game renderer initialises lazily — only when "Start Game" is pressed — not on page load.

**Tech Stack:** TypeScript, Vite 8, Vitest 3. Tests: `npm test`. Dev server: `npm run dev`.

## Global Constraints

- TypeScript strict mode — no `any`, no implicit `any`.
- All existing tests must stay green after every task.
- Do **not** touch `src/sim/`, `src/game/GameRenderer.ts`, `src/game/GameUI.ts`, or `src/game/matchLogic.ts` — those are stable.
- HP Mode and No-Turn options appear in the lobby but are **disabled** ("Coming soon") since Groups 3 and 4 aren't built yet. They must be visually present but non-interactive.
- "Play Online" button appears but is **disabled** ("Coming soon") — Group 6 not built yet.
- "Play again" after a match goes **back to the lobby** (not directly restart), since the lobby is now the entry point.
- Stick to the existing dark colour palette (`#0f141a` bg, `#ff4444` red, `#4488ff` blue, `#cdd9e5` text, `#2b3a49` borders). UI redesign comes later.
- No animations or transitions that could cause layout jank — use simple `hidden` attribute toggling.

---

## File Map

| File | Change |
|---|---|
| `src/game/configRouter.ts` | **New.** Pure functions: `parseConfigFromHash`, `configToHash`. Unit-tested. |
| `src/game/configRouter.test.ts` | **New.** Unit tests for hash ↔ config round-trip. |
| `src/ui/LobbyScreen.ts` | **New.** Lobby UI component — mode cards, round picker, start callback. |
| `src/game/main.ts` | Add routing: show lobby first, defer game init to "Start Game". "Play again" returns to lobby. |
| `index.html` | Add `#lobby-screen` DOM + CSS. Default-hide `#game`. Adjust `#reset-btn` label. |

---

## Task 1: Pure Config ↔ Hash Utilities (testable)

**Files:**
- Create: `src/game/configRouter.ts`
- Create: `src/game/configRouter.test.ts`

**Interfaces:**
- Produces:
  - `parseConfigFromHash(hash: string): MatchConfig`
  - `configToHash(config: MatchConfig): string`
  - Default config when hash is missing/malformed: `{ mode: "classic", rounds: 3, noTurn: false, role: "local" }`

---

- [ ] **Step 1: Write the failing tests**

Create `src/game/configRouter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseConfigFromHash, configToHash } from "./configRouter";
import type { MatchConfig } from "./matchLogic";

const DEFAULT: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local" };

describe("configToHash", () => {
  it("encodes classic 3-round config", () => {
    expect(configToHash(DEFAULT)).toBe("#game?mode=classic&rounds=3&noTurn=false");
  });

  it("encodes classic 5-round no-turn config", () => {
    const cfg: MatchConfig = { mode: "classic", rounds: 5, noTurn: true, role: "local" };
    expect(configToHash(cfg)).toBe("#game?mode=classic&rounds=5&noTurn=true");
  });
});

describe("parseConfigFromHash", () => {
  it("parses a well-formed hash back to config", () => {
    const hash = "#game?mode=classic&rounds=3&noTurn=false";
    expect(parseConfigFromHash(hash)).toEqual(DEFAULT);
  });

  it("parses a 5-round no-turn hash", () => {
    const hash = "#game?mode=classic&rounds=5&noTurn=true";
    expect(parseConfigFromHash(hash)).toEqual(
      { mode: "classic", rounds: 5, noTurn: true, role: "local" }
    );
  });

  it("returns default config for empty hash", () => {
    expect(parseConfigFromHash("")).toEqual(DEFAULT);
    expect(parseConfigFromHash("#")).toEqual(DEFAULT);
  });

  it("returns default config for non-game hash", () => {
    expect(parseConfigFromHash("#lobby")).toEqual(DEFAULT);
  });

  it("falls back to default for invalid rounds value", () => {
    const hash = "#game?mode=classic&rounds=7&noTurn=false";
    expect(parseConfigFromHash(hash).rounds).toBe(3);
  });

  it("configToHash and parseConfigFromHash are inverse operations", () => {
    const original: MatchConfig = { mode: "classic", rounds: 5, noTurn: false, role: "local" };
    expect(parseConfigFromHash(configToHash(original))).toEqual(original);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test
```

Expected: test file fails because `configRouter.ts` doesn't exist.

- [ ] **Step 3: Create `configRouter.ts`**

Create `src/game/configRouter.ts`:

```ts
import type { MatchConfig } from "./matchLogic";

const DEFAULT_CONFIG: MatchConfig = {
  mode: "classic",
  rounds: 3,
  noTurn: false,
  role: "local",
};

/** Encode a MatchConfig into a URL hash string. */
export function configToHash(config: MatchConfig): string {
  return `#game?mode=${config.mode}&rounds=${config.rounds}&noTurn=${config.noTurn}`;
}

/**
 * Parse a URL hash string into a MatchConfig.
 * Falls back to defaults for missing or invalid values.
 * Only recognises hashes that start with "#game".
 */
export function parseConfigFromHash(hash: string): MatchConfig {
  if (!hash.startsWith("#game")) return { ...DEFAULT_CONFIG };

  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return { ...DEFAULT_CONFIG };

  const params = new URLSearchParams(hash.slice(qIdx + 1));

  const modeRaw = params.get("mode");
  const mode: MatchConfig["mode"] =
    modeRaw === "hp" ? "hp" : "classic";

  const roundsRaw = Number(params.get("rounds"));
  const rounds: MatchConfig["rounds"] =
    roundsRaw === 5 ? 5 : 3;

  const noTurn = params.get("noTurn") === "true";

  return { mode, rounds, noTurn, role: "local" };
}
```

- [ ] **Step 4: Run tests — expect all green**

```bash
npm test
```

Expected:
```
✓ src/game/configRouter.test.ts (7 tests)
✓ src/game/matchLogic.test.ts (8 tests)
✓ src/sim/engine.test.ts (10 tests)
... all passing
```

- [ ] **Step 5: Commit**

```bash
git add src/game/configRouter.ts src/game/configRouter.test.ts
git commit -m "feat(game): add configToHash / parseConfigFromHash for lobby routing"
```

---

## Task 2: Lobby DOM in `index.html`

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces DOM consumed by `LobbyScreen.ts` in Task 3:
  - `#lobby-screen` — full-screen container (shown by default)
  - `#lobby-title` — game title
  - `#lobby-mode-classic` — Classic VS radio/card button
  - `#lobby-mode-hp` — HP Mode radio/card button (disabled)
  - `#lobby-rounds-3` — "3 Rounds" button
  - `#lobby-rounds-5` — "5 Rounds" button
  - `#lobby-noturn` — No-Turn checkbox (disabled)
  - `#lobby-start-local` — "Start Game" button
  - `#lobby-online` — "Play Online" button (disabled)
- Change to existing DOM: add `hidden` to `<div id="game">` so game starts hidden.

---

- [ ] **Step 1: Add `hidden` to the `#game` div**

In `index.html`, find:
```html
    <div id="game">
```
Replace with:
```html
    <div id="game" hidden>
```

- [ ] **Step 2: Add lobby CSS to the `<style>` block**

Add these rules at the end of the `<style>` block, before `</style>`:

```css
/* ── Lobby screen ────────────────────────────────────────────────── */
#lobby-screen {
  position: fixed;
  inset: 0;
  background: #0f141a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  z-index: 10;
}
#lobby-screen[hidden] { display: none; }

#lobby-title {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: 0.08em;
  margin: 0;
}
#lobby-title .t-red { color: #ff4444; }
#lobby-title .t-blue { color: #4488ff; }

#lobby-tagline {
  font-size: 14px;
  color: #5e7081;
  margin: -24px 0 0;
  letter-spacing: 0.05em;
}

#lobby-config {
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: rgba(18, 26, 34, 0.92);
  border: 1px solid #2b3a49;
  border-radius: 16px;
  padding: 28px 36px;
  min-width: 340px;
}

.lobby-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #5e7081;
  text-transform: uppercase;
  margin: 0 0 8px;
}

.lobby-btn-group {
  display: flex;
  gap: 8px;
}

.lobby-mode-btn,
.lobby-rounds-btn {
  flex: 1;
  border: 1px solid #2b3a49;
  background: #0c1116;
  color: #8499ab;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  text-align: center;
  position: relative;
}
.lobby-mode-btn:hover:not(:disabled),
.lobby-rounds-btn:hover:not(:disabled) {
  border-color: #4488ff;
  color: #cdd9e5;
}
.lobby-mode-btn.active,
.lobby-rounds-btn.active {
  border-color: #4488ff;
  background: rgba(68, 136, 255, 0.12);
  color: #cdd9e5;
}
.lobby-mode-btn:disabled,
.lobby-rounds-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.coming-soon-badge {
  position: absolute;
  top: -8px;
  right: -4px;
  background: #2b3a49;
  color: #5e7081;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 5px;
  border-radius: 4px;
  text-transform: uppercase;
  pointer-events: none;
}

.lobby-noturn-row {
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0.35;
}
.lobby-noturn-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: not-allowed;
}
.lobby-noturn-label {
  font-size: 13px;
  color: #8499ab;
  cursor: default;
}
.lobby-noturn-row .coming-soon-badge {
  position: static;
  display: inline-block;
}

#lobby-start-local {
  border: none;
  background: #4488ff;
  color: #fff;
  border-radius: 10px;
  padding: 13px 24px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.03em;
  transition: background 0.15s;
}
#lobby-start-local:hover {
  background: #2266dd;
}

#lobby-online {
  border: 1px solid #2b3a49;
  background: transparent;
  color: #5e7081;
  border-radius: 10px;
  padding: 10px 24px;
  font-size: 13px;
  font-weight: 600;
  cursor: not-allowed;
  opacity: 0.5;
  letter-spacing: 0.03em;
}
```

- [ ] **Step 3: Add lobby HTML before `<div id="game">`**

In `index.html`, insert this block immediately before `<div id="game" hidden>`:

```html
    <div id="lobby-screen">
      <h1 id="lobby-title">
        <span class="t-red">GRAPH</span><span class="t-blue"> WAR</span>
      </h1>
      <p id="lobby-tagline">Fire mathematical functions. Hit your opponent.</p>

      <div id="lobby-config">
        <!-- Mode -->
        <div>
          <p class="lobby-label">Game Mode</p>
          <div class="lobby-btn-group">
            <button id="lobby-mode-classic" class="lobby-mode-btn active">
              Classic VS
              <small style="display:block;font-size:11px;font-weight:400;color:#5e7081;margin-top:2px">One hit per round</small>
            </button>
            <button id="lobby-mode-hp" class="lobby-mode-btn" disabled>
              HP Mode
              <small style="display:block;font-size:11px;font-weight:400;color:#5e7081;margin-top:2px">Slope = damage</small>
              <span class="coming-soon-badge">Soon</span>
            </button>
          </div>
        </div>

        <!-- Rounds -->
        <div>
          <p class="lobby-label">Rounds</p>
          <div class="lobby-btn-group">
            <button id="lobby-rounds-3" class="lobby-rounds-btn active">Best of 3</button>
            <button id="lobby-rounds-5" class="lobby-rounds-btn">Best of 5</button>
          </div>
        </div>

        <!-- No-Turn modifier -->
        <div class="lobby-noturn-row">
          <input type="checkbox" id="lobby-noturn" disabled />
          <label for="lobby-noturn" class="lobby-noturn-label">No-Turn Mode (simultaneous fire)</label>
          <span class="coming-soon-badge">Soon</span>
        </div>

        <!-- Actions -->
        <button id="lobby-start-local">▶ Play Locally</button>
        <button id="lobby-online" disabled>Play Online — Coming Soon</button>
      </div>
    </div>
```

- [ ] **Step 4: Update `#reset-btn` label and update win-detail copy**

In `index.html`, find:
```html
        <button id="reset-btn">Play again</button>
```
Replace with:
```html
        <button id="reset-btn">Back to Lobby</button>
```

- [ ] **Step 5: Verify the page renders without breaking the game**

```bash
npm run dev
```

Open `http://localhost:5173`. The lobby should appear (game is hidden). The lobby shows the title, mode cards, round picker, and buttons. No overlapping elements. Screenshot it.

The game shouldn't load or init at all yet (main.ts still calls `bootWithTutorial()` which needs the game DOM — this may error; that's expected and will be fixed in Task 4).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(ui): add lobby screen DOM and CSS to index.html"
```

---

## Task 3: `LobbyScreen` Component

**Files:**
- Create: `src/ui/LobbyScreen.ts`

**Interfaces:**
- Consumes: DOM elements from Task 2
- Produces:
  - `new LobbyScreen()` — queries all lobby DOM elements, wires click handlers
  - `lobby.onStart(cb: (config: MatchConfig) => void)` — callback fired when "Play Locally" is clicked
  - `lobby.show()` / `lobby.hide()` — toggle visibility

---

- [ ] **Step 1: Create `src/ui/LobbyScreen.ts`**

```ts
import type { MatchConfig } from "../game/matchLogic";

export class LobbyScreen {
  private el: HTMLElement;
  private modeClassicBtn: HTMLButtonElement;
  private modeHpBtn: HTMLButtonElement;
  private rounds3Btn: HTMLButtonElement;
  private rounds5Btn: HTMLButtonElement;
  private startLocalBtn: HTMLButtonElement;

  private selectedMode: MatchConfig["mode"] = "classic";
  private selectedRounds: 3 | 5 = 3;

  private startCb: ((config: MatchConfig) => void) | null = null;

  constructor(root: ParentNode = document) {
    this.el = root.querySelector<HTMLElement>("#lobby-screen")!;
    this.modeClassicBtn = root.querySelector<HTMLButtonElement>("#lobby-mode-classic")!;
    this.modeHpBtn = root.querySelector<HTMLButtonElement>("#lobby-mode-hp")!;
    this.rounds3Btn = root.querySelector<HTMLButtonElement>("#lobby-rounds-3")!;
    this.rounds5Btn = root.querySelector<HTMLButtonElement>("#lobby-rounds-5")!;
    this.startLocalBtn = root.querySelector<HTMLButtonElement>("#lobby-start-local")!;

    this.modeClassicBtn.addEventListener("click", () => this.selectMode("classic"));
    this.modeHpBtn.addEventListener("click", () => this.selectMode("hp"));
    this.rounds3Btn.addEventListener("click", () => this.selectRounds(3));
    this.rounds5Btn.addEventListener("click", () => this.selectRounds(5));
    this.startLocalBtn.addEventListener("click", () => this.handleStart());
  }

  onStart(cb: (config: MatchConfig) => void): void {
    this.startCb = cb;
  }

  show(): void {
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }

  private selectMode(mode: MatchConfig["mode"]): void {
    this.selectedMode = mode;
    this.modeClassicBtn.classList.toggle("active", mode === "classic");
    this.modeHpBtn.classList.toggle("active", mode === "hp");
  }

  private selectRounds(rounds: 3 | 5): void {
    this.selectedRounds = rounds;
    this.rounds3Btn.classList.toggle("active", rounds === 3);
    this.rounds5Btn.classList.toggle("active", rounds === 5);
  }

  private handleStart(): void {
    const config: MatchConfig = {
      mode: this.selectedMode,
      rounds: this.selectedRounds,
      noTurn: false,
      role: "local",
    };
    this.startCb?.(config);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/LobbyScreen.ts
git commit -m "feat(ui): add LobbyScreen component with mode/rounds selection"
```

---

## Task 4: Wire Routing in `main.ts`

**Files:**
- Modify: `src/game/main.ts`

**Interfaces:**
- Consumes:
  - `LobbyScreen` from `../ui/LobbyScreen`
  - `configToHash`, `parseConfigFromHash` from `./configRouter`
- Produces: unified entry point that routes between lobby and game

---

- [ ] **Step 1: Restructure `main.ts` with routing**

Replace the entire contents of `src/game/main.ts` with:

```ts
import { GameRenderer } from "./GameRenderer";
import { GameUI } from "./GameUI";
import { LobbyScreen } from "../ui/LobbyScreen";
import { fire } from "../sim/engine";
import { evaluateAll } from "../math/Context";
import { matchWinner, firstShooterNextRound, type MatchConfig } from "./matchLogic";
import { configToHash, parseConfigFromHash } from "./configRouter";
import type { Bounds, Planet, Vec2, World } from "../sim/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const CRATER_RADIUS = 0.8;
const PLAYER_RADIUS = 0.1;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const lobbyEl = document.getElementById("lobby-screen")!;
const gameEl = document.getElementById("game")!;

// ── Game state (initialised lazily in startGame) ──────────────────────────────

let renderer: GameRenderer | null = null;
let ui: GameUI | null = null;
let matchConfig: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local" };

let redPlayerPos: Vec2 = { x: -9, y: 0 };
let bluePlayerPos: Vec2 = { x: 9, y: 0 };
let planets: Planet[] = [];
let activeTurn: "red" | "blue" = "red";
let busy = false;
let gameOver = false;
let redScore = 0;
let blueScore = 0;
let currentRound = 1;

// ── Planet seed ───────────────────────────────────────────────────────────────

function seedPlanets(): Planet[] {
  return [
    { id: "p1", pos: { x: -5, y: 3 }, radius: 1.2, craters: [] },
    { id: "p2", pos: { x: -3, y: -2 }, radius: 1.8, craters: [] },
    { id: "p3", pos: { x: 0, y: 2 }, radius: 1.5, craters: [] },
    { id: "p4", pos: { x: 0, y: -3 }, radius: 1.4, craters: [] },
    { id: "p5", pos: { x: 3, y: 1 }, radius: 2.0, craters: [] },
    { id: "p6", pos: { x: 5, y: -2 }, radius: 1.3, craters: [] },
  ];
}

// ── World helpers ─────────────────────────────────────────────────────────────

function buildWorld(turn: "red" | "blue", ps: Planet[]): World {
  return turn === "red"
    ? { soldier: { pos: redPlayerPos, dir: 1 }, bounds: renderer!.getEffectiveBounds(), targets: [{ id: "blue", pos: bluePlayerPos, radius: PLAYER_RADIUS }], planets: ps }
    : { soldier: { pos: bluePlayerPos, dir: -1 }, bounds: renderer!.getEffectiveBounds(), targets: [{ id: "red", pos: redPlayerPos, radius: PLAYER_RADIUS }], planets: ps };
}

function placePlayersRandomly(b: Bounds) {
  const yLo = b.minY + 1, yHi = b.maxY - 1;
  const xEdge = Math.abs(b.minX) - 0.3;
  const xInner = Math.min(11, xEdge);
  const xRange = Math.max(0, xEdge - xInner);
  redPlayerPos = { x: -(xInner + Math.random() * xRange), y: yLo + Math.random() * (yHi - yLo) };
  bluePlayerPos = { x: xInner + Math.random() * xRange, y: yLo + Math.random() * (yHi - yLo) };
}

// ── Game lifecycle ────────────────────────────────────────────────────────────

function start() {
  planets = seedPlanets();
  activeTurn = "red";
  gameOver = false;
  busy = false;
  redScore = 0;
  blueScore = 0;
  currentRound = 1;
  placePlayersRandomly(renderer!.getEffectiveBounds());
  renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
  ui!.resetInputs();
  ui!.setTurn(activeTurn, "");
  ui!.hideWin();
  ui!.hideSplash();
  ui!.updateScoreboard(redScore, blueScore, currentRound, matchConfig.rounds);
  ui!.setStatus();
  ui!.focus();
}

function nextRound(roundLoser: "red" | "blue") {
  if (roundLoser === "red") blueScore++;
  else redScore++;

  const winner = matchWinner(redScore, blueScore, matchConfig.rounds);
  if (winner) {
    gameOver = true;
    busy = false;
    ui!.setBusy(false);
    ui!.showWin(winner);
    return;
  }

  currentRound++;
  const loserLabel = roundLoser === "red" ? "RED" : "BLUE";
  const winnerLabel = roundLoser === "red" ? "BLUE" : "RED";
  const splashHtml =
    `Round ${currentRound} of ${matchConfig.rounds}<br>` +
    `<span style="color:${roundLoser === "red" ? "#4488ff" : "#ff4444"}">${winnerLabel} wins the round!</span><br>` +
    `<small style="color:#5e7081">${loserLabel} shoots first</small>`;

  ui!.showSplash(splashHtml);

  window.setTimeout(() => {
    ui!.hideSplash();
    planets = seedPlanets();
    activeTurn = firstShooterNextRound(roundLoser);
    gameOver = false;
    busy = false;
    placePlayersRandomly(renderer!.getEffectiveBounds());
    renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
    ui!.resetInputs();
    ui!.setTurn(activeTurn, "");
    ui!.updateScoreboard(redScore, blueScore, currentRound, matchConfig.rounds);
    ui!.setStatus();
    ui!.focus();
  }, 2000);
}

async function onFire(latex: string) {
  if (busy || gameOver) return;

  const result = evaluateAll([{ id: "shot", latex }]);
  const row = result.get("shot");
  const fn = row?.kind === "curve" ? row.fn : undefined;
  if (!fn) {
    ui!.setStatus("that isn't a plottable function of x");
    return;
  }

  busy = true;
  ui!.setBusy(true);

  const shooter = activeTurn;
  const world = buildWorld(shooter, planets);
  const shot = fire(world, fn);

  await renderer!.playShot(shot);

  if (shot.hit.kind === "planet" && shot.hit.planetId) {
    const planet = planets.find((p) => p.id === shot.hit.planetId);
    if (planet) planet.craters.push({ pos: shot.hit.at, radius: CRATER_RADIUS });
  }

  if (shot.hit.kind === "target") {
    const roundLoser = shooter === "red" ? "blue" : "red";
    renderer!.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
    nextRound(roundLoser);
    return;
  }

  activeTurn = shooter === "red" ? "blue" : "red";
  renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
  ui!.setTurn(activeTurn, latex);
  busy = false;
  ui!.setBusy(false);
  ui!.setStatus(noteFor(shot.hit.kind));
  ui!.focus();
}

function noteFor(kind: string): string {
  switch (kind) {
    case "planet": return "blocked by a planet — carve through or arc around";
    case "bounds": return "flew off the field — try again";
    case "dud": return "undefined at your position — shift your function";
    default: return "adjust and fire again";
  }
}

// ── Tutorial ──────────────────────────────────────────────────────────────────

function bootWithTutorial() {
  if (localStorage.getItem("graphwar.tutorialDone")) {
    start();
    return;
  }

  start();

  const steps = [
    "Welcome to Graph War! You are the RED dot on the left. BLUE is on the right.",
    "Type a mathematical function of x (like: 0, x, sin(x)) into the RED input below. Your shot will travel along that curve.",
    "Press Enter or the Fire button to shoot. Try to hit BLUE!",
  ];

  let stepIndex = 0;

  function showStep() {
    if (stepIndex >= steps.length) { finishTutorial(); return; }
    ui!.showTutorialStep(steps[stepIndex], () => { stepIndex++; showStep(); }, finishTutorial);
  }

  function finishTutorial() {
    ui!.hideTutorial();
    localStorage.setItem("graphwar.tutorialDone", "1");
    ui!.focus();
  }

  showStep();
}

// ── Game screen init (lazy — only runs when lobby starts a match) ─────────────

async function startGame(config: MatchConfig) {
  matchConfig = config;

  // Push hash so back-navigation works
  history.pushState(null, "", configToHash(config));

  // Show game, hide lobby
  lobbyEl.hidden = true;
  gameEl.hidden = false;

  // Initialise renderer + UI only once
  if (!renderer) {
    const stage = document.getElementById("game-stage")!;
    renderer = new GameRenderer();
    await renderer.init(stage);

    ui = new GameUI();
    ui.onFire(onFire);
    // "Back to Lobby" button replaces old "Play again"
    ui.onReset(goToLobby);
  }

  bootWithTutorial();
}

// ── Lobby ─────────────────────────────────────────────────────────────────────

function goToLobby() {
  gameEl.hidden = true;
  lobbyEl.hidden = false;
  history.pushState(null, "", "/");
}

// ── Router entry point ────────────────────────────────────────────────────────

function route() {
  const hash = location.hash;
  if (hash.startsWith("#game")) {
    const config = parseConfigFromHash(hash);
    startGame(config);
  } else {
    // Default: show lobby
    lobbyEl.hidden = false;
    gameEl.hidden = true;
    const lobby = new LobbyScreen();
    lobby.onStart((config) => startGame(config));
  }
}

window.addEventListener("popstate", () => {
  if (!location.hash.startsWith("#game")) goToLobby();
});

route();
```

- [ ] **Step 2: Rename `ui.setStatus` call**

The current `GameUI` has `setStatus(note?: string)`. The new main.ts calls `ui!.setStatus()` and `ui!.setStatus("message")`. Verify that `GameUI.setStatus` accepts an optional string — it does (no change needed).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests green including the 7 new `configRouter` tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/main.ts
git commit -m "feat(game): add lobby routing — defer game init, Back to Lobby on match end"
```

---

## Task 5: Browser Validation (stop criteria)

Start the dev server and test every flow with Playwright. Do NOT report done until all of these pass.

```bash
npm run dev
```

Navigate to `http://localhost:5173`.

**Test A — Lobby renders correctly:**
- [ ] Lobby screen visible on load, game canvas NOT visible (no game elements)
- [ ] Title shows "GRAPH WAR" with RED/BLUE colour split
- [ ] "Classic VS" mode button is highlighted (active state), "HP Mode" is greyed/disabled with "Soon" badge
- [ ] "Best of 3" rounds button is active, "Best of 5" is not
- [ ] No-Turn row is present but dimmed and checkbox is disabled
- [ ] "Play Online" button is disabled/greyed
- [ ] No overlapping elements, no layout jank
- [ ] Screenshot the lobby

**Test B — Mode/round selection:**
- [ ] Click "Best of 5" → it becomes active, "Best of 3" deactivates
- [ ] Click "Best of 3" → switches back
- [ ] HP Mode button click has no effect (disabled)
- [ ] Screenshot the updated selection

**Test C — Start game flow:**
- [ ] Click "▶ Play Locally" with "Classic VS" + "Best of 3" selected
- [ ] Lobby hides, game canvas appears with the graph field and HUD
- [ ] URL hash changes to `#game?mode=classic&rounds=3&noTurn=false`
- [ ] Scoreboard shows `RED 0 — BLUE 0 · Round 1/3`
- [ ] Tutorial overlay appears (first run — clear localStorage first with `localStorage.clear()` then reload)
- [ ] Screenshot the game screen

**Test D — Tutorial then game play:**
- [ ] Click through all 3 tutorial steps, confirm tutorial closes
- [ ] Fire a flat shot (`0`) as RED — confirm animation plays and turn switches to BLUE
- [ ] Fire until a hit lands — confirm round splash appears
- [ ] After splash, confirm scoreboard updates (`Round 2/3`)
- [ ] Screenshot mid-game

**Test E — Match end → Back to Lobby:**
- [ ] Play until a match winner (win 2 of 3 rounds)
- [ ] Win banner shows correct winner with "Back to Lobby" button
- [ ] Click "Back to Lobby" → lobby appears, game hides
- [ ] URL resets to `/`
- [ ] Screenshot lobby after returning

**Test F — Direct URL navigation:**
- [ ] Navigate directly to `http://localhost:5173/#game?mode=classic&rounds=5&noTurn=false`
- [ ] Game starts directly, lobby is skipped
- [ ] Scoreboard shows `Round 1/5` (5-round match)
- [ ] Screenshot

**Test G — Edge cases:**
- [ ] Navigate to `http://localhost:5173/#game?rounds=99&mode=invalid` — game starts with defaults (3 rounds, classic mode). Confirm scoreboard shows `Round 1/3`
- [ ] Start a game, press browser back button → returns to lobby

**Test H — No layout issues:**
- [ ] Resize browser window to narrow (e.g. 768px wide) — confirm lobby layout doesn't overlap or break
- [ ] Screenshot narrow layout

- [ ] **Step 6: Commit final validation note**

After all tests pass:
```bash
git add -A
git commit -m "test(lobby): browser validation complete — all flows confirmed" --allow-empty
```

---

## Self-Review

**Spec coverage check (§7):**
- ✅ §7.1 SPA routing — hash-based, `/#lobby` (default `/`) and `/#game?...`
- ✅ §7.2 Lobby flow — Play Locally path fully implemented; Play Online disabled with label
- ✅ §7.2 Mode cards — Classic VS (active), HP Mode (disabled + badge)
- ✅ §7.2 Round picker — 3 or 5, toggleable
- ✅ §7.2 No-Turn — disabled checkbox present
- ✅ §7.3 Mode cards with one-line descriptions ✓ (implemented as `<small>` text)
- ✅ §7.3 Settings locked once play starts — lobby hides; no way to change mid-game
- ✅ "Back to Lobby" replaces "Play again"
- ✅ `MatchConfig` flows from lobby → `startGame()` → game logic

**Placeholder scan:** None. HP Mode and No-Turn are explicitly disabled, not "TBD."

**Type consistency:**
- `MatchConfig` imported from `./matchLogic` in `configRouter.ts` and `main.ts` ✓
- `configToHash` / `parseConfigFromHash` imported in `main.ts` from `./configRouter` ✓
- `LobbyScreen.onStart(cb)` callback signature matches `startGame(config: MatchConfig)` ✓

**Open questions:**
- Should "Back to Lobby" clear the tutorial flag? (No — tutorial only runs once, per spec.)
- Should the lobby remember the last-used config across sessions? (Not in spec — defer to later.)
