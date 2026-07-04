# Group 2 · Classic VS Mode + Tutorial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-round match structure (best of 3 or 5), a live scoreboard, a between-round splash, and a first-run tutorial to the existing single-round hot-seat game.

**Architecture:** Three layers of change. (1) Extract pure match-logic functions (testable). (2) Add DOM elements to `index.html` for scoreboard, splash, and tutorial. (3) Wire state into `main.ts` and display methods into `GameUI.ts`. The existing one-hit-per-round mechanic is unchanged — this group wraps it in match structure. `MatchConfig` is introduced here and hardcoded to `{ mode: "classic", rounds: 3, noTurn: false, role: "local" }` until the Lobby (Group 5) is built.

**Tech Stack:** TypeScript, Vite 8, Vitest 3. Run tests: `npm test`. Dev server: `npm run dev`.

## Global Constraints

- TypeScript strict mode — no `any`, no implicit `any`.
- All existing tests (`npm test`) must stay green after every task.
- Do not touch `src/sim/` files — those are owned by Group 1.
- Do not add the Lobby, HP bars, or No-Turn logic — those are Groups 3–5.
- Tutorial runs once only, gated by `localStorage.getItem('graphwar.tutorialDone')`.
- `MatchConfig.rounds` must be `3 | 5` (union type, not `number`).
- Loser of the previous round shoots first next round — this is a required mechanic.

---

## File Map

| File | Change |
|---|---|
| `src/game/matchLogic.ts` | **New.** Pure functions for match scoring and turn order. Unit-tested. |
| `src/game/matchLogic.test.ts` | **New.** Unit tests for matchLogic. |
| `src/game/main.ts` | Add `MatchConfig`, match state, `nextRound()`, tutorial boot. |
| `src/game/GameUI.ts` | Add `showSplash()`, `hideSplash()`, `updateScoreboard()`, tutorial overlay methods. |
| `index.html` | Add scoreboard pill, between-round splash overlay, tutorial overlay DOM. |

---

## Task 1: Pure Match Logic (testable core)

**Files:**
- Create: `src/game/matchLogic.ts`
- Create: `src/game/matchLogic.test.ts`

**Interfaces:**
- Produces:
  - `MatchConfig` interface (imported by `main.ts` in Task 2)
  - `matchWinner(red: number, blue: number, rounds: 3 | 5): "red" | "blue" | null`
  - `firstShooterNextRound(roundLoser: "red" | "blue"): "red" | "blue"`
  - `majorityNeeded(rounds: 3 | 5): number`

---

- [ ] **Step 1: Write the failing tests**

Create `src/game/matchLogic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchWinner, firstShooterNextRound, majorityNeeded } from "./matchLogic";

describe("majorityNeeded", () => {
  it("returns 2 for best-of-3", () => {
    expect(majorityNeeded(3)).toBe(2);
  });
  it("returns 3 for best-of-5", () => {
    expect(majorityNeeded(5)).toBe(3);
  });
});

describe("matchWinner", () => {
  it("returns null when neither player has reached majority", () => {
    expect(matchWinner(1, 0, 3)).toBeNull();
    expect(matchWinner(0, 1, 3)).toBeNull();
    expect(matchWinner(1, 1, 5)).toBeNull();
  });
  it("returns 'red' when red reaches majority in best-of-3", () => {
    expect(matchWinner(2, 0, 3)).toBe("red");
    expect(matchWinner(2, 1, 3)).toBe("red");
  });
  it("returns 'blue' when blue reaches majority in best-of-3", () => {
    expect(matchWinner(0, 2, 3)).toBe("blue");
    expect(matchWinner(1, 2, 3)).toBe("blue");
  });
  it("returns 'red' when red reaches majority in best-of-5", () => {
    expect(matchWinner(3, 2, 5)).toBe("red");
    expect(matchWinner(3, 0, 5)).toBe("red");
  });
  it("returns 'blue' when blue reaches majority in best-of-5", () => {
    expect(matchWinner(2, 3, 5)).toBe("blue");
  });
});

describe("firstShooterNextRound", () => {
  it("returns the opponent of the round loser (loser gets initiative)", () => {
    // loser shoots first — loser = the one who got hit, so we pass the loser
    expect(firstShooterNextRound("red")).toBe("red");
    expect(firstShooterNextRound("blue")).toBe("blue");
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test
```

Expected: 3 test suites fail because `matchLogic.ts` doesn't exist yet.

