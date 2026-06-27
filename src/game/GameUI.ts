import { MathInput } from "../ui/MathInput";

const PLAYER = {
  red: { color: "#ff4444", dim: "rgba(255,68,68,0.18)", label: "RED" },
  blue: { color: "#4488ff", dim: "rgba(68,136,255,0.18)", label: "BLUE" },
} as const;

export class GameUI {
  private redInput: MathInput;
  private blueInput: MathInput;
  private redFireBtn: HTMLButtonElement;
  private blueFireBtn: HTMLButtonElement;
  private redStatus: HTMLElement;
  private blueStatus: HTMLElement;
  private banner: HTMLElement;
  private winTitle: HTMLElement;
  private winDetail: HTMLElement;
  private resetBtn: HTMLButtonElement;
  private currentTurn: "red" | "blue" = "red";

  private fireCb: ((latex: string) => void) | null = null;
  private resetCb: (() => void) | null = null;

  private scoreboardText: HTMLElement;
  private roundSplash: HTMLElement;
  private splashText: HTMLElement;
  private tutorialOverlay: HTMLElement;
  private tutorialText: HTMLElement;
  private tutorialNext: HTMLButtonElement;
  private tutorialSkip: HTMLButtonElement;

  constructor(root: ParentNode = document) {
    const redInputHost = root.querySelector<HTMLElement>("#red-input")!;
    this.redFireBtn = root.querySelector<HTMLButtonElement>("#red-fire-btn")!;
    this.redStatus = root.querySelector<HTMLElement>("#red-status")!;

    const blueInputHost = root.querySelector<HTMLElement>("#blue-input")!;
    this.blueFireBtn = root.querySelector<HTMLButtonElement>("#blue-fire-btn")!;
    this.blueStatus = root.querySelector<HTMLElement>("#blue-status")!;

    this.banner = root.querySelector<HTMLElement>("#win-banner")!;
    this.winTitle = root.querySelector<HTMLElement>("#win-title")!;
    this.winDetail = root.querySelector<HTMLElement>("#win-detail")!;
    this.resetBtn = root.querySelector<HTMLButtonElement>("#reset-btn")!;

    this.scoreboardText = root.querySelector<HTMLElement>("#scoreboard-text")!;
    this.roundSplash = root.querySelector<HTMLElement>("#round-splash")!;
    this.splashText = root.querySelector<HTMLElement>("#splash-text")!;
    this.tutorialOverlay = root.querySelector<HTMLElement>("#tutorial-overlay")!;
    this.tutorialText = root.querySelector<HTMLElement>("#tutorial-text")!;
    this.tutorialNext = root.querySelector<HTMLButtonElement>("#tutorial-next")!;
    this.tutorialSkip = root.querySelector<HTMLButtonElement>("#tutorial-skip")!;

    this.redInput = new MathInput();
    redInputHost.appendChild(this.redInput.el);
    this.redInput.reflow();

    this.blueInput = new MathInput();
    blueInputHost.appendChild(this.blueInput.el);
    this.blueInput.reflow();

    this.redInput.onEnter(() => this.emitFire("red"));
    this.redFireBtn.addEventListener("click", () => this.emitFire("red"));
    this.blueInput.onEnter(() => this.emitFire("blue"));
    this.blueFireBtn.addEventListener("click", () => this.emitFire("blue"));
    this.resetBtn.addEventListener("click", () => this.resetCb?.());
  }

  private emitFire(player: "red" | "blue") {
    if (player !== this.currentTurn) return;
    const input = player === "red" ? this.redInput : this.blueInput;
    const latex = input.getLatex().trim();
    if (latex) this.fireCb?.(latex);
  }

  onFire(cb: (latex: string) => void) { this.fireCb = cb; }
  onReset(cb: () => void) { this.resetCb = cb; }

  setTurn(turn: "red" | "blue", lastEquation = "") {
    this.currentTurn = turn;
    const p = PLAYER[turn];
    document.documentElement.style.setProperty("--player-color", p.color);
    document.documentElement.style.setProperty("--player-color-dim", p.dim);

    const redHud = document.getElementById("red-hud")!;
    const blueHud = document.getElementById("blue-hud")!;

    if (turn === "red") {
      redHud.classList.remove("inactive");
      blueHud.classList.add("inactive");
      this.redFireBtn.disabled = false;
      this.blueFireBtn.disabled = true;
      this.blueInput.setLatex(lastEquation);
      this.blueInput.setEnabled(false);
      this.redInput.setEnabled(true);
      this.redInput.focus();
    } else {
      blueHud.classList.remove("inactive");
      redHud.classList.add("inactive");
      this.blueFireBtn.disabled = false;
      this.redFireBtn.disabled = true;
      this.redInput.setLatex(lastEquation);
      this.redInput.setEnabled(false);
      this.blueInput.setEnabled(true);
      this.blueInput.focus();
    }
  }

  setBusy(busy: boolean) {
    if (this.currentTurn === "red") {
      this.redFireBtn.disabled = busy;
    } else {
      this.blueFireBtn.disabled = busy;
    }
  }

  focus() {
    if (this.currentTurn === "red") {
      this.redInput.focus();
    } else {
      this.blueInput.focus();
    }
  }

  setStatus(note?: string) {
    const p = PLAYER[this.currentTurn];
    const statusEl = this.currentTurn === "red" ? this.redStatus : this.blueStatus;
    const turn = `<strong style="color:${p.color}">${p.label}'s turn</strong>`;
    const tail = note
      ? ` &middot; <span class="hint">${note}</span>`
      : ` &middot; <span class="hint">type a function in <code>x</code></span>`;
    statusEl.innerHTML = turn + tail;
  }

  showWin(winner: "red" | "blue") {
    const p = PLAYER[winner];
    this.winTitle.innerHTML = `<span style="color:${p.color}">${p.label} WINS!</span>`;
    this.winDetail.textContent = "Direct hit.";
    this.banner.hidden = false;
  }

  resetInputs() {
    this.redInput.setLatex("");
    this.blueInput.setLatex("");
  }

  hideWin() { this.banner.hidden = true; }

  updateScoreboard(red: number, blue: number, round: number, totalRounds: number): void {
    this.scoreboardText.innerHTML =
      `<span style="color:#ff4444">RED ${red}</span>` +
      ` — ` +
      `<span style="color:#4488ff">BLUE ${blue}</span>` +
      ` &middot; Round ${round}/${totalRounds}`;
  }

  showSplash(text: string): void {
    this.splashText.innerHTML = text;
    this.roundSplash.hidden = false;
  }

  hideSplash(): void {
    this.roundSplash.hidden = true;
  }

  showTutorialStep(text: string, onNext: () => void, onSkip: () => void): void {
    this.tutorialText.textContent = text;
    this.tutorialOverlay.hidden = false;

    // Remove any previous listeners by replacing the nodes.
    const nextClone = this.tutorialNext.cloneNode(true) as HTMLButtonElement;
    const skipClone = this.tutorialSkip.cloneNode(true) as HTMLButtonElement;
    this.tutorialNext.replaceWith(nextClone);
    this.tutorialSkip.replaceWith(skipClone);
    this.tutorialNext = nextClone;
    this.tutorialSkip = skipClone;

    this.tutorialNext.addEventListener("click", onNext, { once: true });
    this.tutorialSkip.addEventListener("click", onSkip, { once: true });
  }

  hideTutorial(): void {
    this.tutorialOverlay.hidden = true;
  }
}
