// src/app/hud/Footer.tsx
//
// arena-shell-redesign (C3) — the single full-width FOOTER card shared by all
// four arena states. Absorbs Start Match (moved out of ConfigPanel/the old
// host drawer) and the equation input + Fire (moved out of the standalone
// HudBar overlay — HudBar is now composed in-flow here for the "ingame" mode).
//
// Modes:
//   pregame-local   — [Start] only.
//   pregame-online  — host: [Start] | [Name] [Switch side] | [Copy code] [Copy link]
//                     non-host: Start replaced by "Waiting for host…"; rest unchanged.
//   ingame          — centered [equation input][Fire]; no Start/name/switch/copy.
//
// Seams for later tasks: onNameChange/onSwitchSide are exposed here but the
// actual setName/switchTeam network dispatch is wired by E2/E3 — this
// component only renders the controls and calls the prop back. Copy code/
// link are fully wired here (clipboard write is local, no server round-trip).

import { useEffect, useState } from "react";
import { HudBar } from "./HudBar";
import type { Team } from "./hudStore";

export type FooterMode = "pregame-local" | "pregame-online" | "ingame";

// L3 — pure helper so the sub-path-preserving logic is unit-testable without
// touching `location`. `base` is expected to be `origin + pathname` (no
// hash); any existing hash on `base` is stripped defensively so callers
// can't accidentally double up on `#room=`.
export function roomLink(roomCode: string, base: string): string {
  const hashIndex = base.indexOf("#");
  const cleanBase = hashIndex === -1 ? base : base.slice(0, hashIndex);
  return `${cleanBase}#room=${roomCode}`;
}

interface FooterProps {
  mode: FooterMode;

  /** Leave/Quit action. ingame confirms first; pregame calls directly. */
  onLeave?: () => void;

  // pregame (both local + online)
  onStart?: () => void;
  startDisabled?: boolean;

  // pregame-online only
  isHost?: boolean;
  name?: string;
  onNameChange?: (name: string) => void;
  onSwitchSide?: () => void;
  roomCode?: string;

  // ingame — passed through to HudBar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeInput?: () => any;
  singleTeam?: Team;
}

export function Footer(props: FooterProps) {
  const [localName, setLocalName] = useState(props.name ?? "");

  // Keep in sync if the parent's `name` prop changes from outside (e.g. once
  // E2 wires setName round-trips and the server echoes the confirmed name).
  useEffect(() => {
    if (props.name !== undefined) setLocalName(props.name);
  }, [props.name]);

  if (props.mode === "ingame") {
    const quit = () => { if (window.confirm("Quit match?")) props.onLeave?.(); };
    return (
      <div className="comp footer footer--ingame" data-testid="arena-footer">
        <HudBar makeInput={props.makeInput} singleTeam={props.singleTeam} />
        <button type="button" className="gw-btn footer-leave" onClick={quit}>
          Quit Match
        </button>
      </div>
    );
  }

  const isOnline = props.mode === "pregame-online";
  const showWaiting = isOnline && !props.isHost;

  const onNameInput = (value: string) => {
    setLocalName(value);
    props.onNameChange?.(value);
  };

  const copyCode = () => {
    if (props.roomCode) void navigator.clipboard.writeText(props.roomCode);
  };
  const copyLink = () => {
    if (props.roomCode) {
      void navigator.clipboard.writeText(roomLink(props.roomCode, location.origin + location.pathname));
    }
  };

  return (
    <div className="comp footer footer--pregame" data-testid="arena-footer">
      <button type="button" className="gw-btn footer-leave" onClick={props.onLeave}>
        {props.mode === "pregame-online" ? "Leave Room" : "Leave"}
      </button>
      {showWaiting ? (
        <span className="footer-waiting">⏳ Waiting for host…</span>
      ) : (
        <button
          type="button"
          className="gw-btn gw-btn--primary footer-start"
          disabled={props.startDisabled}
          onClick={props.onStart}
        >
          ▶ Start Match
        </button>
      )}

      {isOnline && (
        <>
          <span className="footer-sep" aria-hidden="true" />
          <label className="footer-name">
            <span className="gw-label">Name</span>
            <input
              type="text"
              className="footer-name-input"
              value={localName}
              onChange={(e) => onNameInput(e.target.value)}
            />
          </label>
          <button type="button" className="gw-btn footer-switch" onClick={props.onSwitchSide}>
            ⇄ Switch side
          </button>
          <span className="footer-sep" aria-hidden="true" />
          <button type="button" className="gw-btn footer-copy-code" onClick={copyCode}>
            ⧉ Copy code
          </button>
          <button type="button" className="gw-btn footer-copy-link" onClick={copyLink}>
            ⧉ Copy link
          </button>
        </>
      )}
    </div>
  );
}
