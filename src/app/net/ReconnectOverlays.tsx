// src/app/net/ReconnectOverlays.tsx
//
// Renders reconnect state overlays driven by netLobbyStore:
//   selfReconnecting=true → blocking full-screen "Reconnecting…" overlay
//   peerDown              → non-blocking banner "NAME disconnected — waiting up to 30s"
//   both null             → null (renders nothing)
//
// selfReconnecting takes precedence: if both are set, the blocking overlay is shown.

import { useStore } from "../store";
import { netLobbyStore } from "./netLobbyStore";

export function ReconnectOverlays() {
  const selfReconnecting = useStore(netLobbyStore, (s) => s.selfReconnecting);
  const peerDown         = useStore(netLobbyStore, (s) => s.peerDown);

  if (selfReconnecting) {
    return (
      <div className="reconnect-overlay reconnect-overlay--blocking" role="status" aria-live="assertive">
        <div className="reconnect-overlay__inner">
          <span className="reconnect-overlay__spinner" aria-hidden="true" />
          <span className="reconnect-overlay__text">Reconnecting…</span>
        </div>
      </div>
    );
  }

  if (peerDown) {
    return (
      <div className="reconnect-overlay reconnect-overlay--banner" role="status" aria-live="polite">
        <span className="reconnect-overlay__text">
          {peerDown.name} disconnected — waiting up to 30s
        </span>
      </div>
    );
  }

  return null;
}
