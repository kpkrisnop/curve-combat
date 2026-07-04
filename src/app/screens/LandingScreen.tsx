import { SpacetimeBackground } from "../SpacetimeBackground";

export function LandingScreen() {
  return (
    <div className="gw-landing gw-layer">
      <SpacetimeBackground />
      <div className="gw-layer" style={{ textAlign: "center" }}>
        <h1><span className="t-red">GRAPH</span> <span className="t-blue">WAR</span></h1>
        <p className="gw-tagline">Fire mathematical functions. Hit your opponent.</p>
      </div>
      <div className="gw-layer" style={{ display: "flex", gap: "20px" }}>
        <button className="gw-btn gw-btn--primary" onClick={() => { location.hash = "#local"; }}>
          ▶ Play Locally
        </button>
        <button className="gw-btn" onClick={() => {
          // Phase-1 parity: prompt for a code or create one. Phase 3 replaces this.
          const raw = prompt("Room code (leave blank to create a new room):", "")?.trim().toUpperCase();
          const code = raw || Array.from({ length: 4 }, () =>
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]).join("");
          location.hash = `#room=${code}`;
        }}>Play Online</button>
      </div>
    </div>
  );
}
