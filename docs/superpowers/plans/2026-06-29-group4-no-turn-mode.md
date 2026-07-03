# Group 4 · No-Turn Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add No-Turn Mode — a match modifier where both players fire simultaneously instead of alternating. Each player's Fire button re-enables as soon as their own bullet resolves. Bullets from both players can coexist on screen.

**Architecture:** No-Turn is a modifier flag (`matchConfig.noTurn`), not a standalone mode — it stacks with Classic VS or HP Mode. Changes are in three layers: (1) `GameUI` gains a `setNoTurnMode()` that keeps both HUDs active and passes the firing player to the callback, plus a per-player `setBusy(player, busy)` API; (2) `GameRenderer` gains a second trail layer (`trailLayerBlue`) and `playShot` accepts an optional player parameter so concurrent shots render independently; (3) `main.ts` replaces the single `busy` flag with `redBusy`/`blueBusy`, wires per-player fire/busy logic, and removes the `activeTurn` gate when no-turn is active.

**Tech Stack:** TypeScript strict, Vite 8, Vitest 3, Pixi.js 8. Tests: `npm test`. Dev: `npm run dev`.

## Global Constraints

- TypeScript strict mode — no `any`.
- All existing tests must stay green after every task.
- **Group 3 must be fully merged before implementing Group 4.** This plan assumes `computeDamage`, `HP_MAX`, `showHpBars`, `updateHp`, `showFloatingDamage`, `showWin(winner, detail)` all exist.
- No-Turn changes are guarded by `matchConfig.noTurn === true` — all turn-based behaviour is fully unchanged when `noTurn === false`.
- Friendly fire is disabled by design: `buildWorld` for RED always lists only BLUE as a target, so RED cannot hit themselves.
- Both players' bullets can coexist on screen simultaneously; each uses its own trail layer.
- Per spec §6.4: two separate `trailLayer` Graphics — rename existing to `trailLayerRed`, add `trailLayerBlue`. Both animate concurrently via the same Pixi ticker.
- `GameUI.fireCb` signature change: `(player: "red" | "blue", latex: string) => void`. All callers in `main.ts` must be updated.
- `GameUI.setBusy` signature change: `(player: "red" | "blue", busy: boolean) => void`. All callers in `main.ts` must be updated.
- Do NOT touch `src/sim/`, `src/game/matchLogic.ts`, `src/game/configRouter.ts`, `src/game/hpLogic.ts`.

---

## File Map

| File | Change |
|---|---|
| `src/game/GameUI.ts` | Update `fireCb` + `setBusy` signatures; add `setNoTurnMode()` |
| `src/game/GameRenderer.ts` | Rename `trailLayer` → `trailLayerRed`; add `trailLayerBlue`; update `playShot(result, player?)` |
| `index.html` | Remove `disabled` from `#lobby-noturn` checkbox; remove "Soon" badge from No-Turn row |
| `src/ui/LobbyScreen.ts` | Read `#lobby-noturn` checkbox value; pass `noTurn` to `MatchConfig` |
| `src/game/main.ts` | Replace `busy` with `redBusy`/`blueBusy`; no-turn fire loop; update all `setBusy`/`onFire` calls |

---

## Task 1: `GameUI.ts` — No-Turn Mode Support

**Files:**
- Modify: `src/game/GameUI.ts`

**Interfaces:**
- Produces:
  - Updated `fireCb: ((player: "red" | "blue", latex: string) => void) | null`
  - Updated `onFire(cb: (player: "red" | "blue", latex: string) => void): void`
  - Updated `setBusy(player: "red" | "blue", busy: boolean): void`
  - New `setNoTurnMode(enabled: boolean): void`

---

- [ ] **Step 1: Update `fireCb` type and `onFire` method**

In `src/game/GameUI.ts`, find:

```ts
private fireCb: ((latex: string) => void) | null = null;
```

Replace with:

```ts
private fireCb: ((player: "red" | "blue", latex: string) => void) | null = null;
```

Find:

```ts
onFire(cb: (latex: string) => void) { this.fireCb = cb; }
```

Replace with:

