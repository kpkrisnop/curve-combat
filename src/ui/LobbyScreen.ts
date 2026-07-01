import type { MatchConfig } from "../game/matchLogic";
import { SettingsPanel } from "./settings/SettingsPanel";

export class LobbyScreen {
  private el: HTMLElement;
  private modeClassicBtn: HTMLButtonElement;
  private modeHpBtn: HTMLButtonElement;
  private rounds3Btn: HTMLButtonElement;
  private rounds5Btn: HTMLButtonElement;
  private startLocalBtn: HTMLButtonElement;
  private noTurnCheckbox: HTMLInputElement;
  private settings: SettingsPanel;

  private selectedMode: MatchConfig["mode"] = "classic";
  private selectedRounds: 3 | 5 = 3;

  private startCb: ((config: MatchConfig) => void) | null = null;

  constructor(root: ParentNode = document) {
    this.el = root.querySelector<HTMLElement>("#lobby-screen")!;
    this.settings = new SettingsPanel(root);
    this.modeClassicBtn = root.querySelector<HTMLButtonElement>("#lobby-mode-classic")!;
    this.modeHpBtn = root.querySelector<HTMLButtonElement>("#lobby-mode-hp")!;
    this.rounds3Btn = root.querySelector<HTMLButtonElement>("#lobby-rounds-3")!;
    this.rounds5Btn = root.querySelector<HTMLButtonElement>("#lobby-rounds-5")!;
    this.startLocalBtn = root.querySelector<HTMLButtonElement>("#lobby-start-local")!;
    this.noTurnCheckbox = root.querySelector<HTMLInputElement>("#lobby-noturn")!;

    this.modeClassicBtn.addEventListener("click", () => this.selectMode("classic"));
    this.modeHpBtn.addEventListener("click", () => this.selectMode("hp"));
    this.rounds3Btn.addEventListener("click", () => this.selectRounds(3));
    this.rounds5Btn.addEventListener("click", () => this.selectRounds(5));
    this.startLocalBtn.addEventListener("click", () => this.handleStart());
  }

  onStart(cb: (config: MatchConfig) => void): void {
    this.startCb = cb;
  }

  show(): void {
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }

  private selectMode(mode: MatchConfig["mode"]): void {
    this.selectedMode = mode;
    this.modeClassicBtn.classList.toggle("is-active", mode === "classic");
    this.modeHpBtn.classList.toggle("is-active", mode === "hp");
  }

  private selectRounds(rounds: 3 | 5): void {
    this.selectedRounds = rounds;
    this.rounds3Btn.classList.toggle("is-active", rounds === 3);
    this.rounds5Btn.classList.toggle("is-active", rounds === 5);
  }

  private handleStart(): void {
    const config: MatchConfig = {
      mode: this.selectedMode,
      rounds: this.selectedRounds,
      noTurn: this.noTurnCheckbox.checked,
      role: "local",
      ...this.settings.getSettings(),
    };
    this.startCb?.(config);
  }
}
