// src/app/hud/TeamStrip.tsx
//
// Compact NvN team-status strip rendered above the HUD bar during online matches.
// Shows one row per player, grouped: red team left, blue team right.
// Row states: .is-dead (alive=false), .is-active (id===activePlayerId), .is-me (id===myId, bold).

import "./hud.css";
import type { PlayerState } from "../../game/matchState";

interface Props {
  players: PlayerState[];
  myId: string | null;
  activePlayerId: string | null;
}

function PlayerRow({
  player,
  isMe,
  isActive,
}: {
  player: PlayerState;
  isMe: boolean;
  isActive: boolean;
}) {
  const cls = [
    "team-strip__row",
    `team-strip__row--${player.team}`,
    !player.alive ? "is-dead" : "",
    isActive ? "is-active" : "",
    isMe ? "is-me" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {isActive && <span className="team-strip__ring" aria-hidden="true" />}
      <span className="team-strip__name">{player.name}</span>
      {!player.alive ? (
        <span className="team-strip__skull" aria-label="eliminated">☠</span>
      ) : (
        <span className="team-strip__hp">
          <span className="team-strip__hp-icon">♥</span>
          {player.hp}
        </span>
      )}
    </div>
  );
}

export function TeamStrip({ players, myId, activePlayerId }: Props) {
  const redPlayers  = players.filter((p) => p.team === "red");
  const bluePlayers = players.filter((p) => p.team === "blue");

  return (
    <div className="team-strip">
      <div className="team-strip__team team-strip__team--red">
        {redPlayers.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            isMe={p.id === myId}
            isActive={p.id === activePlayerId}
          />
        ))}
      </div>
      <div className="team-strip__team team-strip__team--blue">
        {bluePlayers.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            isMe={p.id === myId}
            isActive={p.id === activePlayerId}
          />
        ))}
      </div>
    </div>
  );
}
