// src/app/net/ReconnectOverlays.tsx
//
// The ONE reconnect state that still earns an overlay:
//   selfReconnecting=true → blocking full-screen "Reconnecting…" overlay
//   otherwise             → null (renders nothing)
//
// It blocks because it must: while YOU are the disconnected one, the board is
// stale and nothing you do will register, so a non-blocking badge would be a lie.
//
// The other two notices (peer disconnected, peer forfeited) used to render as
// non-blocking badges here. They now go to the HUD status line instead — see
// NetworkGame's peerStatus/render handlers — so the game has a single message
// channel rather than a badge competing with the footer for the same news.

import { useStore } from "../store";
import { netLobbyStore } from "./netLobbyStore";

export function ReconnectOverlays() {
  const selfReconnecting = useStore(netLobbyStore, (s) => s.selfReconnecting);

  if (!selfReconnecting) return null;

  return (
    <div className="reconnect-overlay reconnect-overlay--blocking" role="status" aria-live="assertive">
      <div className="reconnect-overlay__inner">
        <span className="reconnect-overlay__spinner" aria-hidden="true" />
        <span className="reconnect-overlay__text">Reconnecting…</span>
      </div>
    </div>
  );
}
