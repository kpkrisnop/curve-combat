import { createStore, type Store } from "../store";
import type { GameUiPort, StatusTone } from "../../game/GameUiPort";

export type Team = "red" | "blue";

export interface HudState {
  turn: Team;
  noTurn: boolean;
  busy: { red: boolean; blue: boolean };
  score: { red: number; blue: number; round: number; totalRounds: number };
  status: string;
  /** Severity of `status`; drives its colour so errors/warnings cut through. */
  statusTone: StatusTone;
  timer: number | null;
  win: { winner: Team; detail: string } | null;
  splash: string | null;
  tutorial: { text: string } | null;
  /** Per-team fired-equation history, newest first, capped at HudController.HISTORY_MAX. Client-local — never sent over the wire. */
  history: { red: string[]; blue: string[] };
}

export function initialHudState(): HudState {
  return {
    turn: "red",
    noTurn: false,
    busy: { red: false, blue: false },
    score: { red: 0, blue: 0, round: 1, totalRounds: 3 },
    status: "",
    statusTone: "info",
    timer: null,
    win: null,
    splash: null,
    tutorial: null,
    history: { red: [], blue: [] },
  };
}

export interface HudInputHandle {
  getLatex(): string;
  setLatex(v: string): void;
  focus(): void;
  setEnabled(e: boolean): void;
  /** Type raw chars/LaTeX at the cursor (function chips). */
  insertText(chars: string): void;
  /** Send a non-text key: "Left", "Right", "Backspace" (keypad nav keys). */
  keystroke(chars: string): void;
  /** Restructure flat/pasted ASCII into proper LaTeX; returns before/after so the
   *  caller can guard the change against the compiled curve (Format button). */
  reformat(): { before: string; after: string };
}

export class HudInputRegistry {
  private map = new Map<Team, HudInputHandle>();
  register(team: Team, h: HudInputHandle): void { this.map.set(team, h); }
  unregister(team: Team): void { this.map.delete(team); }
  get(team: Team): HudInputHandle | undefined { return this.map.get(team); }
}

export class HudController implements GameUiPort {
  private static readonly HISTORY_MAX = 8;
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
    if (!latex) return;
    this.pushHistory(team, latex);
    this.fireCb?.(team, latex);
  }
  pushHistory(team: Team, latex: string): void {
    this.store.set((s) => ({
      history: { ...s.history, [team]: [latex, ...s.history[team]].slice(0, HudController.HISTORY_MAX) },
    }));
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
  /** Local-only. Routing by `turn` is safe HERE and nowhere else: LocalGame is
   *  the sole caller and it is turn-based, so `turn` IS the team that types.
   *  In online noTurn `turn` is stale forever (the server never sets an active
   *  player), so this would resolve the wrong/unregistered field. Focus for
   *  online is owned by FiringConsole's enable effect, which routes by `active`
   *  — wire the online path through THAT, never through here. */
  focus(): void { this.inputs.get(this.store.get().turn)?.focus(); }
  setStatus(note?: string, tone: StatusTone = "info"): void {
    this.store.set({ status: note ?? "", statusTone: tone });
  }
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
  /** Wipe HUD *state* back to defaults on entering a match. NOT the leave-match
   *  action — that's onReset/requestReset (a navigation callback). */
  reset(): void { this.store.set(initialHudState()); }
}

// App-wide singletons (one HUD per page).
export const hudStore = createStore(initialHudState());
export const hudInputs = new HudInputRegistry();
export const hudController = new HudController(hudStore, hudInputs);
