// server/matchEngine.ts
import { createMatch, beginRound, skipTurn, type MatchState, type PlayerState, type Team, type RoundLayout } from "../src/game/matchState";
import { resolveFire } from "../src/game/resolveFire";
import { firstShooterNextRound, matchWinner, type MatchConfig } from "../src/game/matchLogic";
import { nextActive } from "../src/game/turnQueue";
import { generatePlanets, computeSpawns, boundsFromMap } from "../src/sim/planetScatter";
import { shotDuration } from "../src/sim/timing";
import type { ShotResult } from "../src/sim/types";

export interface RoomPlayer { id: string; name: string; team: Team }

type FireOk = { ok: true; firerId: string; shot: ShotResult; duration: number };
type FireErr = { ok: false; code: string };

export class MatchEngine {
  private state: MatchState;
  private inFlight = new Map<string, string>(); // playerId → latex
  private roundLoser: Team | null = null;

  constructor(
    private config: MatchConfig,
    private players: RoomPlayer[],
    private seedFn: () => number = () => (Math.random() * 0xffffffff) >>> 0,
  ) {
    this.state = createMatch(config, this.layout(seedFn()), boundsFromMap(config.map), "red");
  }

  /** Server-authoritative round layout: mint planets from the seed, seat each RoomPlayer on a spawn column. */
  private layout(seed: number): RoundLayout {
    const bounds = boundsFromMap(this.config.map);
    const spawns = computeSpawns(this.config.map, this.config.teamSize, this.config.scatter, seed);
    const planets = generatePlanets(seed, bounds, spawns, this.config.scatter);
    const left = spawns.filter((s) => s.x < 0);
    const right = spawns.filter((s) => s.x > 0);
    let li = 0, ri = 0;
    const roster: PlayerState[] = this.players.map((p) => ({
      id: p.id, name: p.name, team: p.team,
      pos: { ...(p.team === "red" ? left[li++] : right[ri++]) },
      hp: 100, alive: true,
    }));
    return { players: roster, planets };
  }

  get busy(): boolean { return this.inFlight.size > 0; }

  snapshot(): MatchState { return this.state; }

  fire(playerId: string, latex: string): FireOk | FireErr {
    // Turn-based: any in-flight shot blocks all firing.
    // No-Turn: only this player's own in-flight shot blocks them.
    if (this.state.config.noTurn) {
      if (this.inFlight.has(playerId)) return { ok: false, code: "mid-animation" };
    } else {
      if (this.inFlight.size > 0) return { ok: false, code: "mid-animation" };
    }
    const res = resolveFire(this.state, { playerId, latex });
    if (res.rejected) return { ok: false, code: res.rejected };
    this.inFlight.set(playerId, latex);
    return { ok: true, firerId: playerId, shot: res.shot!, duration: shotDuration(res.shot!) };
  }

  /**
   * Commit one player's in-flight shot against the current live state.
   * Re-resolves the latex (same commit-against-live-state approach as local no-turn).
   * If the player is now dead or their shot is otherwise rejected, it's a no-op.
   */
  resolvePlayerShot(playerId: string): MatchState {
    const latex = this.inFlight.get(playerId);
    this.inFlight.delete(playerId);
    if (!latex) return this.state;
    const res = resolveFire(this.state, { playerId, latex });
    if (res.rejected) return this.state; // player eliminated mid-flight — shot doesn't count
    this.state = res.next;
    if (res.roundLoser) this.roundLoser = res.roundLoser;
    return this.state;
  }

  /** Start the next round after a "between" phase (loser shoots first). */
  beginNextRound(): MatchState {
    const first = this.roundLoser ? firstShooterNextRound(this.roundLoser) : "red";
    this.state = beginRound(this.state, this.layout(this.seedFn()), first);
    this.roundLoser = null;
    return this.state;
  }

  /** Skip the active player's turn (timer expiry). No-op if busy or not turn-based. */
  skipActiveTurn(): MatchState {
    if (this.inFlight.size > 0) return this.state;
    this.state = skipTurn(this.state);
    return this.state;
  }

  /**
   * Remove a player from the match for good (Forfeit or grace-expired disconnect).
   * The player leaves the engine roster (so future rounds shrink) and the live
   * state. If their Team is left with zero players the opposing Team wins the
   * Match immediately; if the removal wipes the Team's alive set for the current
   * round, that round is awarded (matchWinner may then end the Match); otherwise
   * the round continues and the active turn advances past the leaver.
   */
  removePlayer(playerId: string): MatchState {
    this.players = this.players.filter((p) => p.id !== playerId);
    this.inFlight.delete(playerId);

    const s = this.state;
    const players = s.players.filter((p) => p.id !== playerId);
    const teams: Team[] = ["red", "blue"];

    // 1) A Team with zero players → other Team wins the Match now.
    const emptyTeam = teams.find((t) => players.filter((p) => p.team === t).length === 0);
    if (emptyTeam) {
      const winner: Team = emptyTeam === "red" ? "blue" : "red";
      this.state = { ...s, players, turnQueue: s.turnQueue.filter((id) => id !== playerId), activePlayerId: null, phase: "over", winner };
      this.roundLoser = null;
      return this.state;
    }

    // 2) Team still has players but all of one Team are now not-alive → round over.
    const roundLoser = teams.find((t) => {
      const tp = players.filter((p) => p.team === t);
      return tp.length > 0 && tp.every((p) => !p.alive);
    });
    if (roundLoser) {
      const winnerTeam: Team = roundLoser === "red" ? "blue" : "red";
      const scores = { ...s.scores, [winnerTeam]: s.scores[winnerTeam] + 1 };
      const winner = matchWinner(scores.red, scores.blue, s.config.rounds);
      this.state = {
        ...s, players, turnQueue: s.turnQueue.filter((id) => id !== playerId),
        scores, phase: winner ? "over" : "between", winner,
        activePlayerId: winner ? null : s.activePlayerId,
      };
      this.roundLoser = roundLoser;
      return this.state;
    }

    // 3) Round continues. Advance the active turn if the leaver was active
    //    (compute the next id off the ORIGINAL queue so ordering is preserved).
    let activePlayerId = s.activePlayerId;
    if (activePlayerId === playerId) {
      activePlayerId = nextActive(
        s.turnQueue, playerId,
        (id) => id !== playerId && (players.find((p) => p.id === id)?.alive ?? false),
      );
    }
    this.state = { ...s, players, turnQueue: s.turnQueue.filter((id) => id !== playerId), activePlayerId };
    return this.state;
  }
}
