// src/net/NetworkGame.ts
import type { ServerClient } from "./ServerClient";
import type { GameRenderer } from "../game/GameRenderer";
import type { GameUI } from "../game/GameUI";
import type { MatchState, Team } from "../game/matchState";

export class NetworkGame {
  private myTeam: Team | null = null;
  private myId: string | null = null;

  constructor(private client: ServerClient, private renderer: GameRenderer, private ui: GameUI) {}

  async start(room: string, name: string): Promise<void> {
    this.client.on("joined", (m) => { if (m.type === "joined") this.myId = m.playerId; });
    this.client.on("lobbyState", (m) => {
      if (m.type !== "lobbyState") return;
      const me = m.players.find((p) => p.id === this.myId);
      if (me) this.myTeam = me.team;
    });
    this.client.on("shotPlayback", (m) => {
      if (m.type === "shotPlayback") void this.renderer.playShot(m.shot);
    });
    this.client.on("matchState", (m) => {
      if (m.type === "matchState") this.render(m.state);
    });
    this.ui.onFire((_player, latex) => this.client.send({ type: "fireIntent", latex }));
    await this.client.connect();
    this.client.send({ type: "join", room, name });
  }

  private render(state: MatchState): void {
    const red = state.players.find((p) => p.team === "red")!;
    const blue = state.players.find((p) => p.team === "blue")!;
    const viewTeam: Team = this.myTeam ?? "red";
    const viewer = state.players.find((p) => p.team === viewTeam && p.alive) ?? red;
    this.renderer.setWorld(
      { soldier: { pos: viewer.pos, dir: viewTeam === "red" ? 1 : -1 }, bounds: state.bounds,
        targets: state.players.filter((p) => p.team !== viewTeam && p.alive).map((p) => ({ id: p.id, pos: p.pos, radius: 0.1 })),
        planets: state.planets },
      viewTeam, red.pos, blue.pos,
    );
    this.ui.updateScoreboard(state.scores.red, state.scores.blue, state.round, state.config.rounds);
    if (state.phase === "over" && state.winner) this.ui.showWin(state.winner, "Direct hit.");
  }
}
