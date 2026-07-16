// server/roomManager.ts
import { timingSafeEqual, randomUUID } from "crypto";
import { MatchEngine, type RoomPlayer } from "./matchEngine";
import { arenaDefaults } from "../src/game/arenaDefaults";
import type { MatchConfig, MapConfig, ScatterConfig } from "../src/game/matchLogic";
import type { MatchState, Team } from "../src/game/matchState";
import { uniqueName } from "./uniqueName";

export interface Room {
  code: string;
  players: RoomPlayer[];
  ownerId: string;
  config: MatchConfig;
  engine: MatchEngine | null;
  rejoinTokens: Map<string, string>;
  graceTimers: Map<string, ReturnType<typeof setTimeout>>;
  ttlTimer: ReturnType<typeof setTimeout> | null;
  spectators: Array<{ id: string; name: string }>;
  locked: boolean;
  round1Seed: number;
}

let counter = 0;
const nextId = () => `p${++counter}`;
const TTL_MS = 10 * 60 * 1000;
const GRACE_MS = 30 * 1000;
export const LOBBY_GRACE_MS = 3000;
const TEAM_CAP = 5;

function mintSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined { return this.rooms.get(code); }

  /** Names already in use in a room (players + spectators), optionally excluding one player (for self-rename). */
  private takenNames(room: Room, excludePlayerId?: string): string[] {
    return [
      ...room.players.filter((p) => p.id !== excludePlayerId).map((p) => p.name),
      ...room.spectators.map((s) => s.name),
    ];
  }

  roundSeed(code: string): number {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    return room.round1Seed;
  }

  remove(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      if (room.ttlTimer) clearTimeout(room.ttlTimer);
      for (const h of room.graceTimers.values()) clearTimeout(h);
    }
    this.rooms.delete(code);
  }

  join(code: string, name: string): { room: Room; playerId: string; token: string } {
    const existing = this.rooms.get(code);
    let room = existing;
    const id = nextId();
    if (!room) {
      room = {
        code, players: [], ownerId: id,
        config: { mode: "classic", rounds: 3, noTurn: false, ...arenaDefaults() },
        engine: null,
        rejoinTokens: new Map(), graceTimers: new Map(),
        ttlTimer: null, spectators: [],
        locked: false,
        round1Seed: mintSeed(),
      };
      this.rooms.set(code, room);
    }
    // Guard: locked or engine running
    if (room.locked || room.engine !== null) throw new Error("room locked");
    // Guard: full (both teams at cap)
    const redCount = room.players.filter((p) => p.team === "red").length;
    const blueCount = room.players.filter((p) => p.team === "blue").length;
    const smallerTeamCount = Math.min(redCount, blueCount);
    if (smallerTeamCount >= TEAM_CAP) throw new Error("room full");
    // Auto-place onto smaller team; red on tie
    const team: Team = redCount <= blueCount ? "red" : "blue";
    const dedupedName = uniqueName(name, this.takenNames(room));
    room.players.push({ id, name: dedupedName, team });
    const token = randomUUID();
    room.rejoinTokens.set(id, token);
    this.relayout(code);
    return { room, playerId: id, token };
  }

  switchTeam(code: string, playerId: string, team: Team): void {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.locked) throw new Error("room locked");
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new Error("unknown player");
    const targetCount = room.players.filter((p) => p.team === team).length;
    if (targetCount >= TEAM_CAP) throw new Error("team full");
    player.team = team;
    this.relayout(code);
  }

  /**
   * H1 defense-in-depth: once the room is locked or the match has started,
   * setName is a safe no-op — it neither throws nor mutates the roster. A
   * late/debounced setName arriving mid-match must not churn the roster (which
   * would trigger a lobbyState broadcast a stray client could act on). Unlike
   * join/switchTeam/reroll, which throw when locked, we deliberately swallow
   * this one: a rename attempt racing the start of a match isn't an error
   * worth surfacing to the sender, it's just too late to apply.
   */
  setName(code: string, playerId: string, name: string): void {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.locked || room.engine !== null) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new Error("unknown player");
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    // takenNames excludes this player's own entry, so renaming to your own
    // current name (or a case variant of it) never collides against yourself.
    player.name = uniqueName(trimmed, this.takenNames(room, playerId));
  }

  startTTL(code: string, onExpire: () => void): void {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.ttlTimer) clearTimeout(room.ttlTimer);
    room.ttlTimer = setTimeout(() => {
      room.ttlTimer = null;
      onExpire();
    }, TTL_MS);
  }

  startGrace(code: string, playerId: string, onExpire: () => void, ms: number = GRACE_MS): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const handle = setTimeout(() => {
      room.graceTimers.delete(playerId);
      room.rejoinTokens.delete(playerId);
      onExpire();
    }, ms);
    room.graceTimers.set(playerId, handle);
  }

  cancelGrace(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const h = room.graceTimers.get(playerId);
    if (h !== undefined) { clearTimeout(h); room.graceTimers.delete(playerId); }
  }

  /**
   * Pre-match player removal (Bug B). In the lobby a disconnect is immediate:
   * the player leaves `room.players`, their grace timer + rejoin token are
   * cleared, ownership transfers to the next player in roster order if they
   * were the owner, and the room is torn down if it becomes empty. Returns
   * `{ roomGone }` so the socket layer can re-broadcast the roster or terminate
   * the dead room's sockets. No-op (`roomGone:false`) once a match has started
   * (`engine !== null`) — in-match disconnects keep the grace/reconnect path.
   */
  removeFromLobby(code: string, playerId: string): { roomGone: boolean } {
    const room = this.rooms.get(code);
    if (!room) return { roomGone: false };
    if (room.engine !== null) return { roomGone: false };
    this.cancelGrace(code, playerId);
    room.rejoinTokens.delete(playerId);
    const wasOwner = room.ownerId === playerId;
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      this.remove(code);
      return { roomGone: true };
    }
    if (wasOwner) room.ownerId = room.players[0].id;
    this.relayout(code);
    return { roomGone: false };
  }

  /**
   * In-match removal (Forfeit or grace-expired disconnect). Drops the player
   * from the roster, clears their grace/token, transfers ownership if they were
   * the owner, drives the engine's removePlayer(), and tears the room down if it
   * becomes empty. No-op (`state:null`) in the lobby — pre-match departures use
   * removeFromLobby(). Returns the new MatchState + who left for the caller to
   * broadcast.
   */
  forfeit(code: string, playerId: string): { state: MatchState | null; roomGone: boolean; removed: { name: string; team: Team } | null } {
    const room = this.rooms.get(code);
    if (!room || room.engine === null) return { state: null, roomGone: false, removed: null };
    const player = room.players.find((p) => p.id === playerId);
    const removed = player ? { name: player.name, team: player.team } : null;
    this.cancelGrace(code, playerId);
    room.rejoinTokens.delete(playerId);
    const wasOwner = room.ownerId === playerId;
    room.players = room.players.filter((p) => p.id !== playerId);
    const state = room.engine.removePlayer(playerId);
    if (room.players.length === 0) {
      this.remove(code);
      return { state, roomGone: true, removed };
    }
    if (wasOwner) room.ownerId = room.players[0].id;
    return { state, roomGone: false, removed };
  }

  rejoin(code: string, playerId: string, token: string): { room: Room; token: string } | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const stored = room.rejoinTokens.get(playerId);
    if (!stored || !safeEq(stored, token)) return null;
    this.cancelGrace(code, playerId);
    const fresh = randomUUID();
    room.rejoinTokens.set(playerId, fresh);
    return { room, token: fresh };
  }

  joinSpectator(code: string, name: string): string {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    const id = nextId();
    room.spectators.push({ id, name });
    return id;
  }

  setConfig(
    code: string,
    byPlayerId: string,
    partial: {
      mode: "classic" | "hp";
      rounds: 3 | 5;
      noTurn: boolean;
      turnSeconds: number;
      map?: MapConfig;
      scatter?: ScatterConfig;
      gridMode?: "full" | "minimal";
    },
  ): void {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.ownerId !== byPlayerId) throw new Error("only the owner can configure");
    if (room.locked) throw new Error("room locked");
    if (room.engine !== null) throw new Error("cannot configure after match starts");
    const hadMap = "map" in partial;
    const hadScatter = "scatter" in partial;
    room.config = { ...room.config, ...partial };
    if (hadMap || hadScatter) {
      room.round1Seed = mintSeed();
    }
  }

  /**
   * Picks a fresh round-1 seed so terrain + all player positions reroll to
   * match the current roster. Not host-gated — called internally on every
   * roster change (join / switchTeam / player removal). A no-op once the
   * match has started (`room.engine !== null`), since terrain is frozen
   * for an in-progress match.
   */
  relayout(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.engine !== null) return;
    room.round1Seed = mintSeed();
  }

  reroll(code: string, byPlayerId: string): number {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.ownerId !== byPlayerId) throw new Error("only the host can reroll");
    if (room.locked) throw new Error("room locked");
    if (room.engine !== null) throw new Error("cannot reroll after match starts");
    this.relayout(code);
    return room.round1Seed;
  }

  lock(code: string): void {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    room.locked = true;
  }

  canStart(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    const redCount = room.players.filter((p) => p.team === "red").length;
    const blueCount = room.players.filter((p) => p.team === "blue").length;
    return redCount >= 1 && blueCount >= 1;
  }

  start(code: string, byPlayerId: string): MatchState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.ownerId !== byPlayerId) throw new Error("only the owner can start");
    if (room.engine !== null) throw new Error("match already in progress");
    // Set teamSize to fit the larger team before building the engine
    const redCount = room.players.filter((p) => p.team === "red").length;
    const blueCount = room.players.filter((p) => p.team === "blue").length;
    room.config.teamSize = Math.min(5, Math.max(redCount, blueCount)) as 1 | 2 | 3 | 4 | 5;
    // Build seedFn: first call returns round1Seed, subsequent calls use random
    let first: number | null = room.round1Seed;
    const seedFn = (): number => {
      if (first !== null) {
        const s = first;
        first = null as never;
        return s;
      }
      return (Math.random() * 0xffffffff) >>> 0;
    };
    room.engine = new MatchEngine(room.config, room.players, seedFn);
    return room.engine.snapshot();
  }
}
