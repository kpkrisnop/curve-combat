import type { MapConfig, ScatterConfig } from "./matchLogic";

/** Dart-throw budget — not user-facing. */
export const MAX_ATTEMPTS = 300;

export const DEFAULT_MAP: MapConfig = { width: 24, height: 14 };

export const DEFAULT_SCATTER: ScatterConfig = {
  rMin: 0.8,
  rMax: 2.0,
  gapMin: 0.5,
  gapMax: 2.0,
  spawnClearance: 2.0,
  fieldMargin: 0.5,
  maxPlanets: 12,
};

export const DEFAULT_TEAM_SIZE: 1 | 2 | 3 | 4 | 5 = 1;

/** Fresh, independent copies of the arena defaults (never share references). */
export function arenaDefaults(): {
  map: MapConfig;
  scatter: ScatterConfig;
  teamSize: 1 | 2 | 3 | 4 | 5;
} {
  return {
    map: { ...DEFAULT_MAP },
    scatter: { ...DEFAULT_SCATTER },
    teamSize: DEFAULT_TEAM_SIZE,
  };
}