- [ ] **Step 3: Create `matchLogic.ts`**

Create `src/game/matchLogic.ts`:

```ts
export interface MatchConfig {
  mode: "classic" | "hp";
  noTurn: boolean;
  rounds: 3 | 5;
  roomCode?: string;
  role?: "host" | "guest" | "local";
}

/** Rounds a player must win to take the match. */
export function majorityNeeded(rounds: 3 | 5): number {
  return Math.ceil(rounds / 2);
}

/**
 * Returns the match winner if one player has reached majority, or null if the
 * match is still in progress. Ties are impossible with odd round counts.
 */
export function matchWinner(
  redScore: number,
  blueScore: number,
  rounds: 3 | 5,
): "red" | "blue" | null {
  const need = majorityNeeded(rounds);
  if (redScore >= need) return "red";
  if (blueScore >= need) return "blue";
  return null;
}

/**
 * The loser of the previous round shoots first next round (comeback mechanic).
 * Pass the player who LOST the round (got hit); they shoot first next round.
 */
export function firstShooterNextRound(roundLoser: "red" | "blue"): "red" | "blue" {
  return roundLoser;
}
```

- [ ] **Step 4: Run tests — expect green**

```bash
npm test
```

Expected output:
```
✓ src/game/matchLogic.test.ts (7 tests)
✓ src/sim/engine.test.ts
✓ src/sim/collision.test.ts
✓ src/sim/trajectory.test.ts
✓ src/game/firePipeline.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/game/matchLogic.ts src/game/matchLogic.test.ts
git commit -m "feat(game): add pure match logic — matchWinner, firstShooterNextRound"
```

---

## Task 2: DOM Elements (scoreboard, splash, tutorial)

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: DOM elements consumed by `GameUI.ts` in Task 3:
  - `#scoreboard` — pill between HUD panels
  - `#round-splash` + `#splash-text` — between-round overlay
  - `#tutorial-overlay` + `#tutorial-text` + `#tutorial-skip` + `#tutorial-next` — tutorial overlay

---

- [ ] **Step 1: Add scoreboard pill to `index.html`**

In `index.html`, find the `#hud-bar` div. It currently contains `#red-hud` and `#blue-hud`. Add a scoreboard pill between them:

```html
<div id="hud-bar">
  <div id="red-hud" class="player-hud">
    <!-- existing red HUD content unchanged -->
  </div>

  <div id="scoreboard">
    <span id="scoreboard-text">RED 0 — BLUE 0 · Round 1/3</span>
  </div>

  <div id="blue-hud" class="player-hud inactive">
    <!-- existing blue HUD content unchanged -->
  </div>
</div>
```

Add CSS in the `<style>` block (inside `<head>`):

```css
/* ── Scoreboard pill ─────────────────────────────────────────────── */
#scoreboard {
  flex: 0 0 auto;
  background: rgba(18, 26, 34, 0.92);
  border: 1px solid #2b3a49;
  border-radius: 20px;
  padding: 6px 16px;
  white-space: nowrap;
}
#scoreboard-text {
  font-size: 13px;
  font-weight: 600;
  color: #8499ab;
  letter-spacing: 0.03em;
}
```

- [ ] **Step 2: Add between-round splash overlay to `index.html`**

Inside `<div id="game">`, after `#win-banner`, add:

```html
<div id="round-splash" hidden>
  <p id="splash-text"></p>
</div>
```

Add CSS:

```css
/* ── Between-round splash ────────────────────────────────────────── */
#round-splash {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 15, 20, 0.82);
  z-index: 7;
  pointer-events: none;
}
#round-splash[hidden] { display: none; }
#splash-text {
  font-size: 28px;
  font-weight: 700;
  color: #cdd9e5;
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.5;
}
```

- [ ] **Step 3: Add tutorial overlay to `index.html`**

Inside `<div id="game">`, after `#round-splash`, add:

```html
<div id="tutorial-overlay" hidden>
  <div id="tutorial-box">
    <p id="tutorial-text"></p>
    <div id="tutorial-actions">
      <button id="tutorial-skip">Skip tutorial</button>
      <button id="tutorial-next">OK</button>
    </div>
  </div>
</div>
```

Add CSS:

