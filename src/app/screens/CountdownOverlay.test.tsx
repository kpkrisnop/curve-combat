// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CountdownOverlay } from "./CountdownOverlay";

describe("CountdownOverlay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts 3-2-1 then calls onDone", () => {
    const onDone = vi.fn();
    render(<CountdownOverlay seconds={3} onDone={onDone} />);
    expect(screen.getByText("3")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("2")).toBeTruthy();
    // Advance in 1s steps: each tick's timeout is scheduled only after the
    // previous re-render, so a single 2000ms advance would never fire it.
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("1")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
