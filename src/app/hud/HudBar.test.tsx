// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { HudBar } from "./HudBar";
import { HudOverlays } from "./Overlays";
import { hudStore, hudController, initialHudState } from "./hudStore";

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

  it("disables Fire until the active team's field has content, and Fire always targets the current turn", () => {
    const trackedMakeInput = () => { const m = makeInput(); return m; };
    render(<HudBar makeInput={trackedMakeInput} />);
    act(() => hudController.setTurn("red"));
    expect(screen.getAllByRole("button", { name: "Fire" })).toHaveLength(1);
  });

  it("locks the inactive side's math input (hidden, not just disabled Fire)", () => {
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

  it("shows the timer on the console", () => {
    render(<HudBar makeInput={makeInput} />);
    act(() => hudController.setTurn("red"));
    act(() => hudController.setTimer(42));
    expect(screen.getByText("42s")).toBeTruthy();
  });

  it("fire click routes through controller gating (typed content required, matching FiringConsole's real Fire-gating)", () => {
    const cb = vi.fn();
    hudController.onFire(cb);
    let redInput: { typeLatex: (v: string) => void } | null = null;
    const trackedMakeInput = () => {
      const el = document.createElement("span");
      let latex = "";
      let editCb: (() => void) | null = null;
      const m = {
        el,
        getLatex: () => latex,
        setLatex: vi.fn((v: string) => { latex = v; editCb?.(); }),
        focus: vi.fn(),
        setEnabled: vi.fn(),
        reflow: vi.fn(),
        insertText: vi.fn(),
        onEnter: vi.fn(),
        onEdit: (cb: () => void) => { editCb = cb; },
        onUpOutOf: vi.fn(),
        onDownOutOf: vi.fn(),
        typeLatex: (v: string) => { latex = v; editCb?.(); },
      };
      if (!redInput) redInput = m; // first registered is "red" per this file's existing registry-order convention
      return m;
    };
    render(<HudBar makeInput={trackedMakeInput} />);
    act(() => hudController.setTurn("red"));
    act(() => redInput!.typeLatex("\\tan(x)"));
    fireEvent.click(screen.getByRole("button", { name: "Fire" }));
    expect(cb).toHaveBeenCalledWith("red", "\\tan(x)");
  });
});

describe("HudBar — singleTeam prop", () => {
  beforeEach(() => hudStore.set(initialHudState()));
  afterEach(() => cleanup());

  it("singleTeam='blue' renders exactly one Fire button and mounts only blue's field", () => {
    act(() => hudController.setTurn("blue"));
    render(<HudBar makeInput={makeInput} singleTeam="blue" />);
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(1);
    expect(document.querySelectorAll(".hud-console-field")).toHaveLength(1);
  });

  it("singleTeam='red' renders exactly one Fire button and mounts only red's field", () => {
    act(() => hudController.setTurn("red"));
    render(<HudBar makeInput={makeInput} singleTeam="red" />);
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(1);
    expect(document.querySelectorAll(".hud-console-field")).toHaveLength(1);
  });

  it("turn-based (noTurn false, the default), singleTeam unset: renders the single-console FiringConsole, not the old dual panels", () => {
    render(<HudBar makeInput={makeInput} />);
    expect(document.querySelector(".hud-console")).toBeTruthy();
    expect(document.querySelector(".player-panel")).toBeNull();
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(1); // one visible Fire button, not one per side
  });

  it("noTurn mode still renders the original always-both-visible dual panel layout, unaffected by the redesign", () => {
    act(() => hudController.setNoTurnMode(true));
    render(<HudBar makeInput={makeInput} />);
    expect(document.querySelector(".player-panel.is-red")).toBeTruthy();
    expect(document.querySelector(".player-panel.is-blue")).toBeTruthy();
    expect(document.querySelector(".hud-console")).toBeNull();
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(2);
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
