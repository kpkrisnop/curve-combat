import { useState } from "react";
import { SpacetimeBackground } from "../SpacetimeBackground";

export function JoinRoom() {
  const [value, setValue] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const filtered = e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4);
    setValue(filtered);
    if (filtered.length === 4) {
      location.hash = `#room=${filtered}`;
    }
  }

  return (
    <div className="gw-landing gw-layer">
      <SpacetimeBackground />
      <div className="gw-layer" style={{ textAlign: "center" }}>
        <h2 style={{ marginBottom: "32px" }}>Join a Room</h2>
        <input
          className="gw-code-entry"
          type="text"
          autoFocus
          maxLength={4}
          value={value}
          onChange={handleChange}
          placeholder="CODE"
          aria-label="Room code"
        />
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
