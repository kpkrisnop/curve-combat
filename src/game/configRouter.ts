import type { MatchConfig } from "./matchLogic";

const DEFAULT_CONFIG: MatchConfig = {
  mode: "classic",
  rounds: 3,
  noTurn: false,
  role: "local",
};

/** Encode a MatchConfig into a URL hash string. */
export function configToHash(config: MatchConfig): string {
  return `#game?mode=${config.mode}&rounds=${config.rounds}&noTurn=${config.noTurn}`;
}

/**
 * Parse a URL hash string into a MatchConfig.
 * Falls back to defaults for missing or invalid values.
 * Only recognises hashes that start with "#game".
 */
export function parseConfigFromHash(hash: string): MatchConfig {
  if (!hash.startsWith("#game")) return { ...DEFAULT_CONFIG };

  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return { ...DEFAULT_CONFIG };

  const params = new URLSearchParams(hash.slice(qIdx + 1));

  const modeRaw = params.get("mode");
  const mode: MatchConfig["mode"] =
    modeRaw === "hp" ? "hp" : "classic";

  const roundsRaw = Number(params.get("rounds"));
  const rounds: MatchConfig["rounds"] =
    roundsRaw === 5 ? 5 : 3;

  const noTurn = params.get("noTurn") === "true";

  return { mode, rounds, noTurn, role: "local" };
}
