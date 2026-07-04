import type { MapConfig, ScatterConfig } from "../../game/matchLogic";

export interface PanelConfig {
  mode: "classic" | "hp"; rounds: 3 | 5; noTurn: boolean; turnSeconds: number;
  map: MapConfig; scatter: ScatterConfig;
}

type ArenaPath = "map.width" | "map.height" | `scatter.${keyof ScatterConfig}`;
const ARENA_SPECS: [ArenaPath, string, number, number, number][] = [
  ["map.width", "map width", 8, 60, 1],
  ["map.height", "map height", 6, 40, 1],
  ["scatter.rMin", "planet size min", 0.3, 4, 0.1],
  ["scatter.rMax", "planet size max", 0.3, 4, 0.1],
  ["scatter.gapMin", "gap min", 0, 6, 0.1],
  ["scatter.gapMax", "gap max", 0, 6, 0.1],
  ["scatter.spawnClearance", "spawn clearance", 0, 5, 0.1],
  ["scatter.fieldMargin", "field margin", 0, 3, 0.1],
  ["scatter.maxPlanets", "planet count", 1, 24, 1],
];

function getPath(v: PanelConfig, path: ArenaPath): number {
  const [g, k] = path.split(".") as ["map" | "scatter", string];
  return (v[g] as unknown as Record<string, number>)[k];
}
function patchPath(v: PanelConfig, path: ArenaPath, n: number): Partial<PanelConfig> {
  const [g, k] = path.split(".") as ["map" | "scatter", string];
  return { [g]: { ...v[g], [k]: n } } as Partial<PanelConfig>;
}

interface Props {
  value: PanelConfig;
  onChange: (patch: Partial<PanelConfig>) => void;
  seed: number;
  onReroll: () => void;
  readOnly?: boolean;
  hideSeedRow?: boolean;
}

export function ConfigPanel({ value, onChange, seed, onReroll, readOnly, hideSeedRow }: Props) {
  const step = (d: number) => onChange({ turnSeconds: Math.max(15, Math.min(120, value.turnSeconds + d)) });
  return (
    <div className="config-panel gw-card">
      <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0 }}>
        <p className="gw-label">Game Mode</p>
        <div className="cfg-row">
          <button className={`gw-card cfg-opt ${value.mode === "classic" ? "is-active" : ""}`}
            onClick={() => onChange({ mode: "classic" })}>Classic VS<small>One hit per round</small></button>
          <button className={`gw-card cfg-opt ${value.mode === "hp" ? "is-active" : ""}`}
            onClick={() => onChange({ mode: "hp" })}>HP Mode<small>Slope = damage</small></button>
        </div>

        <p className="gw-label">Rounds</p>
        <div className="cfg-row">
          <button className={`gw-card cfg-opt ${value.rounds === 3 ? "is-active" : ""}`}
            onClick={() => onChange({ rounds: 3 })}>Best of 3</button>
          <button className={`gw-card cfg-opt ${value.rounds === 5 ? "is-active" : ""}`}
            onClick={() => onChange({ rounds: 5 })}>Best of 5</button>
        </div>

        <label className="cfg-toggle">
          <input type="checkbox" checked={value.noTurn}
            onChange={(e) => onChange({ noTurn: e.target.checked })} />
          No-Turn Mode (simultaneous fire)
        </label>

        <div className="cfg-timer">
          <span className="gw-label">Turn Timer</span>
          <button className="gw-btn" onClick={() => step(-5)}>−</button>
          <span>{value.turnSeconds} s</span>
          <button className="gw-btn" onClick={() => step(+5)}>+</button>
          <small>(turn-based only · min 15 s)</small>
        </div>

        <p className="gw-label">Arena — the map behind you is the real round 1</p>
        <div className="cfg-arena" data-testid="arena-controls">
          {ARENA_SPECS.map(([path, label, min, max, stp]) => (
            <label key={path} className="cfg-slider">
              <span>{label}</span>
              <input type="range" min={min} max={max} step={stp} value={getPath(value, path)}
                onChange={(e) => onChange(patchPath(value, path, Number(e.target.value)))} />
            </label>
          ))}
        </div>
        {!hideSeedRow && (
          <div className="cfg-seed">
            <code>seed {seed}</code>
            <button className="gw-btn" onClick={onReroll}>Reroll</button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
