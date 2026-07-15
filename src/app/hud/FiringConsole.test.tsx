// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { FiringConsole } from "./FiringConsole";
import { hudStore, hudController, initialHudState } from "./hudStore";

function makeTrackedInput() {
  let latex = "";
  let enterCb: (() => void) | null = null;
  let editCb: (() => void) | null = null;
  let upCb: (() => void) | null = null;
  let downCb: (() => void) | null = null;
  // Real reformat runs MathQuill's typedText (no MathQuill in jsdom); tests inject
  // the structured "after" so the guard + revert wiring can still be exercised.
  let reformatResult: string | null = null;
  const el = document.createElement("span");
  return {
    el,
    getLatex: () => latex,
    setLatex: vi.fn((v: string) => { latex = v; editCb?.(); }),
    focus: vi.fn(),
    setEnabled: vi.fn(),
    reflow: vi.fn(),
    insertText: vi.fn((chars: string) => { latex += chars; editCb?.(); }),
    keystroke: vi.fn(),
    reformat: vi.fn(() => {
      const before = latex;
      const after = reformatResult ?? latex;
      latex = after; editCb?.();
      return { before, after };
    }),
    setReformatResult: (v: string) => { reformatResult = v; },
    onEnter: (cb: () => void) => { enterCb = cb; },
    onEdit: (cb: () => void) => { editCb = cb; },
    onUpOutOf: (cb: () => void) => { upCb = cb; },
    onDownOutOf: (cb: () => void) => { downCb = cb; },
    fireEnter: () => enterCb?.(),
    fireUpOutOf: () => upCb?.(),
    fireDownOutOf: () => downCb?.(),
    typeLatex: (v: string) => { latex = v; editCb?.(); },
  };
}

const statusEl = () => document.querySelector(".hud-status")!;

describe("FiringConsole — status line", () => {
  const makeInput = () => makeTrackedInput();

  beforeEach(() => hudStore.set(initialHudState()));
  afterEach(() => cleanup());

  it("is never blank: with nothing to report it shows a tip", () => {
    render(<FiringConsole makeInput={makeInput} />);
    expect(statusEl().textContent).toMatch(/^Tip: /);
    expect(statusEl().className).toContain("is-tip");
  });

  it("shows an in-flight flavour line while the shot is busy, not a tip", () => {
    render(<FiringConsole makeInput={makeInput} />);
    act(() => hudController.setBusy("red", true));
    expect(statusEl().className).toContain("is-flavour");
    expect(statusEl().textContent).not.toMatch(/^Tip: /);
  });

  it("shows shot commentary (info) once the game reports it, replacing the tip", () => {
    render(<FiringConsole makeInput={makeInput} />);
    act(() => hudController.setStatus("Direct hit on BLUE — 12 dmg", "info"));
    expect(statusEl().textContent).toBe("Direct hit on BLUE — 12 dmg");
    expect(statusEl().className).toContain("is-info");
  });

  it("an error outranks everything and is toned so it cuts through", () => {
    render(<FiringConsole makeInput={makeInput} />);
    act(() => hudController.setBusy("red", true));
    act(() => hudController.setStatus("Not a plottable function of x", "error"));
    expect(statusEl().textContent).toBe("Not a plottable function of x");
    expect(statusEl().className).toContain("is-error");
  });

  it("a disconnect warning still shows while waiting on the opponent's turn", () => {
    // Regression guard: the line used to render "" whenever it wasn't your turn,
    // which hid exactly the news you most need during the opponent's turn.
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} singleTeam="blue" />);
    act(() => hudController.setStatus("Ann disconnected — waiting up to 30s…", "warn"));
    expect(statusEl().textContent).toBe("Ann disconnected — waiting up to 30s…");
    expect(statusEl().className).toContain("is-warn");
  });

  it("clearing the status falls back to a tip rather than blanking the line", () => {
    render(<FiringConsole makeInput={makeInput} />);
    act(() => hudController.setStatus("RED hit a planet", "info"));
    expect(statusEl().textContent).toBe("RED hit a planet");
    act(() => hudController.setStatus());
    expect(statusEl().textContent).toMatch(/^Tip: /);
  });
});

