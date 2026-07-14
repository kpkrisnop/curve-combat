import { useEffect, useRef, useState } from "react";
import { mdiGithub } from "@mdi/js";
import { Icon } from "../mdiIcon";
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
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape closes the online panel and returns focus to its toggle
  useEffect(() => {
    if (!panelOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPanelOpen(false);
        toggleRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen]);

  function handleCreate() {
    location.hash = `#room=${randomCode()}`;
  }

  return (
    <div className="cc-landing">
      <SpacetimeBackground />
      <div className="land-bleed" aria-hidden="true" />
      <div className="land-chrome" aria-hidden="true">
        <span className="land-chrome__tl">SPACETIME ARENA</span>
        <span className="land-chrome__tr">DESKTOP · 2 TEAMS</span>
        <span className="land-chrome__br">TURN-BASED · LOCAL + ONLINE</span>
      </div>
      {/* Outside .land-chrome: that block is aria-hidden and pointer-events: none */}
      <a
        className="land-gh"
        href="https://github.com/kpkrisnop/curve-combat"
        target="_blank"
        rel="noreferrer"
        aria-label="Source on GitHub"
      >
        <Icon path={mdiGithub} size={1} />
      </a>
      <h1 className="land-title">
        <span className="t-red">CURVE</span> <span className="t-blue">COMBAT</span>
      </h1>
      <p className="land-tagline">
        <span className="land-tagline__eq">y = f(x)</span>
        <span className="land-tagline__sep" aria-hidden="true">·</span>
        fire curves, hit your opponent
      </p>
      <div className="land-actions">
        <button
          className="land-btn land-btn--primary"
          onClick={() => { location.hash = "#local"; }}
        >
          Play Locally
        </button>
        <button
          ref={toggleRef}
          className="land-btn"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          Play Online
        </button>
      </div>
      <div className="land-panel-slot">
        {panelOpen && (
          <div className="land-panel">
            <button className="land-btn" onClick={handleCreate}>
              Create Room
            </button>
            <span className="land-panel__or" aria-hidden="true">or</span>
            <div className="land-join">
              <RoomCodeInput autoFocus />
              <span className="land-join__hint">ENTER A ROOM CODE</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
