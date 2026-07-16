// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { LocalGame } from "./LocalGame";
import { boundsFromMap } from "../sim/planetScatter";
import { arenaDefaults } from "./arenaDefaults";
import type { MatchConfig } from "./matchLogic";
import type { GameUiPort } from "./GameUiPort";

// Under the default forks pool the per-file jsdom environment doesn't wire
// localStorage onto globalThis.  Provide a minimal Map-backed stub so tests
// that call localStorage.setItem/getItem/removeItem work without vmThreads.
beforeAll(() => {
  if (typeof localStorage === "undefined") {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        get length() { return store.size; },
        key: (i: number) => [...store.keys()][i] ?? null,
      },
      writable: true,
    });
  }
});

const cfg: MatchConfig = {
  mode: "classic", rounds: 3, noTurn: false, turnSeconds: 60, role: "local", ...arenaDefaults(),
};

function fakeRenderer() {
  return {
    setMap: vi.fn(),
    getEffectiveBounds: () => boundsFromMap(cfg.map),
    setWorld: vi.fn(),
    setNoTurnMode: vi.fn(),
    setMirror: vi.fn(),
    playShot: vi.fn().mockResolvedValue(undefined),
    showFloatingDamage: vi.fn(),
  };
}

function fakeUi(): GameUiPort & {
  fire?: (p: "red" | "blue", l: string) => void;
  inputs: Record<"red" | "blue", string>;
} {
  const ui: any = { fire: undefined, inputs: { red: "", blue: "" } };
  for (const m of [
    "onReset","setBusy","setNoTurnMode","focus","setStatus","showWin",
    "hideWin","updateScoreboard","showSplash","hideSplash",
    "showTutorialStep","hideTutorial","setTimer",
  ]) ui[m] = vi.fn();
  ui.onFire = (cb: any) => { ui.fire = cb; };
  // Mirror HudController.setTurn: when a lastEquation is given, it's written
  // into the now-inactive (just-fired) player's tracked input.
  ui.setTurn = vi.fn((turn: "red" | "blue", lastEquation?: string) => {
    if (lastEquation !== undefined) {
      const opponent = turn === "red" ? "blue" : "red";
      ui.inputs[opponent] = lastEquation;
    }
  });
  // Mirror HudController.resetInputs: clears both tracked inputs.
  ui.resetInputs = vi.fn(() => { ui.inputs.red = ""; ui.inputs.blue = ""; });
  return ui;
}

describe("LocalGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem("curvecombat.tutorialDone", "1"); // skip tutorial in tests
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

  it("timer expiry skips the turn to the other player without wiping their input", () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    g.preview({ ...cfg, turnSeconds: 15 }, 42);
    g.begin();
    ui.inputs.red = "x^2"; // red was mid-typing when the clock ran out
    vi.advanceTimersByTime(15_000);
    expect(ui.setTurn).toHaveBeenLastCalledWith("blue"); // no wiping "" arg
    expect(ui.inputs.red).toBe("x^2"); // timed-out player keeps their equation
    // A timeout must flip the view like a fire does, or blue plays in red's
    // frame (ADR 0008 regression).
    expect(r.setMirror).toHaveBeenLastCalledWith(true);
    g.dispose();
  });

  it("a direct hit ends the round and shows the splash", async () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    // Empty field + mirrored spawns → guaranteed hit. A fired constant is
    // anchored to the shooter (trajectory.ts: yOffset = sy - fn(sx)), so "0" is a
    // flat line at red's own y and only connects when blue shares it. spawnMirror
    // defaults to false (cfd58cd), so the test has to ask for the symmetry.
    g.preview({ ...cfg, scatter: { ...cfg.scatter, maxPlanets: 0, spawnMirror: true } }, 42);
    g.begin();
    await (ui as any).fire("red", "0");
    expect(ui.showSplash).toHaveBeenCalled();
    g.dispose();
  });

  it("keeps the shooter's typed equation in their input after a turn-based miss", async () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    // Empty field; "x^2" arcs off the top of the field → guaranteed miss,
    // so the round continues and the turn passes to blue.
    g.preview({ ...cfg, scatter: { ...cfg.scatter, maxPlanets: 0 } }, 42);
    g.begin();
    ui.inputs.red = "x^2"; // what red typed before firing
    await (ui as any).fire("red", "x^2");
    // Red just fired and should stay red's own turn view — but the equation
    // must survive so red can tweak their aim next turn.
    expect(ui.inputs.red).toBe("x^2");
    expect(ui.setTurn).toHaveBeenLastCalledWith("blue");
    g.dispose();
  });

  it("flips the view mirror to match the active shooter each turn (ADR 0008)", async () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    g.preview({ ...cfg, scatter: { ...cfg.scatter, maxPlanets: 0 } }, 42);
    g.begin();
    // Red opens on the left — un-mirrored.
    expect(r.setMirror).toHaveBeenLastCalledWith(false);
    await (ui as any).fire("red", "x^2"); // arcs off the top → miss, turn → blue
    // Blue is up now; the whole view mirrors so blue also plays from the left.
    expect(r.setMirror).toHaveBeenLastCalledWith(true);
    g.dispose();
  });

  it("reflects a mirrored (BLUE) shooter's function into the world frame before firing", async () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    // No-turn so blue can fire directly; empty field so the shot flies clean.
    g.preview({ ...cfg, noTurn: true, scatter: { ...cfg.scatter, maxPlanets: 0 } }, 42);
    g.begin();
    await (ui as any).fire("blue", "2x");
    const shot = (r.playShot as any).mock.calls.at(-1)![0];
    const s = shot.samples;
    // Blue typed y=2x in its left-seated frame. Reflected to world (y=-2x), the
    // trajectory CLIMBS as the shot marches toward the enemy; an un-reflected raw
    // 2x would descend. The sign of the path is the observable proof of x→-x.
    expect(s.length).toBeGreaterThan(1);
    expect(s[1].p.y).toBeGreaterThan(s[0].p.y);
    g.dispose();
  });
});