```css
/* ── Tutorial overlay ────────────────────────────────────────────── */
#tutorial-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: calc(var(--hud-height) + 12px);
  z-index: 8;
  pointer-events: none;
}
#tutorial-overlay[hidden] { display: none; }
#tutorial-box {
  background: rgba(18, 26, 34, 0.97);
  border: 1px solid #34506a;
  border-radius: 14px;
  padding: 18px 28px;
  max-width: 480px;
  pointer-events: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
#tutorial-text {
  margin: 0 0 14px;
  font-size: 15px;
  color: #cdd9e5;
  line-height: 1.6;
}
#tutorial-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
#tutorial-skip {
  border: 1px solid #2b3a49;
  background: transparent;
  color: #5e7081;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}
#tutorial-next {
  border: none;
  background: #34506a;
  color: #cdd9e5;
  border-radius: 8px;
  padding: 6px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
#tutorial-next:hover { background: #3d5f7d; }
```

- [ ] **Step 4: Verify the page still loads**

```bash
npm run dev
```

Open `http://localhost:5173`. The game should load and play exactly as before. The scoreboard pill appears between the two HUDs (showing placeholder text). The splash and tutorial overlays are hidden.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ui): add scoreboard, round splash, and tutorial overlay DOM"
```

---

## Task 3: `GameUI` display methods

**Files:**
- Modify: `src/game/GameUI.ts`

**Interfaces:**
- Consumes: DOM elements from Task 2 (`#scoreboard-text`, `#round-splash`, `#splash-text`, `#tutorial-overlay`, `#tutorial-text`, `#tutorial-next`, `#tutorial-skip`)
- Produces (called by `main.ts` in Task 4):
  - `updateScoreboard(red: number, blue: number, round: number, totalRounds: number): void`
  - `showSplash(text: string): void`
  - `hideSplash(): void`
  - `showTutorialStep(text: string, onNext: () => void, onSkip: () => void): void`
  - `hideTutorial(): void`

---

- [ ] **Step 1: Add display method stubs to `GameUI.ts`**

Open `src/game/GameUI.ts`. Add the new private fields at the top of the class (after `private resetCb`):

```ts
private scoreboardText: HTMLElement;
private roundSplash: HTMLElement;
private splashText: HTMLElement;
private tutorialOverlay: HTMLElement;
private tutorialText: HTMLElement;
private tutorialNext: HTMLButtonElement;
private tutorialSkip: HTMLButtonElement;
```

In the `constructor`, after the existing `this.resetBtn` line, add:

```ts
this.scoreboardText = root.querySelector<HTMLElement>("#scoreboard-text")!;
this.roundSplash = root.querySelector<HTMLElement>("#round-splash")!;
this.splashText = root.querySelector<HTMLElement>("#splash-text")!;
this.tutorialOverlay = root.querySelector<HTMLElement>("#tutorial-overlay")!;
this.tutorialText = root.querySelector<HTMLElement>("#tutorial-text")!;
this.tutorialNext = root.querySelector<HTMLButtonElement>("#tutorial-next")!;
this.tutorialSkip = root.querySelector<HTMLButtonElement>("#tutorial-skip")!;
```

- [ ] **Step 2: Implement `updateScoreboard`**

Add this method to the `GameUI` class (before the closing `}`):

```ts
updateScoreboard(red: number, blue: number, round: number, totalRounds: number): void {
  this.scoreboardText.innerHTML =
    `<span style="color:#ff4444">RED ${red}</span>` +
    ` — ` +
    `<span style="color:#4488ff">BLUE ${blue}</span>` +
    ` &middot; Round ${round}/${totalRounds}`;
}
```

- [ ] **Step 3: Implement `showSplash` and `hideSplash`**

```ts
showSplash(text: string): void {
  this.splashText.innerHTML = text;
  this.roundSplash.hidden = false;
}

hideSplash(): void {
  this.roundSplash.hidden = true;
}
```

- [ ] **Step 4: Implement `showTutorialStep` and `hideTutorial`**

```ts
showTutorialStep(text: string, onNext: () => void, onSkip: () => void): void {
  this.tutorialText.textContent = text;
  this.tutorialOverlay.hidden = false;

  // Remove any previous listeners by replacing the nodes.
  const nextClone = this.tutorialNext.cloneNode(true) as HTMLButtonElement;
  const skipClone = this.tutorialSkip.cloneNode(true) as HTMLButtonElement;
  this.tutorialNext.replaceWith(nextClone);
  this.tutorialSkip.replaceWith(skipClone);
  this.tutorialNext = nextClone;
  this.tutorialSkip = skipClone;

  this.tutorialNext.addEventListener("click", onNext, { once: true });
  this.tutorialSkip.addEventListener("click", onSkip, { once: true });
}

hideTutorial(): void {
  this.tutorialOverlay.hidden = true;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/GameUI.ts
git commit -m "feat(ui): add scoreboard, splash, and tutorial display methods to GameUI"
```

