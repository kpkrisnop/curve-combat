// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfigPanel } from "./ConfigPanel";
import { arenaDefaults } from "../../game/arenaDefaults";

const base = { mode: "classic" as const, rounds: 3 as const, noTurn: false, turnSeconds: 60,
  map: arenaDefaults().map, scatter: arenaDefaults().scatter };

describe("ConfigPanel", () => {
  it("mode buttons emit onChange", () => {
    const onChange = vi.fn();
    render(<ConfigPanel value={base} onChange={onChange} seed={7} onReroll={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /HP Mode/ }));
    expect(onChange).toHaveBeenCalledWith({ mode: "hp" });
  });
  it("timer stepper clamps at 15s and steps by 5", () => {
    const onChange = vi.fn();
    render(<ConfigPanel value={{ ...base, turnSeconds: 15 }} onChange={onChange} seed={7} onReroll={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "−" }));
    expect(onChange).toHaveBeenCalledWith({ turnSeconds: 15 });   // clamped
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(onChange).toHaveBeenCalledWith({ turnSeconds: 20 });
  });
  it("arena sliders have no numeric value text (ADR-0003)", () => {
    render(<ConfigPanel value={base} onChange={vi.fn()} seed={7} onReroll={vi.fn()} />);
    const arena = screen.getByTestId("arena-controls");
    // slider labels exist, but no rendered numeric values
    expect(arena.querySelectorAll("input[type=range]").length).toBeGreaterThan(4);
    expect(arena.textContent).not.toMatch(/\d+\.\d+/);
  });
  it("reroll button fires", () => {
    const onReroll = vi.fn();
    render(<ConfigPanel value={base} onChange={vi.fn()} seed={7} onReroll={onReroll} />);
    fireEvent.click(screen.getByRole("button", { name: /Reroll/ }));
    expect(onReroll).toHaveBeenCalled();
  });
});
