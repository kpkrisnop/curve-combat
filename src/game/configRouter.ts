import type { MatchConfig } from "./matchLogic";
import { arenaDefaults, DEFAULT_MAP, DEFAULT_SCATTER } from "./arenaDefaults";

const DEFAULT_CONFIG: MatchConfig = {
  mode: "classic",
  rounds: 3,
  noTurn: false,
  turnSeconds: 60,
  role: "local",
  ...arenaDefaults(),
};

/** Trim trailing zeros so 2.0 → "2" (keeps hashes short and stable). */
function n(v: number): string {
  return String(Number(v.toFixed(4)));
}

/** Encode a MatchConfig into a URL hash string. */
export function configToHash(c: MatchConfig): string {
  const { map, scatter, teamSize } = c;
  const tt = c.turnSeconds ?? 60;
  return (
    `#game?mode=${c.mode}&rounds=${c.rounds}&noTurn=${c.noTurn}&tt=${tt}` +
    `&w=${n(map.width)}&h=${n(map.height)}` +
    `&rmn=${n(scatter.rMin)}&rmx=${n(scatter.rMax)}` +
    `&gmn=${n(scatter.gapMin)}&gmx=${n(scatter.gapMax)}` +
    `&sc=${n(scatter.spawnClearance)}&fm=${n(scatter.fieldMargin)}` +
    `&mp=${scatter.maxPlanets}&ts=${teamSize}`
  );
}

/** Parse a raw param to a number clamped to [min,max], falling back on garbage. */
function clampNum(raw: string | null, min: number, max: number, fallback: number): number {
  const v = Number(raw);
  if (raw === null || raw === "" || Number.isNaN(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/**
 * Parse a URL hash string into a MatchConfig.
 * Falls back to defaults for missing/invalid values. Only recognises "#game" hashes.
 */
export function parseConfigFromHash(hash: string): MatchConfig {
  if (!hash.startsWith("#game")) return { ...DEFAULT_CONFIG, ...arenaDefaults() };

  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return { ...DEFAULT_CONFIG, ...arenaDefaults() };

  const p = new URLSearchParams(hash.slice(qIdx + 1));

  const mode: MatchConfig["mode"] = p.get("mode") === "hp" ? "hp" : "classic";
  const rounds: MatchConfig["rounds"] = Number(p.get("rounds")) === 5 ? 5 : 3;
  const noTurn = p.get("noTurn") === "true";

  const map = {
    width: clampNum(p.get("w"), 8, 60, DEFAULT_MAP.width),
    height: clampNum(p.get("h"), 6, 40, DEFAULT_MAP.height),
  };
  const scatter = {
    rMin: clampNum(p.get("rmn"), 0.3, 4, DEFAULT_SCATTER.rMin),
    rMax: clampNum(p.get("rmx"), 0.3, 4, DEFAULT_SCATTER.rMax),
    gapMin: clampNum(p.get("gmn"), 0, 6, DEFAULT_SCATTER.gapMin),
    gapMax: clampNum(p.get("gmx"), 0, 6, DEFAULT_SCATTER.gapMax),
    spawnClearance: clampNum(p.get("sc"), 0, 5, DEFAULT_SCATTER.spawnClearance),
    fieldMargin: clampNum(p.get("fm"), 0, 3, DEFAULT_SCATTER.fieldMargin),
    maxPlanets: Math.round(clampNum(p.get("mp"), 1, 24, DEFAULT_SCATTER.maxPlanets)),
  };
  const teamSize = Math.round(clampNum(p.get("ts"), 1, 5, arenaDefaults().teamSize)) as 1 | 2 | 3 | 4 | 5;
  const turnSeconds = Math.round(clampNum(p.get("tt"), 15, 120, 60) / 5) * 5; // snap to 5s grid

  return { mode, rounds, noTurn, turnSeconds, role: "local", map, scatter, teamSize };
}
