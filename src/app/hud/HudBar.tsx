import "./hud.css";
import { useStore } from "../store";
import { hudStore, hudController, hudInputs, type Team } from "./hudStore";
import { MathField } from "./MathField";

function TimerBadge() {
  const timer = useStore(hudStore, (s) => s.timer);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  if (timer === null || noTurn) return null;
  const cls = timer <= 5 ? "hud-timer crit" : timer <= 10 ? "hud-timer warn" : "hud-timer";
  return <span className={cls}>{timer}s</span>;
}

function PlayerPanel({ team, makeInput }: { team: Team; makeInput?: () => any }) {
  const turn = useStore(hudStore, (s) => s.turn);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  const busy = useStore(hudStore, (s) => s.busy[team]);
  const status = useStore(hudStore, (s) => s.status);
  const active = noTurn || turn === team;
  const canFire = active && !busy;
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

export function HudBar({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }) {
  return (
    <div className="hud-bar">
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
