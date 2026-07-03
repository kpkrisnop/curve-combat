// src/game/LocalGame.ts
import type { GameUiPort } from "./GameUiPort";
import type { MatchConfig, MapConfig } from "./matchLogic";
import { firstShooterNextRound } from "./matchLogic";
import {
  createMatch, beginRound, worldFor, playerById, skipTurn,
  type MatchState, type Team, type PlayerState,
} from "./matchState";
import { resolveFire } from "./resolveFire";
import { buildLocalLayout } from "./localLayout";
import type { Bounds, World, Vec2, ShotResult } from "../sim/types";

/** The 6 renderer methods LocalGame needs (structural, so tests can fake it). */
export interface RendererPort {
  setMap(map: MapConfig): void;
  getEffectiveBounds(): Bounds;
  setWorld(world: World, activeTurn: Team, redPos: Vec2, bluePos: Vec2): void;
  setNoTurnMode(enabled: boolean): void;
  playShot(result: ShotResult, player?: Team): Promise<void>;
  showFloatingDamage(at: Vec2, dmg: number, player: Team): void;
}

const SPLASH_MS = 2000;

export class LocalGame {
  private config!: MatchConfig;
  private match: MatchState | null = null;
  private started = false;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private timerRemaining = 0;
  private splashTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private renderer: RendererPort, private ui: GameUiPort) {
    this.ui.onFire((p, latex) => void this.onFire(p, latex));
  }

  /** Render round 1 for this config+seed without starting play (ADR-0003 preview). */
  preview(config: MatchConfig, seed: number): void {
    if (this.started) return;
    this.config = config;
    this.renderer.setMap(config.map);
    const bounds = this.renderer.getEffectiveBounds();
    const layout = buildLocalLayout(bounds, config, seed);
    this.match = createMatch(config, layout, bounds, "red");
    this.renderFrom(this.match, "red");
  }

  /** Start play on the previewed round-1 state. */
  begin(): void {
    if (!this.match || this.started) return;
    this.started = true;
    this.renderer.setNoTurnMode(this.config.noTurn);
    if (this.config.noTurn) this.ui.setNoTurnMode(true);
    this.initRoundHud();
    if (localStorage.getItem("graphwar.tutorialDone") !== "1") this.runTutorial();
    else this.ui.focus();
  }

  dispose(): void {
    this.cancelTimer();
    if (this.splashTimeout) clearTimeout(this.splashTimeout);
    this.started = false;
    this.match = null;
  }

  // ── internals (ported from src/game/main.ts) ─────────────────────────────

  private redOf(m: MatchState): PlayerState { return m.players.find((p) => p.team === "red")!; }
  private blueOf(m: MatchState): PlayerState { return m.players.find((p) => p.team === "blue")!; }

  private renderFrom(m: MatchState, viewTeam: Team): void {
    const viewer = m.players.find((p) => p.team === viewTeam && p.alive) ?? this.redOf(m);
    this.renderer.setWorld(worldFor(m, viewer), viewTeam, this.redOf(m).pos, this.blueOf(m).pos);
  }

  private initRoundHud(): void {
    const m = this.match!;
    const viewTeam: Team = m.activePlayerId ? playerById(m, m.activePlayerId)!.team : "red";
    this.ui.resetInputs();
    this.ui.setTurn(viewTeam, "");
    this.armTimer();
    this.ui.hideWin();
    this.ui.hideSplash();
    this.ui.updateScoreboard(m.scores.red, m.scores.blue, m.round, this.config.rounds);
    this.ui.showHpBars(this.config.mode === "hp");
    this.ui.updateHp(this.redOf(m).hp, this.blueOf(m).hp);
    this.ui.setStatus();
  }

  private cancelTimer(): void {
    if (this.timerInterval !== null) { clearInterval(this.timerInterval); this.timerInterval = null; }
    this.ui.setTimer(null);
  }

  private armTimer(): void {
    this.cancelTimer();
    if (this.config.noTurn) return;
    this.timerRemaining = this.config.turnSeconds ?? 60;
    this.ui.setTimer(this.timerRemaining);
    this.timerInterval = setInterval(() => {
      this.timerRemaining -= 1;
      this.ui.setTimer(this.timerRemaining);
      if (this.timerRemaining > 0) return;
      // Turn expired: skip to the other player.
      if (this.match && this.match.phase === "play") {
        this.match = skipTurn(this.match);
        const viewTeam: Team = this.match.activePlayerId
          ? playerById(this.match, this.match.activePlayerId)!.team : "red";
        this.ui.setTurn(viewTeam, "");
        this.armTimer();
      } else {
        this.cancelTimer();
      }
    }, 1000);
  }

  private async onFire(player: Team, latex: string): Promise<void> {
    if (!this.started) return;
    this.cancelTimer();
    const m = this.match;
    if (!m || m.phase !== "play") return;
    const shooter = m.players.find((p) => p.team === player && p.alive);
    if (!shooter) return;

    const res = resolveFire(m, { playerId: shooter.id, latex });
    if (res.rejected) {
      if (res.rejected === "bad-function") this.ui.setStatus("that isn't a plottable function of x");
      if (!this.config.noTurn) this.armTimer();
      return;
    }

    this.ui.setBusy(player, true);
    await this.renderer.playShot(res.shot!, player);
    this.ui.setBusy(player, false);

    // Commit against LIVE state (no-turn: enemy may have mutated match mid-flight).
    let commit = res;
    if (this.config.noTurn) {
      commit = resolveFire(this.match!, { playerId: shooter.id, latex });
      if (commit.rejected) { this.ui.focus(); return; }
    }
    this.match = commit.next;

    if (commit.shot!.hit.kind === "target" && this.config.mode === "hp" && commit.damage) {
      const defender: Team = player === "red" ? "blue" : "red";
      this.renderer.showFloatingDamage(commit.shot!.hit.at, commit.damage, defender);
    }

    if (commit.roundEnded) {
      this.renderFrom(this.match, player);
      if (this.config.mode === "hp") this.ui.updateHp(this.redOf(this.match).hp, this.blueOf(this.match).hp);
      this.handleRoundEnd(commit.roundLoser!);
      return;
    }

    const viewTeam: Team = this.match.activePlayerId
      ? playerById(this.match, this.match.activePlayerId)!.team : player;
    this.renderFrom(this.match, viewTeam);
    if (this.config.mode === "hp") this.ui.updateHp(this.redOf(this.match).hp, this.blueOf(this.match).hp);
    if (!this.config.noTurn) {
      this.ui.setTurn(viewTeam, "");
      this.armTimer();
    }
    this.ui.setStatus();
    this.ui.focus();
  }

  private handleRoundEnd(roundLoser: Team): void {
    const m = this.match!;
    if (m.phase === "over") {
      this.cancelTimer();
      this.ui.setBusy("red", false);
      this.ui.setBusy("blue", false);
      this.ui.showWin(m.winner!, this.config.mode === "hp" ? "Health depleted." : "Direct hit.");
      return;
    }
    const winnerLabel = roundLoser === "red" ? "BLUE" : "RED";
    const loserLabel = roundLoser === "red" ? "RED" : "BLUE";
    this.ui.showSplash(
      `Round ${m.round + 1} of ${this.config.rounds}<br>` +
      `<span style="color:${roundLoser === "red" ? "var(--gw-blue)" : "var(--gw-red)"}">${winnerLabel} wins the round!</span><br>` +
      `<small>${loserLabel} shoots first</small>`,
    );
    this.splashTimeout = setTimeout(() => {
      this.ui.hideSplash();
      const bounds = this.renderer.getEffectiveBounds();
      this.match = beginRound(m, buildLocalLayout(bounds, this.config), firstShooterNextRound(roundLoser));
      const viewTeam: Team = this.match.activePlayerId
        ? playerById(this.match, this.match.activePlayerId)!.team : "red";
      this.renderFrom(this.match, viewTeam);
      this.ui.resetInputs();
      this.ui.setTurn(viewTeam, "");
      this.armTimer();
      this.ui.setNoTurnMode(this.config.noTurn);
      this.ui.updateScoreboard(this.match.scores.red, this.match.scores.blue, this.match.round, this.config.rounds);
      if (this.config.mode === "hp") this.ui.updateHp(this.redOf(this.match).hp, this.blueOf(this.match).hp);
      this.ui.setStatus();
      this.ui.focus();
    }, SPLASH_MS);
  }

  private runTutorial(): void {
    const steps = [
      "Welcome to Graph War! You are the RED dot on the left. BLUE is on the right.",
      "Type a mathematical function of x (like: 0, x, sin(x)) into the RED input below. Your shot will travel along that curve.",
      "Press Enter or the Fire button to shoot. Try to hit BLUE!",
    ];
    let i = 0;
    const show = (): void => {
      if (i >= steps.length) { done(); return; }
      this.ui.showTutorialStep(steps[i], () => { i++; show(); }, done);
    };
    const done = (): void => {
      this.ui.hideTutorial();
      localStorage.setItem("graphwar.tutorialDone", "1");
      this.ui.focus();
    };
    show();
  }
}
