// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecallPopover, prettyLatex } from "./RecallPopover";

describe("prettyLatex", () => {
  it("renders the equation the way the player typed it, not as raw LaTeX", () => {
    expect(prettyLatex("\\sin\\left(x\\right)")).toBe("sin(x)");
    expect(prettyLatex("\\frac{1}{x}")).toBe("(1)/(x)");
    expect(prettyLatex("2\\cdot x^{2}+\\pi")).toBe("2·x^2+π");
  });
});

// ponytail: repo has no user-event/jest-dom (see Keypad.test.tsx) — fireEvent +
// plain DOM assertions are the house style.
describe("RecallPopover", () => {
  it("lists past shots newest first", () => {
    render(<RecallPopover history={["sin(x)", "x^2"]} onPick={vi.fn()} onDismiss={vi.fn()} />);
    const items = screen.getAllByRole("option");
    expect(items[0].textContent).toContain("sin(x)");
    expect(items[1].textContent).toContain("x^2");
  });

  it("picking an entry returns its RAW latex, not the prettified label", () => {
    const onPick = vi.fn();
    render(<RecallPopover history={["\\sin\\left(x\\right)"]} onPick={onPick} onDismiss={vi.fn()} />);
    const item = screen.getAllByRole("option")[0];
    expect(item.textContent).toContain("sin(x)");
    fireEvent.click(item);
    expect(onPick).toHaveBeenCalledWith("\\sin\\left(x\\right)");
  });

  it("Escape dismisses without picking", () => {
    const onDismiss = vi.fn();
    const onPick = vi.fn();
    render(<RecallPopover history={["sin(x)"]} onPick={onPick} onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("a pointerdown outside dismisses it", () => {
    const onDismiss = vi.fn();
    render(<RecallPopover history={["sin(x)"]} onPick={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("a pointerdown on an item does NOT dismiss it (the click must still land)", () => {
    const onDismiss = vi.fn();
    const onPick = vi.fn();
    render(<RecallPopover history={["sin(x)"]} onPick={onPick} onDismiss={onDismiss} />);
    const item = screen.getAllByRole("option")[0];
    fireEvent.pointerDown(item);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(item);
    expect(onPick).toHaveBeenCalledWith("sin(x)");
  });

  it("prevents default on pointerdown so a tap never blurs the math field", () => {
    render(<RecallPopover history={["sin(x)"]} onPick={vi.fn()} onDismiss={vi.fn()} />);
    const ev = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    screen.getAllByRole("option")[0].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("says so when there is nothing to recall", () => {
    render(<RecallPopover history={[]} onPick={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryAllByRole("option").length).toBe(0);
    expect(screen.getByText(/no shots yet/i)).not.toBeNull();
  });
});
