import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../mdiIcon";
import { mdiRefresh, mdiRestore } from "@mdi/js";
import type { MapConfig, ScatterConfig } from "../../game/matchLogic";
import { arenaDefaults } from "../../game/arenaDefaults";

export interface PanelConfig {
  mode: "classic" | "hp"; rounds: 3 | 5; noTurn: boolean; turnSeconds: number;
  map: MapConfig; scatter: ScatterConfig;
}

type ArenaPath = "map.width" | "map.height" | `scatter.${keyof ScatterConfig}`;
type ArenaSpec = [ArenaPath, string, number, number, number];

// Grouped for "dense, but calm": world → obstacles → player placement,
// instead of one flat 13-row list.
const ARENA_CLUSTERS: [string, ArenaSpec[]][] = [
  ["Field", [
    ["map.width", "map width", 8, 60, 1],
    ["map.height", "map height", 6, 40, 1],
    ["scatter.fieldMargin", "field margin", 0, 3, 0.1],
  ]],
  ["Planets", [
    ["scatter.rMin", "planet size min", 0.3, 4, 0.1],
    ["scatter.rMax", "planet size max", 0.3, 4, 0.1],
    ["scatter.gapMin", "gap min", 0, 6, 0.1],
    ["scatter.gapMax", "gap max", 0, 6, 0.1],
    ["scatter.maxPlanets", "planet count", 1, 24, 1],
  ]],
  ["Spawns", [
    ["scatter.spawnClearance", "spawn clearance", 0, 5, 0.1],
    ["scatter.spawnEdgeGap", "spawn edge gap", 0, 6, 0.1],
    ["scatter.spawnBandX", "spawn band X", 0, 8, 0.2],
    ["scatter.spawnYMargin", "spawn Y margin", 0, 5, 0.1],
    ["scatter.spawnSeparation", "spawn min separation", 0, 6, 0.1],
  ]],
];

function getPath(v: PanelConfig, path: ArenaPath): number {
  const [g, k] = path.split(".") as ["map" | "scatter", string];
  return (v[g] as unknown as Record<string, number>)[k];
}
function patchPath(v: PanelConfig, path: ArenaPath, n: number): Partial<PanelConfig> {
  const [g, k] = path.split(".") as ["map" | "scatter", string];
  return { [g]: { ...v[g], [k]: n } } as Partial<PanelConfig>;
}

const TIMER_MIN = 15, TIMER_MAX = 120;
const clampTimer = (n: number) => Math.max(TIMER_MIN, Math.min(TIMER_MAX, Math.round(n)));

/** Custom checkbox (design-system `cfg-check`): hidden input, SVG check box,
 *  inline label that brightens when on. The whole row is the hit target. */
function Check({ checked, onChange, disabled, children }: {
  checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; children: ReactNode;
}) {
  return (
    <label className="cfg-check">
      <input type="checkbox" className="cfg-check__input" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span className="cfg-check__box" aria-hidden="true">
        <svg viewBox="0 0 12 10"><path d="M1 5l3.5 3.5L11 1" /></svg>
      </span>
      <span className="cfg-check__label">{children}</span>
    </label>
  );
}

/** Editable stepper value. Draft state so typing "9" on the way to "90"
 *  isn't clamped mid-keystroke; commits clamped on blur / Enter. */
