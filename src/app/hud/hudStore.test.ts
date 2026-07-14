import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore } from "../store";
import { HudController, HudInputRegistry, initialHudState, type HudState } from "./hudStore";
import type { Store } from "../store";

function fakeInput(latex = "x") {
  return { getLatex: () => latex, setLatex: vi.fn(), focus: vi.fn(), setEnabled: vi.fn(), insertText: vi.fn(), keystroke: vi.fn() };
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

  it("setTurn/updateScoreboard write store state", () => {
    hud.setTurn("blue");
    hud.updateScoreboard(1, 2, 3, 5);
    const s = store.get();
    expect(s.turn).toBe("blue");
    expect(s.score).toEqual({ red: 1, blue: 2, round: 3, totalRounds: 5 });
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

  it("setTurn writes lastEquation into the opponent's (now-inactive) input", () => {
    const r = fakeInput(), b = fakeInput();
    inputs.register("red", r);
    inputs.register("blue", b);
    // Switching to red: the blue input (opponent) receives lastEquation
    hud.setTurn("red", "x^2");
    expect(b.setLatex).toHaveBeenCalledWith("x^2");
    expect(r.setLatex).not.toHaveBeenCalledWith("x^2");
    // Switching to blue: the red input (opponent) receives lastEquation
    hud.setTurn("blue", "\\sin(x)");
    expect(r.setLatex).toHaveBeenCalledWith("\\sin(x)");
  });

  it("requestFire is blocked when the player is busy", () => {
    const cb = vi.fn();
    hud.onFire(cb);
    inputs.register("red", fakeInput("x"));
    hud.setTurn("red");
    hud.setBusy("red", true);
    hud.requestFire("red");
    expect(cb).not.toHaveBeenCalled();
  });

  it("requestFire pushes the fired latex onto that team's history, newest first", () => {
    const cb = vi.fn();
    hud.onFire(cb);
    inputs.register("red", fakeInput("x"));
    hud.setTurn("red");
    hud.requestFire("red");
    expect(store.get().history.red).toEqual(["x"]);
    expect(store.get().history.blue).toEqual([]);
  });

  it("history caps at 8 entries per team, dropping the oldest", () => {
    hud.setNoTurnMode(true); // let the same team fire repeatedly without turn-gating
    for (let i = 0; i < 9; i++) {
      inputs.register("red", fakeInput(`shot${i}`));
      hud.requestFire("red");
    }
    expect(store.get().history.red).toHaveLength(8);
    expect(store.get().history.red[0]).toBe("shot8"); // newest first
    expect(store.get().history.red).not.toContain("shot0"); // oldest dropped
  });

  it("does not push to history when requestFire is gated (wrong turn / busy / empty)", () => {
    inputs.register("red", fakeInput("x"));
    hud.setTurn("blue"); // red can't fire
    hud.requestFire("red");
    expect(store.get().history.red).toEqual([]);
  });

  it("tutorialSkip invokes the onSkip callback", () => {
    const onNext = vi.fn(), onSkip = vi.fn();
    hud.showTutorialStep("step 1", onNext, onSkip);
    hud.tutorialSkip();
    expect(onSkip).toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("reset() restores the store to initialHudState()", () => {
    hud.setTimer(42);
    hud.setStatus("busy");
    hud.showWin("red");
    hud.reset();
    const s = store.get();
    expect(s).toEqual(initialHudState());
    expect(s.timer).toBeNull();
    expect(s.status).toBe("");
    expect(s.win).toBeNull();
  });
});
