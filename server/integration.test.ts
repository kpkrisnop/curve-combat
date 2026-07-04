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

  it("stale close after reconnect does not arm grace or destroy room", async () => {
    const port = 3700 + Math.floor(Math.random() * 150);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    a.send(encode({ type: "join", room: "STALE", name: "Ann" }));
    const aJoined = await next(a, "joined");
    const { playerId: aId, token: aToken } = aJoined as any;
    b.send(encode({ type: "join", room: "STALE", name: "Bo" })); await next(b, "joined");
    a.send(encode({ type: "startMatch" })); await next(a, "matchState");

    // A reconnects on a new socket BEFORE closing the old one (simulates page-refresh race).
    const a2 = await open(port);
    a2.send(encode({ type: "reconnect", room: "STALE", playerId: aId, token: aToken }));
    const rejoined = await next(a2, "joined");
    expect((rejoined as any).playerId).toBe(aId);

    // NOW close the old socket (stale close arrives after reconnect was processed).
    a.close();

    // Advance well past the 30s grace — room must NOT be destroyed.
    vi.advanceTimersByTime(35_000);
    await Promise.resolve(); // flush microtasks

    // B must NOT receive opponent-timed-out (room still alive).
    let gotTimedOut = false;
    b.on("message", (buf: Buffer) => {
      const m = parseServerMessage(JSON.parse(buf.toString()));
      if (m.type === "error" && (m as any).code === "opponent-timed-out") gotTimedOut = true;
    });
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(gotTimedOut).toBe(false);

    a2.close(); b.close(); await server.close();
  });
});

