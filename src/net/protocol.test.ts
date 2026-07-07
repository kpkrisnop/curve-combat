// src/net/protocol.test.ts
import { describe, it, expect } from "vitest";
import { parseClientMessage, parseServerMessage, encode } from "./protocol";

describe("protocol", () => {
  it("round-trips a fireIntent client message", () => {
    const msg = { type: "fireIntent", latex: "x^2" } as const;
    expect(parseClientMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });

  it("round-trips a shotPlayback server message", () => {
    const shot = { samples: [], hit: { kind: "bounds" as const, at: { x: 0, y: 0 }, sampleIndex: 0 }, impactSlope: 0 };
    const msg = { type: "shotPlayback", firerId: "p1", shot, duration: 2 } as const;
    expect(parseServerMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });

  it("rejects an unknown client message type", () => {
    expect(() => parseClientMessage({ type: "nope" })).toThrow();
  });

  it("rejects a fireIntent missing latex", () => {
    expect(() => parseClientMessage({ type: "fireIntent" })).toThrow();
  });

  it("round-trips a reconnect client message", () => {
    const msg = { type: "reconnect", room: "WOLF", playerId: "p1", token: "tok-abc" } as const;
    expect(parseClientMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });

  it("round-trips a joined server message with token", () => {
    const msg = { type: "joined", playerId: "p1", ownerId: "p1", token: "tok-abc" } as const;
    expect(parseServerMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });

  it("round-trips a lobbyState with spectators", () => {
    const msg = {
      type: "lobbyState" as const,
      players: [{ id: "p1", name: "Ann", team: "red" as const }],
      ownerId: "p1",
      spectators: [{ id: "s1", name: "Eve" }],
    };
    expect(parseServerMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });

  it("round-trips a peerStatus server message", () => {
    const msg = { type: "peerStatus", playerId: "p1", name: "Ann", connected: false } as const;
    expect(parseServerMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });

  it("configureRoom round-trips", () => {
    const msg = { type: "configureRoom", mode: "hp", rounds: 5, noTurn: true, turnSeconds: 45 } as const;
    expect(parseClientMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });

  it("lobbyState with config round-trips", () => {
    const msg = {
      type: "lobbyState" as const,
      players: [],
      ownerId: "p1",
      spectators: [],
      config: { mode: "hp" as const, rounds: 5 as const, noTurn: false, turnSeconds: 30 },
    };
    expect(parseServerMessage(JSON.parse(encode(msg)))).toEqual(msg);
  });
});

describe("protocol v2 (NvN + arena + countdown)", () => {
  it("parses switchTeam and rerollArena client messages", () => {
    expect(parseClientMessage({ type: "switchTeam", team: "blue" }).type).toBe("switchTeam");
    expect(parseClientMessage({ type: "rerollArena" }).type).toBe("rerollArena");
    expect(() => parseClientMessage({ type: "switchTeam", team: "green" })).toThrow();
  });

  it("configureRoom accepts optional map + scatter and still accepts the old shape", () => {
    const old = { type: "configureRoom", mode: "classic", rounds: 3, noTurn: false, turnSeconds: 60 };
    expect(parseClientMessage(old).type).toBe("configureRoom");
    const withArena = {
      ...old,
      map: { width: 24, height: 14 },
      scatter: {
        rMin: 0.8, rMax: 2, gapMin: 0.5, gapMax: 2, spawnClearance: 2, fieldMargin: 0.5, maxPlanets: 12,
        spawnEdgeGap: 1, spawnBandX: 3, spawnYMargin: 1.5, spawnSeparation: 2, spawnMirror: true,
      },
    };
    const parsed = parseClientMessage(withArena);
    if (parsed.type === "configureRoom") expect(parsed.map?.width).toBe(24);
  });

  it("parses matchStarting and lobbyState with round1Seed", () => {
    expect(parseServerMessage({ type: "matchStarting", startAt: 123 }).type).toBe("matchStarting");
    const lobby = parseServerMessage({
      type: "lobbyState", players: [], ownerId: "p1", spectators: [], round1Seed: 42,
    });
    if (lobby.type === "lobbyState") expect(lobby.round1Seed).toBe(42);
  });

  it("parses a setName client message", () => {
    const msg = { type: "setName", name: "Ada" };
    expect(parseClientMessage(msg)).toEqual(msg);
  });

  it("parses a forfeit message", () => {
    expect(parseClientMessage({ type: "forfeit" })).toEqual({ type: "forfeit" });
  });
});
