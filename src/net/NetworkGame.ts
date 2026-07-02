// src/net/NetworkGame.ts
import type { ServerClient } from "./ServerClient";
import type { GameRenderer } from "../game/GameRenderer";
import type { GameUI } from "../game/GameUI";
import type { MatchState, Team } from "../game/matchState";
import { computeDamage } from "../game/hpLogic";

const SESSION_KEY = "graphwar-session";

export class NetworkGame {
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private lastState: MatchState | null = null;
  private myTeam: Team | null = null;
  private myId: string | null = null;
  private myToken: string | null = null;
  private ownerId: string | null = null;
  private startBtn: HTMLButtonElement | null = null;
  private room = "";
  private name = "";
  private readonly boundClose = () => this.close();

  constructor(private client: ServerClient, private renderer: GameRenderer, private ui: GameUI) {}

  async start(room: string, name: string): Promise<void> {
    this.room = room;
    this.name = name;

    window.addEventListener("beforeunload", this.boundClose);

    this.client.on("joined", (m) => {
      if (m.type !== "joined") return;
      this.myId = m.playerId;
      this.myToken = m.token;
      this.ownerId = m.ownerId;
      if (m.token) this.storeSession();
      this.maybeShowStartButton();
      this.client.setReconnectHandler(() =>
        this.client.send({ type: "reconnect", room: this.room, playerId: this.myId!, token: this.myToken! })
      );
    });
    this.client.on("lobbyState", (m) => {
      if (m.type !== "lobbyState") return;
      this.ownerId = m.ownerId;
      const me = m.players.find((p) => p.id === this.myId);
      if (me) this.myTeam = me.team;
      this.maybeShowStartButton();
    });
    this.client.on("shotPlayback", (m) => {
      if (m.type !== "shotPlayback") return;
      void (async () => {
        await this.renderer.playShot(m.shot);
        if (
          this.lastState?.config.mode === "hp" &&
          m.shot.hit.kind === "target" &&
          m.shot.hit.at
        ) {
          const dmg = computeDamage(m.shot.impactSlope);
          const firer = this.lastState.players.find((p) => p.id === m.firerId);
          if (firer) {
            const targetTeam: Team = firer.team === "red" ? "blue" : "red";
            this.renderer.showFloatingDamage(m.shot.hit.at, dmg, targetTeam);
          }
        }
      })();
    });
    this.client.on("matchState", (m) => {
      if (m.type !== "matchState") return;
      this.removeStartButton();
      this.render(m.state);
    });
    this.client.on("peerStatus", (m) => {
      if (m.type !== "peerStatus") return;
      this.ui.setStatus(m.connected ? "" : "Opponent disconnected — waiting up to 30s…");
    });
    this.client.on("error", (m) => {
      if (m.type !== "error") return;
      if (m.code === "rejoin-failed") {
        this.clearSession();
        this.client.send({ type: "join", room: this.room, name: this.name });
        return;
      }
      this.ui.setStatus(m.message);
    });

    this.ui.onFire((_player, latex) => this.client.send({ type: "fireIntent", latex }));

    await this.client.connect();

    const saved = this.loadSession();
    if (saved) {
      this.client.send({ type: "reconnect", room: this.room, playerId: saved.playerId, token: saved.token });
    } else {
      this.client.send({ type: "join", room: this.room, name: this.name });
    }
  }

  close(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    window.removeEventListener("beforeunload", this.boundClose);
    this.client.close();
  }

  private storeSession(): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ room: this.room, playerId: this.myId, token: this.myToken }));
  }

  private clearSession(): void {
    sessionStorage.removeItem(SESSION_KEY);
  }

  private loadSession(): { playerId: string; token: string } | null {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      return s.room === this.room && s.playerId && s.token ? { playerId: s.playerId, token: s.token } : null;
    } catch { return null; }
  }

  private maybeShowStartButton(): void {
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
    if (this.startBtn) { this.startBtn.remove(); this.startBtn = null; }
  }

  private render(state: MatchState): void {
    this.lastState = state;
    // --- countdown ---
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (state.turnDeadline !== null && state.phase === "play" && state.activePlayerId !== null) {
      const tick = () => {
        const secs = Math.max(0, Math.ceil(((state.turnDeadline as number) - Date.now()) / 1000));
        this.ui.setStatus(`⏱ ${secs}s`);
      };
      tick();
      this.countdownInterval = setInterval(tick, 500);
    } else {
      this.ui.setStatus("");
    }
    // --- rest of render (unchanged below) ---
    const red = state.players.find((p) => p.team === "red")!;
    const blue = state.players.find((p) => p.team === "blue")!;
    const viewTeam: Team = this.myTeam ?? "red";
    const viewer = state.players.find((p) => p.team === viewTeam && p.alive) ?? red;
    this.renderer.setMap(state.config.map);
    this.renderer.setWorld(
      { soldier: { pos: viewer.pos, dir: viewTeam === "red" ? 1 : -1 }, bounds: state.bounds,
        targets: state.players.filter((p) => p.team !== viewTeam && p.alive).map((p) => ({ id: p.id, pos: p.pos, radius: 0.1 })),
        planets: state.planets },
      viewTeam, red.pos, blue.pos,
    );
    const active = state.players.find((p) => p.id === state.activePlayerId);
    if (active) this.ui.setTurn(active.team);
    else this.ui.setNoTurnMode(true);
    this.ui.updateScoreboard(state.scores.red, state.scores.blue, state.round, state.config.rounds);

    if (state.config.mode === "hp") {
      this.ui.updateHp(red.hp, blue.hp);
    }

    if (state.phase === "over" && state.winner) {
      const detail = state.config.mode === "hp" ? "Out of HP." : "Direct hit.";
      this.ui.showWin(state.winner, detail);
    }
  }
}
