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

  it("timer expiry skips the turn to the other player without wiping their input", () => {
    const r = fakeRenderer(); const ui = fakeUi();
    const g = new LocalGame(r as never, ui);
    g.preview({ ...cfg, turnSeconds: 15 }, 42);
    g.begin();
    ui.inputs.red = "x^2"; // red was mid-typing when the clock ran out
    vi.advanceTimersByTime(15_000);
    expect(ui.setTurn).toHaveBeenLastCalledWith("blue"); // no wiping "" arg
    expect(ui.inputs.red).toBe("x^2"); // timed-out player keeps their equation
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
});
