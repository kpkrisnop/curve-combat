/**
 * Extracted from GameUI's public API so React (HudController) and any future UI
 * can implement it; NetworkGame and LocalGame depend on this, not on a concrete class.
 */
/** Severity of a HUD status-line message. Drives its colour, not its content. */
export type StatusTone = "info" | "warn" | "error";

export interface GameUiPort {
  onFire(cb: (player: "red" | "blue", latex: string) => void): void;
  onReset(cb: () => void): void;
  setTurn(turn: "red" | "blue", lastEquation?: string): void;
  setBusy(player: "red" | "blue", busy: boolean): void;
  setNoTurnMode(enabled: boolean): void;
  focus(): void;
  /**
   * The HUD's single status line. `tone` drives its colour so an error/warning
   * still cuts through a line that otherwise carries routine shot commentary.
   * Omit `note` to clear it (the HUD then falls back to a tip).
   */
  setStatus(note?: string, tone?: StatusTone): void;
  showWin(winner: "red" | "blue", detail?: string): void;
  resetInputs(): void;
  hideWin(): void;
  updateScoreboard(red: number, blue: number, round: number, totalRounds: number): void;
  showSplash(html: string): void;
  hideSplash(): void;
  showTutorialStep(text: string, onNext: () => void, onSkip: () => void): void;
  hideTutorial(): void;
  setTimer(seconds: number | null): void;
}
