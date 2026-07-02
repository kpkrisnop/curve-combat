// server/roomManager.test.ts
import { describe, it, expect } from "vitest";
import { RoomManager } from "./roomManager";

describe("RoomManager", () => {
  it("first joiner owns the room and is red; second is blue", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "Ann");
    const b = m.join("WOLF", "Bo");
    const room = m.get("WOLF")!;
    expect(room.ownerId).toBe(a.playerId);
    expect(room.players.find((p) => p.id === a.playerId)!.team).toBe("red");
    expect(room.players.find((p) => p.id === b.playerId)!.team).toBe("blue");
  });

  it("only the owner can start, and start builds an engine in play phase", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "Ann");
    const b = m.join("WOLF", "Bo");
    expect(() => m.start("WOLF", b.playerId)).toThrow();
    const state = m.start("WOLF", a.playerId);
    expect(state.phase).toBe("play");
    expect(m.get("WOLF")!.engine).not.toBeNull();
  });

  it("rejects a third joiner (room full)", () => {
    const m = new RoomManager();
    m.join("WOLF", "Ann");
    m.join("WOLF", "Bo");
    expect(() => m.join("WOLF", "Cy")).toThrow(/full/i);
  });
});
