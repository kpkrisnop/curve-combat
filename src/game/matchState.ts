// src/game/matchState.ts
import type { Bounds, Planet, Vec2, World } from "../sim/types";
import type { MatchConfig } from "./matchLogic";
import { HP_MAX } from "./hpLogic";
import { buildTurnQueue, nextActive } from "./turnQueue";

export type Team = "red" | "blue";
export type MatchPhase = "play" | "between" | "over";

export interface PlayerState {
  id: string;
  name: string;
  team: Team;
  pos: Vec2;
  hp: number;
  alive: boolean;
}

export interface MatchState {
  config: MatchConfig;
  players: PlayerState[];
  planets: Planet[];
  bounds: Bounds;
  /** Player ids in firing order (turn-based). */
  turnQueue: string[];
  /** Whose turn it is (turn-based); null in no-turn mode. */
  activePlayerId: string | null;
  scores: Record<Team, number>;
  round: number;
  phase: MatchPhase;
  winner: Team | null;
  /** Unix-ms deadline for the active player's turn; null when no timer is running. */
  turnDeadline: number | null;
}

/** Positions + identities for one round; HP/alive are (re)set by the lifecycle fns. */
export interface RoundLayout {
  players: PlayerState[];
  planets: Planet[];
}

/** Collision + draw radius for a player-as-target, world units. */
export const PLAYER_RADIUS = 0.1;
/** Radius of the crater carved into a planet on impact, world units. */
export const CRATER_RADIUS = 0.8;

/** Which way world x marches when a team fires: red → +x, blue → -x. */
export function teamDir(team: Team): 1 | -1 {
  return team === "red" ? 1 : -1;
}

export function playerById(state: MatchState, id: string): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

export function livingEnemies(state: MatchState, team: Team): PlayerState[] {
  return state.players.filter((p) => p.team !== team && p.alive);
}

/** The engine World as seen from one shooter: own muzzle + all living enemies as targets. */
export function worldFor(state: MatchState, shooter: PlayerState): World {
  return {
    soldier: { pos: shooter.pos, dir: teamDir(shooter.team) },
    bounds: state.bounds,
    targets: livingEnemies(state, shooter.team).map((e) => ({
      id: e.id,
      pos: e.pos,
      radius: PLAYER_RADIUS,
    })),
    planets: state.planets,
  };
}

/** Build a fresh match in the "play" phase. `firstTeam` fires first (round 1: red). */
export function createMatch(
  config: MatchConfig,
  layout: RoundLayout,
  bounds: Bounds,
  firstTeam: Team = "red",
): MatchState {
  const players = layout.players.map((p) => ({ ...p, hp: HP_MAX, alive: true }));
  const turnQueue = buildTurnQueue(players, firstTeam);
  return {
    config,
    players,
    planets: layout.planets,
    bounds,
    turnQueue,
    activePlayerId: config.noTurn ? null : (turnQueue[0] ?? null),
    scores: { red: 0, blue: 0 },
    round: 1,
    phase: "play",
    winner: null,
    turnDeadline: null,
  };
}

/**
 * Advance the active player's turn without a shot (timer-expiry skip).
 * No-op in no-turn mode or when there is no active player.
 */
export function skipTurn(state: MatchState): MatchState {
  if (state.config.noTurn || state.activePlayerId === null) return state;
  const next = nextActive(
    state.turnQueue,
    state.activePlayerId,
    (id) => state.players.find((p) => p.id === id)?.alive ?? false,
  );
  return { ...state, activePlayerId: next, turnDeadline: null };
}

/** Set up the next round: respawn everyone, install the new layout, keep scores. */
export function beginRound(
  prev: MatchState,
  layout: RoundLayout,
  firstTeam: Team,
): MatchState {
  const players = layout.players.map((p) => ({ ...p, hp: HP_MAX, alive: true }));
  const turnQueue = buildTurnQueue(players, firstTeam);
  return {
    ...prev,
    players,
    planets: layout.planets,
    turnQueue,
    activePlayerId: prev.config.noTurn ? null : (turnQueue[0] ?? null),
    round: prev.round + 1,
    phase: "play",
    winner: null,
    turnDeadline: null,
  };
}
