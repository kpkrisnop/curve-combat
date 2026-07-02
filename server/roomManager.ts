// server/roomManager.ts
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
}

let counter = 0;
const nextId = () => `p${++counter}`;

export class RoomManager {
  private rooms = new Map<string, Room>();

  get(code: string): Room | undefined { return this.rooms.get(code); }

  join(code: string, name: string): { room: Room; playerId: string } {
    const existing = this.rooms.get(code);
    if (existing && existing.players.length >= 2) throw new Error("room full");
    let room = existing;
    const id = nextId();
    if (!room) {
      room = { code, players: [], ownerId: id, config: { mode: "classic", rounds: 3, noTurn: false, ...arenaDefaults() }, engine: null };
      this.rooms.set(code, room);
    }
    const team: Team = room.players.some((p) => p.team === "red") ? "blue" : "red";
    room.players.push({ id, name, team });
    return { room, playerId: id };
  }

  start(code: string, byPlayerId: string): MatchState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("no such room");
    if (room.ownerId !== byPlayerId) throw new Error("only the owner can start");
    room.engine = new MatchEngine(room.config, room.players);
    return room.engine.snapshot();
  }
}
