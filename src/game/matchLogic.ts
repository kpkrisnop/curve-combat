/** Logical playfield rectangle in world units. Identical for everyone in a room. */
export interface MapConfig {
  width: number;
  height: number;
}

/** Planet rejection-sampling parameters. */
export interface ScatterConfig {
  rMin: number;
  rMax: number;
  gapMin: number;
  gapMax: number;
  spawnClearance: number;
  fieldMargin: number;
  maxPlanets: number;
  /** Distance from the map wall to the spawn zone's outer edge (world units). */
  spawnEdgeGap: number;
  /** Inward depth of the per-side spawn zone (world units). */
  spawnBandX: number;
  /** Vertical inset of the spawn zone from the top/bottom bounds (world units). */
  spawnYMargin: number;
  /** Minimum mutual distance between same-side spawns (world units). */
  spawnSeparation: number;
  /** When true, blue spawns are the mirror image of red; when false each side rolls independently. */
  spawnMirror: boolean;
}

export interface MatchConfig {
  mode: "classic" | "hp";
  noTurn: boolean;
  rounds: 3 | 5;
  turnSeconds?: number;
  roomCode?: string;
  role?: "local" | "online";
  /** Cosmetic-only: "full" grid + all labels, or "minimal" (axes + boundary
   *  labels). Never a sim input — absent means "full". */
  gridMode?: "full" | "minimal";
  /** Cosmetic-only: show the shooter's typed equation on their soldier for 5s
   *  after firing (ADR 0010). Never a sim input — absent means on. */
  showFiredEquation?: boolean;
  map: MapConfig;
  scatter: ScatterConfig;
  teamSize: 1 | 2 | 3 | 4 | 5;
}

/** Rounds a player must win to take the match. */
export function majorityNeeded(rounds: 3 | 5): number {
  return Math.ceil(rounds / 2);
}

/**
 * Returns the match winner if one player has reached majority, or null if the
 * match is still in progress. Ties are impossible with odd round counts.
 */
export function matchWinner(
  redScore: number,
  blueScore: number,
  rounds: 3 | 5,
): "red" | "blue" | null {
  const need = majorityNeeded(rounds);
  if (redScore >= need) return "red";
  if (blueScore >= need) return "blue";
  return null;
}

/**
 * The loser of the previous round shoots first next round (comeback mechanic).
 * Pass the player who LOST the round (got hit); they shoot first next round.
 */
export function firstShooterNextRound(roundLoser: "red" | "blue"): "red" | "blue" {
  return roundLoser;
}
