// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JoinRoom } from "./JoinRoom";

// SpacetimeBackground calls window.matchMedia — stub it for jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("JoinRoom", () => {
  beforeEach(() => {
    location.hash = "";
  });

  it("renders a single text input", () => {
    render(<JoinRoom />);
    expect(screen.getAllByRole("textbox").length).toBe(1);
  });

  it("auto-submits a 4-letter code uppercased", () => {
    location.hash = "";
    render(<JoinRoom />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "wo1lf" } });
    expect(location.hash).toBe("#room=WOLF");
  });

  it("strips non-letter characters", () => {
    render(<JoinRoom />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ab1!" } });
    // only 2 letters remain — should NOT auto-submit
    expect(location.hash).toBe("");
  });

  it("uppercases input", () => {
    render(<JoinRoom />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input.value).toBe("ABC");
  });
});
