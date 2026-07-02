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
