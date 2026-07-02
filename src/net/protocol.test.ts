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
});