```ts
onFire(cb: (player: "red" | "blue", latex: string) => void): void { this.fireCb = cb; }
```

- [ ] **Step 2: Add `noTurnMode` field and update `emitFire`**

Add the field after the existing private fields:

```ts
private noTurnMode = false;
```

Find the `emitFire` method:

```ts
private emitFire(player: "red" | "blue") {
  if (player !== this.currentTurn) return;
  const input = player === "red" ? this.redInput : this.blueInput;
  const latex = input.getLatex().trim();
  if (latex) this.fireCb?.(latex);
}
```

Replace with:

```ts
private emitFire(player: "red" | "blue") {
  if (!this.noTurnMode && player !== this.currentTurn) return;
  const input = player === "red" ? this.redInput : this.blueInput;
  const latex = input.getLatex().trim();
  if (latex) this.fireCb?.(player, latex);
}
```

- [ ] **Step 3: Update `setBusy` to accept a player**

Find:

```ts
setBusy(busy: boolean) {
  if (this.currentTurn === "red") {
    this.redFireBtn.disabled = busy;
  } else {
    this.blueFireBtn.disabled = busy;
  }
}
```

Replace with:

```ts
setBusy(player: "red" | "blue", busy: boolean): void {
  if (player === "red") {
    this.redFireBtn.disabled = busy;
  } else {
    this.blueFireBtn.disabled = busy;
  }
}
```

- [ ] **Step 4: Add `setNoTurnMode` method**

Add after `setBusy`:

```ts
setNoTurnMode(enabled: boolean): void {
  this.noTurnMode = enabled;
  if (enabled) {
    document.getElementById("red-hud")!.classList.remove("inactive");
    document.getElementById("blue-hud")!.classList.remove("inactive");
    this.redFireBtn.disabled = false;
    this.blueFireBtn.disabled = false;
    this.redInput.setEnabled(true);
    this.blueInput.setEnabled(true);
  }
}
```

- [ ] **Step 5: Run build to check for TypeScript errors**

```bash
npm run build
```

