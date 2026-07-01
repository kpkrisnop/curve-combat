import { ArenaPreview } from "./ArenaPreview";
import { arenaDefaults } from "../../game/arenaDefaults";
import type { MapConfig, ScatterConfig } from "../../game/matchLogic";

export interface ArenaSettings {
  map: MapConfig;
  scatter: ScatterConfig;
  teamSize: 1 | 2 | 3 | 4 | 5;
}

type Path = "map.width" | "map.height" | "teamSize" | `scatter.${keyof ScatterConfig}`;

/** [key path, label, min, max, step] */
const SPECS: [Path, string, number, number, number][] = [
  ["map.width", "map width", 8, 60, 1],
  ["map.height", "map height", 6, 40, 1],
  ["scatter.rMin", "rMin", 0.3, 4, 0.1],
  ["scatter.rMax", "rMax", 0.3, 4, 0.1],
  ["scatter.gapMin", "gapMin", 0, 6, 0.1],
  ["scatter.gapMax", "gapMax", 0, 6, 0.1],
  ["scatter.spawnClearance", "spawnClearance", 0, 5, 0.1],
  ["scatter.fieldMargin", "fieldMargin", 0, 3, 0.1],
  ["scatter.maxPlanets", "maxPlanets", 1, 24, 1],
  ["teamSize", "players/team", 1, 5, 1],
];

/**
 * Modular lobby settings panel. v1 renders the Arena section (map + scatter +
 * teamSize) with a live preview. Future setting groups are added by rendering
 * another section into the same container — nothing here is game-specific.
 */
export class SettingsPanel {
  private state: ArenaSettings = arenaDefaults();
  private seed = (Math.random() * 0xffffffff) >>> 0;
  private preview: ArenaPreview;
  private inputs = new Map<Path, HTMLInputElement>();
  private valueEls = new Map<Path, HTMLElement>();
  private readout: HTMLElement;
  private seedEl: HTMLElement;

  constructor(root: ParentNode = document) {
    const canvas = root.querySelector<HTMLCanvasElement>("#arena-preview")!;
    const controls = root.querySelector<HTMLElement>("#arena-controls")!;
    this.readout = root.querySelector<HTMLElement>("#arena-readout")!;
    this.seedEl = root.querySelector<HTMLElement>("#arena-seed")!;
    this.preview = new ArenaPreview(canvas);

    for (const [path, label, min, max, step] of SPECS) {
      const wrap = document.createElement("label");
      wrap.className = "gw-field";

      const head = document.createElement("span");
      head.className = "gw-field__head";
      const cap = document.createElement("span");
      cap.textContent = label;
      const val = document.createElement("span");
      val.className = "gw-field__value";
      head.append(cap, val);

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(this.get(path));
      input.addEventListener("input", () => {
        this.set(path, +input.value);
        this.clamp();
        this.rerender();
      });

      wrap.append(head, input);
      controls.append(wrap);
      this.inputs.set(path, input);
      this.valueEls.set(path, val);
    }

    root.querySelector<HTMLButtonElement>("#arena-reroll")!.addEventListener("click", () => {
      this.seed = (Math.random() * 0xffffffff) >>> 0;
      this.rerender();
    });

    this.rerender();
  }

  getSettings(): ArenaSettings {
    return {
      map: { ...this.state.map },
      scatter: { ...this.state.scatter },
      teamSize: this.state.teamSize,
    };
  }

  private get(path: Path): number {
    if (path === "teamSize") return this.state.teamSize;
    const [grp, key] = path.split(".") as [string, string];
    return (this.state as any)[grp][key];
  }

  private set(path: Path, v: number): void {
    if (path === "teamSize") {
      this.state.teamSize = Math.round(v) as 1 | 2 | 3 | 4 | 5;
      return;
    }
    const [grp, key] = path.split(".") as [string, string];
    (this.state as any)[grp][key] = v;
  }

  /** Keep min ≤ max for the size and gap pairs. */
  private clamp(): void {
    const s = this.state.scatter;
    if (s.rMin > s.rMax) {
      s.rMax = s.rMin;
      this.inputs.get("scatter.rMax")!.value = String(s.rMax);
    }
    if (s.gapMin > s.gapMax) {
      s.gapMax = s.gapMin;
      this.inputs.get("scatter.gapMax")!.value = String(s.gapMax);
    }
  }

  private rerender(): void {
    for (const [path, el] of this.valueEls) el.textContent = String(this.get(path));
    const st = this.preview.render(this.state.map, this.state.scatter, this.state.teamSize, this.seed);
    this.seedEl.textContent = "seed " + this.seed;
    this.readout.innerHTML =
      `<span>planets ${st.placed}/${this.state.scatter.maxPlanets}</span>` +
      `<span>coverage ${st.coveragePct.toFixed(1)}%</span>` +
      `<span>attempts ${st.attempts}/300</span>`;
  }
}
