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

  it("tutorialSkip invokes the onSkip callback", () => {
    const onNext = vi.fn(), onSkip = vi.fn();
    hud.showTutorialStep("step 1", onNext, onSkip);
    hud.tutorialSkip();
    expect(onSkip).toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
});
