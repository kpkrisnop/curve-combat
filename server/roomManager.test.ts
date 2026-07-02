// server/roomManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("RoomManager Phase 2", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("join returns a non-empty token", () => {
    const m = new RoomManager();
    const { token } = m.join("WOLF", "Ann");
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
  });

  it("rejoin with valid token succeeds and returns a fresh token", () => {
    const m = new RoomManager();
    const { playerId, token } = m.join("WOLF", "Ann");
    const result = m.rejoin("WOLF", playerId, token);
    expect(result).not.toBeNull();
    expect(result!.token).toBeTruthy();
    expect(result!.token).not.toBe(token); // fresh token issued
  });

  it("rejoin with wrong token returns null", () => {
    const m = new RoomManager();
    const { playerId } = m.join("WOLF", "Ann");
    expect(m.rejoin("WOLF", playerId, "bad-token")).toBeNull();
  });

  it("rejoin after grace expires returns null", () => {
    const m = new RoomManager();
    const { playerId, token } = m.join("WOLF", "Ann");
    const onExpire = vi.fn();
    m.startGrace("WOLF", playerId, onExpire);
    vi.advanceTimersByTime(30_001);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(m.rejoin("WOLF", playerId, token)).toBeNull();
  });

  it("cancelGrace prevents the expiry callback from firing", () => {
    const m = new RoomManager();
    const { playerId } = m.join("WOLF", "Ann");
    const onExpire = vi.fn();
    m.startGrace("WOLF", playerId, onExpire);
    m.cancelGrace("WOLF", playerId);
    vi.advanceTimersByTime(30_001);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("start throws if called twice on the same room", () => {
    const m = new RoomManager();
    const { playerId: a } = m.join("WOLF", "Ann");
    m.join("WOLF", "Bo");
    m.start("WOLF", a);
    expect(() => m.start("WOLF", a)).toThrow(/already in progress/i);
  });

  it("joinSpectator adds to spectators list", () => {
    const m = new RoomManager();
    m.join("WOLF", "Ann");
    const id = m.joinSpectator("WOLF", "Eve");
    expect(id).toBeTruthy();
    expect(m.get("WOLF")!.spectators).toEqual([{ id, name: "Eve" }]);
  });

  it("TTL fires after 10 minutes", () => {
    const m = new RoomManager();
    m.join("WOLF", "Ann");
    const onExpire = vi.fn();
    m.startTTL("WOLF", onExpire);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("startTTL resets a previously running TTL", () => {
    const m = new RoomManager();
    m.join("WOLF", "Ann");
    const first = vi.fn(), second = vi.fn();
    m.startTTL("WOLF", first);
    vi.advanceTimersByTime(5 * 60 * 1000); // halfway
    m.startTTL("WOLF", second); // reset
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("remove clears TTL and grace timers", () => {
    const m = new RoomManager();
    const { playerId } = m.join("WOLF", "Ann");
    const ttlFn = vi.fn(), graceFn = vi.fn();
    m.startTTL("WOLF", ttlFn);
    m.startGrace("WOLF", playerId, graceFn);
    m.remove("WOLF");
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(ttlFn).not.toHaveBeenCalled();
    expect(graceFn).not.toHaveBeenCalled();
  });

  it("setConfig: owner can set config before match starts", () => {
    const m = new RoomManager();
    const { playerId: owner } = m.join("WOLF", "Ann");
    m.join("WOLF", "Bo");
    const newConfig = { mode: "hp" as const, rounds: 5, noTurn: true, turnSeconds: 15 };
    m.setConfig("WOLF", owner, newConfig);
    const room = m.get("WOLF")!;
    expect(room.config.mode).toBe("hp");
    expect(room.config.rounds).toBe(5);
    expect(room.config.noTurn).toBe(true);
    expect(room.config.turnSeconds).toBe(15);
  });

  it("setConfig: throws when room does not exist", () => {
    const m = new RoomManager();
    expect(() => m.setConfig("NONEXISTENT", "player", { mode: "classic", rounds: 3, noTurn: false, turnSeconds: 30 })).toThrow(/no such room/i);
  });

  it("setConfig: throws when byPlayerId is not the owner", () => {
    const m = new RoomManager();
    const { playerId: owner } = m.join("WOLF", "Ann");
    const { playerId: nonOwner } = m.join("WOLF", "Bo");
    expect(() => m.setConfig("WOLF", nonOwner, { mode: "classic", rounds: 3, noTurn: false, turnSeconds: 30 })).toThrow(/only the owner can configure/i);
  });

  it("setConfig: throws when engine is already running", () => {
    const m = new RoomManager();
    const { playerId: owner } = m.join("WOLF", "Ann");
    m.join("WOLF", "Bo");
    m.start("WOLF", owner); // start the match, engine is now active
    expect(() => m.setConfig("WOLF", owner, { mode: "hp", rounds: 5, noTurn: true, turnSeconds: 15 })).toThrow(/cannot configure after match starts/i);
  });
});
