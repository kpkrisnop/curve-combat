// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
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
  afterEach(() => cleanup());

  it("shows the scoreboard from store state", () => {
    render(<HudBar makeInput={makeInput} />);
    act(() => hudController.updateScoreboard(2, 1, 3, 5));
    expect(screen.getByText(/Round 3\/5/)).toBeTruthy();
  });

  it("disables the inactive side's Fire button in turn-based mode", () => {
    render(<HudBar makeInput={makeInput} />);
    act(() => hudController.setTurn("red"));
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect((fires[0] as HTMLButtonElement).disabled).toBe(false); // red (left)
    expect((fires[1] as HTMLButtonElement).disabled).toBe(true);  // blue (right)
  });

  it("shows the timer only on the active panel and hides it in no-turn", () => {
    render(<HudBar makeInput={makeInput} />);
    act(() => hudController.setTurn("red"));
    act(() => hudController.setTimer(42));
    expect(screen.getByText("42s")).toBeTruthy();
    act(() => hudController.setNoTurnMode(true));
    expect(screen.queryByText("42s")).toBeNull();
  });

  it("fire click routes through controller gating", () => {
    const cb = vi.fn();
    hudController.onFire(cb);
    render(<HudBar makeInput={makeInput} />);
    // Register after render so this is the last registration (registry contract: last wins)
    hudInputs.register("red", fakeInput("\\tan(x)"));
    hudController.setTurn("red");
    fireEvent.click(screen.getAllByRole("button", { name: "Fire" })[0]);
    expect(cb).toHaveBeenCalledWith("red", "\\tan(x)");
  });
});

describe("HudBar — singleTeam prop", () => {
  beforeEach(() => hudStore.set(initialHudState()));
  afterEach(() => cleanup());

  it("singleTeam='blue' renders exactly one Fire button and it belongs to blue", () => {
    act(() => hudController.setTurn("blue"));
    render(<HudBar makeInput={makeInput} singleTeam="blue" />);
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(1);
    // The single panel should be the blue panel
    const panel = document.querySelector(".player-panel.is-blue");
    expect(panel).toBeTruthy();
    expect(document.querySelector(".player-panel.is-red")).toBeNull();
  });

  it("singleTeam='red' renders exactly one Fire button for red", () => {
    act(() => hudController.setTurn("red"));
    render(<HudBar makeInput={makeInput} singleTeam="red" />);
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(1);
    expect(document.querySelector(".player-panel.is-red")).toBeTruthy();
    expect(document.querySelector(".player-panel.is-blue")).toBeNull();
  });

  it("singleTeam unset renders both panels (dual layout unchanged)", () => {
    render(<HudBar makeInput={makeInput} />);
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(2);
    expect(document.querySelector(".player-panel.is-red")).toBeTruthy();
    expect(document.querySelector(".player-panel.is-blue")).toBeTruthy();
  });
});

describe("HudOverlays", () => {
  beforeEach(() => hudStore.set(initialHudState()));
  afterEach(() => cleanup());

  it("win banner renders winner and Back to Lobby resets", () => {
    const reset = vi.fn();
    hudController.onReset(reset);
    render(<HudOverlays />);
    act(() => hudController.showWin("blue", "Health depleted."));
    expect(screen.getByText(/BLUE WINS/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back to Lobby/ }));
    expect(reset).toHaveBeenCalled();
  });

  it("tutorial overlay shows text and wires next/skip", () => {
    render(<HudOverlays />);
    const onNext = vi.fn();
    act(() => hudController.showTutorialStep("step one", onNext, vi.fn()));
    expect(screen.getByText("step one")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onNext).toHaveBeenCalled();
  });
});
