import { useState } from "react";
import { SpacetimeBackground } from "../SpacetimeBackground";
import { RoomCodeInput } from "./RoomCodeInput";

function randomCode(): string {
  return Array.from(
    { length: 4 },
    () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]
  ).join("");
}

export function LandingScreen({ initialPanelOpen = false }: { initialPanelOpen?: boolean } = {}) {
  const [panelOpen, setPanelOpen] = useState(initialPanelOpen);

  function handleCreate() {
    location.hash = `#room=${randomCode()}`;
  }

  return (
    <div className="gw-landing gw-layer">
      <SpacetimeBackground />
      <div className="gw-layer" style={{ textAlign: "center" }}>
        <h1><span className="t-red">GRAPH</span> <span className="t-blue">WAR</span></h1>
        <p className="gw-tagline">Fire mathematical functions. Hit your opponent.</p>
      </div>
      <div className="gw-layer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
        <div style={{ display: "flex", gap: "20px" }}>
          <button className="gw-btn gw-btn--primary" onClick={() => { location.hash = "#local"; }}>
            ▶ Play Locally
          </button>
          <button
            className="gw-btn"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
          >
            Play Online
          </button>
        </div>
        {panelOpen && (
          <div
            className="gw-online-panel"
            style={{ display: "flex", gap: "20px", alignItems: "center" }}
          >
            <button className="gw-btn gw-btn--primary" onClick={handleCreate}>
              Create Room
            </button>
            <RoomCodeInput />
          </div>
        )}
      </div>
    </div>
  );
}
