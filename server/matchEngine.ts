// server/matchEngine.ts
import { createMatch, beginRound, skipTurn, type MatchState, type PlayerState, type Team, type RoundLayout } from "../src/game/matchState";
import { resolveFire } from "../src/game/resolveFire";
import { firstShooterNextRound, type MatchConfig } from "../src/game/matchLogic";
import { generatePlanets, computeSpawns, boundsFromMap } from "../src/sim/planetScatter";
import { shotDuration } from "../src/sim/timing";
import type { ShotResult } from "../src/sim/types";

export interface RoomPlayer { id: string; name: string; team: Team }

type FireOk = { ok: true; firerId: string; shot: ShotResult; duration: number };
type FireErr = { ok: false; code: string };

export class MatchEngine {
  private state: MatchState;
  private pending: MatchState | null = null;
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
    const spawns = computeSpawns(this.config.map, this.config.teamSize);
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

  get busy(): boolean { return this.pending !== null; }

  snapshot(): MatchState { return this.state; }

  fire(playerId: string, latex: string): FireOk | FireErr {
    if (this.busy) return { ok: false, code: "mid-animation" };
    const res = resolveFire(this.state, { playerId, latex });
    if (res.rejected) return { ok: false, code: res.rejected };
    this.pending = res.next;
    this.roundLoser = res.roundLoser ?? null;
    return { ok: true, firerId: playerId, shot: res.shot!, duration: shotDuration(res.shot!) };
  }

  /** Commit the pending shot once its duration elapses. Callers invoke this only
   *  after a successful fire() (busy === true); a no-op call returns current state. */
  resolvePending(): MatchState {
    if (this.pending) { this.state = this.pending; this.pending = null; }
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
    if (this.pending) return this.state;
    this.state = skipTurn(this.state);
    return this.state;
  }
}
