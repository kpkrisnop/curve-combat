import { MathInput } from "../ui/MathInput";

/**
 * The shooter HUD: a single math field + Fire button, a status line, and the
 * win banner. Knows nothing about the engine — it just emits the typed LaTeX on
 * fire and renders state it is told about.
 */
export class GameUI {
  private input: MathInput;
  private fireBtn: HTMLButtonElement;
  private status: HTMLElement;
  private banner: HTMLElement;
  private winDetail: HTMLElement;
  private resetBtn: HTMLButtonElement;

  private fireCb: ((latex: string) => void) | null = null;
  private resetCb: (() => void) | null = null;

  constructor(root: ParentNode = document) {
    const inputHost = root.querySelector<HTMLElement>("#fire-input")!;
    this.fireBtn = root.querySelector<HTMLButtonElement>("#fire-btn")!;
    this.status = root.querySelector<HTMLElement>("#game-status")!;
    this.banner = root.querySelector<HTMLElement>("#win-banner")!;
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

  onFire(cb: (latex: string) => void) {
    this.fireCb = cb;
  }

  onReset(cb: () => void) {
    this.resetCb = cb;
  }

  setBusy(busy: boolean) {
    this.fireBtn.disabled = busy;
  }

  focus() {
    this.input.focus();
  }

  clearInput() {
    this.input.setLatex("");
  }

  setStatus(shots: number, targetsLeft: number, note?: string) {
    const base = `Shots: <strong>${shots}</strong> &middot; Targets left: <strong>${targetsLeft}</strong>`;
    const tail = note
      ? ` &middot; <span class="hint">${note}</span>`
      : ` &middot; <span class="hint">type a function in <code>x</code></span>`;
    this.status.innerHTML = base + tail;
  }

  showWin(shots: number) {
    this.winDetail.textContent = `Cleared in ${shots} shot${shots === 1 ? "" : "s"}.`;
    this.banner.hidden = false;
  }

  hideWin() {
    this.banner.hidden = true;
  }
}
