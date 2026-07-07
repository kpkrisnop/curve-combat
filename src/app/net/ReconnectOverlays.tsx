// src/app/net/ReconnectOverlays.tsx
//
// Renders reconnect state overlays driven by netLobbyStore:
//   selfReconnecting=true → blocking full-screen "Reconnecting…" overlay
//   peerDown              → non-blocking banner "NAME disconnected — waiting up to 30s"
//   forfeitNotice         → non-blocking banner with the notice text, auto-clears after 4s
//   all null              → null (renders nothing)
//
// Precedence when multiple are set: selfReconnecting > peerDown > forfeitNotice.

import { useEffect } from "react";
import { useStore } from "../store";
import { netLobbyStore } from "./netLobbyStore";

export function ReconnectOverlays() {
  const selfReconnecting = useStore(netLobbyStore, (s) => s.selfReconnecting);
  const peerDown         = useStore(netLobbyStore, (s) => s.peerDown);
  const forfeitNotice    = useStore(netLobbyStore, (s) => s.forfeitNotice);

  useEffect(() => {
    if (!forfeitNotice) return;
    const t = setTimeout(() => netLobbyStore.set({ forfeitNotice: null }), 4000);
    return () => clearTimeout(t);
  }, [forfeitNotice]);

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

  if (forfeitNotice) {
    return (
      <div className="reconnect-overlay reconnect-overlay--banner" role="status" aria-live="polite">
        {forfeitNotice}
      </div>
    );
  }

  return null;
}