Expected: TypeScript errors in `main.ts` — `setBusy` now requires a player arg and `onFire` callback now receives a player arg. These will be fixed in Task 4. The errors are expected at this step.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: all existing tests pass (they don't import GameUI).

- [ ] **Step 7: Commit**

```bash
git add src/game/GameUI.ts
git commit -m "feat(ui): update fireCb/setBusy signatures; add setNoTurnMode for No-Turn mode"
```

---

## Task 2: `GameRenderer.ts` — Second Trail Layer

**Files:**
- Modify: `src/game/GameRenderer.ts`

**Interfaces:**
- Produces:
  - `trailLayerRed` (renamed from `trailLayer`) — RED's shot trail Graphics
  - `trailLayerBlue` — BLUE's shot trail Graphics (new)
  - Updated `playShot(result: ShotResult, player?: "red" | "blue"): Promise<void>` — optional player param

---

- [ ] **Step 1: Rename `trailLayer` → `trailLayerRed` and add `trailLayerBlue`**

In `src/game/GameRenderer.ts`, find:

```ts
private trailLayer = new Graphics();
```

Replace with:

```ts
private trailLayerRed = new Graphics();
private trailLayerBlue = new Graphics();
```

Find the `init` method where children are added to the stage:

```ts
this.app.stage.addChild(
  this.gridLayer,
  this.axisLayer,
  this.labelLayer,
  this.planetLayer,
  this.fieldLayer,
  this.trailLayer,
  this.fxLayer,
);
```

Replace with:

```ts
this.app.stage.addChild(
  this.gridLayer,
  this.axisLayer,
  this.labelLayer,
  this.planetLayer,
  this.fieldLayer,
  this.trailLayerRed,
  this.trailLayerBlue,
  this.fxLayer,
);
```

- [ ] **Step 2: Update `setWorld` to clear the renamed trail layers**

Find in `setWorld`:

```ts
this.trailLayer.clear();
```

Replace with:

```ts
this.trailLayerRed.clear();
this.trailLayerBlue.clear();
```

- [ ] **Step 3: Add `noTurnMode` field and `setNoTurnMode` method**

Add the private field after the existing fields:

```ts
private noTurnMode = false;
```

Add the public method after `setWorld`:

```ts
setNoTurnMode(enabled: boolean): void {
  this.noTurnMode = enabled;
}
```

- [ ] **Step 4: Update `drawField` to respect No-Turn mode**

In `drawField`, the current code checks `this.activeTurn` to dim the inactive player. In No-Turn mode, both players should be at full brightness. Find the alpha lines:

```ts
g.circle(rs.x, rs.y, rPx).fill({ color: COLORS.red, alpha: isRedActive ? 1.0 : 0.4 });
```

and

```ts
g.circle(bs.x, bs.y, rPx).fill({ color: COLORS.blue, alpha: isBlueActive ? 1.0 : 0.4 });
```

Update both to respect `noTurnMode`. Replace the full `drawField` alpha logic:

Find:

```ts
const isRedActive = this.activeTurn === "red";
if (isRedActive) {
  g.circle(rs.x, rs.y, rPx + 6).stroke({ width: 2.5, color: COLORS.red, alpha: 0.35 });
}
g.circle(rs.x, rs.y, rPx).fill({ color: COLORS.red, alpha: isRedActive ? 1.0 : 0.4 });
if (isRedActive) {
  g.moveTo(rs.x, rs.y).lineTo(rs.x + BARREL_PX, rs.y).stroke({ width: 3, color: COLORS.red });
}

// BLUE — full brightness when active, dimmed when waiting.
const bs = this.toScreen(this.bluePos);
const isBlueActive = this.activeTurn === "blue";
if (isBlueActive) {
  g.circle(bs.x, bs.y, rPx + 6).stroke({ width: 2.5, color: COLORS.blue, alpha: 0.35 });
}
g.circle(bs.x, bs.y, rPx).fill({ color: COLORS.blue, alpha: isBlueActive ? 1.0 : 0.4 });
if (isBlueActive) {
  g.moveTo(bs.x, bs.y).lineTo(bs.x - BARREL_PX, bs.y).stroke({ width: 3, color: COLORS.blue });
}
```

Replace with:

```ts
const isRedActive = this.noTurnMode || this.activeTurn === "red";
if (isRedActive) {
  g.circle(rs.x, rs.y, rPx + 6).stroke({ width: 2.5, color: COLORS.red, alpha: 0.35 });
}
g.circle(rs.x, rs.y, rPx).fill({ color: COLORS.red, alpha: isRedActive ? 1.0 : 0.4 });
if (isRedActive) {
  g.moveTo(rs.x, rs.y).lineTo(rs.x + BARREL_PX, rs.y).stroke({ width: 3, color: COLORS.red });
}

const bs = this.toScreen(this.bluePos);
const isBlueActive = this.noTurnMode || this.activeTurn === "blue";
if (isBlueActive) {
  g.circle(bs.x, bs.y, rPx + 6).stroke({ width: 2.5, color: COLORS.blue, alpha: 0.35 });
}
g.circle(bs.x, bs.y, rPx).fill({ color: COLORS.blue, alpha: isBlueActive ? 1.0 : 0.4 });
if (isBlueActive) {
  g.moveTo(bs.x, bs.y).lineTo(bs.x - BARREL_PX, bs.y).stroke({ width: 3, color: COLORS.blue });
}
```

- [ ] **Step 5: Update `playShot` to accept optional player and use the right trail layer**

Find the start of `playShot`:

```ts
playShot(result: ShotResult): Promise<void> {
  this.trailLayer.clear();
  this.fxLayer.clear();
  const trailColor = this.activeColor();
```

Replace with:

```ts
playShot(result: ShotResult, player?: "red" | "blue"): Promise<void> {
  const effectivePlayer = player ?? this.activeTurn;
  const trailLayer = effectivePlayer === "red" ? this.trailLayerRed : this.trailLayerBlue;
  trailLayer.clear();
  if (!player) this.fxLayer.clear(); // Only clear fx in turn-based mode
  const trailColor = effectivePlayer === "red" ? COLORS.red : COLORS.blue;
```

Now update the two references to `this.trailLayer` inside `playShot` (within the `tick` function):

Find (first occurrence, at start of tick):
```ts
const g = this.trailLayer;
g.clear();
```

Replace with:
```ts
const g = trailLayer;
g.clear();
```

Find (the stroke call — inside `tick`, after the drawing loop):
The drawing code uses `g` already after the first replacement, so no additional changes are needed for the trail drawing. Just verify `g` is used consistently throughout the tick function.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run build
```

Expected: TS errors in `main.ts` only (from Task 1's API changes). No errors in `GameRenderer.ts`.

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/game/GameRenderer.ts
git commit -m "feat(renderer): add trailLayerBlue for concurrent No-Turn shots; update playShot(result, player?)"
```

---

## Task 3: Lobby — Enable No-Turn Checkbox

**Files:**
- Modify: `index.html`
- Modify: `src/ui/LobbyScreen.ts`

---

- [ ] **Step 1: Enable No-Turn checkbox in `index.html`**

Find:
```html
        <div class="lobby-noturn-row">
          <input type="checkbox" id="lobby-noturn" disabled />
          <label for="lobby-noturn" class="lobby-noturn-label">No-Turn Mode (simultaneous fire)</label>
          <span class="coming-soon-badge">Soon</span>
        </div>
```

Replace with:
```html
        <div class="lobby-noturn-row">
          <input type="checkbox" id="lobby-noturn" />
          <label for="lobby-noturn" class="lobby-noturn-label">No-Turn Mode (simultaneous fire)</label>
        </div>
```

Also find the CSS rule that dims the no-turn row when disabled:
```css
.lobby-noturn-row {
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0.35;
}
```

Replace with:
```css
.lobby-noturn-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
```

- [ ] **Step 2: Update `LobbyScreen.ts` to read the checkbox**

In `src/ui/LobbyScreen.ts`, add the private field after the existing button fields:

```ts
private noTurnCheckbox: HTMLInputElement;
```

In the constructor, add a query after the existing button queries:

```ts
this.noTurnCheckbox = root.querySelector<HTMLInputElement>("#lobby-noturn")!;
```

In `handleStart()`, find:

```ts
private handleStart(): void {
  const config: MatchConfig = {
    mode: this.selectedMode,
    rounds: this.selectedRounds,
    noTurn: false,
    role: "local",
  };
  this.startCb?.(config);
}
```

Replace with:

```ts
private handleStart(): void {
  const config: MatchConfig = {
    mode: this.selectedMode,
    rounds: this.selectedRounds,
    noTurn: this.noTurnCheckbox.checked,
    role: "local",
  };
  this.startCb?.(config);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add index.html src/ui/LobbyScreen.ts
git commit -m "feat(lobby): enable No-Turn Mode checkbox; wire noTurn to MatchConfig"
```

---

## Task 4: `main.ts` — No-Turn Game Loop

**Files:**
- Modify: `src/game/main.ts`

This task fixes all TypeScript errors from Tasks 1–2 and implements the no-turn game loop.

**Key logic:**
- In turn-based mode (classic/hp, noTurn=false): `onFire` callback ignores `player` arg (always `activeTurn`), `redBusy`/`blueBusy` collapse to a single gate.
- In no-turn mode: both players can fire independently; `redBusy`/`blueBusy` gate each player separately; `activeTurn` is not used for gating.

---

- [ ] **Step 1: Replace `busy` with `redBusy` / `blueBusy`**

Find:

```ts
let activeTurn: "red" | "blue" = "red";
let busy = false;
let gameOver = false;
```

Replace with:

```ts
let activeTurn: "red" | "blue" = "red";
let redBusy = false;
let blueBusy = false;
let gameOver = false;
```

- [ ] **Step 2: Update `start()` to reset busy flags and call new UI methods**

In `start()`, find:

```ts
gameOver = false;
busy = false;
```

Replace with:

```ts
gameOver = false;
redBusy = false;
blueBusy = false;
```

After `ui!.setTurn(activeTurn, "")`, add the no-turn mode UI setup:

```ts
if (matchConfig.noTurn) {
  renderer!.setNoTurnMode(true);
  ui!.setNoTurnMode(true);
} else {
  renderer!.setNoTurnMode(false);
}
```

- [ ] **Step 3: Update `nextRound()` to reset busy flags**

In `nextRound()`, find:

```ts
gameOver = false;
busy = false;
```

Replace with:

```ts
gameOver = false;
redBusy = false;
blueBusy = false;
```

Also in `nextRound()`, find the win banner path:

```ts
gameOver = true;
busy = false;
ui!.setBusy(false);
```

Replace with:

```ts
gameOver = true;
redBusy = false;
blueBusy = false;
ui!.setBusy("red", false);
ui!.setBusy("blue", false);
```

Also in the `setTimeout` callback in `nextRound()`, after `ui!.setTurn(activeTurn, "")`, add:

```ts
if (matchConfig.noTurn) {
  renderer!.setNoTurnMode(true);
  ui!.setNoTurnMode(true);
}
```

- [ ] **Step 4: Rewrite `onFire` to accept `(player, latex)` and handle both modes**

Replace the entire `onFire` function with:

```ts
async function onFire(player: "red" | "blue", latex: string) {
  if (gameOver) return;

  // Gate: turn-based uses activeTurn + single busy; no-turn uses per-player busy
  if (matchConfig.noTurn) {
    if (player === "red" && redBusy) return;
    if (player === "blue" && blueBusy) return;
  } else {
    if (player !== activeTurn) return;
    if (redBusy || blueBusy) return;
  }

  const result = evaluateAll([{ id: "shot", latex }]);
  const row = result.get("shot");
  const fn = row?.kind === "curve" ? row.fn : undefined;
  if (!fn) {
    if (!matchConfig.noTurn || player === activeTurn) {
      ui!.setStatus("that isn't a plottable function of x");
    }
    return;
  }

  // Set player busy
  if (player === "red") redBusy = true;
  else blueBusy = true;
  ui!.setBusy(player, true);

  const shooter = player;
  const world = buildWorld(shooter, planets);
  const shot = fire(world, fn);

  await renderer!.playShot(shot, player);

  if (shot.hit.kind === "planet" && shot.hit.planetId) {
    const planet = planets.find((p) => p.id === shot.hit.planetId);
    if (planet) planet.craters.push({ pos: shot.hit.at, radius: CRATER_RADIUS });
  }

  if (shot.hit.kind === "target") {
    if (matchConfig.mode === "hp") {
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

      if (player === "red") redBusy = false;
      else blueBusy = false;
      ui!.setBusy(player, false);

      if (!matchConfig.noTurn) {
        activeTurn = shooter === "red" ? "blue" : "red";
        renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
        ui!.setTurn(activeTurn, latex);
      } else {
        renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
      }
      ui!.setStatus(`Hit! -${dmg} HP`);
      ui!.focus();
      return;
    }

    // Classic mode: hit = round end
    const roundLoser = shooter === "red" ? "blue" : "red";
    renderer!.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
    nextRound(roundLoser);
    return;
  }

  // Miss — re-enable this player's button; switch turns only in turn-based mode
  if (player === "red") redBusy = false;
  else blueBusy = false;
  ui!.setBusy(player, false);

  if (!matchConfig.noTurn) {
    activeTurn = shooter === "red" ? "blue" : "red";
    renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
    ui!.setTurn(activeTurn, latex);
  } else {
    renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
  }
  ui!.setStatus(noteFor(shot.hit.kind));
  ui!.focus();
}
```

- [ ] **Step 5: Update `ui.onFire` registration in `startGame`**

In `startGame`, find:

```ts
ui = new GameUI();
ui.onFire(onFire);
ui.onReset(goToLobby);
```

The `onFire` callback signature now matches the new `GameUI.fireCb` type `(player, latex) => void`. No change needed here since `onFire` already takes `(player, latex)`.

- [ ] **Step 6: Verify TypeScript compiles with no errors**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all 126 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/game/main.ts
git commit -m "feat(game): implement No-Turn mode — per-player busy flags, simultaneous fire"
```

---

## Task 5: Browser Validation

Start the dev server and validate every No-Turn mode flow via Playwright.

```bash
npm run dev &
sleep 3
```

**Test A — No-Turn checkbox in lobby:**
- Navigate to `http://localhost:5173/`
- Verify No-Turn checkbox is enabled (not disabled/greyed)
- Check the checkbox — verify the visual state changes
- Take screenshot

**Test B — Classic VS + No-Turn:**
- Select Classic VS + No-Turn + Best of 3
- Click "Play Locally"
- Verify URL is `#game?mode=classic&rounds=3&noTurn=true`
- Verify BOTH HUD panels are active (neither has `inactive` class)
- Verify BOTH fire buttons are enabled
- Take screenshot

**Test C — Simultaneous fire (Classic + No-Turn):**
- Skip tutorial: `localStorage.setItem("graphwar.tutorialDone", "1")` then reload
- Start Classic VS + No-Turn game
- Type `0` in RED's input, click RED's Fire button
- IMMEDIATELY type `-1` in BLUE's input and click BLUE's Fire button (before RED's shot resolves)
- Verify: both trails appear on screen simultaneously
- Verify: RED's button disables while RED's shot is flying, BLUE's button disables while BLUE's shot is flying
- Verify: after shots resolve, both buttons re-enable
- Take screenshot during concurrent animation

**Test D — Round end in No-Turn (Classic):**
- In Classic + No-Turn, shoot until a hit
- Verify round splash appears
- Verify both HP bars NOT visible (Classic mode)
- Verify round resets and both buttons re-enable
- Take screenshot

**Test E — HP Mode + No-Turn:**
- Start HP Mode + No-Turn + Best of 3
- Verify HP bars appear for both players
- Fire RED while BLUE is also firing (simultaneous)
- Verify damage applies correctly when hits land
- Verify both buttons re-enable after their respective shots resolve
- Take screenshot

**Test F — Turn-based mode unchanged:**
- Start Classic VS (noTurn=false) game
- Verify only ONE HUD is active at a time
- Verify BLUE's button is disabled when it's RED's turn
- Type in BLUE's input during RED's turn — verify fire is blocked
- Take screenshot confirming single-active-player behaviour

**Test G — No-Turn via direct URL:**
- Navigate to `http://localhost:5173/#game?mode=classic&rounds=3&noTurn=true`
- Verify game starts in no-turn mode directly from URL (both HUDs active)
- Take screenshot

**Fix any bugs found.** After all tests pass:

```bash
pkill -f "vite" 2>/dev/null || true
git commit --allow-empty -m "test(no-turn): browser validation complete — all no-turn mode flows verified"
```

---

## Self-Review

**Spec coverage (§6):**
- ✅ §6.1 No-Turn is a modifier, not a standalone mode; stacks with Classic VS and HP Mode
- ✅ §6.2 `activeTurn` gate removed; each player gated by own busy flag
- ✅ §6.3 Per-player `setBusy` — fire button re-enables only when own shot resolves
- ✅ §6.4 Both bullets coexist on screen (`trailLayerRed` + `trailLayerBlue`)
- ✅ §6.5 Friendly fire disabled (inherent from `buildWorld` — only opponent in targets)
- ✅ §6.6 Both HUD panels always active in no-turn mode (`setNoTurnMode`)
- ✅ §6.7 No-Turn checkbox in lobby wired to `MatchConfig.noTurn`
- ✅ Turn-based behaviour fully unchanged when `noTurn === false`
- ✅ HP Mode + No-Turn combination works (damage applied per-hit, independent async flows)

**Simultaneous hit edge case (HP + No-Turn):**
If RED hits BLUE and BLUE hits RED simultaneously, both `onFire` calls are async. They can both reach the `shot.hit.kind === "target"` branch concurrently. HP is updated sequentially (JavaScript single-threaded), so both damage values apply correctly. If both bring HP to 0 simultaneously, `nextRound` is called twice. To prevent double-round-end: the `if (gameOver) return` guard at the top of `onFire` catches the second call after `gameOver = true` is set by the first `nextRound`.
