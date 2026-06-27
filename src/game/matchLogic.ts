export interface MatchConfig {
  mode: "classic" | "hp";
  noTurn: boolean;
  rounds: 3 | 5;
  roomCode?: string;
  role?: "host" | "guest" | "local";
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
