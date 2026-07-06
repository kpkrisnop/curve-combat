// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LandingScreen } from "./LandingScreen";

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

describe("LandingScreen", () => {
  beforeEach(() => {
    location.hash = "";
  });

  it("does not show the online panel (Create/Join controls) before Play Online is clicked", () => {
    render(<LandingScreen />);
    expect(screen.queryByText("Create Room")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("clicking Play Online reveals an inline panel with Create Room and a room-code input", () => {
    render(<LandingScreen />);
    fireEvent.click(screen.getByText("Play Online"));
    expect(screen.getByText("Create Room")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("clicking Play Online again collapses the panel", () => {
    render(<LandingScreen />);
    const toggle = screen.getByText("Play Online");
    fireEvent.click(toggle);
    expect(screen.getByText("Create Room")).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText("Create Room")).toBeNull();
  });

  it("has no nickname/name input anywhere on the landing screen", () => {
    render(<LandingScreen />);
    fireEvent.click(screen.getByText("Play Online"));
    expect(screen.queryByLabelText(/nickname|name/i)).toBeNull();
  });

  it("Create Room navigates to a #room=XXXX hash with a 4-letter uppercase code", () => {
    render(<LandingScreen />);
    fireEvent.click(screen.getByText("Play Online"));
    fireEvent.click(screen.getByText("Create Room"));
    expect(location.hash).toMatch(/^#room=[A-Z]{4}$/);
  });

  it("typing a 4-letter code in the join input auto-submits to #room=CODE", () => {
    render(<LandingScreen />);
    fireEvent.click(screen.getByText("Play Online"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "wo1lf" } });
    expect(location.hash).toBe("#room=WOLF");
  });

  it("opens the panel immediately when initialPanelOpen is true (for #online → landing redirect)", () => {
    render(<LandingScreen initialPanelOpen />);
    expect(screen.getByText("Create Room")).toBeTruthy();
  });
});
