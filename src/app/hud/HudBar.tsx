import { useEffect } from "react";
import "./hud.css";
import { useStore } from "../store";
import { hudStore, hudController, hudInputs, type Team } from "./hudStore";
import { MathField } from "./MathField";
import { TimerBadge } from "./TimerBadge";
import { FiringConsole } from "./FiringConsole";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PlayerPanel({ team, makeInput }: { team: Team; makeInput?: () => any }) {
  const turn = useStore(hudStore, (s) => s.turn);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  const busy = useStore(hudStore, (s) => s.busy[team]);
  const status = useStore(hudStore, (s) => s.status);
  const active = noTurn || turn === team;
  const canFire = active && !busy;
  useEffect(() => {
    hudInputs.get(team)?.setEnabled(canFire);
  }, [team, canFire]);
  return (
    <div className={`player-panel is-${team} ${active ? "is-active" : "is-inactive"}`}>
      <div className="fire-row">
        <span className="hud-prompt">y =</span>
        <MathField team={team} registry={hudInputs} makeInput={makeInput}
          onEnter={() => hudController.requestFire(team)} />
        {turn === team && <TimerBadge />}
        <button className="gw-btn" disabled={!canFire}
          onClick={() => hudController.requestFire(team)}>Fire</button>
      </div>
      <div className="hud-status">{turn === team ? status : ""}</div>
    </div>
  );
}

/**
 * `noTurn` (simultaneous-fire) mode keeps the original always-both-visible
 * dual layout — there's no "whose turn" concept to swap a single console on.
 * Turn-based play (the default) delegates to the redesigned FiringConsole.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HudBar({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }) {
  const noTurn = useStore(hudStore, (s) => s.noTurn);

  if (!noTurn) {
    return <FiringConsole makeInput={makeInput} singleTeam={singleTeam} />;
  }

  return (
    <div className={singleTeam ? "hud-bar hud-bar--single" : "hud-bar"}>
      {singleTeam ? (
        <PlayerPanel team={singleTeam} makeInput={makeInput} />
      ) : (
        <>
          <PlayerPanel team="red" makeInput={makeInput} />
          <PlayerPanel team="blue" makeInput={makeInput} />
        </>
      )}
    </div>
  );
}
