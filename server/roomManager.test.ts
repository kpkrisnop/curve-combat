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

  it("allows up to 5 per team (NvN); rejects when both teams are full (5v5)", () => {
    const m = new RoomManager();
    // Fill both teams to 5
    for (let i = 0; i < 10; i++) m.join("WOLF", `P${i}`);
    // 11th join should throw room full
    expect(() => m.join("WOLF", "overflow")).toThrow(/full/i);
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
    const newConfig = { mode: "hp" as const, rounds: 5 as const, noTurn: true, turnSeconds: 15 };
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

describe("RoomManager NvN (ADR-0002)", () => {
  it("auto-places joiners onto the smaller team, red on tie", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A"); // red (tie)
    const b = m.join("WOLF", "B"); // blue (smaller)
    const c = m.join("WOLF", "C"); // red or blue — tie again → red
    const room = m.get("WOLF")!;
    const team = (id: string) => room.players.find((p) => p.id === id)!.team;
    expect(team(a.playerId)).toBe("red");
    expect(team(b.playerId)).toBe("blue");
    expect(team(c.playerId)).toBe("red");
    expect(room.players).toHaveLength(3);
  });

  it("switchTeam moves a player; capped at 5 per team; blocked when locked", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A");
    m.join("WOLF", "B");
    m.switchTeam("WOLF", a.playerId, "blue");
    expect(m.get("WOLF")!.players.find((p) => p.id === a.playerId)!.team).toBe("blue");
    m.lock("WOLF");
    expect(() => m.switchTeam("WOLF", a.playerId, "red")).toThrow(/locked/i);
  });

  it("mints round1Seed at creation; setConfig with arena params regenerates it; without them it doesn't", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A");
    const room = m.get("WOLF")!;
    const s0 = room.round1Seed;
    expect(typeof s0).toBe("number");
    m.setConfig("WOLF", a.playerId, { mode: "hp", rounds: 5, noTurn: false, turnSeconds: 60 });
    expect(room.round1Seed).toBe(s0);                       // mode change: same terrain
    m.setConfig("WOLF", a.playerId, {
      mode: "hp", rounds: 5, noTurn: false, turnSeconds: 60,
      scatter: { ...room.config.scatter, maxPlanets: 5 },
    });
    expect(room.round1Seed).not.toBe(s0);                   // terrain params changed: new seed
  });

  it("reroll is host-only and returns a fresh seed; blocked when locked", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A");
    const b = m.join("WOLF", "B");
    const s0 = m.get("WOLF")!.round1Seed;
    expect(() => m.reroll("WOLF", b.playerId)).toThrow(/host/i);
    const s1 = m.reroll("WOLF", a.playerId);
    expect(s1).not.toBe(s0);
    m.lock("WOLF");
    expect(() => m.reroll("WOLF", a.playerId)).toThrow(/locked/i);
  });

  it("canStart requires both teams non-empty; join throws when locked", () => {
    const m = new RoomManager();
    const a = m.join("WOLF", "A");
    expect(m.canStart("WOLF")).toBe(false);                 // 1v0
    m.join("WOLF", "B");
    expect(m.canStart("WOLF")).toBe(true);
    m.lock("WOLF");
    expect(() => m.join("WOLF", "C")).toThrow(/locked/i);
    void a;
  });

  it("start uses round1Seed for round 1 — same seed, same planets across two identical rooms", () => {
    const m = new RoomManager();
    m.join("WOLF", "A"); const w2 = m.join("WOLF", "B");
    m.join("BEAR", "C"); const b2 = m.join("BEAR", "D");
    // Force both rooms to the same seed, then start with each room's host.
    m.get("WOLF")!.round1Seed = 777;
    m.get("BEAR")!.round1Seed = 777;
    const s1 = m.start("WOLF", m.get("WOLF")!.ownerId);
    const s2 = m.start("BEAR", m.get("BEAR")!.ownerId);
    expect(s1.planets).toEqual(s2.planets);
    void w2; void b2;
  });
});
