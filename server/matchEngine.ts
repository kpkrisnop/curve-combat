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
}
