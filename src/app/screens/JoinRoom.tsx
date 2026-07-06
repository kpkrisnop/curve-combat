import { SpacetimeBackground } from "../SpacetimeBackground";
import { RoomCodeInput } from "./RoomCodeInput";

export function JoinRoom() {
  return (
    <div className="gw-landing gw-layer">
      <SpacetimeBackground />
      <div className="gw-layer" style={{ textAlign: "center" }}>
        <h2 style={{ marginBottom: "32px" }}>Join a Room</h2>
        <RoomCodeInput autoFocus />
        <div style={{ marginTop: "24px" }}>
          <a
            href="#online"
            style={{ color: "var(--gw-text-muted)", textDecoration: "none", fontSize: "var(--gw-fs-md)" }}
            onClick={(e) => { e.preventDefault(); location.hash = "#online"; }}
          >
            ← Back
          </a>
        </div>
      </div>
    </div>
  );
}
