// src/net/NetworkGame.ts
import type { ServerClient } from "./ServerClient";
import type { GameRenderer } from "../game/GameRenderer";
import type { GameUiPort } from "../game/GameUiPort";
import type { MatchState, Team } from "../game/matchState";
import { computeDamage } from "../game/hpLogic";
import type { ScatterConfig } from "../game/matchLogic";
import { netLobbyStore } from "../app/net/netLobbyStore";

export interface LobbySnapshot {
  players: { id: string; name: string; team: "red" | "blue" }[];
  spectators: { id: string; name: string }[];
  hostId: string;
  myId: string | null;
  config?: {
    mode: "classic" | "hp";
    rounds: 3 | 5;
    noTurn: boolean;
    turnSeconds: number;
    map?: { width: number; height: number };
    scatter?: ScatterConfig;
  };
  round1Seed?: number;
}

const SESSION_KEY = "graphwar-session";

export class NetworkGame {
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private lastState: MatchState | null = null;
  private myTeam: Team | null = null;
  private myId: string | null = null;
  private myToken: string | null = null;
  private room = "";
  private name = "";
  private readonly boundClose = () => this.close();
  private myBusy = false;
  private lobbyCallback: ((s: LobbySnapshot) => void) | null = null;
  private matchStartingCallback: ((startAt: number) => void) | null = null;
  private stateCallback: ((s: MatchState) => void) | null = null;

  constructor(
    private client: ServerClient,
    private renderer: GameRenderer,
    private ui: GameUiPort,
  ) {}

  async start(room: string, name: string): Promise<void> {
    this.room = room;
    this.name = name;

    window.addEventListener("beforeunload", this.boundClose);

    this.client.on("joined", (m) => {
      if (m.type !== "joined") return;
      // Clear self-reconnecting flag — we're back in.
      netLobbyStore.set({ selfReconnecting: false });
      this.myId = m.playerId;
      this.myToken = m.token;
      if (m.token) this.storeSession();
      this.client.setReconnectHandler(() => {
        netLobbyStore.set({ selfReconnecting: true });
        this.client.send({ type: "reconnect", room: this.room, playerId: this.myId!, token: this.myToken! });
      });
    });
    this.client.on("lobbyState", (m) => {
      if (m.type !== "lobbyState") return;
      const me = m.players.find((p) => p.id === this.myId);
      if (me) this.myTeam = me.team;
      // Phase 3 event surface — build snapshot and fire callback
      if (this.lobbyCallback) {
        const snapshot: LobbySnapshot = {
          players: m.players,
          spectators: m.spectators,
          hostId: m.ownerId,
          myId: this.myId,
          config: m.config as LobbySnapshot["config"],
          round1Seed: m.round1Seed,
        };
        this.lobbyCallback(snapshot);
      }
    });
    this.client.on("matchStarting", (m) => {
      if (m.type !== "matchStarting") return;
      this.matchStartingCallback?.(m.startAt);
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
      // Server-authoritative phase flip: first matchState → "play"
      if (netLobbyStore.get().phase !== "play") {
        netLobbyStore.set({ phase: "play" });
      }
      this.render(m.state);
    });
    this.client.on("peerStatus", (m) => {
      if (m.type !== "peerStatus") return;
      if (m.connected) {
        netLobbyStore.set({ peerDown: null });
        this.ui.setStatus("");
      } else {
        // Find the peer's name from lastState for the overlay
        const peerName = this.lastState
          ? (this.lastState.players.find((p) => p.id !== this.myId)?.name ?? "Opponent")
          : "Opponent";
        netLobbyStore.set({ peerDown: { name: peerName, deadline: Date.now() + 30_000 } });
        this.ui.setStatus("Opponent disconnected — waiting up to 30s…");
      }
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

    this.ui.onFire((_player, latex) => {
      if (this.myBusy) return;
      this.myBusy = true;
      if (this.myTeam) this.ui.setBusy(this.myTeam, true);
      this.client.send({ type: "fireIntent", latex });
    });

    await this.client.connect();

    const saved = this.loadSession();
    if (saved) {
      netLobbyStore.set({ selfReconnecting: true });
      this.client.send({ type: "reconnect", room: this.room, playerId: saved.playerId, token: saved.token });
    } else {
      this.client.send({ type: "join", room: this.room, name: this.name });
    }
  }

  // ── Phase 3 event surface ────────────────────────────────────────────────────
  onLobby(cb: (s: LobbySnapshot) => void): void {
    this.lobbyCallback = cb;
  }

  onMatchStarting(cb: (startAt: number) => void): void {
    this.matchStartingCallback = cb;
  }

  /** Called at the top of every render(state) with the full server-authoritative MatchState. */
  onState(cb: (s: MatchState) => void): void {
    this.stateCallback = cb;
  }

  sendConfigure(partial: {
    mode: "classic" | "hp";
    rounds: 3 | 5;
    noTurn: boolean;
    turnSeconds: number;
    map?: { width: number; height: number };
    scatter?: ScatterConfig;
  }): void {
    this.client.send({
      type: "configureRoom",
      mode: partial.mode,
      rounds: partial.rounds,
      noTurn: partial.noTurn,
      turnSeconds: partial.turnSeconds,
      ...(partial.map ? { map: partial.map } : {}),
      ...(partial.scatter ? { scatter: partial.scatter } : {}),
    });
  }

  sendSwitchTeam(team: "red" | "blue"): void {
    this.client.send({ type: "switchTeam", team });
  }

  sendReroll(): void {
    this.client.send({ type: "rerollArena" });
  }

  sendSetName(name: string): void {
    this.client.send({ type: "setName", name });
  }

  requestStart(): void {
    this.client.send({ type: "startMatch" });
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

  private render(state: MatchState): void {
    this.stateCallback?.(state);
    this.lastState = state;
    // Re-enable local player fire button if they were busy.
    if (this.myBusy) {
      const me = state.players.find((p) => p.id === this.myId);
      if (me) {
        this.myBusy = false;
        this.ui.setBusy(me.team, false);
      }
    }
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
    const viewTeam: Team = this.myTeam ?? "red";
    const viewer = state.players.find((p) => p.team === viewTeam && p.alive) ?? red;
    this.renderer.setMap(state.config.map);
    // H3 fix: the renderer's per-player glow/aim needs both the no-turn flag
    // and the server-authoritative active PLAYER id — previously this was
    // never set for online play, so isPlayerActive() fell back to comparing
    // team only (highlighting an entire NvN team instead of the one shooter).
    this.renderer.setNoTurnMode(state.config.noTurn);
    this.renderer.setWorld(
      { soldier: { pos: viewer.pos, dir: viewTeam === "red" ? 1 : -1 }, bounds: state.bounds,
        targets: state.players.filter((p) => p.team !== viewTeam && p.alive).map((p) => ({ id: p.id, pos: p.pos, radius: 0.1 })),
        planets: state.planets },
      viewTeam, state.players,
      { phase: "ingame", mode: state.config.mode, activePlayerId: state.activePlayerId },
    );
    const active = state.players.find((p) => p.id === state.activePlayerId);
    if (active) this.ui.setTurn(active.team);
    else this.ui.setNoTurnMode(true);
    this.ui.updateScoreboard(state.scores.red, state.scores.blue, state.round, state.config.rounds);

    if (state.phase === "over" && state.winner) {
      const detail = state.config.mode === "hp" ? "Out of HP." : "Direct hit.";
      this.ui.showWin(state.winner, detail);
    }
  }
}
