// src/game/resolveFire.ts
import { fire } from "../sim/engine";
import { evaluateAll } from "../math/Context";
import { computeDamage } from "./hpLogic";
import { matchWinner } from "./matchLogic";
import { nextActive } from "./turnQueue";
import {
  type MatchState,
  type Team,
  CRATER_RADIUS,
  playerById,
  worldFor,
} from "./matchState";
import type { ShotResult } from "../sim/types";

export interface FireIntent {
  playerId: string;
  latex: string;
}

export type RejectReason =
  | "game-over"
  | "not-active"
  | "dead"
  | "unknown-player"
  | "bad-function";

export interface ShotResolution {
  /** The committed next state. Equals the input state (by reference) when `rejected` is set. */
  next: MatchState;
  shot: ShotResult | null;
  rejected?: RejectReason;
  /** HP-mode damage dealt on a target hit. */
  damage?: number;
  /** Set when this shot eliminated an enemy. */
  eliminatedId?: string;
  /** The team wiped out this shot (round loser). */
  roundLoser?: Team;
  roundEnded?: boolean;
  matchEnded?: boolean;
}

const PROBE_XS = [0, 1, -1, 2, Math.PI];

function compile(latex: string): ((x: number) => number) | null {
  const row = evaluateAll([{ id: "shot", latex }]).get("shot");
  if (row?.kind !== "curve" || !row.fn) return null;
  const fn = row.fn;
  // A function that returns only NaN is unplottable (e.g. incomplete syntax like "\sin(").
  if (!PROBE_XS.some((x) => Number.isFinite(fn(x)))) return null;
  return fn;
}

/**
 * Resolve one fire intent into the next match state. Pure: never mutates
 * `state`, and identical (state, intent) always produce identical results.
 */
export function resolveFire(state: MatchState, intent: FireIntent): ShotResolution {
  if (state.phase !== "play") return { next: state, shot: null, rejected: "game-over" };

  const shooter = playerById(state, intent.playerId);
  if (!shooter) return { next: state, shot: null, rejected: "unknown-player" };
  if (!shooter.alive) return { next: state, shot: null, rejected: "dead" };
  if (!state.config.noTurn && state.activePlayerId !== shooter.id) {
    return { next: state, shot: null, rejected: "not-active" };
  }

  const fn = compile(intent.latex);
  if (!fn) return { next: state, shot: null, rejected: "bad-function" };

  const shot = fire(worldFor(state, shooter), fn);

  let players = state.players;
  let planets = state.planets;

  // Planet impact → carve a crater (immutably).
  if (shot.hit.kind === "planet" && shot.hit.planetId) {
    const planetId = shot.hit.planetId;
    planets = planets.map((p) =>
      p.id === planetId
        ? { ...p, craters: [...p.craters, { pos: shot.hit.at, radius: CRATER_RADIUS }] }
        : p,
    );
  }

  // Target scoring is added in Tasks 4–5. For now, target/miss/planet all
  // fall through to "round continues".
  void computeDamage; // referenced fully in Task 5
  void matchWinner; //  referenced fully in Task 4

  let next: MatchState = { ...state, players, planets };

  if (!state.config.noTurn) {
    next = {
      ...next,
      activePlayerId: nextActive(state.turnQueue, shooter.id, (id) => {
        const p = players.find((q) => q.id === id);
        return !!p && p.alive;
      }),
    };
  }

  return { next, shot, roundEnded: false, matchEnded: false };
}
