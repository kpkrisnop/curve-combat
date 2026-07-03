# Frontend Redesign — Phase 1: React Shell + Design System + Local Play

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the UI chrome in React — landing screen, local config with the arena-as-centerpiece, countdown + zoom transition, and a fully React game HUD — while the engine, sim, renderer, and net code stay vanilla TS, and online play keeps working at parity.

**Architecture:** React owns everything around the Pixi canvas (ADR-0001). A `GameUiPort` interface is extracted from `GameUI`'s public API; a React-backed `HudController` implements it, so both the new `LocalGame` controller and the existing `NetworkGame` drive the React HUD through the same port. The local flow follows ADR-0003: one `GameRenderer` instance renders the real round-1 arena at ~87% scale inside the config screen, and match start is a 3-2-1 countdown while the container CSS-scales to 100%. Phases 2 (NvN server) and 3 (online UI) are separate plans.

**Tech Stack:** TypeScript (strict), Vite 8, Vitest 3, React 19, @vitejs/plugin-react, jsdom + @testing-library/react for component tests, Pixi 8 (existing), MathQuill via existing `MathInput` adapter.

## Global Constraints

- `npm test` = `vitest run`; build gate = `tsc --noEmit && vite build`. Both must pass at every commit.
- Hash routing only (ADR-0001): `/#local`, `/#game?…`, `/#room=CODE`. No router library, no path routing.
- Design tokens use the existing `--gw-*` prefix in `src/design/` (foundation.css already exists — extend, don't fork the naming).
- Visual direction (KP): pitch black, space-time, math, animated; black-hole spacetime fabric on landing; `--gw-red: #ff4444` / `--gw-blue: #4488ff` stay the accent identities.
- Arena parameters show **no numeric readouts** (ADR-0003). Seed row + Reroll are shown in the **local** flow only.
- Tutorial localStorage key stays `graphwar.tutorialDone`. WS URL env stays `VITE_WS_URL`.
- Target ≥1024px landscape; below that a phone-gate overlay ("Graph War needs a bigger screen") covers the app.
- `src/sim`, `src/math`, `src/graph`, `src/net` (except one type-only retype in NetworkGame), `src/game/GameRenderer.ts`, `matchState.ts`, `matchLogic.ts`, `resolveFire.ts`, `hpLogic.ts`, `turnQueue.ts`, `configRouter.ts`, `arenaDefaults.ts` are **not** rewritten.
- Component tests declare `// @vitest-environment jsdom` at the top of the file (the global vitest env stays `node` for sim/server tests).
- React components never instantiate Pixi in tests — `GameRenderer` is always injected or mocked.

**Files created in this plan (overview):**

```
src/app/main.tsx                 React entry (replaces script tag target)
src/app/App.tsx                  route → screen switch + phone gate
src/app/routes.ts                parseRoute + useHashRoute
src/app/store.ts                 createStore + useStore
src/app/theme.css                pitch-black spacetime tokens + component styles
src/app/SpacetimeBackground.tsx  animated black-hole canvas (landing)
src/app/PhoneGate.tsx            <1024px overlay
src/app/hud/hudStore.ts          HudState + hudStore + HudController + registry
src/app/hud/MathField.tsx        React wrapper around MathInput
src/app/hud/HudBar.tsx           PlayerPanel ×2 + Scoreboard + timer
src/app/hud/Overlays.tsx         HpBars, WinBanner, RoundSplash, TutorialOverlay
src/app/arena/ArenaStage.tsx     renderer host div + scale transition
src/app/arena/rendererSingleton.ts
src/app/screens/LandingScreen.tsx
src/app/screens/LocalFlow.tsx    config → countdown → play (one mounted stage)
src/app/screens/ConfigPanel.tsx  shared config component (drawer-ready)
src/app/screens/CountdownOverlay.tsx
src/app/screens/OnlineParity.tsx #room= parity path (Phase 3 replaces)
src/game/GameUiPort.ts           interface extracted from GameUI
src/game/LocalGame.ts            local match controller (ported from main.ts)
```

**Files deleted at the end:** `src/game/GameUI.ts`, `src/game/main.ts`, `src/ui/LobbyScreen.ts`, `src/ui/settings/SettingsPanel.ts`, `src/ui/settings/ArenaPreview.ts`, plus the legacy `<body>` DOM and inline `<style>` in `index.html`.

---

### Task 1: React Toolchain + Entry Point

**Files:**
- Modify: `package.json` (deps)
- Modify: `vite.config.ts` (react plugin)
- Modify: `tsconfig.json` (jsx)
- Modify: `index.html` (body → `#root`, script → React entry; keep `<head>` untouched for now)
- Create: `src/app/main.tsx`, `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Produces: `<App />` mounted at `#root`; later tasks replace its placeholder switch.

- [ ] **Step 1: Install dependencies**

```bash
npm install react react-dom
npm install -D @types/react @types/react-dom @vitejs/plugin-react jsdom @testing-library/react
```

- [ ] **Step 2: Wire the react plugin and jsx**

`vite.config.ts` — add the plugin, keep everything else:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        calculator: "calculator.html",
      },
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
```

`tsconfig.json` — add one line inside `compilerOptions`:

```json
"jsx": "react-jsx",
```

- [ ] **Step 3: Write the failing test**

`src/app/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the landing title", () => {
    location.hash = "";
    render(<App />);
    expect(screen.getByText("GRAPH")).toBeTruthy();
    expect(screen.getByText("WAR")).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/app/App.test.tsx`
Expected: FAIL — `Cannot find module './App'`

- [ ] **Step 5: Minimal App + entry**

`src/app/App.tsx`:

```tsx
export function App() {
  return (
    <div className="gw-app">
      <h1>
        <span className="t-red">GRAPH</span>
        <span className="t-blue">WAR</span>
      </h1>
    </div>
  );
}
```

`src/app/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import "../design/foundation.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

`index.html` — replace the entire `<body>` (everything from `<body>` to `</body>`, including `#lobby-screen`, `#game`, and the old script tag) with:

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/app/main.tsx"></script>
</body>
```

Leave `<head>` (including the big inline `<style>`) untouched — it is deleted in Task 10.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/app/App.test.tsx` — Expected: PASS

