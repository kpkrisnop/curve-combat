// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { NetCountdown } from "./NetCountdown";

describe("NetCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders the initial count (3) from startAt", () => {
    const startAt = Date.now() + 3000;
    render(<NetCountdown startAt={startAt} />);
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("counts down: 3 → 2 after 1 second", () => {
    const startAt = Date.now() + 3000;
    render(<NetCountdown startAt={startAt} />);
    expect(screen.getByText("3")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("returns null (renders nothing) once startAt has passed", () => {
    const startAt = Date.now() + 500;
    render(<NetCountdown startAt={startAt} />);
    expect(screen.getByText("1")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    // n === 0 → returns null
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("1")).toBeNull();
  });
});