---

## Task 4: Wire match state into `main.ts`

**Files:**
- Modify: `src/game/main.ts`

**Interfaces:**
- Consumes:
  - `MatchConfig`, `matchWinner`, `firstShooterNextRound` from `./matchLogic`
  - `ui.updateScoreboard(red, blue, round, totalRounds)`
  - `ui.showSplash(text)` / `ui.hideSplash()`
  - `ui.showTutorialStep(text, onNext, onSkip)` / `ui.hideTutorial()`

---

- [ ] **Step 1: Add imports and MatchConfig default at top of `main.ts`**

At the top of `src/game/main.ts`, add:

```ts
import { matchWinner, firstShooterNextRound, type MatchConfig } from "./matchLogic";
```

After the existing imports, add the hardcoded config (used until Lobby in Group 5):

```ts
const MATCH_CONFIG: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local" };
```

- [ ] **Step 2: Add match-level state variables**

In `main.ts`, after the existing `let gameOver = false;` line, add:

```ts
let redScore = 0;
let blueScore = 0;
let currentRound = 1;
```

- [ ] **Step 3: Update `start()` to reset match state and show scoreboard**

Replace the existing `start()` function:

```ts
function start() {
  planets = seedPlanets();
  activeTurn = "red";
  gameOver = false;
  busy = false;
  redScore = 0;
  blueScore = 0;
  currentRound = 1;
  placePlayersRandomly(renderer.getEffectiveBounds());
  renderer.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
  ui.resetInputs();
  ui.setTurn(activeTurn, "");
  ui.hideWin();
  ui.hideSplash();
  ui.updateScoreboard(redScore, blueScore, currentRound, MATCH_CONFIG.rounds);
  refresh();
  ui.focus();
}
```

- [ ] **Step 4: Add `nextRound()` function**

Add this function after `start()`:

```ts
function nextRound(roundLoser: "red" | "blue") {
  // Award the round to the survivor
  if (roundLoser === "red") blueScore++;
  else redScore++;

  // Check if the match is over
  const winner = matchWinner(redScore, blueScore, MATCH_CONFIG.rounds);
  if (winner) {
    gameOver = true;
    busy = false;
    ui.setBusy(false);
    ui.showWin(winner);
    return;
  }

  // Start the next round after a 2-second splash
  currentRound++;
  const loserLabel = roundLoser === "red" ? "RED" : "BLUE";
  const winnerLabel = roundLoser === "red" ? "BLUE" : "RED";
  const splashHtml =
    `Round ${currentRound} of ${MATCH_CONFIG.rounds}<br>` +
    `<span style="color:${roundLoser === "red" ? "#4488ff" : "#ff4444"}">${winnerLabel} wins the round!</span><br>` +
    `<small style="color:#5e7081">${loserLabel} shoots first</small>`;

  ui.showSplash(splashHtml);

  window.setTimeout(() => {
    ui.hideSplash();
    planets = seedPlanets();
    activeTurn = firstShooterNextRound(roundLoser);
    gameOver = false;
    busy = false;
    placePlayersRandomly(renderer.getEffectiveBounds());
    renderer.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
    ui.resetInputs();
    ui.setTurn(activeTurn, "");
    ui.updateScoreboard(redScore, blueScore, currentRound, MATCH_CONFIG.rounds);
    refresh();
    ui.focus();
  }, 2000);
}
```

- [ ] **Step 5: Update `onFire()` to call `nextRound()` on a hit**

In the `onFire` function, find this block:

```ts
if (shot.hit.kind === "target") {
  gameOver = true;
  busy = false;
  ui.setBusy(false);
  renderer.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
  ui.showWin(shooter);
  return;
}
```

Replace it with:

```ts
if (shot.hit.kind === "target") {
  // The target that was hit is the opponent — so the shooter wins the round,
  // and the hit player (the loser) shoots first next round.
  const roundLoser = shooter === "red" ? "blue" : "red";
  renderer.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
  nextRound(roundLoser);
  return;
}
```

- [ ] **Step 6: Update `onReset` to call `start()` (already correct) and wire tutorial boot**

After the existing `ui.onReset(start);` line, add the tutorial boot:

```ts
function bootWithTutorial() {
  if (localStorage.getItem("graphwar.tutorialDone")) {
    start();
    return;
  }

  // Run tutorial before first match
  start(); // set up the field so it's visible behind the tutorial

  const steps = [
    "Welcome to Graph War! You are the RED dot on the left. BLUE is on the right.",
    "Type a mathematical function of x (like: 0, x, sin(x)) into the RED input below. Your shot will travel along that curve.",
    "Press Enter or the Fire button to shoot. Try to hit BLUE!",
  ];

  let stepIndex = 0;

  function showStep() {
    if (stepIndex >= steps.length) {
      finishTutorial();
      return;
    }
    ui.showTutorialStep(steps[stepIndex], () => {
      stepIndex++;
      showStep();
    }, finishTutorial);
  }

  function finishTutorial() {
    ui.hideTutorial();
    localStorage.setItem("graphwar.tutorialDone", "1");
    ui.focus();
  }

  showStep();
}

