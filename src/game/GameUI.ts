import { MathInput } from "../ui/MathInput";

const PLAYER = {
  red: { color: "#ff4444", dim: "rgba(255,68,68,0.18)", label: "RED" },
  blue: { color: "#4488ff", dim: "rgba(68,136,255,0.18)", label: "BLUE" },
} as const;

export class GameUI {
  private input: MathInput;
  private fireBtn: HTMLButtonElement;
  private status: HTMLElement;
  private banner: HTMLElement;
  private winTitle: HTMLElement;
  private winDetail: HTMLElement;
  private resetBtn: HTMLButtonElement;
  private currentTurn: "red" | "blue" = "red";

  private fireCb: ((latex: string) => void) | null = null;
  private resetCb: (() => void) | null = null;

  constructor(root: ParentNode = document) {
    const inputHost = root.querySelector<HTMLElement>("#fire-input")!;
    this.fireBtn = root.querySelector<HTMLButtonElement>("#fire-btn")!;
    this.status = root.querySelector<HTMLElement>("#game-status")!;
    this.banner = root.querySelector<HTMLElement>("#win-banner")!;
    this.winTitle = root.querySelector<HTMLElement>("#win-title")!;
    this.winDetail = root.querySelector<HTMLElement>("#win-detail")!;
    this.resetBtn = root.querySelector<HTMLButtonElement>("#reset-btn")!;

    this.input = new MathInput();
    inputHost.appendChild(this.input.el);
    this.input.reflow();

    this.input.onEnter(() => this.emitFire());
    this.fireBtn.addEventListener("click", () => this.emitFire());
    this.resetBtn.addEventListener("click", () => this.resetCb?.());
  }

  private emitFire() {
    const latex = this.input.getLatex().trim();
    if (latex) this.fireCb?.(latex);
  }

  onFire(cb: (latex: string) => void) { this.fireCb = cb; }
  onReset(cb: () => void) { this.resetCb = cb; }

  setTurn(turn: "red" | "blue") {
    this.currentTurn = turn;
    const p = PLAYER[turn];
    document.documentElement.style.setProperty("--player-color", p.color);
    document.documentElement.style.setProperty("--player-color-dim", p.dim);
  }

  setBusy(busy: boolean) {
    this.fireBtn.disabled = busy;
  }

  focus() { this.input.focus(); }
  clearInput() { this.input.setLatex(""); }

  setStatus(note?: string) {
    const p = PLAYER[this.currentTurn];
    const turn = `<strong style="color:${p.color}">${p.label}'s turn</strong>`;
    const tail = note
      ? ` &middot; <span class="hint">${note}</span>`
      : ` &middot; <span class="hint">type a function in <code>x</code></span>`;
    this.status.innerHTML = turn + tail;
  }

  showWin(winner: "red" | "blue") {
    const p = PLAYER[winner];
    this.winTitle.innerHTML = `<span style="color:${p.color}">${p.label} WINS!</span>`;
    this.winDetail.textContent = "Direct hit.";
    this.banner.hidden = false;
  }

  hideWin() { this.banner.hidden = true; }
}
