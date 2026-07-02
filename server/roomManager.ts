// server/roomManager.ts
import { timingSafeEqual, randomUUID } from "crypto";
import { MatchEngine, type RoomPlayer } from "./matchEngine";
import { arenaDefaults } from "../src/game/arenaDefaults";
import type { MatchConfig } from "../src/game/matchLogic";
import type { MatchState, Team } from "../src/game/matchState";

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
}

let counter = 0;
const nextId = () => `p${++counter}`;
const TTL_MS = 10 * 60 * 1000;
const GRACE_MS = 30 * 1000;

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined { return this.rooms.get(code); }

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
    if (existing && existing.players.length >= 2) throw new Error("room full");
    let room = existing;
    const id = nextId();
    if (!room) {
      room = {
        code, players: [], ownerId: id,
        config: { mode: "classic", rounds: 3, noTurn: false, ...arenaDefaults() },
        engine: null,
        rejoinTokens: new Map(), graceTimers: new Map(),
        ttlTimer: null, spectators: [],
      };
      this.rooms.set(code, room);
    }
    const team: Team = room.players.some((p) => p.team === "red") ? "blue" : "red";
    room.players.push({ id, name, team });
    const token = randomUUID();
    room.rejoinTokens.set(id, token);
    return { room, playerId: id, token };
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

  startGrace(code: string, playerId: string, onExpire: () => void): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const handle = setTimeout(() => {
      room.graceTimers.delete(playerId);
      room.rejoinTokens.delete(playerId);
      onExpire();
    }, GRACE_MS);
    room.graceTimers.set(playerId, handle);
  }

  cancelGrace(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const h = room.graceTimers.get(playerId);
    if (h !== undefined) { clearTimeout(h); room.graceTimers.delete(playerId); }
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
    partial: { mode: "classic" | "hp"; rounds: 3 | 5; noTurn: boolean; turnSeconds: number },
  ): void {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.ownerId !== byPlayerId) throw new Error("only the owner can configure");
    if (room.engine !== null) throw new Error("cannot configure after match starts");
    room.config = { ...room.config, ...partial };
  }

  start(code: string, byPlayerId: string): MatchState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.ownerId !== byPlayerId) throw new Error("only the owner can start");
    if (room.engine !== null) throw new Error("match already in progress");
    room.engine = new MatchEngine(room.config, room.players);
    return room.engine.snapshot();
  }
}