describe("server integration (Phase 4 — lobby terrain, teams, countdown)", () => {
  it("lobbyState carries round1Seed and config.map.width", async () => {
    const port = 3950 + Math.floor(Math.random() * 50);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    // Register listener on B before B sends join so we capture the broadcast
    a.send(encode({ type: "join", room: "TERR", name: "Ann" }));
    const aJoinedP = next(a, "joined");
    const aLobbyP = next(a, "lobbyState"); // from B's join broadcast
    await aJoinedP;

    const bJoinedP = next(b, "joined");
    const bLobbyP = next(b, "lobbyState");
    b.send(encode({ type: "join", room: "TERR", name: "Bo" }));
    const [, lobby] = await Promise.all([bJoinedP, bLobbyP, aLobbyP]);

    expect(typeof (lobby as any).round1Seed).toBe("number");
    expect((lobby as any).config?.map?.width).toBe(24);

    a.close(); b.close();
    await server.close();
  });

  it("switchTeam rebroadcasts lobbyState with updated team assignment", async () => {
    const port = 4000 + Math.floor(Math.random() * 50);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    // Join both players — register lobbyState listeners BEFORE sends to avoid races
    const aJoinedP = next(a, "joined");
    const aLobby1P = next(a, "lobbyState"); // A's own join
    a.send(encode({ type: "join", room: "TEAM", name: "Ann" }));
    await aJoinedP;
    await aLobby1P;

    const bJoinedP = next(b, "joined");
    const aLobby2P = next(a, "lobbyState"); // B's join broadcast to A
    const bLobby2P = next(b, "lobbyState"); // B's join broadcast to B
    b.send(encode({ type: "join", room: "TEAM", name: "Bo" }));
    const [bJoined] = await Promise.all([bJoinedP, aLobby2P, bLobby2P]);
    const bId = (bJoined as any).playerId;

    // Now switchTeam — register listeners before sending
    const aRosterP = next(a, "lobbyState");
    const bRosterP = next(b, "lobbyState");
    b.send(encode({ type: "switchTeam", team: "red" }));

    const [aRoster, bRoster] = await Promise.all([aRosterP, bRosterP]);
    const bInA = (aRoster as any).players.find((p: any) => p.id === bId);
    const bInB = (bRoster as any).players.find((p: any) => p.id === bId);
    expect(bInA?.team).toBe("red");
    expect(bInB?.team).toBe("red");

    a.close(); b.close();
    await server.close();
  });

  it("rerollArena: host changes seed; non-host gets reroll-failed error", async () => {
    const port = 4050 + Math.floor(Math.random() * 50);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    // Join A — capture A's own lobbyState
    const aJoinedP = next(a, "joined");
    const aLobby1P = next(a, "lobbyState");
    a.send(encode({ type: "join", room: "ROLL", name: "Ann" }));
    await aJoinedP;
    await aLobby1P;

    // Join B — capture lobbyState broadcast from B's join (goes to both A and B)
    const bJoinedP = next(b, "joined");
    const aLobby2P = next(a, "lobbyState");
    const bLobby2P = next(b, "lobbyState");
    b.send(encode({ type: "join", room: "ROLL", name: "Bo" }));
    const [, firstLobbyFromA] = await Promise.all([bJoinedP, aLobby2P, bLobby2P]);
    const s0 = (firstLobbyFromA as any).round1Seed as number;

    // Host rerolls — both get updated lobbyState
    const aNewP = next(a, "lobbyState");
    const bNewP = next(b, "lobbyState");
    a.send(encode({ type: "rerollArena" }));
    const [aNew] = await Promise.all([aNewP, bNewP]);
    expect((aNew as any).round1Seed).not.toBe(s0);

    // Non-host rerolls — gets error
    b.send(encode({ type: "rerollArena" }));
    const err = await next(b, "error");
    expect((err as any).code).toBe("reroll-failed");

    a.close(); b.close();
    await server.close();
  });

  it("startMatch is a countdown: matchStarting arrives before matchState", async () => {
    const port = 4100 + Math.floor(Math.random() * 50);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    // Join A
    const aJoinedP = next(a, "joined");
    const aLobby1P = next(a, "lobbyState");
    a.send(encode({ type: "join", room: "CDN", name: "Ann" }));
    await aJoinedP;
    await aLobby1P;

    // Join B — capture lobbyState with round1Seed from BOTH sockets
    const bJoinedP = next(b, "joined");
    const aLobby2P = next(a, "lobbyState");
    const bLobby2P = next(b, "lobbyState");
    b.send(encode({ type: "join", room: "CDN", name: "Bo" }));
    const [, finalLobby] = await Promise.all([bJoinedP, aLobby2P, bLobby2P]);
    const round1Seed = (finalLobby as any).round1Seed as number;

    // Register matchStarting listeners before sending startMatch
    const beforeStart = Date.now();
    const aStartingP = next(a, "matchStarting");
    const bStartingP = next(b, "matchStarting");
    a.send(encode({ type: "startMatch" }));

    const [aStarting, bStarting] = await Promise.all([aStartingP, bStartingP]);
    const startAt = (aStarting as any).startAt as number;
    expect(startAt).toBeGreaterThanOrEqual(beforeStart + 2500);
    expect(startAt).toBeLessThanOrEqual(beforeStart + 3500);
    void bStarting;

    // Wait for matchState (real 3s countdown) — register listeners before countdown fires
    const aMatchP = next(a, "matchState");
    const bMatchP = next(b, "matchState");
    const [aMatch, bMatch] = await Promise.all([aMatchP, bMatchP]);
    expect((aMatch as any).state.phase).toBe("play");
    void bMatch;

    // Verify planets match generatePlanets(round1Seed, ...)
    const { generatePlanets, computeSpawns, boundsFromMap } = await import("../src/sim/planetScatter");
    const { DEFAULT_MAP, DEFAULT_SCATTER } = await import("../src/game/arenaDefaults");
    const bounds = boundsFromMap(DEFAULT_MAP);
    const spawns = computeSpawns(DEFAULT_MAP, 1);
    const expectedPlanets = generatePlanets(round1Seed, bounds, spawns, DEFAULT_SCATTER);
    expect((aMatch as any).state.planets).toEqual(expectedPlanets);

    a.close(); b.close();
    await server.close();
  }, 8000);

  it("late joiner during countdown becomes spectator (no asSpectator flag)", async () => {
    const port = 4150 + Math.floor(Math.random() * 50);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    // Join A
    const aJoinedP = next(a, "joined");
    const aLobby1P = next(a, "lobbyState");
    a.send(encode({ type: "join", room: "LATE", name: "Ann" }));
    await aJoinedP;
    await aLobby1P;

    // Join B
    const bJoinedP = next(b, "joined");
    const aLobby2P = next(a, "lobbyState");
    const bLobby2P = next(b, "lobbyState");
    b.send(encode({ type: "join", room: "LATE", name: "Bo" }));
    await Promise.all([bJoinedP, aLobby2P, bLobby2P]);

    // Start match — register matchStarting listeners first
    const aStartingP = next(a, "matchStarting");
    a.send(encode({ type: "startMatch" }));
    await aStartingP;

    // Third client joins with no asSpectator — should become spectator
    const c = await open(port);
    const cJoinedP = next(c, "joined");
    const cLobbyP = next(c, "lobbyState");
    c.send(encode({ type: "join", room: "LATE", name: "Eve" }));
    const [cJoined, roster] = await Promise.all([cJoinedP, cLobbyP]);

    expect((cJoined as any).playerId).toBeTruthy();
    const spectIds = (roster as any).spectators.map((s: any) => s.id);
    const playerIds = (roster as any).players.map((p: any) => p.id);
    expect(spectIds).toContain((cJoined as any).playerId);
    expect(playerIds).not.toContain((cJoined as any).playerId);

    a.close(); b.close(); c.close();
    await server.close();
  });
});