- [ ] **Step 7: Full gate.** Run: `npm test && npx tsc --noEmit`
Expected: prior suites still pass. `src/game/main.ts` still typechecks (it's just no longer loaded by index.html).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json index.html src/app/
git commit -m "feat(app): React toolchain + #root entry; legacy DOM unplugged"
```

---

### Task 2: Pitch-Black Theme + SpacetimeBackground

**Files:**
- Create: `src/app/theme.css`
- Create: `src/app/SpacetimeBackground.tsx`
- Modify: `src/app/main.tsx` (import theme.css)
- Test: `src/app/SpacetimeBackground.test.tsx`

**Interfaces:**
- Produces: `<SpacetimeBackground />` — full-viewport animated canvas, `position: fixed`, `z-index: 0`, pointer-events none. All screens layer above it (`.gw-layer { position: relative; z-index: 1; }`).

- [ ] **Step 1: Write the failing test**

`src/app/SpacetimeBackground.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { SpacetimeBackground } from "./SpacetimeBackground";

describe("SpacetimeBackground", () => {
  it("mounts a canvas and starts an animation frame", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    // jsdom has no 2d context — stub it
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillRect: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      set strokeStyle(_v: unknown) {}, set fillStyle(_v: unknown) {},
      set lineWidth(_v: unknown) {}, set globalAlpha(_v: unknown) {},
    } as unknown as CanvasRenderingContext2D);
    const { container, unmount } = render(<SpacetimeBackground />);
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(raf).toHaveBeenCalled();
    unmount(); // must not throw (cancels rAF)
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/app/SpacetimeBackground.test.tsx` — FAIL (module missing).

- [ ] **Step 3: Implement theme + component**

`src/app/theme.css` (imported after foundation.css so overrides win):

```css
/* ── Phase-1 redesign: pitch black space-time ─────────────────────────── */
:root {
  --gw-bg: #000000;
  --gw-surface: rgba(14, 18, 26, 0.82);
  --gw-surface-2: rgba(8, 10, 15, 0.9);
  --gw-border: #1c2530;
  --gw-border-strong: #2e4256;
  --gw-glow-red: 0 0 24px rgba(255, 68, 68, 0.35);
  --gw-glow-blue: 0 0 24px rgba(68, 136, 255, 0.35);
}

html, body { margin: 0; background: var(--gw-bg); color: var(--gw-text); }
body { font-family: var(--gw-font-sans); overflow: hidden; }

.gw-layer { position: relative; z-index: 1; }
.gw-bgcanvas {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  width: 100vw; height: 100vh; display: block;
}

.gw-app { min-height: 100vh; }

/* Landing */
.gw-landing {
  min-height: 100vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: var(--gw-space-6);
}
.gw-landing h1 {
  font-size: clamp(56px, 9vw, 128px); letter-spacing: 0.06em; margin: 0;
  font-weight: 900;
}
.gw-landing h1 .t-red  { color: var(--gw-red);  text-shadow: var(--gw-glow-red); }
.gw-landing h1 .t-blue { color: var(--gw-blue); text-shadow: var(--gw-glow-blue); }
.gw-landing .gw-tagline { color: var(--gw-text-muted); font-size: var(--gw-fs-md); }

.gw-btn {
  font: inherit; cursor: pointer; border-radius: var(--gw-radius-lg);
  border: 1px solid var(--gw-border-strong); padding: 14px 36px;
  background: var(--gw-surface); color: var(--gw-text);
  font-size: var(--gw-fs-md); font-weight: 700; letter-spacing: 0.04em;
  transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
}
.gw-btn:hover { transform: translateY(-1px); border-color: var(--gw-accent); }
.gw-btn--primary { border-color: var(--gw-accent); box-shadow: var(--gw-glow-blue); }
.gw-btn--danger  { border-color: var(--gw-red);   box-shadow: var(--gw-glow-red); }
.gw-btn:disabled { opacity: 0.4; cursor: default; transform: none; box-shadow: none; }

/* Card / seat / panel primitives (used by ConfigPanel, seats, HUD) */
.gw-card {
  background: var(--gw-surface); border: 1px solid var(--gw-border);
  border-radius: var(--gw-radius-lg); padding: var(--gw-space-4);
  backdrop-filter: blur(6px);
}
.gw-card.is-active { border-color: var(--gw-accent); box-shadow: var(--gw-glow-blue); }

/* Phone gate */
.gw-phonegate {
  position: fixed; inset: 0; z-index: 100; display: none;
  align-items: center; justify-content: center; text-align: center;
  background: #000; padding: var(--gw-space-6);
}
@media (max-width: 1023px) { .gw-phonegate { display: flex; } }
```

`src/app/SpacetimeBackground.tsx` — warped spacetime grid falling toward a central mass, plus a drifting starfield. Static single frame under `prefers-reduced-motion`:

```tsx
import { useEffect, useRef } from "react";

const GRID = 26;      // grid lines per axis
const STARS = 140;

/** Radial spacetime warp: pulls a point toward the center mass. */
function warp(x: number, y: number, cx: number, cy: number, t: number): [number, number] {
  const dx = x - cx, dy = y - cy;
  const r = Math.hypot(dx, dy) + 1;
  const pull = 2600 / (r * 0.9 + 60);           // stronger near the center
  const swirl = 0.14 * Math.sin(t * 0.0002 + r * 0.004);
  const a = Math.atan2(dy, dx) + swirl;
  const r2 = Math.max(6, r - pull);
  return [cx + Math.cos(a) * r2, cy + Math.sin(a) * r2];
}

export function SpacetimeBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const stars = Array.from({ length: STARS }, () => ({
      x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.4,
    }));
    let raf = 0;

    const draw = (t: number) => {
      const w = (canvas.width = canvas.clientWidth);
      const h = (canvas.height = canvas.clientHeight);
      const cx = w / 2, cy = h * 0.44;
      ctx.clearRect(0, 0, w, h);

      // stars
      ctx.fillStyle = "#8499ab";
      for (const st of stars) {
        ctx.globalAlpha = 0.25 + 0.3 * Math.sin(t * 0.0006 + st.x * 40);
        ctx.fillRect(st.x * w, st.y * h, st.s, st.s);
      }
      ctx.globalAlpha = 1;

      // warped grid
      ctx.strokeStyle = "rgba(68, 136, 255, 0.10)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID; i++) {
        ctx.beginPath();
        for (let j = 0; j <= GRID; j++) {
          const [px, py] = warp((i / GRID) * w, (j / GRID) * h, cx, cy, t);
          j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let j = 0; j <= GRID; j++) {
          const [px, py] = warp((j / GRID) * w, (i / GRID) * h, cx, cy, t);
          j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // event horizon
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      g.addColorStop(0, "#000");
      g.addColorStop(0.8, "#000");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      draw(0);
    } else {
      const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="gw-bgcanvas" aria-hidden="true" />;
}
```

`src/app/main.tsx` — add `import "./theme.css";` after the foundation import.

- [ ] **Step 4: Run test to verify it passes.** `npx vitest run src/app/SpacetimeBackground.test.tsx` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/theme.css src/app/SpacetimeBackground.tsx src/app/SpacetimeBackground.test.tsx src/app/main.tsx
git commit -m "feat(design): pitch-black spacetime theme + animated black-hole background"
```

---

### Task 3: Route Model + useHashRoute

**Files:**
- Create: `src/app/routes.ts`
- Test: `src/app/routes.test.ts`

**Interfaces:**
- Consumes: `parseConfigFromHash` from `src/game/configRouter.ts` (existing).
- Produces:

```ts
export type Route =
  | { screen: "landing" }
  | { screen: "local" }
  | { screen: "game"; config: MatchConfig }
  | { screen: "room"; code: string };
export function parseRoute(hash: string): Route;
export function useHashRoute(): Route;  // re-parses on hashchange + popstate
```

- [ ] **Step 1: Write the failing test**

`src/app/routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseRoute } from "./routes";

describe("parseRoute", () => {
  it("empty or unknown hash → landing", () => {
    expect(parseRoute("").screen).toBe("landing");
    expect(parseRoute("#nonsense").screen).toBe("landing");
  });
  it("#local → local config", () => {
    expect(parseRoute("#local").screen).toBe("local");
  });
  it("#game hash → game with parsed config", () => {
    const r = parseRoute("#game?mode=hp&rounds=5&noTurn=false");
    expect(r.screen).toBe("game");
    if (r.screen === "game") {
      expect(r.config.mode).toBe("hp");
      expect(r.config.rounds).toBe(5);
    }
  });
  it("#room=wolf → room, code uppercased", () => {
    const r = parseRoute("#room=wolf");
    expect(r).toEqual({ screen: "room", code: "WOLF" });
  });
  it("#room= with empty code → landing", () => {
    expect(parseRoute("#room=").screen).toBe("landing");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/app/routes.test.ts` — FAIL.

- [ ] **Step 3: Implement**

`src/app/routes.ts`:

```ts
import { useSyncExternalStore } from "react";
import { parseConfigFromHash } from "../game/configRouter";
import type { MatchConfig } from "../game/matchLogic";

export type Route =
  | { screen: "landing" }
  | { screen: "local" }
  | { screen: "game"; config: MatchConfig }
  | { screen: "room"; code: string };

export function parseRoute(hash: string): Route {
  if (hash.startsWith("#room=")) {
    const code = hash.slice("#room=".length).trim().toUpperCase();
    return code ? { screen: "room", code } : { screen: "landing" };
  }
  if (hash.startsWith("#game")) return { screen: "game", config: parseConfigFromHash(hash) };
  if (hash === "#local") return { screen: "local" };
  return { screen: "landing" };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
  };
}

export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => "");
  return parseRoute(hash);
}
```

- [ ] **Step 4: Run to verify pass, then commit**

```bash
npx vitest run src/app/routes.test.ts
git add src/app/routes.ts src/app/routes.test.ts
git commit -m "feat(app): hash route model + useHashRoute"
```

---

### Task 4: Store, GameUiPort, HudController

The pivot of the whole rebuild: `GameUiPort` is the exact public surface of today's `GameUI` (plus `setTimer`), implemented by a `HudController` that writes plain state into a subscribable store. `LocalGame` (Task 8) and `NetworkGame` both talk to the port; React renders the store.

**Files:**
- Create: `src/app/store.ts`
- Create: `src/game/GameUiPort.ts`
- Create: `src/app/hud/hudStore.ts`
- Modify: `src/net/NetworkGame.ts` (type-only: `GameUI` → `GameUiPort`)
- Test: `src/app/store.test.ts`, `src/app/hud/hudStore.test.ts`

**Interfaces:**
- Produces:

```ts
// store.ts
export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => T)): void;
  subscribe(cb: () => void): () => void;
}
export function createStore<T extends object>(initial: T): Store<T>;
export function useStore<T extends object, U>(store: Store<T>, selector: (s: T) => U): U;

// GameUiPort.ts — every method GameUI has today, same signatures, plus setTimer
export interface GameUiPort {
  onFire(cb: (player: "red" | "blue", latex: string) => void): void;
  onReset(cb: () => void): void;
  setTurn(turn: "red" | "blue", lastEquation?: string): void;
  setBusy(player: "red" | "blue", busy: boolean): void;
  setNoTurnMode(enabled: boolean): void;
  focus(): void;
  setStatus(note?: string): void;
  showWin(winner: "red" | "blue", detail?: string): void;
  resetInputs(): void;
  hideWin(): void;
  updateScoreboard(red: number, blue: number, round: number, totalRounds: number): void;
  showSplash(html: string): void;
  hideSplash(): void;
  showTutorialStep(text: string, onNext: () => void, onSkip: () => void): void;
  hideTutorial(): void;
  showHpBars(visible: boolean): void;
  updateHp(redHp: number, blueHp: number): void;
  setTimer(seconds: number | null): void;
}

// hudStore.ts
export interface HudState { /* see implementation */ }
export interface HudInputHandle {
  getLatex(): string; setLatex(v: string): void; focus(): void; setEnabled(e: boolean): void;
}
export class HudInputRegistry {
  register(team: "red" | "blue", h: HudInputHandle): void;
  unregister(team: "red" | "blue"): void;
  get(team: "red" | "blue"): HudInputHandle | undefined;
}
export class HudController implements GameUiPort {
  constructor(store: Store<HudState>, inputs: HudInputRegistry);
  requestFire(team: "red" | "blue"): void;   // React fire-button / Enter path
  requestReset(): void;                      // "Back to Lobby"
  tutorialNext(): void; tutorialSkip(): void;
}
export function initialHudState(): HudState;
export const hudStore: Store<HudState>;
export const hudInputs: HudInputRegistry;
export const hudController: HudController;   // module singletons used by the app
```

- [ ] **Step 1: Write the failing store test**

`src/app/store.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createStore } from "./store";

describe("createStore", () => {
  it("get returns state; set merges partials and notifies", () => {
    const s = createStore({ a: 1, b: "x" });
    const cb = vi.fn();
    s.subscribe(cb);
    s.set({ a: 2 });
    expect(s.get()).toEqual({ a: 2, b: "x" });
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it("set accepts an updater function", () => {
    const s = createStore({ n: 1 });
    s.set((st) => ({ n: st.n + 1 }));
    expect(s.get().n).toBe(2);
  });
  it("unsubscribe stops notifications", () => {
    const s = createStore({ n: 0 });
    const cb = vi.fn();
    const off = s.subscribe(cb);
    off();
    s.set({ n: 1 });
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement `src/app/store.ts`**

```ts
import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => T)): void;
  subscribe(cb: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (patch) => {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
      for (const cb of subs) cb();
    },
    subscribe: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

export function useStore<T extends object, U>(store: Store<T>, selector: (s: T) => U): U {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}
```

Run: `npx vitest run src/app/store.test.ts` — PASS.

- [ ] **Step 3: Write the failing HudController test**

`src/app/hud/hudStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "../store";
import { HudController, HudInputRegistry, initialHudState, type HudState } from "./hudStore";
import type { Store } from "../store";

function fakeInput(latex = "x") {
  return { getLatex: () => latex, setLatex: vi.fn(), focus: vi.fn(), setEnabled: vi.fn() };
}

describe("HudController", () => {
  let store: Store<HudState>;
  let inputs: HudInputRegistry;
  let hud: HudController;

  beforeEach(() => {
    store = createStore(initialHudState());
    inputs = new HudInputRegistry();
    hud = new HudController(store, inputs);
  });

  it("setTurn/updateScoreboard/updateHp write store state", () => {
    hud.setTurn("blue");
    hud.updateScoreboard(1, 2, 3, 5);
    hud.updateHp(74, 100);
    const s = store.get();
    expect(s.turn).toBe("blue");
    expect(s.score).toEqual({ red: 1, blue: 2, round: 3, totalRounds: 5 });
    expect(s.hp.red).toBe(74);
  });

  it("requestFire is turn-gated and forwards latex", () => {
    const cb = vi.fn();
    hud.onFire(cb);
    inputs.register("red", fakeInput("\\sin(x)"));
    inputs.register("blue", fakeInput("x^2"));
    hud.setTurn("red");
    hud.requestFire("blue");                       // not blue's turn
    expect(cb).not.toHaveBeenCalled();
    hud.requestFire("red");
    expect(cb).toHaveBeenCalledWith("red", "\\sin(x)");
  });

  it("no-turn mode lets both fire", () => {
    const cb = vi.fn();
    hud.onFire(cb);
    inputs.register("red", fakeInput("0"));
    inputs.register("blue", fakeInput("1"));
    hud.setNoTurnMode(true);
    hud.requestFire("blue");
    expect(cb).toHaveBeenCalledWith("blue", "1");
  });

  it("tutorial step stores text; next/skip route to callbacks", () => {
    const onNext = vi.fn(), onSkip = vi.fn();
    hud.showTutorialStep("hello", onNext, onSkip);
    expect(store.get().tutorial).toEqual({ text: "hello" });
    hud.tutorialNext();
    expect(onNext).toHaveBeenCalled();
    hud.hideTutorial();
    expect(store.get().tutorial).toBeNull();
  });

  it("resetInputs clears both registered inputs", () => {
    const r = fakeInput(), b = fakeInput();
    inputs.register("red", r);
    inputs.register("blue", b);
    hud.resetInputs();
    expect(r.setLatex).toHaveBeenCalledWith("");
    expect(b.setLatex).toHaveBeenCalledWith("");
  });
});
```

- [ ] **Step 4: Run to verify failure, then implement**

`src/game/GameUiPort.ts` — exactly the interface shown in **Interfaces** above (copy verbatim, with a doc comment: "Extracted from GameUI's public API so React (HudController) and any future UI can implement it; NetworkGame and LocalGame depend on this, not on a concrete class.").

`src/app/hud/hudStore.ts`:

```ts
import { createStore, type Store } from "../store";
import type { GameUiPort } from "../../game/GameUiPort";

export type Team = "red" | "blue";

export interface HudState {
  turn: Team;
  noTurn: boolean;
  busy: { red: boolean; blue: boolean };
  score: { red: number; blue: number; round: number; totalRounds: number };
  hp: { red: number; blue: number; visible: boolean };
  status: string;
  timer: number | null;
  win: { winner: Team; detail: string } | null;
  splash: string | null;
  tutorial: { text: string } | null;
}

export function initialHudState(): HudState {
  return {
    turn: "red",
    noTurn: false,
    busy: { red: false, blue: false },
    score: { red: 0, blue: 0, round: 1, totalRounds: 3 },
    hp: { red: 100, blue: 100, visible: false },
    status: "",
    timer: null,
    win: null,
    splash: null,
    tutorial: null,
  };
}

export interface HudInputHandle {
  getLatex(): string;
  setLatex(v: string): void;
  focus(): void;
  setEnabled(e: boolean): void;
}

export class HudInputRegistry {
  private map = new Map<Team, HudInputHandle>();
  register(team: Team, h: HudInputHandle): void { this.map.set(team, h); }
  unregister(team: Team): void { this.map.delete(team); }
  get(team: Team): HudInputHandle | undefined { return this.map.get(team); }
}

export class HudController implements GameUiPort {
  private fireCb: ((player: Team, latex: string) => void) | null = null;
  private resetCb: (() => void) | null = null;
  private tutNext: (() => void) | null = null;
  private tutSkip: (() => void) | null = null;

  constructor(private store: Store<HudState>, private inputs: HudInputRegistry) {}

  // ── React-side entry points ──────────────────────────────────────────────
  requestFire(team: Team): void {
    const s = this.store.get();
    if (!s.noTurn && team !== s.turn) return;
    if (s.busy[team]) return;
    const latex = this.inputs.get(team)?.getLatex().trim();
    if (latex) this.fireCb?.(team, latex);
  }
  requestReset(): void { this.resetCb?.(); }
  tutorialNext(): void { this.tutNext?.(); }
  tutorialSkip(): void { this.tutSkip?.(); }

  // ── GameUiPort ───────────────────────────────────────────────────────────
  onFire(cb: (player: Team, latex: string) => void): void { this.fireCb = cb; }
  onReset(cb: () => void): void { this.resetCb = cb; }
  setTurn(turn: Team): void { this.store.set({ turn, status: "" }); }
  setBusy(player: Team, busy: boolean): void {
    this.store.set((s) => ({ busy: { ...s.busy, [player]: busy } }));
  }
  setNoTurnMode(enabled: boolean): void { this.store.set({ noTurn: enabled }); }
  focus(): void { this.inputs.get(this.store.get().turn)?.focus(); }
  setStatus(note?: string): void { this.store.set({ status: note ?? "" }); }
  showWin(winner: Team, detail = "Direct hit."): void { this.store.set({ win: { winner, detail } }); }
  resetInputs(): void {
    this.inputs.get("red")?.setLatex("");
    this.inputs.get("blue")?.setLatex("");
  }
  hideWin(): void { this.store.set({ win: null }); }
  updateScoreboard(red: number, blue: number, round: number, totalRounds: number): void {
    this.store.set({ score: { red, blue, round, totalRounds } });
  }
  showSplash(html: string): void { this.store.set({ splash: html }); }
  hideSplash(): void { this.store.set({ splash: null }); }
  showTutorialStep(text: string, onNext: () => void, onSkip: () => void): void {
    this.tutNext = onNext;
    this.tutSkip = onSkip;
    this.store.set({ tutorial: { text } });
  }
  hideTutorial(): void { this.store.set({ tutorial: null }); }
  showHpBars(visible: boolean): void {
    this.store.set((s) => ({ hp: { ...s.hp, visible } }));
  }
  updateHp(redHp: number, blueHp: number): void {
    this.store.set((s) => ({ hp: { ...s.hp, red: redHp, blue: blueHp } }));
  }
  setTimer(seconds: number | null): void { this.store.set({ timer: seconds }); }
}

// App-wide singletons (one HUD per page).
export const hudStore = createStore(initialHudState());
export const hudInputs = new HudInputRegistry();
export const hudController = new HudController(hudStore, hudInputs);
```

`src/net/NetworkGame.ts` — two edits only:

```ts
// was: import type { GameUI } from "../game/GameUI";
import type { GameUiPort } from "../game/GameUiPort";
// was: private ui: GameUI,
    private ui: GameUiPort,
```

- [ ] **Step 5: Run tests + typecheck.** `npx vitest run src/app && npx tsc --noEmit`
Expected: PASS. `GameUI` structurally satisfies `GameUiPort` except `setTimer` — if tsc complains where `new GameUI()` is passed to `NetworkGame` in `src/game/main.ts`, add a temporary shim there: `Object.assign(ui, { setTimer: () => {} })` — main.ts is deleted in Task 10 anyway.

- [ ] **Step 6: Commit**

```bash
git add src/app/store.ts src/app/store.test.ts src/game/GameUiPort.ts src/app/hud/hudStore.ts src/app/hud/hudStore.test.ts src/net/NetworkGame.ts src/game/main.ts
git commit -m "feat(hud): GameUiPort + store-backed HudController; NetworkGame retyped to port"
```

---

### Task 5: MathField React Wrapper

**Files:**
- Create: `src/app/hud/MathField.tsx`
- Test: `src/app/hud/MathField.test.tsx`

**Interfaces:**
- Consumes: `MathInput` from `src/ui/MathInput.ts` (existing: `el`, `getLatex()`, `setLatex()`, `focus()`, `setEnabled()`, `reflow()`, `onEnter(cb)`), `HudInputRegistry`.
- Produces: `<MathField team registry onEnter placeholder? makeInput? />` — mounts a MathInput, registers it under `team`, unregisters on unmount. `makeInput` (optional factory) exists solely so tests can inject a fake.

- [ ] **Step 1: Write the failing test**

`src/app/hud/MathField.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MathField } from "./MathField";
import { HudInputRegistry } from "./hudStore";

function fakeMathInput() {
  const el = document.createElement("span");
  el.className = "mq-input";
  let enterCb: (() => void) | null = null;
  return {
    el,
    getLatex: () => "x", setLatex: vi.fn(), focus: vi.fn(),
    setEnabled: vi.fn(), reflow: vi.fn(),
    onEnter: (cb: () => void) => { enterCb = cb; },
    fireEnter: () => enterCb?.(),
  };
}

describe("MathField", () => {
  it("registers on mount, unregisters on unmount, forwards Enter", () => {
    const registry = new HudInputRegistry();
    const input = fakeMathInput();
    const onEnter = vi.fn();
    const { container, unmount } = render(
      <MathField team="red" registry={registry} onEnter={onEnter} makeInput={() => input} />,
    );
    expect(container.querySelector(".mq-input")).toBe(input.el);
    expect(registry.get("red")).toBeTruthy();
    input.fireEnter();
    expect(onEnter).toHaveBeenCalled();
    unmount();
    expect(registry.get("red")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

`src/app/hud/MathField.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { MathInput } from "../../ui/MathInput";
import type { HudInputRegistry, Team } from "./hudStore";

interface MathInputLike {
  el: HTMLElement;
  getLatex(): string;
  setLatex(v: string): void;
  focus(): void;
  setEnabled(e: boolean): void;
  reflow(): void;
  onEnter(cb: () => void): void;
}

interface Props {
  team: Team;
  registry: HudInputRegistry;
  onEnter: () => void;
  placeholder?: string;
  /** Test seam: inject a fake instead of a real MathQuill field. */
  makeInput?: () => MathInputLike;
}

export function MathField({ team, registry, onEnter, placeholder = "type a function in x", makeInput }: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  useEffect(() => {
    const input: MathInputLike = makeInput ? makeInput() : new MathInput("", placeholder);
    hostRef.current!.appendChild(input.el);
    input.reflow();
    input.onEnter(() => onEnterRef.current());
    registry.register(team, input);
    return () => {
      registry.unregister(team);
      input.el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, registry]);

  return <span ref={hostRef} className="hud-input" />;
}
```

- [ ] **Step 3: Run to verify pass. Note:** the real `MathInput` path is exercised in the Task 11 browser validation, not in jsdom (MathQuill needs a real layout engine).

- [ ] **Step 4: Commit**

```bash
git add src/app/hud/MathField.tsx src/app/hud/MathField.test.tsx
git commit -m "feat(hud): MathField React wrapper around MathInput with registry lifecycle"
```

---

### Task 6: HUD Components (panels, scoreboard, timer, overlays)

**Files:**
- Create: `src/app/hud/HudBar.tsx`, `src/app/hud/Overlays.tsx`, `src/app/hud/hud.css`
- Test: `src/app/hud/HudBar.test.tsx`

**Interfaces:**
- Consumes: `hudStore`/`useStore`, `hudController`, `hudInputs`, `MathField`.
- Produces: `<HudBar />` (both player panels + scoreboard + timer), `<HudOverlays />` (HP bars, win banner, round splash, tutorial). Both are pure store readers; all mutations go through `hudController`.

- [ ] **Step 1: Write the failing test**

`src/app/hud/HudBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HudBar } from "./HudBar";
import { HudOverlays } from "./Overlays";
import { hudStore, hudController, hudInputs, initialHudState } from "./hudStore";

const fakeInput = (latex: string) => ({
  getLatex: () => latex, setLatex: vi.fn(), focus: vi.fn(), setEnabled: vi.fn(),
});

// HudBar renders MathFields with a test factory via prop
const makeInput = () => {
  const el = document.createElement("span");
  return { el, getLatex: () => "x", setLatex: vi.fn(), focus: vi.fn(),
           setEnabled: vi.fn(), reflow: vi.fn(), onEnter: vi.fn() };
};

describe("HudBar", () => {
  beforeEach(() => hudStore.set(initialHudState()));

  it("shows the scoreboard from store state", () => {
    render(<HudBar makeInput={makeInput} />);
    hudController.updateScoreboard(2, 1, 3, 5);
    expect(screen.getByText(/Round 3\/5/)).toBeTruthy();
  });

  it("disables the inactive side's Fire button in turn-based mode", () => {
    render(<HudBar makeInput={makeInput} />);
    hudController.setTurn("red");
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect((fires[0] as HTMLButtonElement).disabled).toBe(false); // red (left)
    expect((fires[1] as HTMLButtonElement).disabled).toBe(true);  // blue (right)
  });

  it("shows the timer only on the active panel and hides it in no-turn", () => {
    render(<HudBar makeInput={makeInput} />);
    hudController.setTurn("red");
    hudController.setTimer(42);
    expect(screen.getByText("42s")).toBeTruthy();
    hudController.setNoTurnMode(true);
    expect(screen.queryByText("42s")).toBeNull();
  });

  it("fire click routes through controller gating", () => {
    const cb = vi.fn();
    hudController.onFire(cb);
    hudInputs.register("red", fakeInput("\\tan(x)"));
    render(<HudBar makeInput={makeInput} />);
    hudController.setTurn("red");
    fireEvent.click(screen.getAllByRole("button", { name: "Fire" })[0]);
    expect(cb).toHaveBeenCalledWith("red", "\\tan(x)");
  });
});

describe("HudOverlays", () => {
  beforeEach(() => hudStore.set(initialHudState()));

  it("win banner renders winner and Back to Lobby resets", () => {
    const reset = vi.fn();
    hudController.onReset(reset);
    render(<HudOverlays />);
    hudController.showWin("blue", "Health depleted.");
    expect(screen.getByText(/BLUE WINS/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back to Lobby/ }));
    expect(reset).toHaveBeenCalled();
  });

  it("tutorial overlay shows text and wires next/skip", () => {
    render(<HudOverlays />);
    const onNext = vi.fn();
    hudController.showTutorialStep("step one", onNext, vi.fn());
    expect(screen.getByText("step one")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onNext).toHaveBeenCalled();
  });
});
```

Note: `hudInputs.register("red", …)` in the fire test intentionally overrides the field the mounted `MathField` registered — last registration wins, which is exactly the registry contract.

- [ ] **Step 2: Run to verify failure, then implement**

`src/app/hud/hud.css` (imported by HudBar):

```css
.hud-bar {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 5;
  display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--gw-space-3);
  align-items: end; padding: var(--gw-space-3);
}
.player-panel {
  background: var(--gw-surface-2); border: 1px solid var(--gw-border);
  border-radius: var(--gw-radius-lg); padding: var(--gw-space-3);
  backdrop-filter: blur(8px); transition: border-color 200ms, box-shadow 200ms, opacity 200ms;
}
.player-panel.is-red.is-active  { border-color: var(--gw-red);  box-shadow: var(--gw-glow-red); }
.player-panel.is-blue.is-active { border-color: var(--gw-blue); box-shadow: var(--gw-glow-blue); }
.player-panel.is-inactive { opacity: 0.45; }
.fire-row { display: flex; align-items: center; gap: var(--gw-space-2); }
.hud-prompt { font-family: var(--gw-font-mono); color: var(--gw-text-muted); }
.hud-input { flex: 1; min-width: 0; background: var(--gw-surface);
  border: 1px solid var(--gw-border); border-radius: var(--gw-radius-sm);
  padding: 6px 10px; display: block; }
.hud-status { min-height: 18px; font-size: var(--gw-fs-xs); color: var(--gw-text-faint); }
.hud-timer { font-family: var(--gw-font-mono); font-weight: 800; min-width: 44px; text-align: center; }
.hud-timer.warn { color: #ffb020; }
.hud-timer.crit { color: var(--gw-red); animation: gw-pulse 0.6s infinite alternate; }
@keyframes gw-pulse { from { opacity: 1; } to { opacity: 0.4; } }
.scoreboard { align-self: end; background: var(--gw-surface); border: 1px solid var(--gw-border);
  border-radius: 999px; padding: 8px 18px; font-weight: 800; white-space: nowrap; }
.scoreboard .s-red { color: var(--gw-red); } .scoreboard .s-blue { color: var(--gw-blue); }

/* Overlays */
.hp-overlay { position: absolute; top: 0; left: 0; right: 0; z-index: 5;
  display: flex; justify-content: space-between; pointer-events: none; }
.hp-wrap { position: relative; width: 34%; height: 22px; background: var(--gw-surface-2);
  border: 1px solid var(--gw-border); overflow: hidden; }
.hp-fill { height: 100%; transition: width 250ms ease; }
.hp-wrap.is-red .hp-fill { background: var(--gw-red); }
.hp-wrap.is-blue .hp-fill { background: var(--gw-blue); margin-left: auto; }
.hp-label { position: absolute; top: 50%; transform: translateY(-50%);
  font-size: 12px; font-weight: 800; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
.hp-wrap.is-red .hp-label { right: 9px; } .hp-wrap.is-blue .hp-label { left: 9px; }

.gw-overlay-center { position: absolute; inset: 0; z-index: 10;
  display: flex; align-items: center; justify-content: center; }
.win-banner, .round-splash, .tutorial-box {
  background: var(--gw-surface); border: 1px solid var(--gw-border-strong);
  border-radius: var(--gw-radius-xl); padding: var(--gw-space-6);
  text-align: center; backdrop-filter: blur(10px);
}
.win-banner h2 { margin: 0 0 var(--gw-space-3); font-size: var(--gw-fs-xl); }
.win-banner .w-red { color: var(--gw-red); } .win-banner .w-blue { color: var(--gw-blue); }
.tutorial-actions { display: flex; gap: var(--gw-space-3); justify-content: center; margin-top: var(--gw-space-4); }
```

`src/app/hud/HudBar.tsx`:

```tsx
import "./hud.css";
import { useStore } from "../store";
import { hudStore, hudController, hudInputs, type Team } from "./hudStore";
import { MathField } from "./MathField";

function TimerBadge() {
  const timer = useStore(hudStore, (s) => s.timer);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  if (timer === null || noTurn) return null;
  const cls = timer <= 5 ? "hud-timer crit" : timer <= 10 ? "hud-timer warn" : "hud-timer";
  return <span className={cls}>{timer}s</span>;
}

function PlayerPanel({ team, makeInput }: { team: Team; makeInput?: never | (() => any) }) {
  const turn = useStore(hudStore, (s) => s.turn);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  const busy = useStore(hudStore, (s) => s.busy[team]);
  const status = useStore(hudStore, (s) => s.status);
  const active = noTurn || turn === team;
  const canFire = active && !busy;
  return (
    <div className={`player-panel is-${team} ${active ? "is-active" : "is-inactive"}`}>
      <div className="fire-row">
        <span className="hud-prompt">y =</span>
        <MathField team={team} registry={hudInputs} makeInput={makeInput}
          onEnter={() => hudController.requestFire(team)} />
        {turn === team && <TimerBadge />}
        <button className="gw-btn" disabled={!canFire}
          onClick={() => hudController.requestFire(team)}>Fire</button>
      </div>
      <div className="hud-status">{turn === team ? status : ""}</div>
    </div>
  );
}

function Scoreboard() {
  const score = useStore(hudStore, (s) => s.score);
  return (
    <div className="scoreboard">
      <span className="s-red">RED {score.red}</span> — <span className="s-blue">BLUE {score.blue}</span>
      {" · "}Round {score.round}/{score.totalRounds}
    </div>
  );
}

export function HudBar({ makeInput }: { makeInput?: () => any }) {
  return (
    <div className="hud-bar">
      <PlayerPanel team="red" makeInput={makeInput} />
      <Scoreboard />
      <PlayerPanel team="blue" makeInput={makeInput} />
    </div>
  );
}
```

`src/app/hud/Overlays.tsx`:

```tsx
import { useStore } from "../store";
import { hudStore, hudController } from "./hudStore";

function HpBars() {
  const hp = useStore(hudStore, (s) => s.hp);
  if (!hp.visible) return null;
  return (
    <div className="hp-overlay">
      {(["red", "blue"] as const).map((t) => (
        <div key={t} className={`hp-wrap is-${t}`}>
          <div className="hp-fill" style={{ width: `${Math.max(0, Math.min(100, hp[t]))}%` }} />
          <span className="hp-label">{hp[t]} HP</span>
        </div>
      ))}
    </div>
  );
}

function WinBanner() {
  const win = useStore(hudStore, (s) => s.win);
  if (!win) return null;
  return (
    <div className="gw-overlay-center">
      <div className="win-banner">
        <h2 className={`w-${win.winner}`}>{win.winner.toUpperCase()} WINS!</h2>
        <p>{win.detail}</p>
        <button className="gw-btn gw-btn--primary" onClick={() => hudController.requestReset()}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}

function RoundSplash() {
  const splash = useStore(hudStore, (s) => s.splash);
  if (!splash) return null;
  return (
    <div className="gw-overlay-center">
      {/* splash html is app-generated (LocalGame), never user input */}
      <div className="round-splash" dangerouslySetInnerHTML={{ __html: splash }} />
    </div>
  );
}

function TutorialOverlay() {
  const tutorial = useStore(hudStore, (s) => s.tutorial);
  if (!tutorial) return null;
  return (
    <div className="gw-overlay-center">
      <div className="tutorial-box">
        <p>{tutorial.text}</p>
        <div className="tutorial-actions">
          <button className="gw-btn" onClick={() => hudController.tutorialSkip()}>Skip tutorial</button>
          <button className="gw-btn gw-btn--primary" onClick={() => hudController.tutorialNext()}>OK</button>
        </div>
      </div>
    </div>
  );
}

export function HudOverlays() {
  return (<><HpBars /><WinBanner /><RoundSplash /><TutorialOverlay /></>);
}
```

- [ ] **Step 3: Run to verify pass.** `npx vitest run src/app/hud` — PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/hud/
git commit -m "feat(hud): React player panels, scoreboard, timer badge, HP/win/splash/tutorial overlays"
```

---

### Task 7: Renderer Singleton + ArenaStage

**Files:**
- Create: `src/app/arena/rendererSingleton.ts`, `src/app/arena/ArenaStage.tsx`
- Test: `src/app/arena/rendererSingleton.test.ts`

**Interfaces:**
- Consumes: `GameRenderer` (existing: `init(container)`, `readonly app`).
- Produces:

```ts
// rendererSingleton.ts — one Pixi renderer for the whole session (ADR-0003)
export function acquireRenderer(
  container: HTMLElement,
  factory?: () => RendererLike,          // test seam
): Promise<GameRenderer>;
interface RendererLike { init(c: HTMLElement): Promise<void>; app: { canvas: HTMLCanvasElement; resizeTo: HTMLElement | Window; resize(): void } }
```

```tsx
// ArenaStage.tsx
<ArenaStage scale={0.87 | 1} onReady={(r: GameRenderer) => void} factory? />
// Renders <div class="arena-stage"> whose transform scales with a 900ms ease.
```

- [ ] **Step 1: Write the failing test**

`src/app/arena/rendererSingleton.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { acquireRenderer, _resetForTests } from "./rendererSingleton";

function fakeRenderer() {
  const canvas = document.createElement("canvas");
  return {
    initCalls: 0,
    app: { canvas, resizeTo: window as Window | HTMLElement, resize: vi.fn() },
    async init(c: HTMLElement) { this.initCalls++; c.appendChild(canvas); this.app.resizeTo = c; },
  };
}

describe("acquireRenderer", () => {
  beforeEach(() => _resetForTests());

  it("initialises once and reattaches on subsequent containers", async () => {
    const r = fakeRenderer();
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    const a = await acquireRenderer(c1, () => r as never);
    const b = await acquireRenderer(c2, () => r as never);
    expect(a).toBe(b);
    expect(r.initCalls).toBe(1);
    expect(r.app.canvas.parentElement).toBe(c2);   // canvas moved, not re-created
    expect(r.app.resizeTo).toBe(c2);
    expect(r.app.resize).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

`src/app/arena/rendererSingleton.ts`:

```ts
import { GameRenderer } from "../../game/GameRenderer";

let instance: GameRenderer | null = null;
let initPromise: Promise<GameRenderer> | null = null;

/**
 * One renderer per session (ADR-0003): the config screen and the game screen
 * share the same Pixi canvas so the config→game transition is a CSS transform,
 * never a re-init. Re-acquiring with a new container moves the canvas.
 */
export async function acquireRenderer(
  container: HTMLElement,
  factory: () => GameRenderer = () => new GameRenderer(),
): Promise<GameRenderer> {
  if (!initPromise) {
    const r = factory();
    instance = r;
    initPromise = r.init(container).then(() => r);
    return initPromise;
  }
  const r = await initPromise;
  if (r.app.canvas.parentElement !== container) {
    container.appendChild(r.app.canvas);
    r.app.resizeTo = container;
    r.app.resize();
  }
  return r;
}

/** Test-only. */
export function _resetForTests(): void {
  instance = null;
  initPromise = null;
}
```

`src/app/arena/ArenaStage.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { GameRenderer } from "../../game/GameRenderer";
import { acquireRenderer } from "./rendererSingleton";

interface Props {
  scale: number;                       // 0.87 in config phase, 1 in play
  onReady: (r: GameRenderer) => void;
  factory?: () => GameRenderer;        // test seam
}

export function ArenaStage({ scale, onReady, factory }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    void acquireRenderer(hostRef.current!, factory).then((r) => {
      if (!cancelled) onReadyRef.current(r);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="arena-frame">
      <div
        ref={hostRef}
        className="arena-stage"
        style={{ transform: `scale(${scale})`, transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
    </div>
  );
}
```

Add to `src/app/theme.css`:

```css
.arena-frame { position: absolute; inset: 0; overflow: hidden; }
.arena-stage { position: absolute; inset: 0; transform-origin: 50% 46%; }
```

- [ ] **Step 3: Run to verify pass + typecheck, commit**

```bash
npx vitest run src/app/arena && npx tsc --noEmit
git add src/app/arena/ src/app/theme.css
git commit -m "feat(arena): shared renderer singleton + CSS-scaled ArenaStage (ADR-0003 zoom)"
```

---

### Task 8: LocalGame Controller + Seeded Layout

Port the local match flow out of `src/game/main.ts` into a class that (a) depends only on `GameRenderer` + `GameUiPort`, (b) splits **preview** (build & render round 1 — the "arena is the waiting room" state) from **begin** (tutorial, timers, play), and (c) ticks the visible turn timer.

**Files:**
- Modify: `src/game/localLayout.ts` (optional seed param)
- Create: `src/game/LocalGame.ts`
- Test: `src/game/LocalGame.test.ts`, extend `src/game/localLayout.test.ts` (create if absent)

**Interfaces:**
- Consumes: `createMatch`, `beginRound`, `worldFor`, `playerById`, `skipTurn` (matchState), `resolveFire`, `firstShooterNextRound`, `buildLocalLayout`, `GameUiPort`, renderer methods `setMap/getEffectiveBounds/setWorld/setNoTurnMode/playShot/showFloatingDamage`.
- Produces:

```ts
export function buildLocalLayout(bounds: Bounds, config: MatchConfig, seed?: number): RoundLayout;

export class LocalGame {
  constructor(renderer: RendererPort, ui: GameUiPort);
  /** Build + render round 1 for `config` at `seed` without starting play. Idempotent; call on every config change / reroll. */
  preview(config: MatchConfig, seed: number): void;
  /** Start play using the exact previewed layout (tutorial on first run). */
  begin(): void;
  /** Cancel timers, clear callbacks. Call on unmount / back-to-lobby. */
  dispose(): void;
}
// RendererPort = the 6 GameRenderer methods above (structural interface, so tests fake it)
```

- [ ] **Step 1: Write the failing seeded-layout test**

`src/game/localLayout.test.ts` (append or create):

```ts
import { describe, it, expect } from "vitest";
import { buildLocalLayout } from "./localLayout";
import { boundsFromMap } from "../sim/planetScatter";
import { arenaDefaults } from "./arenaDefaults";
import type { MatchConfig } from "./matchLogic";

const cfg: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local", ...arenaDefaults() };

describe("buildLocalLayout seeding", () => {
  it("same seed → identical planets; different seed → different planets", () => {
    const bounds = boundsFromMap(cfg.map);
    const a = buildLocalLayout(bounds, cfg, 1234);
    const b = buildLocalLayout(bounds, cfg, 1234);
    const c = buildLocalLayout(bounds, cfg, 99);
    expect(a.planets).toEqual(b.planets);
    expect(JSON.stringify(a.planets)).not.toEqual(JSON.stringify(c.planets));
  });
});
```

- [ ] **Step 2: Run to verify failure, then modify `buildLocalLayout`**

In `src/game/localLayout.ts`, change the signature and first line only:

```ts
export function buildLocalLayout(bounds: Bounds, config: MatchConfig, seed?: number): RoundLayout {
  const layoutSeed = seed ?? (Math.random() * 0xffffffff) >>> 0;
  const spawns = computeSpawns(config.map, config.teamSize);
  const planets = generatePlanets(layoutSeed, bounds, spawns, config.scatter);
```

(Player `pick(...)` stays random — spawn choice isn't part of the previewed terrain contract; the preview passes a seed so the *planets* match. If Task 11 shows player dots jumping between preview and play, thread `mulberry32(layoutSeed)` into `pick` then.)

Run the layout test — PASS.

- [ ] **Step 3: Write the failing LocalGame test**

`src/game/LocalGame.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalGame } from "./LocalGame";
import { boundsFromMap } from "../sim/planetScatter";
import { arenaDefaults } from "./arenaDefaults";
import type { MatchConfig } from "./matchLogic";
import type { GameUiPort } from "./GameUiPort";

const cfg: MatchConfig = {
  mode: "classic", rounds: 3, noTurn: false, turnSeconds: 60, role: "local", ...arenaDefaults(),
};

function fakeRenderer() {
  return {
    setMap: vi.fn(),
    getEffectiveBounds: () => boundsFromMap(cfg.map),
    setWorld: vi.fn(),
    setNoTurnMode: vi.fn(),
    playShot: vi.fn().mockResolvedValue(undefined),
    showFloatingDamage: vi.fn(),
  };
}

function fakeUi(): GameUiPort & { fire?: (p: "red" | "blue", l: string) => void } {
  const ui: any = { fire: undefined };
  for (const m of [
    "onReset","setTurn","setBusy","setNoTurnMode","focus","setStatus","showWin",
    "resetInputs","hideWin","updateScoreboard","showSplash","hideSplash",
    "showTutorialStep","hideTutorial","showHpBars","updateHp","setTimer",
  ]) ui[m] = vi.fn();
  ui.onFire = (cb: any) => { ui.fire = cb; };
  return ui;
}

describe("LocalGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem("graphwar.tutorialDone", "1"); // skip tutorial in tests
  });
  afterEach(() => vi.useRealTimers());

  it("preview renders the world without starting play", () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    g.preview(cfg, 42);
    expect(r.setMap).toHaveBeenCalledWith(cfg.map);
    expect(r.setWorld).toHaveBeenCalled();
    expect(ui.setTurn).not.toHaveBeenCalled();       // not started
    g.dispose();
  });

  it("begin initialises HUD and arms a ticking timer", () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    g.preview(cfg, 42);
    g.begin();
    expect(ui.setTurn).toHaveBeenCalledWith("red", "");
    expect(ui.updateScoreboard).toHaveBeenCalledWith(0, 0, 1, 3);
    expect(ui.setTimer).toHaveBeenCalledWith(60);
    vi.advanceTimersByTime(1000);
    expect(ui.setTimer).toHaveBeenCalledWith(59);
    g.dispose();
  });

  it("timer expiry skips the turn to the other player", () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    g.preview({ ...cfg, turnSeconds: 15 }, 42);
    g.begin();
    vi.advanceTimersByTime(15_000);
    expect(ui.setTurn).toHaveBeenLastCalledWith("blue", "");
    g.dispose();
  });

  it("a direct hit ends the round and shows the splash", async () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    // Empty field + flat shot from red at blue's row → guaranteed hit
    g.preview({ ...cfg, scatter: { ...cfg.scatter, maxPlanets: 0 } }, 42);
    g.begin();
    await (ui as any).fire("red", "0");
    expect(ui.showSplash).toHaveBeenCalled();
    g.dispose();
  });
});
```

- [ ] **Step 4: Run to verify failure, then implement `src/game/LocalGame.ts`**

This is a mechanical port of `main.ts`'s `start` / `onFire` / `handleRoundEnd` / timer / tutorial logic with `ui!` → `this.ui`, `renderer!` → `this.renderer`, plus (a) `preview`/`begin` split and (b) a 1s-interval timer that calls `ui.setTimer`:

```ts
// src/game/LocalGame.ts
import type { GameUiPort } from "./GameUiPort";
import type { MatchConfig } from "./matchLogic";
import { firstShooterNextRound } from "./matchLogic";
import {
  createMatch, beginRound, worldFor, playerById, skipTurn,
  type MatchState, type Team, type PlayerState,
} from "./matchState";
import { resolveFire } from "./resolveFire";
import { buildLocalLayout } from "./localLayout";
import type { Bounds } from "../sim/types";
import type { World } from "../sim/types";
import type { Vec2 } from "../sim/types";
import type { ShotResult } from "../sim/types";
import type { MapConfig } from "./matchLogic";

/** The 6 renderer methods LocalGame needs (structural, so tests can fake it). */
export interface RendererPort {
  setMap(map: MapConfig): void;
  getEffectiveBounds(): Bounds;
  setWorld(world: World, activeTurn: Team, redPos: Vec2, bluePos: Vec2): void;
  setNoTurnMode(enabled: boolean): void;
  playShot(result: ShotResult, player?: Team): Promise<void>;
  showFloatingDamage(at: Vec2, dmg: number, player: Team): void;
}

const SPLASH_MS = 2000;

export class LocalGame {
  private config!: MatchConfig;
  private match: MatchState | null = null;
  private previewSeed = 0;
  private started = false;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private timerRemaining = 0;
  private splashTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private renderer: RendererPort, private ui: GameUiPort) {
    this.ui.onFire((p, latex) => void this.onFire(p, latex));
  }

  /** Render round 1 for this config+seed without starting play (ADR-0003 preview). */
  preview(config: MatchConfig, seed: number): void {
    if (this.started) return;
    this.config = config;
    this.previewSeed = seed;
    this.renderer.setMap(config.map);
    const bounds = this.renderer.getEffectiveBounds();
    const layout = buildLocalLayout(bounds, config, seed);
    this.match = createMatch(config, layout, bounds, "red");
    this.renderFrom(this.match, "red");
  }

  /** Start play on the previewed round-1 state. */
  begin(): void {
    if (!this.match || this.started) return;
    this.started = true;
    this.renderer.setNoTurnMode(this.config.noTurn);
    if (this.config.noTurn) this.ui.setNoTurnMode(true);
    this.initRoundHud();
    if (localStorage.getItem("graphwar.tutorialDone") !== "1") this.runTutorial();
    else this.ui.focus();
  }

  dispose(): void {
    this.cancelTimer();
    if (this.splashTimeout) clearTimeout(this.splashTimeout);
    this.started = false;
    this.match = null;
  }

  // ── internals (ported from src/game/main.ts) ─────────────────────────────

  private redOf(m: MatchState): PlayerState { return m.players.find((p) => p.team === "red")!; }
  private blueOf(m: MatchState): PlayerState { return m.players.find((p) => p.team === "blue")!; }

  private renderFrom(m: MatchState, viewTeam: Team): void {
    const viewer = m.players.find((p) => p.team === viewTeam && p.alive) ?? this.redOf(m);
    this.renderer.setWorld(worldFor(m, viewer), viewTeam, this.redOf(m).pos, this.blueOf(m).pos);
  }

  private initRoundHud(): void {
    const m = this.match!;
    const viewTeam: Team = m.activePlayerId ? playerById(m, m.activePlayerId)!.team : "red";
    this.ui.resetInputs();
    this.ui.setTurn(viewTeam, "");
    this.armTimer();
    this.ui.hideWin();
    this.ui.hideSplash();
    this.ui.updateScoreboard(m.scores.red, m.scores.blue, m.round, this.config.rounds);
    this.ui.showHpBars(this.config.mode === "hp");
    this.ui.updateHp(this.redOf(m).hp, this.blueOf(m).hp);
    this.ui.setStatus();
  }

  private cancelTimer(): void {
    if (this.timerInterval !== null) { clearInterval(this.timerInterval); this.timerInterval = null; }
    this.ui.setTimer(null);
  }

  private armTimer(): void {
    this.cancelTimer();
    if (this.config.noTurn) return;
    this.timerRemaining = this.config.turnSeconds ?? 60;
    this.ui.setTimer(this.timerRemaining);
    this.timerInterval = setInterval(() => {
      this.timerRemaining -= 1;
      this.ui.setTimer(this.timerRemaining);
      if (this.timerRemaining > 0) return;
      // Turn expired: skip to the other player.
      if (this.match && this.match.phase === "play") {
        this.match = skipTurn(this.match);
        const viewTeam: Team = this.match.activePlayerId
          ? playerById(this.match, this.match.activePlayerId)!.team : "red";
        this.ui.setTurn(viewTeam, "");
        this.armTimer();
      } else {
        this.cancelTimer();
      }
    }, 1000);
  }

  private async onFire(player: Team, latex: string): Promise<void> {
    if (!this.started) return;
    this.cancelTimer();
    const m = this.match;
    if (!m || m.phase !== "play") return;
    const shooter = m.players.find((p) => p.team === player && p.alive);
    if (!shooter) return;

    const res = resolveFire(m, { playerId: shooter.id, latex });
    if (res.rejected) {
      if (res.rejected === "bad-function") this.ui.setStatus("that isn't a plottable function of x");
      if (!this.config.noTurn) this.armTimer();
      return;
    }

    this.ui.setBusy(player, true);
    await this.renderer.playShot(res.shot!, player);
    this.ui.setBusy(player, false);

    // Commit against LIVE state (no-turn: enemy may have mutated match mid-flight).
    let commit = res;
    if (this.config.noTurn) {
      commit = resolveFire(this.match!, { playerId: shooter.id, latex });
      if (commit.rejected) { this.ui.focus(); return; }
    }
    this.match = commit.next;

    if (commit.shot!.hit.kind === "target" && this.config.mode === "hp" && commit.damage) {
      const defender: Team = player === "red" ? "blue" : "red";
      this.renderer.showFloatingDamage(commit.shot!.hit.at, commit.damage, defender);
    }

    if (commit.roundEnded) {
      this.renderFrom(this.match, player);
      if (this.config.mode === "hp") this.ui.updateHp(this.redOf(this.match).hp, this.blueOf(this.match).hp);
      this.handleRoundEnd(commit.roundLoser!);
      return;
    }

    const viewTeam: Team = this.match.activePlayerId
      ? playerById(this.match, this.match.activePlayerId)!.team : player;
    this.renderFrom(this.match, viewTeam);
    if (this.config.mode === "hp") this.ui.updateHp(this.redOf(this.match).hp, this.blueOf(this.match).hp);
    if (!this.config.noTurn) {
      this.ui.setTurn(viewTeam, "");
      this.armTimer();
    }
    this.ui.setStatus();
    this.ui.focus();
  }

  private handleRoundEnd(roundLoser: Team): void {
    const m = this.match!;
    if (m.phase === "over") {
      this.cancelTimer();
      this.ui.setBusy("red", false);
      this.ui.setBusy("blue", false);
      this.ui.showWin(m.winner!, this.config.mode === "hp" ? "Health depleted." : "Direct hit.");
      return;
    }
    const winnerLabel = roundLoser === "red" ? "BLUE" : "RED";
    const loserLabel = roundLoser === "red" ? "RED" : "BLUE";
    this.ui.showSplash(
      `Round ${m.round + 1} of ${this.config.rounds}<br>` +
      `<span style="color:${roundLoser === "red" ? "var(--gw-blue)" : "var(--gw-red)"}">${winnerLabel} wins the round!</span><br>` +
      `<small>${loserLabel} shoots first</small>`,
    );
    this.splashTimeout = setTimeout(() => {
      this.ui.hideSplash();
      const bounds = this.renderer.getEffectiveBounds();
      this.match = beginRound(m, buildLocalLayout(bounds, this.config), firstShooterNextRound(roundLoser));
      const viewTeam: Team = this.match.activePlayerId
        ? playerById(this.match, this.match.activePlayerId)!.team : "red";
      this.renderFrom(this.match, viewTeam);
      this.ui.resetInputs();
      this.ui.setTurn(viewTeam, "");
      this.armTimer();
      this.ui.setNoTurnMode(this.config.noTurn);
      this.ui.updateScoreboard(this.match.scores.red, this.match.scores.blue, this.match.round, this.config.rounds);
      if (this.config.mode === "hp") this.ui.updateHp(this.redOf(this.match).hp, this.blueOf(this.match).hp);
      this.ui.setStatus();
      this.ui.focus();
    }, SPLASH_MS);
  }

  private runTutorial(): void {
    const steps = [
      "Welcome to Graph War! You are the RED dot on the left. BLUE is on the right.",
      "Type a mathematical function of x (like: 0, x, sin(x)) into the RED input below. Your shot will travel along that curve.",
      "Press Enter or the Fire button to shoot. Try to hit BLUE!",
    ];
    let i = 0;
    const show = (): void => {
      if (i >= steps.length) { done(); return; }
      this.ui.showTutorialStep(steps[i], () => { i++; show(); }, done);
    };
    const done = (): void => {
      this.ui.hideTutorial();
      localStorage.setItem("graphwar.tutorialDone", "1");
      this.ui.focus();
    };
    show();
  }
}
```

Adjust the `World`/`Vec2`/`ShotResult`/`Bounds` import paths to wherever `src/sim/types.ts` actually exports them (check the file; `GameRenderer.ts` imports show the correct paths).

- [ ] **Step 5: Run tests + typecheck.** `npx vitest run src/game/LocalGame.test.ts src/game/localLayout.test.ts && npx tsc --noEmit` — PASS. (jsdom note: LocalGame.test uses `localStorage` — add `// @vitest-environment jsdom` at the top of `LocalGame.test.ts`.)

- [ ] **Step 6: Commit**

```bash
git add src/game/LocalGame.ts src/game/LocalGame.test.ts src/game/localLayout.ts src/game/localLayout.test.ts
git commit -m "feat(game): LocalGame controller with preview/begin split, seeded layout, ticking turn timer"
```

---

### Task 9: Screens — Landing, ConfigPanel, Countdown, LocalFlow, Online Parity, App Wiring

**Files:**
- Create: `src/app/screens/LandingScreen.tsx`, `src/app/screens/ConfigPanel.tsx`, `src/app/screens/CountdownOverlay.tsx`, `src/app/screens/LocalFlow.tsx`, `src/app/screens/OnlineParity.tsx`, `src/app/PhoneGate.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/screens/ConfigPanel.test.tsx`, `src/app/screens/CountdownOverlay.test.tsx`, `src/app/App.test.tsx` (extend)

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces: `<App />` full route switch. `ConfigPanel` value type:

```ts
export interface PanelConfig {   // MatchConfig minus role/roomCode, teamSize pinned to 1 locally
  mode: "classic" | "hp"; rounds: 3 | 5; noTurn: boolean; turnSeconds: number;
  map: MapConfig; scatter: ScatterConfig;
}
<ConfigPanel value={PanelConfig} onChange={(patch: Partial<PanelConfig>) => void}
             seed={number} onReroll={() => void} />
```

- [ ] **Step 1: Write the failing ConfigPanel test**

`src/app/screens/ConfigPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfigPanel } from "./ConfigPanel";
import { arenaDefaults } from "../../game/arenaDefaults";

const base = { mode: "classic" as const, rounds: 3 as const, noTurn: false, turnSeconds: 60,
  map: arenaDefaults().map, scatter: arenaDefaults().scatter };

describe("ConfigPanel", () => {
  it("mode buttons emit onChange", () => {
    const onChange = vi.fn();
    render(<ConfigPanel value={base} onChange={onChange} seed={7} onReroll={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /HP Mode/ }));
    expect(onChange).toHaveBeenCalledWith({ mode: "hp" });
  });
  it("timer stepper clamps at 15s and steps by 5", () => {
    const onChange = vi.fn();
    render(<ConfigPanel value={{ ...base, turnSeconds: 15 }} onChange={onChange} seed={7} onReroll={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "−" }));
    expect(onChange).toHaveBeenCalledWith({ turnSeconds: 15 });   // clamped
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(onChange).toHaveBeenCalledWith({ turnSeconds: 20 });
  });
  it("arena sliders have no numeric value text (ADR-0003)", () => {
    render(<ConfigPanel value={base} onChange={vi.fn()} seed={7} onReroll={vi.fn()} />);
    const arena = screen.getByTestId("arena-controls");
    // slider labels exist, but no rendered numeric values
    expect(arena.querySelectorAll("input[type=range]").length).toBeGreaterThan(4);
    expect(arena.textContent).not.toMatch(/\d+\.\d+/);
  });
  it("reroll button fires", () => {
    const onReroll = vi.fn();
    render(<ConfigPanel value={base} onChange={vi.fn()} seed={7} onReroll={onReroll} />);
    fireEvent.click(screen.getByRole("button", { name: /Reroll/ }));
    expect(onReroll).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing CountdownOverlay test**

`src/app/screens/CountdownOverlay.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CountdownOverlay } from "./CountdownOverlay";

describe("CountdownOverlay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts 3-2-1 then calls onDone", () => {
    const onDone = vi.fn();
    render(<CountdownOverlay seconds={3} onDone={onDone} />);
    expect(screen.getByText("3")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("2")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run both to verify failure, then implement all screen files**

`src/app/screens/CountdownOverlay.tsx`:

```tsx
import { useEffect, useState } from "react";

export function CountdownOverlay({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [n, setN] = useState(seconds);
  useEffect(() => {
    if (n <= 0) { onDone(); return; }
    const t = setTimeout(() => setN((v) => v - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  if (n <= 0) return null;
  return (
    <div className="gw-overlay-center gw-countdown">
      <span key={n} className="gw-countdown-num">{n}</span>
    </div>
  );
}
```

`src/app/screens/ConfigPanel.tsx` (arena slider specs mirror the old `SettingsPanel` SPECS minus `teamSize`, minus all value readouts):

```tsx
import type { MapConfig, ScatterConfig } from "../../game/matchLogic";

export interface PanelConfig {
  mode: "classic" | "hp"; rounds: 3 | 5; noTurn: boolean; turnSeconds: number;
  map: MapConfig; scatter: ScatterConfig;
}

type ArenaPath = "map.width" | "map.height" | `scatter.${keyof ScatterConfig}`;
const ARENA_SPECS: [ArenaPath, string, number, number, number][] = [
  ["map.width", "map width", 8, 60, 1],
  ["map.height", "map height", 6, 40, 1],
  ["scatter.rMin", "planet size min", 0.3, 4, 0.1],
  ["scatter.rMax", "planet size max", 0.3, 4, 0.1],
  ["scatter.gapMin", "gap min", 0, 6, 0.1],
  ["scatter.gapMax", "gap max", 0, 6, 0.1],
  ["scatter.spawnClearance", "spawn clearance", 0, 5, 0.1],
  ["scatter.fieldMargin", "field margin", 0, 3, 0.1],
  ["scatter.maxPlanets", "planet count", 1, 24, 1],
];

function getPath(v: PanelConfig, path: ArenaPath): number {
  const [g, k] = path.split(".") as [keyof PanelConfig, string];
  return (v[g] as Record<string, number>)[k];
}
function patchPath(v: PanelConfig, path: ArenaPath, n: number): Partial<PanelConfig> {
  const [g, k] = path.split(".") as ["map" | "scatter", string];
  return { [g]: { ...v[g], [k]: n } } as Partial<PanelConfig>;
}

interface Props {
  value: PanelConfig;
  onChange: (patch: Partial<PanelConfig>) => void;
  seed: number;
  onReroll: () => void;
}

export function ConfigPanel({ value, onChange, seed, onReroll }: Props) {
  const step = (d: number) => onChange({ turnSeconds: Math.max(15, Math.min(120, value.turnSeconds + d)) });
  return (
    <div className="config-panel gw-card">
      <p className="gw-label">Game Mode</p>
      <div className="cfg-row">
        <button className={`gw-card cfg-opt ${value.mode === "classic" ? "is-active" : ""}`}
          onClick={() => onChange({ mode: "classic" })}>Classic VS<small>One hit per round</small></button>
        <button className={`gw-card cfg-opt ${value.mode === "hp" ? "is-active" : ""}`}
          onClick={() => onChange({ mode: "hp" })}>HP Mode<small>Slope = damage</small></button>
      </div>

      <p className="gw-label">Rounds</p>
      <div className="cfg-row">
        <button className={`gw-card cfg-opt ${value.rounds === 3 ? "is-active" : ""}`}
          onClick={() => onChange({ rounds: 3 })}>Best of 3</button>
        <button className={`gw-card cfg-opt ${value.rounds === 5 ? "is-active" : ""}`}
          onClick={() => onChange({ rounds: 5 })}>Best of 5</button>
      </div>

      <label className="cfg-toggle">
        <input type="checkbox" checked={value.noTurn}
          onChange={(e) => onChange({ noTurn: e.target.checked })} />
        No-Turn Mode (simultaneous fire)
      </label>

      <div className="cfg-timer">
        <span className="gw-label">Turn Timer</span>
        <button className="gw-btn" onClick={() => step(-5)}>−</button>
        <span>{value.turnSeconds} s</span>
        <button className="gw-btn" onClick={() => step(+5)}>+</button>
        <small>(turn-based only · min 15 s)</small>
      </div>

      <p className="gw-label">Arena — the map behind you is the real round 1</p>
      <div className="cfg-arena" data-testid="arena-controls">
        {ARENA_SPECS.map(([path, label, min, max, stp]) => (
          <label key={path} className="cfg-slider">
            <span>{label}</span>
            <input type="range" min={min} max={max} step={stp} value={getPath(value, path)}
              onChange={(e) => onChange(patchPath(value, path, Number(e.target.value)))} />
          </label>
        ))}
      </div>
      <div className="cfg-seed">
        <code>seed {seed}</code>
        <button className="gw-btn" onClick={onReroll}>Reroll</button>
      </div>
    </div>
  );
}
```

`src/app/screens/LandingScreen.tsx`:

```tsx
import { SpacetimeBackground } from "../SpacetimeBackground";

export function LandingScreen() {
  return (
    <div className="gw-landing gw-layer">
      <SpacetimeBackground />
      <div className="gw-layer" style={{ textAlign: "center" }}>
        <h1><span className="t-red">GRAPH</span> <span className="t-blue">WAR</span></h1>
        <p className="gw-tagline">Fire mathematical functions. Hit your opponent.</p>
      </div>
      <div className="gw-layer" style={{ display: "flex", gap: "20px" }}>
        <button className="gw-btn gw-btn--primary" onClick={() => { location.hash = "#local"; }}>
          ▶ Play Locally
        </button>
        <button className="gw-btn" onClick={() => {
          // Phase-1 parity: prompt for a code or create one. Phase 3 replaces this.
          const raw = prompt("Room code (leave blank to create a new room):", "")?.trim().toUpperCase();
          const code = raw || Array.from({ length: 4 }, () =>
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]).join("");
          location.hash = `#room=${code}`;
        }}>Play Online</button>
      </div>
    </div>
  );
}
```

`src/app/screens/LocalFlow.tsx` — one mounted ArenaStage across config → countdown → play:

```tsx
import { useRef, useState } from "react";
import type { MatchConfig } from "../../game/matchLogic";
import { LocalGame } from "../../game/LocalGame";
import type { GameRenderer } from "../../game/GameRenderer";
import { configToHash } from "../../game/configRouter";
import { hudController } from "../hud/hudStore";
import { ArenaStage } from "../arena/ArenaStage";
import { HudBar } from "../hud/HudBar";
import { HudOverlays } from "../hud/Overlays";
import { ConfigPanel, type PanelConfig } from "./ConfigPanel";
import { CountdownOverlay } from "./CountdownOverlay";

type Phase = "config" | "countdown" | "play";
const newSeed = () => (Math.random() * 0xffffffff) >>> 0;

interface Props {
  initial: MatchConfig;
  autostart?: boolean;      // direct #game?… URL: skip config, straight to countdown
}

export function LocalFlow({ initial, autostart = false }: Props) {
  const [phase, setPhase] = useState<Phase>(autostart ? "countdown" : "config");
  const [config, setConfig] = useState<PanelConfig>({
    mode: initial.mode, rounds: initial.rounds, noTurn: initial.noTurn,
    turnSeconds: initial.turnSeconds ?? 60, map: initial.map, scatter: initial.scatter,
  });
  const [seed, setSeed] = useState(newSeed);
  const gameRef = useRef<LocalGame | null>(null);

  const toMatchConfig = (c: PanelConfig): MatchConfig =>
    ({ ...c, role: "local", teamSize: 1 });

  const applyPreview = (c: PanelConfig, s: number) => {
    gameRef.current?.preview(toMatchConfig(c), s);
  };

  const onReady = (renderer: GameRenderer) => {
    if (!gameRef.current) {
      const g = new LocalGame(renderer, hudController);
      hudController.onReset(() => { g.dispose(); gameRef.current = null; location.hash = ""; });
      gameRef.current = g;
    }
    applyPreview(config, seed);
  };

  const onChange = (patch: Partial<PanelConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    applyPreview(next, seed);
  };

  const onReroll = () => {
    const s = newSeed();
    setSeed(s);
    applyPreview(config, s);
  };

  const onStart = () => {
    history.pushState(null, "", configToHash(toMatchConfig(config)));
    setPhase("countdown");
  };

  const onCountdownDone = () => {
    setPhase("play");
    gameRef.current?.begin();
  };

  return (
    <div className="local-flow gw-layer">
      <ArenaStage scale={phase === "play" ? 1 : 0.87} onReady={onReady} />
      {phase === "config" && (
        <>
          {/* proto-HUD seats: same edges the player panels will occupy */}
          <div className="seat seat-red gw-card">P1 · <b style={{ color: "var(--gw-red)" }}>RED</b></div>
          <div className="seat seat-blue gw-card">P2 · <b style={{ color: "var(--gw-blue)" }}>BLUE</b></div>
          <aside className="config-drawer">
            <ConfigPanel value={config} onChange={onChange} seed={seed} onReroll={onReroll} />
            <button className="gw-btn gw-btn--primary cfg-start" onClick={onStart}>▶ Start Match</button>
          </aside>
        </>
      )}
      {phase === "countdown" && <CountdownOverlay seconds={3} onDone={onCountdownDone} />}
      {phase === "play" && (<><HudBar /><HudOverlays /></>)}
    </div>
  );
}
```

`src/app/screens/OnlineParity.tsx` — keeps today's `#room=` behavior working against the React HUD (Phase 3 replaces this screen entirely):

```tsx
import { useEffect, useRef } from "react";
import { ArenaStage } from "../arena/ArenaStage";
import { HudBar } from "../hud/HudBar";
import { HudOverlays } from "../hud/Overlays";
import { hudController } from "../hud/hudStore";
import { NetworkGame } from "../../net/NetworkGame";
import { ServerClient } from "../../net/ServerClient";
import type { GameRenderer } from "../../game/GameRenderer";

const WS_URL: string = (import.meta.env["VITE_WS_URL"] as string | undefined) ?? "ws://localhost:3001";

export function OnlineParity({ code }: { code: string }) {
  const startedRef = useRef(false);

  useEffect(() => {
    hudController.onReset(() => { location.hash = ""; });
  }, []);

  const onReady = (renderer: GameRenderer) => {
    if (startedRef.current) return;
    startedRef.current = true;
    const name = prompt("Enter your name:", "Player") ?? "Player";
    const net = new NetworkGame(new ServerClient(WS_URL), renderer, hudController);
    void net.start(code, name);
  };

  return (
    <div className="gw-layer" style={{ position: "absolute", inset: 0 }}>
      <ArenaStage scale={1} onReady={onReady} />
      <HudBar />
      <HudOverlays />
    </div>
  );
}
```

`src/app/PhoneGate.tsx`:

```tsx
export function PhoneGate() {
  return (
    <div className="gw-phonegate">
      <div>
        <h2><span className="t-red">GRAPH</span> <span className="t-blue">WAR</span></h2>
        <p>needs a bigger screen — open on a desktop or iPad in landscape (≥1024px).</p>
      </div>
    </div>
  );
}
```

`src/app/App.tsx` (replace placeholder):

```tsx
import { useHashRoute } from "./routes";
import { LandingScreen } from "./screens/LandingScreen";
import { LocalFlow } from "./screens/LocalFlow";
import { OnlineParity } from "./screens/OnlineParity";
import { PhoneGate } from "./PhoneGate";
import { parseConfigFromHash } from "../game/configRouter";

export function App() {
  const route = useHashRoute();
  return (
    <div className="gw-app">
      {route.screen === "landing" && <LandingScreen />}
      {route.screen === "local" && <LocalFlow initial={parseConfigFromHash("#game")} />}
      {route.screen === "game" && <LocalFlow key={location.hash} initial={route.config} autostart />}
      {route.screen === "room" && <OnlineParity code={route.code} />}
      <PhoneGate />
    </div>
  );
}
```

Update `src/app/App.test.tsx`'s landing assertion if the markup changed (title now lives in `LandingScreen`).

Add the remaining screen styles to `src/app/theme.css`:

```css
.local-flow { position: absolute; inset: 0; }
.seat { position: absolute; bottom: 18px; z-index: 6; font-size: var(--gw-fs-md); }
.seat-red { left: 18px; } .seat-blue { right: 18px; }
.config-drawer {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 7; width: 340px;
  overflow-y: auto; padding: var(--gw-space-4);
  display: flex; flex-direction: column; gap: var(--gw-space-3);
  background: linear-gradient(270deg, rgba(0,0,0,0.85), rgba(0,0,0,0.55));
}
.cfg-row { display: flex; gap: var(--gw-space-2); }
.cfg-opt { flex: 1; display: flex; flex-direction: column; gap: 4px; cursor: pointer; font-weight: 700; }
.cfg-opt small { color: var(--gw-text-faint); font-weight: 400; }
.cfg-toggle, .cfg-timer { display: flex; align-items: center; gap: var(--gw-space-2); margin: var(--gw-space-2) 0; }
.cfg-arena { display: flex; flex-direction: column; gap: 6px; }
.cfg-slider { display: grid; grid-template-columns: 130px 1fr; align-items: center; gap: 8px;
  font-size: var(--gw-fs-xs); color: var(--gw-text-muted); }
.cfg-seed { display: flex; align-items: center; justify-content: space-between; margin-top: var(--gw-space-2);
  font-family: var(--gw-font-mono); color: var(--gw-text-code); }
.cfg-start { margin-top: var(--gw-space-3); }
.gw-countdown { z-index: 20; background: rgba(0, 0, 0, 0.35); }
.gw-countdown-num {
  font-size: 220px; font-weight: 900; color: var(--gw-text);
  text-shadow: 0 0 60px rgba(68, 136, 255, 0.5);
  animation: gw-count-pop 900ms ease-out;
}
@keyframes gw-count-pop { from { transform: scale(1.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
```

- [ ] **Step 4: Run all app tests + typecheck.** `npx vitest run src/app && npx tsc --noEmit` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/
git commit -m "feat(app): landing, config-with-real-arena, countdown+zoom LocalFlow, online parity path, phone gate"
```

---

### Task 10: Delete Legacy UI

**Files:**
- Delete: `src/game/GameUI.ts`, `src/game/main.ts`, `src/ui/LobbyScreen.ts`, `src/ui/settings/SettingsPanel.ts`, `src/ui/settings/ArenaPreview.ts`
- Modify: `index.html` (strip the legacy inline `<style>` from `<head>`; keep MathQuill/font `<link>` tags if any exist), `src/ui/settings/coverage.ts` (keep — it has tests and no DOM deps; delete only if nothing imports it and its test is removed too)

- [ ] **Step 1: Confirm nothing imports the doomed modules**

```bash
grep -rn "GameUI\b\|LobbyScreen\|SettingsPanel\|ArenaPreview\|game/main" src server --include='*.ts' --include='*.tsx' | grep -v "GameUiPort" | grep -v test
```

Expected: no hits outside the files being deleted. If `coverage.ts` is only used by `ArenaPreview`, delete `coverage.ts` + `coverage.test.ts` too; if the readout logic seems worth keeping for Phase 3, leave it.

- [ ] **Step 2: Delete + strip**

```bash
git rm src/game/GameUI.ts src/game/main.ts src/ui/LobbyScreen.ts src/ui/settings/SettingsPanel.ts src/ui/settings/ArenaPreview.ts
```

In `index.html`, delete the entire inline `<style>…</style>` block from `<head>`. Preserve `<meta>`, `<title>`, and any `<link>` tags (MathQuill CSS, if present, is still needed by `MathInput`).

- [ ] **Step 3: Full gate.** Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all suites pass, build succeeds. If `npm run build` fails on `calculator.html` for unrelated reasons, note it but don't fix here.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(app): remove legacy vanilla UI (GameUI, LobbyScreen, SettingsPanel, ArenaPreview, old main)"
```

---

### Task 11: Browser Validation (stop criteria)

Start the dev server and validate with Playwright. Do NOT report done until all pass.

```bash
npm run dev
```

**Test A — Landing:**
- [ ] `http://localhost:5173` shows pitch-black landing, animated spacetime background moving, glowing GRAPH WAR title, Play Locally / Play Online buttons
- [ ] Screenshot

**Test B — Local config = real arena:**
- [ ] Click Play Locally → `#local`; arena renders at reduced scale in the center, config drawer on the right, seat cards bottom-left (RED) and bottom-right (BLUE)
- [ ] Arena sliders show **no numeric values**; dragging "planet count" visibly changes the rendered arena live
- [ ] Reroll changes the terrain; the seed readout changes
- [ ] Screenshot

**Test C — Countdown + zoom + same terrain:**
- [ ] Screenshot the arena, then click Start Match
- [ ] 3-2-1 countdown overlays while the arena zooms smoothly to full scale — no flash, no re-render
- [ ] Compare screenshots: the planet layout in-game is **identical** to the preview
- [ ] URL hash is `#game?…` with the chosen config

**Test D — Classic flow (clear localStorage first: `localStorage.clear()` then reload from Test B):**
- [ ] Tutorial appears (3 steps, skippable); complete it
- [ ] RED panel is active with glow; BLUE dimmed; timer counts down in RED's panel
- [ ] Fire `0` as RED → shot animates → turn switches to BLUE, timer resets to BLUE's panel
- [ ] Let the timer hit ≤10s (amber) and ≤5s (red pulse), then expire → turn skips
- [ ] Land a hit → round splash → scoreboard updates → play to a match winner → win banner → Back to Lobby → landing, hash cleared
- [ ] Screenshots at each stage

**Test E — HP + No-Turn:**
- [ ] Start an HP match: HP bars visible top corners, damage floats on hit, HP drains
- [ ] Start a No-Turn match: both panels active, both can fire, no timer badge shown

**Test F — Direct URL + back:**
- [ ] `http://localhost:5173/#game?mode=classic&rounds=5&noTurn=false` → countdown → game with Round 1/5
- [ ] Browser back returns to landing
- [ ] `#game?rounds=99&mode=invalid` → defaults (Round 1/3)

**Test G — Online parity (needs `npm run server` in another terminal):**
- [ ] Play Online → create room (prompt) → `#room=CODE`; second browser tab joins the same code
- [ ] Owner sees the fixed Start Match button; match runs over WS with the React HUD updating both tabs

**Test H — Layout gates:**
- [ ] 1024×768: no overlap, drawer usable
- [ ] Resize below 1024px wide: phone gate covers the app
- [ ] Screenshot both

- [ ] **Final commit**

```bash
git add -A
git commit -m "test(app): Phase-1 browser validation complete — React shell, local play, online parity" --allow-empty
```

---

## Self-Review

**Spec coverage (ADRs + grill decisions):**
- ADR-0001 React chrome / vanilla engine — Tasks 1, 4 (port boundary), 10 ✓; hash routing kept — Task 3 ✓; desktop+iPad gate — Task 9 PhoneGate ✓
- ADR-0003 single renderer, preview = real round 1, no numeric readouts, seed+reroll local, countdown + CSS zoom — Tasks 7, 8 (`preview`/`begin`, seeded layout), 9 (LocalFlow, ConfigPanel), validated in Task 11 C ✓
- Landing-first lobby — Task 9 ✓. Timer in active panel with amber/red thresholds — Tasks 6, 8 ✓. Tutorial preserved — Tasks 6, 8 ✓. Online parity — Tasks 4 (retype), 9 (OnlineParity) ✓
- Out of scope by design (Phases 2–3): join-by-code screen, waiting room, rosters/NvN, spectators, nicknames, server countdown, `configureRoom` live updates.

**Placeholder scan:** no TBDs; every code step has complete code. Two intentional deferrals are explicit and bounded (spawn-pick seeding note in Task 8 Step 2; coverage.ts keep-or-delete rule in Task 10 Step 1).

**Type consistency:** `GameUiPort` method list matches `GameUI`'s public API + `setTimer` (verified against `GameUI.ts` line map). `HudController.requestFire` gating mirrors `GameUI.emitFire`. `LocalGame` consumes `RendererPort` = the 6 `GameRenderer` methods used by `main.ts`. `PanelConfig` = `MatchConfig` minus `role`/`roomCode`/`teamSize`; `toMatchConfig` pins `teamSize: 1` (local is 1v1 per ADR-0002). `buildLocalLayout(bounds, config, seed?)` used consistently in Task 8 and `LocalGame.preview`.

**Known risks (accepted):** MathQuill inside React is exercised only in Task 11 (jsdom can't run it); Pixi `resizeTo` reattachment is covered by the singleton test with a fake and by Task 11 in the real browser.