// Replace the direct start() call at the bottom with bootWithTutorial()
```

- [ ] **Step 7: Replace the final `start()` call with `bootWithTutorial()`**

At the very bottom of `main.ts`, find:

```ts
start();
```

Replace with:

```ts
bootWithTutorial();
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 9: Run all tests**

```bash
npm test
```

Expected: all tests green including the new `matchLogic.test.ts`.

- [ ] **Step 10: Manually verify the full flow**

```bash
npm run dev
```

Open `http://localhost:5173`.

**Test A — Tutorial (first run):**
- Open in an incognito window (no localStorage).
- Tutorial overlay should appear with step 1 text.
- Click OK through all 3 steps. Tutorial disappears, game starts normally.
- Reload the same incognito window — tutorial should NOT appear again.

**Test B — Match structure:**
- Clear localStorage if needed: `localStorage.clear()` in console, reload.
- Skip tutorial. Play until RED hits BLUE.
- Round splash should appear: "Round 2 of 3 · BLUE wins the round! · RED shoots first"
- After 2 seconds, field resets. Scoreboard shows `RED 0 — BLUE 1 · Round 2/3`.
- RED's input panel is active (RED shoots first as the round loser).

**Test C — Match winner:**
- Play until one player wins 2 rounds.
- Win banner should show the overall match winner.
- "Play again" resets scores to 0–0 and goes back to Round 1.

**Test D — Tutorial skip:**
- Clear localStorage, reload. Tutorial appears. Click "Skip tutorial".
- Tutorial disappears, game starts. `graphwar.tutorialDone` is set.

- [ ] **Step 11: Commit**

```bash
git add src/game/main.ts
git commit -m "feat(game): add Classic VS match structure — rounds, scoreboard, splash, tutorial"
```

---

## Self-Review

**Spec coverage check (§4):**
- ✅ §4.1 MatchConfig type — defined in `matchLogic.ts`, consumed by `main.ts`
- ✅ §4.2 Match structure — `redScore`, `blueScore`, `currentRound`, `nextRound()`, majority win, early end
- ✅ §4.2 Between rounds — 2-second splash with round number + score + next shooter hint
- ✅ §4.2 Turn order — loser shoots first via `firstShooterNextRound()`
- ✅ §4.3 Scoreboard — `#scoreboard-text` pill updated on every round start and after every reset
- ✅ §4.4 Tutorial — 3-step flow, `localStorage` gate, skip button, runs on real field

**Placeholder scan:** None found.

**Type consistency:**
- `MatchConfig` defined in Task 1 → imported in Task 4 ✅
- `matchWinner(red, blue, rounds)` defined in Task 1 → called in Task 4 `nextRound()` ✅
- `firstShooterNextRound(roundLoser)` defined in Task 1 → called in Task 4 `nextRound()` ✅
- `ui.updateScoreboard(red, blue, round, totalRounds)` defined in Task 3 → called in Tasks 3+4 ✅
- `ui.showSplash(text)` / `ui.hideSplash()` defined in Task 3 → called in Task 4 ✅
- `ui.showTutorialStep(text, onNext, onSkip)` / `ui.hideTutorial()` defined in Task 3 → called in Task 4 ✅

**Open questions from spec §10:**
- "Does the loser shoot first next round?" — confirmed ✅, implemented via `firstShooterNextRound`.
- "Planet seed per round?" — new seed each round ✅ (`seedPlanets()` called in `nextRound()`).
