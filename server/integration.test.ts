// server/integration.test.ts
import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { createServer } from "./index";
import { encode, parseServerMessage, type ServerMessage } from "../src/net/protocol";

function open(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  return new Promise((res) => ws.on("open", () => res(ws)));
}
function next(ws: WebSocket, type: string): Promise<ServerMessage> {
  return new Promise((res) => {
    const on = (buf: Buffer) => {
      const m = parseServerMessage(JSON.parse(buf.toString()));
      if (m.type === type) { ws.off("message", on); res(m); }
    };
    ws.on("message", on);
  });
}

describe("server integration (1v1 skeleton)", () => {
  it("two clients join, owner starts, a fire yields shotPlayback then matchState", async () => {
    const port = 3400 + Math.floor(Math.random() * 200);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    a.send(encode({ type: "join", room: "TEST", name: "Ann" }));
    const aJoined = await next(a, "joined");
    b.send(encode({ type: "join", room: "TEST", name: "Bo" }));
    await next(b, "joined");

    a.send(encode({ type: "startMatch" }));
    const started = await next(a, "matchState");
    expect((started as any).state.phase).toBe("play");

    const activeId = (started as any).state.activePlayerId;
    const shooter = activeId === (aJoined as any).playerId ? a : b;
    shooter.send(encode({ type: "fireIntent", latex: "0" }));
    const playback = await next(shooter, "shotPlayback");
    expect((playback as any).duration).toBeGreaterThan(0);
    const after = await next(shooter, "matchState");
    expect(["play", "between", "over"]).toContain((after as any).state.phase);

    a.close(); b.close();
    await server.close();
  });
});
