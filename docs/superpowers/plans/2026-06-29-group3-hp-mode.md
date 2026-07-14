# Group 3 · HP Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add HP Mode — a second game mode where each round players have 100 HP, hits deal slope-based damage (5–50), and the round ends when HP hits 0.

**Architecture:** Pure damage formula in `hpLogic.ts` (testable). HP state (`redHp`, `blueHp`) lives in `main.ts`. HP bars are CSS elements in `index.html` controlled by new `GameUI` methods. Floating damage numbers are Pixi.js Text in `GameRenderer`. `main.ts` branches on `matchConfig.mode` when resolving a target hit. HP Mode button in the lobby is enabled and wired through to `matchConfig`.

**Tech Stack:** TypeScript strict, Vite 8, Vitest 3, Pixi.js 8. Tests: `npm test`. Dev: `npm run dev`.

## Global Constraints

- TypeScript strict mode — no `any`, no implicit `any`.
- All existing tests (118) must stay green after every task.
- HP Mode coexists with Classic VS — existing classic behaviour is fully unchanged.
- Damage formula (verbatim from spec §3.2):
  `dmg = Math.round(Math.min(50, Math.max(5, 5 + 35 * Math.tanh(impactSlope / 2))))`
  - slope 0   → 5 (floor)
  - slope 0.5 → 17
  - slope 1   → 26
  - slope 2   → 40
  - slope ∞   → 50 (cap)
- HP resets to 100 at the start of every round (not every shot).
- Minimum 5 damage per hit regardless of slope — a hit always hurts.
- Turn order in HP mode is identical to Classic VS (alternating, loser first next round).
- Floating damage number: `-{dmg}` in player's colour, animates upward 40px, fades over 700 ms.
- `showWin` detail text: Classic mode → `"Direct hit."`, HP mode → `"Health depleted."`.
- Do NOT touch `src/sim/`, `src/game/GameRenderer.ts` (except Task 4), `src/game/matchLogic.ts`, `src/game/configRouter.ts`.

---

## File Map

| File | Change |
|---|---|
| `src/game/hpLogic.ts` | **New.** `HP_MAX = 100`, `computeDamage(slope)` |
| `src/game/hpLogic.test.ts` | **New.** Unit tests for damage formula |
| `index.html` | Add HP bar DOM under each HUD panel; remove `disabled` from `#lobby-mode-hp` |
| `src/game/GameUI.ts` | Add `showHpBars()`, `updateHp()`; update `showWin()` with detail param |
| `src/game/GameRenderer.ts` | Add `showFloatingDamage(at, dmg, player)` |
| `src/game/main.ts` | HP state + HP-mode-branched hit handler; HP reset between rounds |
| `src/ui/LobbyScreen.ts` | Enable HP Mode selection (remove disabled guard) |

---

## Task 1: `hpLogic.ts` — Pure Damage Formula + Tests

**Files:**
- Create: `src/game/hpLogic.ts`
- Create: `src/game/hpLogic.test.ts`

**Interfaces:**
- Produces:
  - `HP_MAX: number` (= 100)
  - `computeDamage(impactSlope: number): number`
- Consumed by Task 5 (`main.ts`)

---

- [ ] **Step 1: Write the failing tests**

Create `src/game/hpLogic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDamage, HP_MAX } from "./hpLogic";

describe("HP_MAX", () => {
  it("is 100", () => {
    expect(HP_MAX).toBe(100);
  });
});

describe("computeDamage", () => {
  it("returns floor of 5 for slope 0", () => {
    expect(computeDamage(0)).toBe(5);
  });

  it("returns ~17 for slope 0.5", () => {
    expect(computeDamage(0.5)).toBeGreaterThanOrEqual(15);
    expect(computeDamage(0.5)).toBeLessThanOrEqual(19);
  });

  it("returns ~26 for slope 1", () => {
    expect(computeDamage(1)).toBeGreaterThanOrEqual(24);
    expect(computeDamage(1)).toBeLessThanOrEqual(28);
  });

  it("returns ~40 for slope 2", () => {
    expect(computeDamage(2)).toBeGreaterThanOrEqual(38);
    expect(computeDamage(2)).toBeLessThanOrEqual(42);
  });

  it("caps at 50 for very high slope", () => {
    expect(computeDamage(100)).toBe(50);
    expect(computeDamage(50)).toBe(50);
  });

  it("always returns an integer", () => {
    for (const s of [0, 0.3, 1.7, 5, 20]) {
      expect(Number.isInteger(computeDamage(s))).toBe(true);
    }
  });

  it("always returns at least 5", () => {
    for (const s of [0, -1, -100]) {
      expect(computeDamage(s)).toBeGreaterThanOrEqual(5);
    }
  });

  it("always returns at most 50", () => {
    for (const s of [10, 50, 1000]) {
      expect(computeDamage(s)).toBeLessThanOrEqual(50);
    }
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test
```

