// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { HudBar } from "./HudBar";
import { HudOverlays } from "./Overlays";
import { hudStore, hudController, hudInputs, initialHudState } from "./hudStore";

const fakeInput = (latex: string) => ({
  getLatex: () => latex, setLatex: vi.fn(), focus: vi.fn(), setEnabled: vi.fn(), insertText: vi.fn(),
});

// HudBar renders MathFields with a test factory via prop
const makeInput = () => {
  const el = document.createElement("span");
  return {
    el, getLatex: () => "x", setLatex: vi.fn(), focus: vi.fn(),
    setEnabled: vi.fn(), reflow: vi.fn(), insertText: vi.fn(),
    onEnter: vi.fn(), onEdit: vi.fn(), onUpOutOf: vi.fn(), onDownOutOf: vi.fn(),
  };
};

describe("HudBar", () => {
  beforeEach(() => hudStore.set(initialHudState()));
  afterEach(() => cleanup());

  it("no longer shows a scoreboard inline (relocated to the top-center round-status overlay)", () => {
    render(<HudBar makeInput={makeInput} />);
    act(() => hudController.updateScoreboard(2, 1, 3, 5));
    expect(document.querySelector(".scoreboard")).toBeNull();
    expect(screen.queryByTestId("round-status")).toBeNull();
  });

  it("disables the inactive side's Fire button in turn-based mode", () => {
    render(<HudBar makeInput={makeInput} />);
    act(() => hudController.setTurn("red"));
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect((fires[0] as HTMLButtonElement).disabled).toBe(false); // red (left)
    expect((fires[1] as HTMLButtonElement).disabled).toBe(true);  // blue (right)
  });

  it("locks the inactive side's math input, not just the Fire button (was: dimmed but still typeable)", () => {
    const mocks: ReturnType<typeof makeInput>[] = [];
    const trackedMakeInput = () => { const m = makeInput(); mocks.push(m); return m; };
    render(<HudBar makeInput={trackedMakeInput} />);
    act(() => hudController.setTurn("red"));
    const [redInput, blueInput] = mocks;
    expect(redInput.setEnabled).toHaveBeenLastCalledWith(true);
    expect(blueInput.setEnabled).toHaveBeenLastCalledWith(false);
    act(() => hudController.setTurn("blue"));
    expect(redInput.setEnabled).toHaveBeenLastCalledWith(false);
    expect(blueInput.setEnabled).toHaveBeenLastCalledWith(true);
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

  // M3/L4 — singleTeam (online in-game) gets a modifier class that drops
  // the hud-bar to a single grid track and caps its width (hud.css), so
  // there's no dangling empty second column and the footer's
  // `justify-content: center` can actually center it. The dual (local)
  // layout must keep the plain two-column class untouched.
  it("singleTeam mode adds the hud-bar--single modifier (single grid track, capped width)", () => {
    render(<HudBar makeInput={makeInput} singleTeam="blue" />);
    const bar = document.querySelector(".hud-bar");
    expect(bar).toBeTruthy();
    expect(bar!.classList.contains("hud-bar--single")).toBe(true);
  });

  it("dual (local) layout does NOT get the single-column modifier", () => {
    render(<HudBar makeInput={makeInput} />);
    const bar = document.querySelector(".hud-bar");
    expect(bar).toBeTruthy();
    expect(bar!.classList.contains("hud-bar--single")).toBe(false);
  });
});

describe("HudOverlays", () => {
  beforeEach(() => hudStore.set(initialHudState()));
  afterEach(() => cleanup());

  it("renders a standalone top-center round-status element with round/best-of/score text", () => {
    render(<HudOverlays />);
    act(() => hudController.updateScoreboard(2, 1, 3, 5));
    const el = screen.getByTestId("round-status");
    expect(el.textContent).toContain("Round 3");
    expect(el.textContent).toContain("Best of 5");
    expect(el.textContent).toContain("2");
    expect(el.textContent).toContain("1");
  });

  it("win banner renders winner and Back to Lobby resets", () => {
    const reset = vi.fn();
    hudController.onReset(reset);
    render(<HudOverlays />);
    act(() => hudController.showWin("blue", "Health depleted."));
    // Copy is lowercase in the DOM; the uppercase look is CSS text-transform.
    expect(screen.getByText(/blue wins/i)).toBeTruthy();
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

  it("never renders a top HP overlay — the on-dot badge is the single HP display", () => {
    render(<HudOverlays />);
    act(() => hudController.updateScoreboard(2, 1, 3, 5));
    expect(document.querySelector(".hp-overlay")).toBeNull();
  });
});
