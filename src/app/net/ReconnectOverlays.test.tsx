// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { act } from "@testing-library/react";
import { netLobbyStore, initialNetLobbyState } from "./netLobbyStore";
import { ReconnectOverlays } from "./ReconnectOverlays";

beforeEach(() => {
  netLobbyStore.set(initialNetLobbyState("TEST"));
});
afterEach(() => cleanup());

describe("ReconnectOverlays", () => {
  it("renders nothing when both null", () => {
    const { container } = render(<ReconnectOverlays />);
    expect(container.firstChild).toBeNull();
  });

  it("selfReconnecting=true → blocking overlay with 'Reconnecting…'", () => {
    act(() => {
      netLobbyStore.set({ selfReconnecting: true, peerDown: null });
    });
    render(<ReconnectOverlays />);
    expect(screen.getByText(/Reconnecting/)).toBeTruthy();
    // Blocking overlay should be present
    const overlay = document.querySelector(".reconnect-overlay--blocking");
    expect(overlay).toBeTruthy();
  });

  it("peerDown → banner with 'NAME disconnected'", () => {
    act(() => {
      netLobbyStore.set({
        selfReconnecting: false,
        peerDown: { name: "Ann", deadline: Date.now() + 30_000 },
      });
    });
    render(<ReconnectOverlays />);
    expect(screen.getByText(/Ann disconnected/)).toBeTruthy();
    const banner = document.querySelector(".reconnect-overlay--banner");
    expect(banner).toBeTruthy();
  });

  it("selfReconnecting takes precedence over peerDown", () => {
    act(() => {
      netLobbyStore.set({
        selfReconnecting: true,
        peerDown: { name: "Ann", deadline: Date.now() + 30_000 },
      });
    });
    render(<ReconnectOverlays />);
    // Blocking overlay shown (self takes priority)
    expect(screen.getByText(/Reconnecting/)).toBeTruthy();
    const blocking = document.querySelector(".reconnect-overlay--blocking");
    expect(blocking).toBeTruthy();
  });
});
