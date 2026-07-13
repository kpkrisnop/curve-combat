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
  it("renders nothing while connected", () => {
    const { container } = render(<ReconnectOverlays />);
    expect(container.firstChild).toBeNull();
  });

  it("selfReconnecting=true → blocking overlay with 'Reconnecting…'", () => {
    act(() => {
      netLobbyStore.set({ selfReconnecting: true });
    });
    render(<ReconnectOverlays />);
    expect(screen.getByText(/Reconnecting/)).toBeTruthy();
    expect(document.querySelector(".reconnect-overlay--blocking")).toBeTruthy();
  });

  it("only ever blocks — the non-blocking badge variant is retired", () => {
    // Peer-disconnect and forfeit notices now go to the HUD status line
    // (NetworkGame → GameUiPort.setStatus), so this component must never
    // render a competing banner again, in any state.
    act(() => {
      netLobbyStore.set({ selfReconnecting: true });
    });
    render(<ReconnectOverlays />);
    expect(document.querySelector(".reconnect-overlay--banner")).toBeNull();
  });
});
