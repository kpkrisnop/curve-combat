// @vitest-environment jsdom
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
