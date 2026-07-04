// src/net/NetworkGame.test.ts
import { it, expect, vi, describe } from "vitest";
import type { ServerMessage } from "./protocol";
import type { ServerClient } from "./ServerClient";
import type { GameRenderer } from "../game/GameRenderer";
import type { GameUiPort } from "../game/GameUiPort";
import { NetworkGame } from "./NetworkGame";

// ── Minimal mock for GameRenderer ────────────────────────────────────────────
const makeRenderer = () => ({
  playShot: vi.fn(),
  showFloatingDamage: vi.fn(),
  setMap: vi.fn(),
  setWorld: vi.fn(),
});

// ── Minimal mock for GameUiPort ───────────────────────────────────────────────
const makeUi = () => ({
  setStatus: vi.fn(),
  setBusy: vi.fn(),
  setTurn: vi.fn(),
  setNoTurnMode: vi.fn(),
  updateScoreboard: vi.fn(),
  updateHp: vi.fn(),
  showWin: vi.fn(),
  onFire: vi.fn(),
});

// ── Mock ServerClient ────────────────────────────────────────────────────────
// Captures registered .on(type, handler) callbacks so we can inject messages,
// and records all .send(...) calls.
class MockServerClient {
  handlers: Map<string, ((m: ServerMessage) => void)[]> = new Map();
  sent: ServerMessage[] = [];
  connectCalled = false;

  on(type: string, handler: (m: ServerMessage) => void): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  send(msg: ServerMessage): void {
    this.sent.push(msg);
  }

  connect(): Promise<void> {
    this.connectCalled = true;
    return Promise.resolve();
  }

  setReconnectHandler(_fn: () => void): void {}
  close(): void {}

  // Helper: inject a server message to all matching handlers
  inject(msg: ServerMessage): void {
    const hs = this.handlers.get(msg.type) ?? [];
    for (const h of hs) h(msg);
  }
}

// Shared lobbyState fixture
const lobbyMsg: ServerMessage = {
  type: "lobbyState",
  players: [
    { id: "p1", name: "Alice", team: "red" },
    { id: "p2", name: "Bob",   team: "blue" },
  ],
  spectators: [{ id: "sp1", name: "Charlie" }],
  ownerId: "p1",
  round1Seed: 42,
  config: {
    mode: "hp",
    rounds: 5,
    noTurn: true,
    turnSeconds: 30,
    map: { width: 20, height: 15 },
    scatter: {
      rMin: 0.5, rMax: 2.0, gapMin: 1, gapMax: 3,
      spawnClearance: 2, fieldMargin: 1, maxPlanets: 8,
    },
  },
};

// ── Helper: build a NetworkGame backed by MockServerClient and call start() ──
async function makeGame(myId = "p1") {
  const client = new MockServerClient();
  const renderer = makeRenderer();
  const ui = makeUi();

  // Stub window/sessionStorage/document so NetworkGame doesn't crash in jsdom-free vitest
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("sessionStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      style: { cssText: "" },
      textContent: "",
      addEventListener: vi.fn(),
    })),
    body: { appendChild: vi.fn() },
  });

  const game = new NetworkGame(
    client as unknown as ServerClient,
    renderer as unknown as GameRenderer,
    ui as unknown as GameUiPort,
  );

  // Start without awaiting connect's reconnect/join logic (inject joined separately if needed)
  const startP = game.start("room1", "Alice");
  // Inject a joined message so myId is set
  client.inject({ type: "joined", playerId: myId, ownerId: "p1", token: "tok-abc" });
  await startP;

  return { game, client, renderer, ui };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("NetworkGame.onLobby", () => {
  it("fires the callback with mapped LobbySnapshot fields incl. round1Seed", async () => {
    const { game, client } = await makeGame("p2");
    const cb = vi.fn();
    game.onLobby(cb);

    client.inject(lobbyMsg);

    expect(cb).toHaveBeenCalledOnce();
    const snap = cb.mock.calls[0][0];
    expect(snap.players).toEqual(lobbyMsg.players);
    expect(snap.spectators).toEqual(lobbyMsg.spectators);
    expect(snap.hostId).toBe("p1");           // wire ownerId → hostId
    expect(snap.myId).toBe("p2");
    expect(snap.round1Seed).toBe(42);
    expect(snap.config?.mode).toBe("hp");
    expect(snap.config?.rounds).toBe(5);
    expect(snap.config?.noTurn).toBe(true);
    expect(snap.config?.turnSeconds).toBe(30);
    expect(snap.config?.map).toEqual({ width: 20, height: 15 });
  });

  it("fires for every lobbyState message", async () => {
    const { game, client } = await makeGame();
    const cb = vi.fn();
    game.onLobby(cb);

    client.inject(lobbyMsg);
    client.inject({ ...lobbyMsg, ownerId: "p2" });

    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("snapshot.myId is null if joined has not fired yet", async () => {
    const client = new MockServerClient();
    const renderer = makeRenderer();
    const ui = makeUi();

    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({ style: { cssText: "" }, textContent: "", addEventListener: vi.fn() })),
      body: { appendChild: vi.fn() },
    });

    const game = new NetworkGame(
      client as unknown as ServerClient,
      renderer as unknown as GameRenderer,
      ui as unknown as GameUiPort,
    );
    // Start but never inject joined
    game.start("room1", "Alice").catch(() => {});
    // Give the promise a tick so handlers are registered
    await Promise.resolve();

    const cb = vi.fn();
    game.onLobby(cb);
    client.inject(lobbyMsg);

    expect(cb.mock.calls[0][0].myId).toBeNull();
  });
});