describe("FiringConsole", () => {
  let inputs: ReturnType<typeof makeTrackedInput>[];
  const makeInput = () => { const i = makeTrackedInput(); inputs.push(i); return i; };

  beforeEach(() => {
    hudStore.set(initialHudState());
    inputs = [];
  });
  afterEach(() => cleanup());

  it("local (no singleTeam): mounts both teams' fields, shows only the active one", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    const fields = document.querySelectorAll(".hud-console-field");
    expect(fields).toHaveLength(2);
    expect(fields[0].classList.contains("hud-console-field--hidden")).toBe(false); // red first-registered
    expect(fields[1].classList.contains("hud-console-field--hidden")).toBe(true);
    act(() => hudController.setTurn("blue"));
    expect(fields[0].classList.contains("hud-console-field--hidden")).toBe(true);
    expect(fields[1].classList.contains("hud-console-field--hidden")).toBe(false);
  });

  it("turn line shows the active team and swaps the team-dot class", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    expect(screen.getByText(/RED TO FIRE/i)).toBeTruthy();
    expect(document.querySelector(".hud-console__dot.is-red")).toBeTruthy();
    act(() => hudController.setTurn("blue"));
    expect(screen.getByText(/BLUE TO FIRE/i)).toBeTruthy();
    expect(document.querySelector(".hud-console__dot.is-blue")).toBeTruthy();
  });

  it("turn label has aria-live=polite so screen readers hear the swap", () => {
    render(<FiringConsole makeInput={makeInput} />);
    expect(document.querySelector(".hud-console__turn")?.getAttribute("aria-live")).toBe("polite");
  });

  it("singleTeam='blue': mounts exactly one field; shows locked placeholder when it's not blue's turn", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} singleTeam="blue" />);
    expect(document.querySelectorAll(".hud-console-field")).toHaveLength(1);
    expect(document.querySelector(".hud-console-field--locked")).toBeTruthy();
    expect(screen.getByText(/opponent is choosing a curve/i)).toBeTruthy();
    act(() => hudController.setTurn("blue"));
    expect(document.querySelector(".hud-console-field--locked")).toBeNull();
  });

  it("field is disabled (not just hidden) while waiting on the opponent's turn", () => {
    act(() => hudController.setTurn("blue"));
    render(<FiringConsole makeInput={makeInput} singleTeam="red" />);
    // singleTeam=red, turn=blue => waiting for opponent => field must be disabled
    expect(inputs[0].setEnabled).toHaveBeenLastCalledWith(false);
  });

  it("Fire is disabled until the active field has content, then fires with that latex", () => {
    const cb = vi.fn();
    hudController.onFire(cb);
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    const fire = screen.getByRole("button", { name: /Fire/i });
    expect((fire as HTMLButtonElement).disabled).toBe(true);
    act(() => inputs[0].typeLatex("\\sin(x)"));
    expect((fire as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(fire);
    expect(cb).toHaveBeenCalledWith("red", "\\sin(x)");
  });

  it("Format keeps the structured LaTeX when it fires the identical shot", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    const flat = "\\sin(100x)/(1+\\exp(-10*(x+-8)))";
    const structured =
      "\\frac{\\sin\\left(100x\\right)}{1+\\exp\\left(-10\\cdot\\left(x+-8\\right)\\right)}";
    act(() => inputs[0].typeLatex(flat));
    inputs[0].setReformatResult(structured);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Format" })));
    expect(inputs[0].getLatex()).toBe(structured);
  });

  it("Format reverts to the original when restructuring would change the shot", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    // typedText would mis-group x/2-1 as x/(2-1); the guard must reject it.
    act(() => inputs[0].typeLatex("x/2-1"));
    inputs[0].setReformatResult("\\frac{x}{2-1}");
    act(() => fireEvent.click(screen.getByRole("button", { name: "Format" })));
    expect(inputs[0].getLatex()).toBe("x/2-1");
  });

  it("flags 'needs formatting' in the status line and lights up Format on raw ASCII", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    act(() => inputs[0].typeLatex("2*x"));
    expect(statusEl().textContent).toMatch(/Format/);
    expect(screen.getByRole("button", { name: "Format" }).className).toContain("is-suggested");
  });

  it("routes a digit key into the ACTIVE team's field only", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect(inputs[0].insertText).toHaveBeenCalledWith("7"); // red = first registered
    expect(inputs[1].insertText).not.toHaveBeenCalled();
  });

  it("routes a function key into the active field", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    fireEvent.click(screen.getByRole("button", { name: "sin" }));
    expect(inputs[0].insertText).toHaveBeenCalledWith("sin(");
  });

  it("log inserts a call, not a base subscript", () => {
    // Regression: `log_` dropped the caret into the BASE subscript, so typing
    // (x) produced \log_{(x)} — log base (x), with no argument.
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    fireEvent.click(screen.getByRole("button", { name: "log" }));
    expect(inputs[0].insertText).toHaveBeenCalledWith("log(");
  });

  it("focuses the active team's field when it becomes their turn, but never a waiting one", () => {
    // Online has no other focus caller (NetworkGame never calls ui.focus()), so
    // without this the desktop player must click the field every single turn.
    act(() => hudController.setTurn("blue"));
    render(<FiringConsole makeInput={makeInput} singleTeam="red" />);
    expect(inputs[0].focus).not.toHaveBeenCalled(); // waiting on blue
    act(() => hudController.setTurn("red"));
    expect(inputs[0].focus).toHaveBeenCalled();

    inputs[0].focus.mockClear();
    act(() => hudController.setBusy("red", true)); // shot in flight — field blurred
    expect(inputs[0].focus).not.toHaveBeenCalled();
    act(() => hudController.setBusy("red", false)); // my turn again -> refocus
    expect(inputs[0].focus).toHaveBeenCalled();
  });

  it("routes backspace as a keystroke, not as text", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    fireEvent.click(screen.getByRole("button", { name: "Backspace" }));
    expect(inputs[0].keystroke).toHaveBeenCalledWith("Backspace");
    expect(inputs[0].insertText).not.toHaveBeenCalled();
  });

  it("Clear empties the active field", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    act(() => inputs[0].typeLatex("x^2"));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("");
  });

  it("keys are inert while waiting on the opponent's turn", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} singleTeam="blue" />);
    const key = screen.getByRole("button", { name: "7" }) as HTMLButtonElement;
    expect(key.disabled).toBe(true);
  });

  it("noTurn: the field is never locked — nobody is ever waiting on anyone", () => {
    act(() => hudController.setNoTurnMode(true));
    act(() => hudController.setTurn("blue")); // stale/meaningless in noTurn
    render(<FiringConsole makeInput={makeInput} singleTeam="red" />);
    expect((screen.getByRole("button", { name: "7" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/is aiming/i)).toBeNull();
    expect(document.querySelector(".hud-console-field--locked")).toBeNull();
  });

  it("noTurn + singleTeam: keys route into MY team's field, not into `turn`", () => {
    // In online noTurn the server never sets an active player, so hudStore.turn
    // is stale ("red" from initial state). Routing by `turn` would type into a
    // field this client doesn't even own.
    act(() => hudController.setNoTurnMode(true));
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} singleTeam="blue" />);
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect(inputs[0].insertText).toHaveBeenCalledWith("7"); // the only field: blue
  });

  it("noTurn + singleTeam: Fire fires MY team's latex, and the turn line names MY team", () => {
    const cb = vi.fn();
    hudController.onFire(cb);
    act(() => hudController.setNoTurnMode(true));
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} singleTeam="blue" />);
    expect(screen.getByText(/BLUE TO FIRE/i)).toBeTruthy();
    expect(document.querySelector(".hud-console__dot.is-blue")).toBeTruthy();
    const fire = screen.getByRole("button", { name: /Fire/i }) as HTMLButtonElement;
    expect(fire.disabled).toBe(true);
    act(() => inputs[0].typeLatex("\\cos(x)"));
    expect(fire.disabled).toBe(false);
    fireEvent.click(fire);
    expect(cb).toHaveBeenCalledWith("blue", "\\cos(x)");
  });

  it("noTurn + singleTeam: my field is enabled, not hidden behind a stale turn", () => {
    act(() => hudController.setNoTurnMode(true));
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} singleTeam="blue" />);
    expect(inputs[0].setEnabled).toHaveBeenLastCalledWith(true);
    const fields = document.querySelectorAll(".hud-console-field");
    expect(fields).toHaveLength(1);
    expect(fields[0].classList.contains("hud-console-field--hidden")).toBe(false);
  });

  it("renders no function chip row — the keypad absorbed it", () => {
    render(<FiringConsole makeInput={makeInput} />);
    expect(document.querySelector(".hud-console__chiprow")).toBeNull();
  });

  it("recall: upOutOf walks older shots, downOutOf walks back to the live draft without blanking it", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    inputs[0].typeLatex("2x");
    act(() => hudController.pushHistory("red", "2x"));
    inputs[0].typeLatex("x^2");
    act(() => hudController.pushHistory("red", "x^2")); // history: [x^2, 2x]
    act(() => inputs[0].typeLatex("draft"));

    act(() => inputs[0].fireUpOutOf()); // -> x^2 (newest)
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("x^2");
    act(() => inputs[0].fireUpOutOf()); // -> 2x (older)
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("2x");
    act(() => inputs[0].fireUpOutOf()); // nothing older — no-op, still 2x
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("2x");

    act(() => inputs[0].fireDownOutOf()); // -> x^2
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("x^2");
    act(() => inputs[0].fireDownOutOf()); // -> back to the saved draft, NOT blanked
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("draft");
    act(() => inputs[0].fireDownOutOf()); // already on draft — no-op, must stay "draft"
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("draft");
  });

  it("recall is scoped per team", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    act(() => hudController.pushHistory("red", "redshot"));
    act(() => hudController.pushHistory("blue", "blueshot"));
    act(() => inputs[0].fireUpOutOf());
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("redshot");
    act(() => hudController.setTurn("blue"));
    act(() => inputs[1].fireUpOutOf());
    expect(inputs[1].setLatex).toHaveBeenLastCalledWith("blueshot");
  });

  it("picking from the recall popover stashes the draft, so ↓ walks back to it", () => {
    // Regression: the popover path used to overwrite the field without saving
    // the draft — a peek at Recall destroyed unfired work, unrecoverably.
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    act(() => hudController.pushHistory("red", "redshot"));
    act(() => inputs[0].typeLatex("my draft"));

    fireEvent.click(screen.getByRole("button", { name: "Recall" }));
    fireEvent.click(screen.getByRole("option", { name: /redshot/ }));
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("redshot");

    act(() => inputs[0].fireDownOutOf()); // back down to the draft
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("my draft");
  });

  it("closes the recall popover on a turn change so it can't reappear over the wrong team", () => {
    // Regression: firing via Enter is a keydown with no pointerdown, so the
    // tap-away handler never runs. The popover used to just hide while busy
    // and reappear once busy cleared, now showing the NEXT team's history.
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    act(() => hudController.pushHistory("red", "redshot"));
    fireEvent.click(screen.getByRole("button", { name: "Recall" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    act(() => hudController.setTurn("blue"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes the recall popover when busy starts, so it doesn't reappear once the shot lands", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    act(() => hudController.pushHistory("red", "redshot"));
    fireEvent.click(screen.getByRole("button", { name: "Recall" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    act(() => hudController.setBusy("red", true));
    expect(screen.queryByRole("listbox")).toBeNull();
    act(() => hudController.setBusy("red", false));
    expect(screen.queryByRole("listbox")).toBeNull(); // stays closed, doesn't zombie back
  });

  it("prevents default on pointerdown for nav keys so a key tap never blurs the math field", () => {
    render(<FiringConsole makeInput={makeInput} />);
    const ev = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "Backspace" }).dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
