// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Keypad } from "./Keypad";

// ponytail: repo has no @testing-library/user-event dependency (checked
// package.json + lockfile — not installed anywhere). fireEvent.click is
// already the repo convention (see Footer.test.tsx) and is sufficient here:
// these keys are plain onClick handlers, no realistic pointer sequence needed.
describe("Keypad", () => {
  it("emits an insert action for a digit", () => {
    const onKey = vi.fn();
    render(<Keypad disabled={false} onKey={onKey} />);
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect(onKey).toHaveBeenCalledWith({ kind: "insert", text: "7" });
  });

  it("emits the LaTeX text, not the label, for a function key", () => {
    const onKey = vi.fn();
    render(<Keypad disabled={false} onKey={onKey} />);
    fireEvent.click(screen.getByRole("button", { name: "sin" }));
    expect(onKey).toHaveBeenCalledWith({ kind: "insert", text: "sin(" });
  });

  it("emits `x` as a variable, never as a multiply sign", () => {
    const onKey = vi.fn();
    render(<Keypad disabled={false} onKey={onKey} />);
    fireEvent.click(screen.getByRole("button", { name: "x" }));
    expect(onKey).toHaveBeenCalledWith({ kind: "insert", text: "x" });
  });

  it("disables every key while disabled (not your turn / shot in flight)", () => {
    // ponytail: no @testing-library/jest-dom in this repo (not installed,
    // not in package.json) — plain `.disabled` on the DOM button node covers
    // the same assertion without adding a dependency.
    render(<Keypad disabled onKey={vi.fn()} />);
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("prevents default on pointerdown so a key tap never blurs the math field", () => {
    render(<Keypad disabled={false} onKey={vi.fn()} />);
    const ev = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "7" }).dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("1/a inserts a reciprocal (1 in the numerator), not a bare empty fraction like ÷", () => {
    const onKey = vi.fn();
    render(<Keypad disabled={false} onKey={onKey} />);
    fireEvent.click(screen.getByRole("button", { name: "1/a" }));
    expect(onKey).toHaveBeenCalledWith({ kind: "insert", text: "1/" });
  });
});
