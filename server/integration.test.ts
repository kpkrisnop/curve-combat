// server/integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { createServer } from "./index";
import { encode, parseServerMessage, type ServerMessage } from "../src/net/protocol";

function open(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  return new Promise((res) => ws.on("open", () => res(ws)));
}

function next(ws: WebSocket, type: string): Promise<ServerMessage> {
  return new Promise((res, rej) => {
    const cleanup = () => { ws.off("message", on); ws.off("close", onClose); ws.off("error", onErr); };
    const on = (buf: Buffer) => {
      const m = parseServerMessage(JSON.parse(buf.toString()));
      if (m.type === type) { cleanup(); res(m); }
    };
    const onClose = () => { cleanup(); rej(new Error(`ws closed waiting for ${type}`)); };
    const onErr = (e: Error) => { cleanup(); rej(e); };
    ws.on("message", on);
    ws.once("close", onClose);
    ws.once("error", onErr);
  });
}

describe("server integration (Phase 1 regression)", () => {
  it("two clients join, owner starts, a fire yields shotPlayback then matchState", async () => {
    const port = 3400 + Math.floor(Math.random() * 200);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    a.send(encode({ type: "join", room: "TEST", name: "Ann" }));
    const aJoined = await next(a, "joined");
    expect((aJoined as any).token).toBeTruthy();
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

describe("server integration (Phase 2)", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it("disconnect sends peerStatus{connected:false}; grace expire tears down room", async () => {
    const port = 3450 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);
    a.send(encode({ type: "join", room: "DROP", name: "Ann" })); await next(a, "joined");
    b.send(encode({ type: "join", room: "DROP", name: "Bo" }));  await next(b, "joined");
    a.send(encode({ type: "startMatch" })); await next(a, "matchState");

    const statusP = next(b, "peerStatus");
    a.close();
    const status = await statusP;
    expect((status as any).connected).toBe(false);
    expect((status as any).name).toBe("Ann");

    // Advance past 30s grace — b should receive "opponent-timed-out" error
    const errP = next(b, "error");
    vi.advanceTimersByTime(30_001);
    const err = await errP;
    expect((err as any).code).toBe("opponent-timed-out");

    b.close(); await server.close();
  });

  it("player reconnects within grace — peer gets peerStatus{connected:true} + snapshot", async () => {
    const port = 3500 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    a.send(encode({ type: "join", room: "RJN", name: "Ann" }));
    const aJoined = await next(a, "joined");
    const { playerId: aId, token: aToken } = aJoined as any;

    b.send(encode({ type: "join", room: "RJN", name: "Bo" }));
    await next(b, "joined");
    a.send(encode({ type: "startMatch" }));
    await next(a, "matchState");

    // A disconnects
    const statusDownP = next(b, "peerStatus");
    a.close();
    const statusDown = await statusDownP;
    expect((statusDown as any).connected).toBe(false);

    // A reconnects before grace expires
    const a2 = await open(port);
    a2.send(encode({ type: "reconnect", room: "RJN", playerId: aId, token: aToken }));

    const [rejoined, snap, statusUp] = await Promise.all([
      next(a2, "joined"),
      next(a2, "matchState"),
      next(b, "peerStatus"),
    ]);

    expect((rejoined as any).playerId).toBe(aId);
    expect((rejoined as any).token).not.toBe(aToken); // fresh token
    expect((snap as any).state.phase).toBe("play");
    expect((statusUp as any).connected).toBe(true);

    a2.close(); b.close(); await server.close();
  });

  it("spectator joining mid-match receives catch-up matchState", async () => {
    const port = 3550 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);
    a.send(encode({ type: "join", room: "SPEC", name: "Ann" })); await next(a, "joined");
    b.send(encode({ type: "join", room: "SPEC", name: "Bo" }));  await next(b, "joined");
    a.send(encode({ type: "startMatch" })); await next(a, "matchState");

    const s = await open(port);
    s.send(encode({ type: "join", room: "SPEC", name: "Eve", asSpectator: true }));
    const sJoined = await next(s, "joined");
    expect((sJoined as any).token).toBe(""); // spectators get empty token
    const snap = await next(s, "matchState");
    expect((snap as any).state.phase).toBe("play");

    a.close(); b.close(); s.close(); await server.close();
  });

  it("owner calling startMatch twice gets already-started error", async () => {
    const port = 3600 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);
    a.send(encode({ type: "join", room: "DBL", name: "Ann" })); await next(a, "joined");
    b.send(encode({ type: "join", room: "DBL", name: "Bo" }));  await next(b, "joined");
    a.send(encode({ type: "startMatch" })); await next(a, "matchState");
    a.send(encode({ type: "startMatch" }));
    const err = await next(a, "error");
    expect((err as any).code).toBe("already-started");

    a.close(); b.close(); await server.close();
  });

  it("spectator sending fireIntent gets not-a-player error", async () => {
    const port = 3650 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port), s = await open(port);
    a.send(encode({ type: "join", room: "SPF", name: "Ann" })); await next(a, "joined");
    b.send(encode({ type: "join", room: "SPF", name: "Bo" }));  await next(b, "joined");
    a.send(encode({ type: "startMatch" })); await next(a, "matchState");
    s.send(encode({ type: "join", room: "SPF", name: "Eve", asSpectator: true }));
    await next(s, "joined");
    await next(s, "matchState"); // catch-up snapshot
    s.send(encode({ type: "fireIntent", latex: "0" }));
    const err = await next(s, "error");
    expect((err as any).code).toBe("not-a-player");

    a.close(); b.close(); s.close(); await server.close();
  });
});
