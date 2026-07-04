/**
 * Extracted from GameUI's public API so React (HudController) and any future UI
 * can implement it; NetworkGame and LocalGame depend on this, not on a concrete class.
 */
export interface GameUiPort {
  onFire(cb: (player: "red" | "blue", latex: string) => void): void;
  onReset(cb: () => void): void;
  setTurn(turn: "red" | "blue", lastEquation?: string): void;
  setBusy(player: "red" | "blue", busy: boolean): void;
  setNoTurnMode(enabled: boolean): void;
  focus(): void;
  setStatus(note?: string): void;
  showWin(winner: "red" | "blue", detail?: string): void;
  resetInputs(): void;
  hideWin(): void;
  updateScoreboard(red: number, blue: number, round: number, totalRounds: number): void;
  showSplash(html: string): void;
  hideSplash(): void;
  showTutorialStep(text: string, onNext: () => void, onSkip: () => void): void;
  hideTutorial(): void;
  showHpBars(visible: boolean): void;
  updateHp(redHp: number, blueHp: number): void;
  setTimer(seconds: number | null): void;
}
