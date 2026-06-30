// src/game/matchState.ts
import type { Bounds, Planet, Vec2, World } from "../sim/types";
import type { MatchConfig } from "./matchLogic";
import { HP_MAX } from "./hpLogic";
import { buildTurnQueue } from "./turnQueue";

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
  };
}