describe("NetworkGame.onMatchStarting", () => {
  it("fires the callback with startAt from the matchStarting message", async () => {
    const { game, client } = await makeGame();
    const cb = vi.fn();
    game.onMatchStarting(cb);

    client.inject({ type: "matchStarting", startAt: 1_700_000_000_000 });

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0]).toBe(1_700_000_000_000);
  });

  it("does NOT mutate DOM status or start-button state", async () => {
    const { game, client, ui } = await makeGame();
    game.onMatchStarting(vi.fn());

    const callsBefore = (ui.setStatus as ReturnType<typeof vi.fn>).mock.calls.length;
    client.inject({ type: "matchStarting", startAt: Date.now() + 5000 });
    const callsAfter = (ui.setStatus as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(callsAfter).toBe(callsBefore); // onMatchStarting touches nothing
  });
});

describe("NetworkGame send helpers", () => {
  it("sendSwitchTeam sends { type: 'switchTeam', team }", async () => {
    const { game, client } = await makeGame();
    game.sendSwitchTeam("red");
    expect(client.sent.at(-1)).toEqual({ type: "switchTeam", team: "red" });
  });

  it("sendReroll sends { type: 'rerollArena' }", async () => {
    const { game, client } = await makeGame();
    game.sendReroll();
    expect(client.sent.at(-1)).toEqual({ type: "rerollArena" });
  });

  it("sendConfigure sends configureRoom with merged fields", async () => {
    const { game, client } = await makeGame();
    game.sendConfigure({ mode: "hp", rounds: 5, noTurn: true, turnSeconds: 45 });
    const last = client.sent.at(-1) as unknown as { type: string; mode: string; rounds: number; noTurn: boolean; turnSeconds: number };
    expect(last.type).toBe("configureRoom");
    expect(last.mode).toBe("hp");
    expect(last.rounds).toBe(5);
    expect(last.noTurn).toBe(true);
    expect(last.turnSeconds).toBe(45);
  });

  it("sendConfigure passes optional map and scatter through", async () => {
    const { game, client } = await makeGame();
    const map = { width: 24, height: 18 };
    const scatter = { rMin: 0.5, rMax: 2, gapMin: 1, gapMax: 3, spawnClearance: 2, fieldMargin: 1, maxPlanets: 10 };
    game.sendConfigure({ mode: "classic", rounds: 3, noTurn: false, turnSeconds: 60, map, scatter });
    const last = client.sent.at(-1) as unknown as { map: unknown; scatter: unknown };
    expect(last.map).toEqual(map);
    expect(last.scatter).toEqual(scatter);
  });

  it("requestStart sends { type: 'startMatch' }", async () => {
    const { game, client } = await makeGame();
    game.requestStart();
    expect(client.sent.at(-1)).toEqual({ type: "startMatch" });
  });
});