describe("server integration (Phase 3)", () => {
  it("no-turn: both players can fire concurrently without mid-animation rejection", async () => {
    const port = 3850 + Math.floor(Math.random() * 100);
    const server = createServer(port);
    const a = await open(port), b = await open(port);

    // Join A — drain A's own join lobbyState
    const aJoinedP = next(a, "joined");
    const aLobby1P = next(a, "lobbyState");
    a.send(encode({ type: "join", room: "NOTURN", name: "Ann" }));
    await aJoinedP;
    await aLobby1P;

    // Join B — drain join broadcast lobbyStates
    const bJoinedP = next(b, "joined");
    const aLobby2P = next(a, "lobbyState");
    const bLobby2P = next(b, "lobbyState");
    b.send(encode({ type: "join", room: "NOTURN", name: "Bo" }));
    await Promise.all([bJoinedP, aLobby2P, bLobby2P]);

    // configureRoom then startMatch sent in order — server processes them sequentially
    // configureRoom broadcasts lobbyState; drain it before waiting for matchState
    const aConfigLobbyP = next(a, "lobbyState");
    const bConfigLobbyP = next(b, "lobbyState");
    a.send(encode({ type: "configureRoom", mode: "classic", rounds: 3, noTurn: true, turnSeconds: 60 }));
    await Promise.all([aConfigLobbyP, bConfigLobbyP]);

    // Register matchState listeners before startMatch so we don't miss matchStarting
    const aStartP = next(a, "matchState");
    const bStartP = next(b, "matchState");
    a.send(encode({ type: "startMatch" }));
    await Promise.all([aStartP, bStartP]);

    // Listen for mid-animation errors alongside the next() listeners
    let aMidAnim = false;
    let bMidAnim = false;
    const onAMsg = (buf: Buffer) => {
      const m = parseServerMessage(JSON.parse(buf.toString()));
      if (m.type === "error" && (m as any).code === "mid-animation") aMidAnim = true;
    };
    const onBMsg = (buf: Buffer) => {
      const m = parseServerMessage(JSON.parse(buf.toString()));
      if (m.type === "error" && (m as any).code === "mid-animation") bMidAnim = true;
    };
    a.on("message", onAMsg);
    b.on("message", onBMsg);

    // Register matchState listeners before firing to avoid race
    const aFinalP = next(a, "matchState");
    const bFinalP = next(b, "matchState");
    a.send(encode({ type: "fireIntent", latex: "0" }));
    b.send(encode({ type: "fireIntent", latex: "0" }));
    const [aFinal, bFinal] = await Promise.all([aFinalP, bFinalP]);

    a.off("message", onAMsg);
    b.off("message", onBMsg);

    expect(aMidAnim).toBe(false);
    expect(bMidAnim).toBe(false);
    expect(["play", "between", "over"]).toContain((aFinal as any).state.phase);
    expect(["play", "between", "over"]).toContain((bFinal as any).state.phase);

    a.close(); b.close();
    await server.close();
  }, 10000);
});
