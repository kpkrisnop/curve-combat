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
        <button className="gw-btn" onClick={() => { location.hash = "#online"; }}>Play Online</button>
      </div>
    </div>
  );
}