Expected: test file fails because `hpLogic.ts` does not exist.

- [ ] **Step 3: Create `hpLogic.ts`**

Create `src/game/hpLogic.ts`:

```ts
export const HP_MAX = 100;

/**
 * Damage dealt on a target hit in HP Mode.
 * Steeper impact angle = faster bullet = more damage.
 * Formula from spec §3.2. Range: [5, 50].
 */
export function computeDamage(impactSlope: number): number {
  return Math.round(Math.min(50, Math.max(5, 5 + 35 * Math.tanh(impactSlope / 2))));
}
```

- [ ] **Step 4: Run tests — expect all green**

```bash
npm test
```

Expected: all 8 new tests pass, all 118 existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/hpLogic.ts src/game/hpLogic.test.ts
git commit -m "feat(game): add computeDamage formula and HP_MAX for HP Mode"
```

---

## Task 2: HP Bar DOM in `index.html`

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces DOM consumed by `GameUI` in Task 3:
  - `#red-hp-bar-wrap`, `#red-hp-bar`, `#red-hp-label`
  - `#blue-hp-bar-wrap`, `#blue-hp-bar`, `#blue-hp-label`
- Also enables `#lobby-mode-hp` button (removes `disabled` attribute).

---

- [ ] **Step 1: Add HP bar CSS to the `<style>` block**

Add at the end of the `<style>` block, before `</style>`:

```css
/* ── HP bars (HP Mode only) ──────────────────────────────────────── */
.hp-bar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hp-bar-wrap[hidden] { display: none; }
.hp-bar-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}
.hp-bar {
  height: 100%;
  width: 100%;
  border-radius: 3px;
  background: var(--hud-color);
  transition: width 0.25s ease;
}
.hp-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--hud-color);
  white-space: nowrap;
  min-width: 38px;
  text-align: right;
}
```

- [ ] **Step 2: Add HP bar DOM inside `#red-hud`**

Find this block in `index.html`:

```html
        <div id="red-hud" class="player-hud">
          <div class="hud-fire-row">
```

Replace with:

```html
        <div id="red-hud" class="player-hud">
          <div class="hud-fire-row">
```

(No change to the outer wrapper itself.) Now find the closing `</div>` of the `.hud-fire-row` inside `#red-hud`, followed by the `#red-status` div. Insert the HP bar wrap BETWEEN the fire-row and the status div:

Find:
```html
          </div>
          <div id="red-status" class="hud-status"></div>
        </div>
```

Replace with:
```html
          </div>
          <div id="red-hp-bar-wrap" class="hp-bar-wrap" hidden>
            <div class="hp-bar-track">
              <div id="red-hp-bar" class="hp-bar"></div>
            </div>
            <span id="red-hp-label" class="hp-label">100 HP</span>
          </div>
          <div id="red-status" class="hud-status"></div>
        </div>
```

- [ ] **Step 3: Add HP bar DOM inside `#blue-hud`**

Find:
```html
          </div>
          <div id="blue-status" class="hud-status"></div>
        </div>
```

Replace with:
```html
          </div>
          <div id="blue-hp-bar-wrap" class="hp-bar-wrap" hidden>
            <div class="hp-bar-track">
              <div id="blue-hp-bar" class="hp-bar"></div>
            </div>
            <span id="blue-hp-label" class="hp-label">100 HP</span>
          </div>
          <div id="blue-status" class="hud-status"></div>
        </div>
```

- [ ] **Step 4: Enable HP Mode button in lobby**

Find:
```html
            <button id="lobby-mode-hp" class="lobby-mode-btn" disabled>
```

Replace with:
```html
            <button id="lobby-mode-hp" class="lobby-mode-btn">
```

