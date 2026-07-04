import { useState } from "react";
import { SpacetimeBackground } from "../SpacetimeBackground";
import { getNickname, setNickname } from "../net/nickname";

function randomCode(): string {
  return Array.from(
    { length: 4 },
    () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]
  ).join("");
}

export function OnlineChoice() {
  const [nick, setNick] = useState(() => getNickname());

  function handleNickChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setNick(v);
    setNickname(v);
  }

  function handleCreate() {
    location.hash = `#room=${randomCode()}`;
  }

  function handleJoin() {
    location.hash = "#join";
  }

  return (
    <div className="gw-landing gw-layer">
      <SpacetimeBackground />
      <div className="gw-layer" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "32px" }}>
        <h2>Play Online</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
          <label style={{ color: "var(--gw-text-muted)", fontSize: "var(--gw-fs-xs)" }} htmlFor="gw-nickname">
            Your nickname
          </label>
          <input
            id="gw-nickname"
            type="text"
            className="gw-code-entry"
            style={{ fontSize: "24px", letterSpacing: "0.08em", width: "10ch" }}
            maxLength={12}
            value={nick}
            onChange={handleNickChange}
            aria-label="Nickname"
          />
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          <button className="gw-btn gw-btn--primary" onClick={handleCreate}>
            Create Room
          </button>
          <button className="gw-btn" onClick={handleJoin}>
            Join Room
          </button>
        </div>
        <div>
          <a
            href="#"
            style={{ color: "var(--gw-text-muted)", textDecoration: "none", fontSize: "var(--gw-fs-md)" }}
            onClick={(e) => { e.preventDefault(); location.hash = ""; }}
          >
            ← Back
          </a>
        </div>
      </div>
    </div>
  );
}