function TimerInput({ seconds, disabled, onCommit }: {
  seconds: number; disabled: boolean; onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(seconds));
  useEffect(() => { setDraft(String(seconds)); }, [seconds]);
  const commit = () => {
    const n = Number(draft);
    const next = clampTimer(Number.isFinite(n) && draft.trim() !== "" ? n : seconds);
    setDraft(String(next));
    onCommit(next);
  };
  return (
    <input className="cfg-stepper__input" type="number" inputMode="numeric"
      min={TIMER_MIN} max={TIMER_MAX} step={5} value={draft} disabled={disabled}
      aria-label="Turn timer seconds"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

interface Props {
  value: PanelConfig;
  onChange: (patch: Partial<PanelConfig>) => void;
  seed: number;
  onReroll: () => void;
  readOnly?: boolean;
  hideSeedRow?: boolean;
  simultaneousDisabled?: boolean;
}

export function ConfigPanel({ value, onChange, seed, onReroll, readOnly, hideSeedRow, simultaneousDisabled }: Props) {
  const step = (d: number) => onChange({ turnSeconds: clampTimer(value.turnSeconds + d) });
  return (
    // The surrounding .comp.side-panel is the card; no surface chrome of its
    // own, or the panel reads as a box nested inside a box.
    <div className="config-panel">
      <fieldset className="cfg-fields" disabled={readOnly}>
        <legend className="sr-only">Local match settings</legend>

        <div className="cfg-block">
          <p className="cfg-label" id="cfg-mode-label">Game Mode</p>
          <div className="cfg-segment" role="group" aria-labelledby="cfg-mode-label">
            <button type="button" className="cfg-segment__opt" aria-pressed={value.mode === "classic"}
              onClick={() => onChange({ mode: "classic" })}>Classic VS<small>One hit per round</small></button>
            <button type="button" className="cfg-segment__opt" aria-pressed={value.mode === "hp"}
              onClick={() => onChange({ mode: "hp" })}>HP Mode<small>Slope = damage</small></button>
          </div>
        </div>

        <div className="cfg-block">
          <p className="cfg-label" id="cfg-rounds-label">Rounds</p>
          <div className="cfg-segment" role="group" aria-labelledby="cfg-rounds-label">
            <button type="button" className="cfg-segment__opt" aria-pressed={value.rounds === 3}
              onClick={() => onChange({ rounds: 3 })}>Best of 3</button>
            <button type="button" className="cfg-segment__opt" aria-pressed={value.rounds === 5}
              onClick={() => onChange({ rounds: 5 })}>Best of 5</button>
          </div>
        </div>

        <Check checked={value.noTurn} onChange={(on) => onChange({ noTurn: on })} disabled={simultaneousDisabled}>
          No-Turn Mode (simultaneous fire)
        </Check>
        {simultaneousDisabled && (
          <small className="cfg-hint">not available on one device — both players would share one keypad</small>
        )}

        <div className="cfg-block">
          <p className="cfg-label">Turn Timer</p>
          <div className="cfg-timer">
            <div className={`cfg-stepper${value.noTurn ? " is-disabled" : ""}`}>
              <button type="button" className="cfg-stepper__btn" aria-label="Decrease turn timer"
                disabled={value.noTurn} onClick={() => step(-5)}>−</button>
              <span className="cfg-stepper__field">
                <TimerInput seconds={value.turnSeconds} disabled={value.noTurn}
                  onCommit={(n) => onChange({ turnSeconds: n })} />
                <span className="cfg-stepper__unit">s</span>
              </span>
              <button type="button" className="cfg-stepper__btn" aria-label="Increase turn timer"
                disabled={value.noTurn} onClick={() => step(+5)}>+</button>
            </div>
            {value.noTurn && <small className="cfg-hint">no timer</small>}
          </div>
        </div>

        <div className="cfg-block cfg-block--arena">
          <div className="cfg-arena-head">
            <p className="cfg-arena-caption">Arena — the map behind you is the real round 1</p>
            {!hideSeedRow && (
              <button type="button" className="cfg-arena-reset" aria-label="Reset arena sliders to defaults"
                onClick={() => { const { map, scatter } = arenaDefaults(); onChange({ map, scatter }); }}>
                <Icon path={mdiRestore} size="12px" color="currentColor" />
                Reset to defaults
              </button>
            )}
          </div>
          <div className="cfg-arena" data-testid="arena-controls">
            {ARENA_CLUSTERS.map(([cluster, specs]) => (
              <div className="cfg-cluster" key={cluster}>
                <p className="cfg-label">{cluster}</p>
                {specs.map(([path, label, min, max, stp]) => {
                  const v = getPath(value, path);
                  return (
                    <label key={path} className="cfg-slider">
                      <span>{label}</span>
                      <input type="range" className="cfg-range" min={min} max={max} step={stp} value={v}
                        style={{ "--fill": `${((v - min) / (max - min)) * 100}%` } as CSSProperties}
                        onChange={(e) => onChange(patchPath(value, path, Number(e.target.value)))} />
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          <Check checked={value.scatter.spawnMirror}
            onChange={(on) => onChange({ scatter: { ...value.scatter, spawnMirror: on } })}>
            Symmetrical spawns (mirror both sides)
          </Check>
        </div>

        {!hideSeedRow && (
          <div className="cfg-seed">
            <code>seed {seed}</code>
            <button type="button" className="cc-btn" onClick={onReroll}>
              <Icon path={mdiRefresh} size="14px" color="currentColor" />
              Reroll
            </button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