Also find and remove the `<span class="coming-soon-badge">Soon</span>` that is a direct child of the HP mode button (it's inside the button tag). The button now looks like:

```html
            <button id="lobby-mode-hp" class="lobby-mode-btn">
              HP Mode
              <small style="display:block;font-size:11px;font-weight:400;color:#5e7081;margin-top:2px">Slope = damage</small>
            </button>
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all 126 tests pass (no new tests for HTML changes).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(ui): add HP bar DOM to HUD panels; enable HP Mode lobby button"
```

---

## Task 3: `GameUI.ts` — HP Bar Methods

**Files:**
- Modify: `src/game/GameUI.ts`

**Interfaces:**
- Produces:
  - `showHpBars(visible: boolean): void` — toggle both HP bar wraps
  - `updateHp(redHp: number, blueHp: number): void` — set bar widths + labels
  - `showWin(winner: "red" | "blue", detail?: string): void` — now accepts optional detail text (default `"Direct hit."`)

---

- [ ] **Step 1: Add HP bar element refs to the constructor**

In `GameUI.ts`, add these private fields (after the existing ones):

```ts
private redHpBarWrap: HTMLElement;
private redHpBar: HTMLElement;
private redHpLabel: HTMLElement;
private blueHpBarWrap: HTMLElement;
private blueHpBar: HTMLElement;
private blueHpLabel: HTMLElement;
```

In the constructor body, add queries after the existing ones:

```ts
this.redHpBarWrap = root.querySelector<HTMLElement>("#red-hp-bar-wrap")!;
this.redHpBar = root.querySelector<HTMLElement>("#red-hp-bar")!;
this.redHpLabel = root.querySelector<HTMLElement>("#red-hp-label")!;
this.blueHpBarWrap = root.querySelector<HTMLElement>("#blue-hp-bar-wrap")!;
this.blueHpBar = root.querySelector<HTMLElement>("#blue-hp-bar")!;
this.blueHpLabel = root.querySelector<HTMLElement>("#blue-hp-label")!;
```

- [ ] **Step 2: Add `showHpBars` method**

Add after the `hideTutorial` method:

```ts
showHpBars(visible: boolean): void {
  this.redHpBarWrap.hidden = !visible;
  this.blueHpBarWrap.hidden = !visible;
}
```

- [ ] **Step 3: Add `updateHp` method**

```ts
updateHp(redHp: number, blueHp: number): void {
  const rPct = Math.max(0, Math.min(100, redHp));
  const bPct = Math.max(0, Math.min(100, blueHp));
  this.redHpBar.style.width = `${rPct}%`;
  this.blueHpBar.style.width = `${bPct}%`;
  this.redHpLabel.textContent = `${redHp} HP`;
  this.blueHpLabel.textContent = `${blueHp} HP`;
}
```

- [ ] **Step 4: Update `showWin` to accept optional detail**

Find:
```ts
showWin(winner: "red" | "blue") {
  const p = PLAYER[winner];
  this.winTitle.innerHTML = `<span style="color:${p.color}">${p.label} WINS!</span>`;
  this.winDetail.textContent = "Direct hit.";
  this.banner.hidden = false;
}
```

Replace with:
```ts
showWin(winner: "red" | "blue", detail = "Direct hit."): void {
  const p = PLAYER[winner];
  this.winTitle.innerHTML = `<span style="color:${p.color}">${p.label} WINS!</span>`;
  this.winDetail.textContent = detail;
  this.banner.hidden = false;
}
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all 126 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/GameUI.ts
git commit -m "feat(ui): add showHpBars, updateHp; update showWin with detail param"
```

---

## Task 4: `GameRenderer.ts` — Floating Damage Number

**Files:**
- Modify: `src/game/GameRenderer.ts`

**Interfaces:**
- Produces: `showFloatingDamage(at: Vec2, dmg: number, player: "red" | "blue"): void`
- Consumed by Task 5 (`main.ts`)

---

- [ ] **Step 1: Add `showFloatingDamage` method**

In `src/game/GameRenderer.ts`, add this method after the `flashDud` method (before `toScreen`):

```ts
showFloatingDamage(at: Vec2, dmg: number, player: "red" | "blue"): void {
  const color = player === "red" ? COLORS.red : COLORS.blue;
  const pos = this.toScreen(at);
  const text = new Text({
    text: `-${dmg}`,
    style: {
      fill: color,
      fontSize: 22,
      fontWeight: "bold",
      fontFamily: "system-ui, -apple-system, sans-serif",
    },
  });
  text.anchor.set(0.5, 1);
  text.position.set(pos.x, pos.y);
  text.alpha = 1;
  this.fxLayer.addChild(text);

  const startMs = performance.now();
  const dur = 700;
  const startY = pos.y;
  const tick = () => {
    const p = Math.min(1, (performance.now() - startMs) / dur);
    text.y = startY - p * 40;
    text.alpha = 1 - p;
    if (p >= 1) {
      this.app.ticker.remove(tick);
      if (!text.destroyed) text.destroy();
    }
  };
  this.app.ticker.add(tick);
}
```

Note: `Text` is already imported from `"pixi.js"` in the existing import at the top of the file. Verify this is the case before adding code — if Text is not imported, add it to the import.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all 126 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/GameRenderer.ts
git commit -m "feat(renderer): add showFloatingDamage Pixi text animation for HP Mode"
```

---

## Task 5: Integration — `main.ts` + `LobbyScreen.ts`

**Files:**
- Modify: `src/game/main.ts`
- Modify: `src/ui/LobbyScreen.ts`

**Interfaces:**
- Consumes:
  - `HP_MAX`, `computeDamage` from `./hpLogic`
  - `ui!.showHpBars(visible)`, `ui!.updateHp(red, blue)` from Task 3
  - `renderer!.showFloatingDamage(at, dmg, player)` from Task 4
  - `ui!.showWin(winner, detail)` from Task 3

---

- [ ] **Step 1: Add HP state and import to `main.ts`**

At the top of `src/game/main.ts`, add the import:

```ts
import { HP_MAX, computeDamage } from "./hpLogic";
```

After the `let currentRound = 1;` declaration, add:

```ts
let redHp = HP_MAX;
let blueHp = HP_MAX;
```

- [ ] **Step 2: Reset HP in `start()`**

In the `start()` function, after `redScore = 0; blueScore = 0; currentRound = 1;`, add:

```ts
redHp = HP_MAX;
blueHp = HP_MAX;
```

After `ui!.updateScoreboard(...)`, add:

```ts
ui!.showHpBars(matchConfig.mode === "hp");
ui!.updateHp(redHp, blueHp);
```

- [ ] **Step 3: Reset HP between rounds in `nextRound()`**

Inside the `window.setTimeout` callback in `nextRound()`, after `ui!.updateScoreboard(...)`, add:

```ts
if (matchConfig.mode === "hp") {
  redHp = HP_MAX;
  blueHp = HP_MAX;
  ui!.updateHp(redHp, blueHp);
}
```

- [ ] **Step 4: Update `nextRound` win banner for HP mode**

In `nextRound()`, find:

```ts
const winner = matchWinner(redScore, blueScore, matchConfig.rounds);
if (winner) {
  gameOver = true;
  busy = false;
  ui!.setBusy(false);
  ui!.showWin(winner);
  return;
}
```

Replace with:

```ts
const winner = matchWinner(redScore, blueScore, matchConfig.rounds);
if (winner) {
  gameOver = true;
  busy = false;
  ui!.setBusy(false);
  ui!.showWin(winner, matchConfig.mode === "hp" ? "Health depleted." : "Direct hit.");
  return;
}
```

- [ ] **Step 5: Branch on mode in `onFire` after a target hit**

In `onFire()`, find:

```ts
if (shot.hit.kind === "target") {
  const roundLoser = shooter === "red" ? "blue" : "red";
  renderer!.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
  nextRound(roundLoser);
  return;
}
```

Replace with:

```ts
if (shot.hit.kind === "target") {
  if (matchConfig.mode === "hp") {
    // HP mode: apply damage, end round only when HP hits 0
    const defender = shooter === "red" ? "blue" : "red";
    const dmg = computeDamage(shot.impactSlope);

    if (defender === "red") {
      redHp = Math.max(0, redHp - dmg);
      ui!.updateHp(redHp, blueHp);
      renderer!.showFloatingDamage(shot.hit.at, dmg, "red");
      if (redHp <= 0) {
        renderer!.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
        nextRound("red");
        return;
      }
    } else {
      blueHp = Math.max(0, blueHp - dmg);
      ui!.updateHp(redHp, blueHp);
      renderer!.showFloatingDamage(shot.hit.at, dmg, "blue");
      if (blueHp <= 0) {
        renderer!.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
        nextRound("blue");
        return;
      }
    }

    // Hit but defender still alive — switch turns and continue
    activeTurn = shooter === "red" ? "blue" : "red";
    renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
    ui!.setTurn(activeTurn, latex);
    busy = false;
    ui!.setBusy(false);
    ui!.setStatus(`Hit! -${dmg} HP`);
    ui!.focus();
    return;
  }

  // Classic mode: direct hit = round end
  const roundLoser = shooter === "red" ? "blue" : "red";
  renderer!.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
  nextRound(roundLoser);
  return;
}
```

- [ ] **Step 6: Enable HP Mode in `LobbyScreen.ts`**

In `src/ui/LobbyScreen.ts`, the constructor currently registers a click handler on `modeHpBtn`. Since the `disabled` attribute has been removed from the HTML (Task 2), the click handler now works. However, the `LobbyScreen` may still be wired to only allow Classic mode. Verify that `selectMode("hp")` works correctly — it should since the toggle logic already handles it.

If `modeHpBtn` was previously a disabled element and never expected to fire events, ensure the click handler in the constructor properly calls `this.selectMode("hp")`. Looking at Task 3's implementation, the constructor already has:

```ts
this.modeHpBtn.addEventListener("click", () => this.selectMode("hp"));
```

No code change needed in `LobbyScreen.ts` since the click handler was already registered. The `disabled` attribute in the HTML was the only gate. Removing it in Task 2 is sufficient.

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: 126 tests passing (all existing + 8 new hpLogic tests).

- [ ] **Step 8: Commit**

```bash
git add src/game/main.ts src/ui/LobbyScreen.ts
git commit -m "feat(game): integrate HP Mode — damage on hit, HP bars, lobby enabled"
```

---

## Task 6: Browser Validation

Start the dev server and validate every HP mode flow via Playwright.

```bash
npm run dev &
sleep 3
```

**Test A — HP Mode lobby selection:**
- Navigate to `http://localhost:5173/`
- Verify HP Mode button is clickable (not disabled/greyed)
- Click HP Mode — verify it becomes active, Classic VS deactivates
- Take screenshot

**Test B — HP Mode game start:**
- With HP Mode + Best of 3 selected, click "Play Locally"
- Verify game starts
- Verify HP bars appear under each HUD panel (with `100 HP` labels)
- Verify URL is `#game?mode=hp&rounds=3&noTurn=false`
- Take screenshot

**Test C — HP damage mechanics:**
- Skip tutorial: `localStorage.setItem("curvecombat.tutorialDone", "1")` then reload
- Start HP Mode game
- Fire a flat shot (`0` — slope ≈ 0) that hits BLUE
- Verify: floating `-5` number appears and fades on BLUE's position
- Verify: BLUE's HP bar shrinks, label shows `95 HP`
- Verify: turn switches to BLUE (round does NOT end)
- Verify: RED HP bar still full
- Take screenshot

**Test D — Round ends at 0 HP:**
- Continue playing (or use steeper functions to deal more damage)
- Verify round ends (splash appears) when HP bar reaches 0
- Verify splash says "BLUE wins the round!" (if RED's HP hit 0)
- Verify HP resets to 100 for both players in next round
- Take screenshot

**Test E — Match end in HP mode:**
- Play until a match winner
- Verify win banner says "Health depleted." (not "Direct hit.")
- Verify "Back to Lobby" button present
- Take screenshot

**Test F — Classic mode unchanged:**
- Return to lobby, select Classic VS, start game
- Fire and hit opponent
- Verify: round ends immediately (no HP bars visible, no floating damage)
- Verify win banner says "Direct hit."
- Take screenshot

**Test G — No layout issues:**
- HP bars should be visible and cleanly laid out in HP mode
- No overlapping elements
- At 0 HP, bar width is 0% (not negative)
- Label shows `0 HP`

**Fix any bugs found.** After all tests pass, stop the dev server:

```bash
pkill -f "vite" 2>/dev/null || true
```

- [ ] **Commit validation note**

```bash
git commit --allow-empty -m "test(hp-mode): browser validation complete — all HP mode flows verified"
```

---

## Self-Review

**Spec coverage (§5):**
- ✅ §5.1 HP = 100 per round, resets on new round
- ✅ §5.2 On hit: `targetHP -= dmg`; round ends when `targetHP <= 0`
- ✅ §5.3 HP bar under each player panel; drains left-to-right; numeric label
- ✅ §5.4 Floating damage number at impact, animates up, fades 700ms
- ✅ §5.5 Damage floor 5; cap 50; formula `5 + 35*tanh(slope/2)`
- ✅ Turn order unchanged (Classic VS alt. turns; loser shoots first next round)
- ✅ HP Mode lobby button enabled
- ✅ Classic VS behaviour fully unchanged

**Open questions:**
- Should the HP status text (`Hit! -5 HP`) replace the existing status or be a temporary overlay? → Using `setStatus` (replaces) since it already has a "hint" pattern.
- Does `impactSlope` correctly reach `computeDamage`? Yes — `ShotResult.impactSlope` was added in Group 1 and already computed by `engine.fire`.
