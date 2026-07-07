import { createStore, type Store } from "../store";
import type { GameUiPort } from "../../game/GameUiPort";

export type Team = "red" | "blue";

export interface HudState {
  turn: Team;
  noTurn: boolean;
  busy: { red: boolean; blue: boolean };
  score: { red: number; blue: number; round: number; totalRounds: number };
  status: string;
  timer: number | null;
  win: { winner: Team; detail: string } | null;
  splash: string | null;
  tutorial: { text: string } | null;
}

export function initialHudState(): HudState {
  return {
    turn: "red",
    noTurn: false,
    busy: { red: false, blue: false },
    score: { red: 0, blue: 0, round: 1, totalRounds: 3 },
    status: "",
    timer: null,
    win: null,
    splash: null,
    tutorial: null,
  };
}

export interface HudInputHandle {
  getLatex(): string;
  setLatex(v: string): void;
  focus(): void;
  setEnabled(e: boolean): void;
}

export class HudInputRegistry {
  private map = new Map<Team, HudInputHandle>();
  register(team: Team, h: HudInputHandle): void { this.map.set(team, h); }
  unregister(team: Team): void { this.map.delete(team); }
  get(team: Team): HudInputHandle | undefined { return this.map.get(team); }
}

export class HudController implements GameUiPort {
  private fireCb: ((player: Team, latex: string) => void) | null = null;
  private resetCb: (() => void) | null = null;
  private tutNext: (() => void) | null = null;
  private tutSkip: (() => void) | null = null;

  constructor(private store: Store<HudState>, private inputs: HudInputRegistry) {}

  // ── React-side entry points ──────────────────────────────────────────────
  requestFire(team: Team): void {
    const s = this.store.get();
    if (!s.noTurn && team !== s.turn) return;
    if (s.busy[team]) return;
    const latex = this.inputs.get(team)?.getLatex().trim();
    if (latex) this.fireCb?.(team, latex);
  }
  requestReset(): void { this.resetCb?.(); }
  tutorialNext(): void { this.tutNext?.(); }
  tutorialSkip(): void { this.tutSkip?.(); }

  // ── GameUiPort ───────────────────────────────────────────────────────────
  onFire(cb: (player: Team, latex: string) => void): void { this.fireCb = cb; }
  onReset(cb: () => void): void { this.resetCb = cb; }
  setTurn(turn: Team, lastEquation?: string): void {
    this.store.set({ turn, status: "" });
    // Mirror GameUI.setTurn: write the last equation into the now-inactive
    // opponent's input (the player who just finished their turn).
    if (lastEquation !== undefined) {
      const opponent: Team = turn === "red" ? "blue" : "red";
      this.inputs.get(opponent)?.setLatex(lastEquation);
    }
  }
  setBusy(player: Team, busy: boolean): void {
    this.store.set((s) => ({ busy: { ...s.busy, [player]: busy } }));
  }
  setNoTurnMode(enabled: boolean): void { this.store.set({ noTurn: enabled }); }
  focus(): void { this.inputs.get(this.store.get().turn)?.focus(); }
  setStatus(note?: string): void { this.store.set({ status: note ?? "" }); }
  showWin(winner: Team, detail = "Direct hit."): void { this.store.set({ win: { winner, detail } }); }
  resetInputs(): void {
    this.inputs.get("red")?.setLatex("");
    this.inputs.get("blue")?.setLatex("");
  }
  hideWin(): void { this.store.set({ win: null }); }
  updateScoreboard(red: number, blue: number, round: number, totalRounds: number): void {
    this.store.set({ score: { red, blue, round, totalRounds } });
  }
  showSplash(html: string): void { this.store.set({ splash: html }); }
  hideSplash(): void { this.store.set({ splash: null }); }
  showTutorialStep(text: string, onNext: () => void, onSkip: () => void): void {
    this.tutNext = onNext;
    this.tutSkip = onSkip;
    this.store.set({ tutorial: { text } });
  }
  hideTutorial(): void { this.store.set({ tutorial: null }); }
  setTimer(seconds: number | null): void { this.store.set({ timer: seconds }); }
  reset(): void { this.store.set(initialHudState()); }
}

// App-wide singletons (one HUD per page).
export const hudStore = createStore(initialHudState());
export const hudInputs = new HudInputRegistry();
export const hudController = new HudController(hudStore, hudInputs);
