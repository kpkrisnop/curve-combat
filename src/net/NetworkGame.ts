// src/net/NetworkGame.ts
import type { ServerClient } from "./ServerClient";
import type { GameRenderer } from "../game/GameRenderer";
import type { GameUI } from "../game/GameUI";
import type { MatchState, Team } from "../game/matchState";

export class NetworkGame {
  private myTeam: Team | null = null;
  private myId: string | null = null;
  private ownerId: string | null = null;
  private startBtn: HTMLButtonElement | null = null;

  constructor(private client: ServerClient, private renderer: GameRenderer, private ui: GameUI) {}

  async start(room: string, name: string): Promise<void> {
    this.client.on("joined", (m) => {
      if (m.type !== "joined") return;
      this.myId = m.playerId;
      this.ownerId = m.ownerId;
      this.maybeShowStartButton();
    });
    this.client.on("lobbyState", (m) => {
      if (m.type !== "lobbyState") return;
      this.ownerId = m.ownerId;
      const me = m.players.find((p) => p.id === this.myId);
      if (me) this.myTeam = me.team;
      this.maybeShowStartButton();
    });
    this.client.on("shotPlayback", (m) => {
      if (m.type === "shotPlayback") void this.renderer.playShot(m.shot);
    });
    this.client.on("matchState", (m) => {
      if (m.type !== "matchState") return;
      this.removeStartButton();
      this.render(m.state);
    });
    this.ui.onFire((_player, latex) => this.client.send({ type: "fireIntent", latex }));
    await this.client.connect();
    this.client.send({ type: "join", room, name });
  }

  private maybeShowStartButton(): void {
    // Only show once, only for the room owner, only before the match starts.
    if (this.startBtn) return;
    if (!this.myId || !this.ownerId || this.myId !== this.ownerId) return;
    const btn = document.createElement("button");
    btn.textContent = "Start Match";
    btn.style.cssText =
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
      "padding:16px 32px;font-size:1.4rem;font-weight:bold;cursor:pointer;" +
      "background:#e74c3c;color:#fff;border:none;border-radius:8px;z-index:9999;";
    btn.addEventListener("click", () => {
      this.client.send({ type: "startMatch" });
      this.removeStartButton();
    });
    document.body.appendChild(btn);
    this.startBtn = btn;
  }

  private removeStartButton(): void {
    if (this.startBtn) {
      this.startBtn.remove();
      this.startBtn = null;
    }
  }

  private render(state: MatchState): void {
    const red = state.players.find((p) => p.team === "red")!;
    const blue = state.players.find((p) => p.team === "blue")!;
    const viewTeam: Team = this.myTeam ?? "red";
    const viewer = state.players.find((p) => p.team === viewTeam && p.alive) ?? red;
    // Fix 2: set map so renderer scales the playfield correctly.
    this.renderer.setMap(state.config.map);
    this.renderer.setWorld(
      { soldier: { pos: viewer.pos, dir: viewTeam === "red" ? 1 : -1 }, bounds: state.bounds,
        targets: state.players.filter((p) => p.team !== viewTeam && p.alive).map((p) => ({ id: p.id, pos: p.pos, radius: 0.1 })),
        planets: state.planets },
      viewTeam, red.pos, blue.pos,
    );
    // Fix 1: enable the active team's HUD so the correct client can fire.
    const active = state.players.find((p) => p.id === state.activePlayerId);
    if (active) this.ui.setTurn(active.team);
    else this.ui.setNoTurnMode(true);
    this.ui.updateScoreboard(state.scores.red, state.scores.blue, state.round, state.config.rounds);
    if (state.phase === "over" && state.winner) this.ui.showWin(state.winner, "Direct hit.");
  }
}
