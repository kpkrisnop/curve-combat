// The redesigned turn-based in-game footer console (arena-shell-redesign
// follow-up). Replaces the always-both-visible dual `PlayerPanel` layout for
// turn-based play: one team-colored console whose visible field swaps with
// the turn. `noTurn` (simultaneous-fire) mode is unaffected — HudBar renders
// the original dual layout for that mode; this component is never mounted
// then.
//
// Both teams' MathQuill fields stay mounted at all times (local hotseat) so
// each is simply its own memory across swaps — there is nothing to marshal.
// For online (`singleTeam` set) only one field ever mounts; the other side
// is represented by a locked placeholder while it's not your turn.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { hudStore, hudController, hudInputs, type Team } from "./hudStore";
import { MathField } from "./MathField";
import { TimerBadge } from "./TimerBadge";

const CHIP_GROUPS: { label: string; type: string }[][] = [
  [{ label: "sin", type: "sin(" }, { label: "cos", type: "cos(" }, { label: "tan", type: "tan(" }],
  // "log_" leaves the cursor inside the subscript for the base — the same
  // raw-insertion-point pattern the "xⁿ" chip uses for superscripts (type
  // "^", arrow out, keep typing).
  [{ label: "ln", type: "ln(" }, { label: "logₐ", type: "log_" }],
  [{ label: "√", type: "sqrt" }, { label: "x²", type: "x^2" }, { label: "xⁿ", type: "^" }],
  [{ label: "π", type: "pi" }, { label: "e", type: "e" }],
  [{ label: "( )", type: "(" }, { label: "abs", type: "abs(" }],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FiringConsole({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }) {
  const turn = useStore(hudStore, (s) => s.turn);
  const busy = useStore(hudStore, (s) => s.busy[turn]);
  const status = useStore(hudStore, (s) => s.status);

  const teams: Team[] = singleTeam ? [singleTeam] : ["red", "blue"];
  const waiting = singleTeam !== undefined && turn !== singleTeam;
  const displayed: Team = waiting ? OTHER(singleTeam!) : turn;

  const [live, setLive] = useState<Record<Team, string>>({ red: "", blue: "" });
  // Recall pointer for whichever team is currently being navigated. idx -1 =
  // live draft; 0 = most recent shot.
  const recallRef = useRef<{ team: Team | null; idx: number }>({ team: null, idx: -1 });
  // The draft a team had typed before entering recall — restored when they
  // walk back down to it, so recall never destroys unfired work.
  const draftRef = useRef<Record<Team, string>>({ red: "", blue: "" });
  const programmaticRef = useRef(false); // true while WE set latex, so onEdit ignores it

  // Enable only the displayed field; refocus it whenever the turn changes.
  useEffect(() => {
    teams.forEach((t) => hudInputs.get(t)?.setEnabled(t === turn && !busy));
    if (turn === displayed && !waiting) hudInputs.get(turn)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `teams` is stable per singleTeam identity
  }, [turn, busy, waiting, displayed, singleTeam]);

  const recallStep = (team: Team, dir: -1 | 1) => {
    const hist = hudStore.get().history[team];
    const cur = recallRef.current.team === team ? recallRef.current.idx : -1;
    let idx: number;
    if (dir < 0) {
      if (cur >= hist.length - 1) return; // nothing older (also covers empty history)
      if (cur === -1) draftRef.current[team] = hudInputs.get(team)?.getLatex() ?? "";
      idx = cur + 1;
    } else {
      if (cur < 0) return; // already on the draft — never blank it
      idx = cur - 1;
    }
    recallRef.current = { team, idx };
    const val = idx === -1 ? draftRef.current[team] : hist[idx];
    programmaticRef.current = true;
    hudInputs.get(team)?.setLatex(val);
    programmaticRef.current = false;
    setLive((l) => ({ ...l, [team]: val }));
  };

  const onEdit = (team: Team) => {
    if (programmaticRef.current) return;
    recallRef.current = { team: null, idx: -1 }; // user typed -> leave recall
    setLive((l) => ({ ...l, [team]: hudInputs.get(team)?.getLatex() ?? "" }));
  };

  const insertChip = (chars: string) => {
    if (waiting || busy) return;
    hudInputs.get(turn)?.insertText(chars);
    recallRef.current = { team: null, idx: -1 };
    setLive((l) => ({ ...l, [turn]: hudInputs.get(turn)?.getLatex() ?? "" }));
  };

  const canFire = !waiting && !busy && live[turn].trim() !== "";
  const label = turn.toUpperCase();

  return (
    <div className="hud-console">
      <div className="hud-console__turnline">
        <span className="hud-console__turn" aria-live="polite">
          <span className={`hud-console__dot is-${displayed}`} aria-hidden="true" />
          {waiting ? `${label} IS AIMING…` : `${label} TO FIRE`}
        </span>
        <TimerBadge />
      </div>

      <div className={`hud-console__inputrow ${waiting ? "is-locked" : ""}`}>
        <span className="hud-prompt">y =</span>
        <div className="hud-console__fields">
          {teams.map((t) => (
            <div
              key={t}
              // In singleTeam (online) mode, while waiting on the opponent's turn,
              // the locked placeholder below takes over the "hud-console-field"
              // slot visually — this wrapper stays mounted (so the MathField
              // instance and its registry entry never unmount) but drops the
              // shared class so it doesn't also count as a visible field.
              className={
                singleTeam && waiting
                  ? "hud-console-field--hidden"
                  : `hud-console-field ${t === turn && !waiting ? "" : "hud-console-field--hidden"}`
              }
            >
              <MathField
                team={t}
                registry={hudInputs}
                makeInput={makeInput}
                placeholder="e.g. sin(x)"
                onEnter={() => hudController.requestFire(t)}
                onEdit={() => onEdit(t)}
                onUpOutOf={() => recallStep(t, -1)}
                onDownOutOf={() => recallStep(t, 1)}
              />
            </div>
          ))}
          {waiting && (
            <span className="hud-console-field hud-console-field--locked">
              opponent is choosing a curve…
            </span>
          )}
        </div>
        {!waiting && (
          <button
            type="button"
            className="hud-console__clear"
            title="Clear"
            aria-label="Clear equation"
            disabled={!live[turn].trim()}
            onClick={() => {
              programmaticRef.current = true;
              hudInputs.get(turn)?.setLatex("");
              programmaticRef.current = false;
              setLive((l) => ({ ...l, [turn]: "" }));
              hudInputs.get(turn)?.focus();
            }}
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="gw-btn gw-btn--primary hud-console__fire"
          disabled={!canFire}
          onClick={() => hudController.requestFire(turn)}
        >
          {busy ? "Firing…" : "Fire"}
          <span className="hud-console__fire-key" aria-hidden="true">↵</span>
        </button>
      </div>

      <div className="hud-status">{!waiting ? status : ""}</div>

      <div className="hud-console__chiprow">
        <div className="hud-console__chips">
          {CHIP_GROUPS.map((group, gi) => (
            <div className="hud-console-chip-group" key={gi}>
              {group.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className="hud-console-chip"
                  disabled={waiting || busy}
                  onClick={() => insertChip(c.type)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <span className="hud-console__hint">↑ recall · ↵ fire</span>
      </div>
    </div>
  );
}

function OTHER(t: Team): Team {
  return t === "red" ? "blue" : "red";
}
