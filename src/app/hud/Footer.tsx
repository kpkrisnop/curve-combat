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

import { useEffect, useRef, useState } from "react";
import { Icon } from "../mdiIcon";
import { mdiPlay, mdiClockOutline, mdiSwapHorizontal, mdiContentCopy, mdiCheck } from "@mdi/js";
import { HudBar } from "./HudBar";
import { useStore } from "../store";
import { hudStore, type Team } from "./hudStore";

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

  /** Pregame Leave — called directly, no confirm. (Ingame Quit is IngameQuit.) */
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
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in sync if the parent's `name` prop changes from outside (e.g. once
  // E2 wires setName round-trips and the server echoes the confirmed name).
  useEffect(() => {
    if (props.name !== undefined) setLocalName(props.name);
  }, [props.name]);

  useEffect(() => () => { if (copiedTimeout.current) clearTimeout(copiedTimeout.current); }, []);

  function flashCopied(which: "code" | "link") {
    setCopied(which);
    if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
    copiedTimeout.current = setTimeout(() => setCopied(null), 1400);
  }

  if (props.mode === "ingame") {
    return <IngameFooter makeInput={props.makeInput} singleTeam={props.singleTeam} />;
  }

  const isOnline = props.mode === "pregame-online";
  const showWaiting = isOnline && !props.isHost;

  const onNameInput = (value: string) => {
    setLocalName(value);
    props.onNameChange?.(value);
  };

  const copyCode = () => {
    if (!props.roomCode) return;
    void navigator.clipboard.writeText(props.roomCode);
    flashCopied("code");
  };
  const copyLink = () => {
    if (!props.roomCode) return;
    void navigator.clipboard.writeText(roomLink(props.roomCode, location.origin + location.pathname));
    flashCopied("link");
  };

  return (
    <div className="comp footer footer--pregame" data-testid="arena-footer">
      <button type="button" className="cc-btn footer-leave" onClick={props.onLeave}>
        {props.mode === "pregame-online" ? "Leave Room" : "Leave"}
      </button>
      {showWaiting ? (
        <span className="footer-waiting">
          <Icon className="footer-waiting__icon" path={mdiClockOutline} size="15px" color="currentColor" />
          Waiting for host…
        </span>
      ) : (
        <button
          type="button"
          className="cc-btn cc-btn--primary footer-start"
          disabled={props.startDisabled}
          onClick={props.onStart}
        >
          <Icon path={mdiPlay} size="15px" color="currentColor" />
          Start Match
        </button>
      )}

      {isOnline && (
        <>
          <span className="footer-sep" aria-hidden="true" />
          <label className="footer-name">
            <span className="cc-label">Name</span>
            <input
              type="text"
              className="footer-name-input"
              value={localName}
              onChange={(e) => onNameInput(e.target.value)}
            />
          </label>
          <button type="button" className="cc-btn footer-switch" onClick={props.onSwitchSide}>
            <Icon path={mdiSwapHorizontal} size="15px" color="currentColor" />
            Switch side
          </button>
          <span className="footer-sep" aria-hidden="true" />
          <button type="button" className={`cc-btn footer-copy-code ${copied === "code" ? "is-confirmed" : ""}`} onClick={copyCode}>
            <Icon path={copied === "code" ? mdiCheck : mdiContentCopy} size="15px" color="currentColor" />
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
          <button type="button" className={`cc-btn footer-copy-link ${copied === "link" ? "is-confirmed" : ""}`} onClick={copyLink}>
            <Icon path={copied === "link" ? mdiCheck : mdiContentCopy} size="15px" color="currentColor" />
            {copied === "link" ? "Copied" : "Copy link"}
          </button>
        </>
      )}
    </div>
  );
}

// The ingame Quit no longer lives here — the keypad fills the footer, so it
// floats on the map card instead (see hud/IngameQuit.tsx, rendered by the
// flows). `onLeave` on FooterProps is now pregame-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function IngameFooter({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }) {
  const turn = useStore(hudStore, (s) => s.turn);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  const waiting = singleTeam !== undefined && turn !== singleTeam;
  const glowTeam: Team = waiting ? (singleTeam === "red" ? "blue" : "red") : turn;
  const teamClass = noTurn ? "" : `is-${glowTeam}`;
  const waitingClass = !noTurn && waiting ? "is-waiting" : "";

  return (
    <div className={`comp footer footer--ingame ${teamClass} ${waitingClass}`} data-testid="arena-footer">
      <HudBar makeInput={makeInput} singleTeam={singleTeam} />
    </div>
  );
}
