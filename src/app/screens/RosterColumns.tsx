import type { NetLobbyState } from "../net/netLobbyStore";

interface Props {
  players: NetLobbyState["players"];
  myId: string | null;
  hostId: string | null;
  locked: boolean;
  onSwitch: (team: "red" | "blue") => void;
}

export function RosterColumns({ players, myId, hostId, locked, onSwitch }: Props) {
  const redPlayers = players.filter((p) => p.team === "red");
  const bluePlayers = players.filter((p) => p.team === "blue");

  const myTeam = players.find((p) => p.id === myId)?.team ?? null;

  // Show switch button in the OTHER column only when not locked and target team < 5
  const showSwitchTo = (targetTeam: "red" | "blue"): boolean => {
    if (locked) return false;
    if (myTeam === null) return false;
    if (myTeam === targetTeam) return false;
    const targetCount = targetTeam === "red" ? redPlayers.length : bluePlayers.length;
    return targetCount < 5;
  };

  const renderColumn = (team: "red" | "blue", teamPlayers: typeof players) => {
    const showSwitch = showSwitchTo(team);

    return (
      <div className={`roster-col is-${team}`}>
        {teamPlayers.map((p) => (
          <div
            key={p.id}
            className={[
              "roster-row",
              p.id === myId ? "is-me" : "",
              p.id === hostId ? "is-host" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {p.id === hostId && <span className="roster-host-badge">♛</span>}
            <span className="roster-name">{p.name}</span>
          </div>
        ))}
        {showSwitch && (
          <button
            className="cc-btn roster-switch-btn"
            onClick={() => onSwitch(team)}
          >
            Switch to {team.toUpperCase()}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      {renderColumn("red", redPlayers)}
      {renderColumn("blue", bluePlayers)}
    </>
  );
}
