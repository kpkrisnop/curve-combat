// src/app/net/netLobbyStore.test.ts
// TDD: tests written before implementation.
// Verifies bindNetworkGame wires LobbySnapshot → store and matchStarting → countdown.

import { describe, it, expect, beforeEach } from "vitest";
import { netLobbyStore, initialNetLobbyState, bindNetworkGame } from "./netLobbyStore";
import type { LobbySnapshot } from "../../net/NetworkGame";

// ── Stub NetworkGame ──────────────────────────────────────────────────────────
// Minimal stand-in: captures the callbacks registered via onLobby / onMatchStarting
// and exposes emit helpers for tests.
type LobbyCallback = (s: LobbySnapshot) => void;
type StartingCallback = (startAt: number) => void;

function makeStubNet() {
  let lobbyCb: LobbyCallback | null = null;
  let startingCb: StartingCallback | null = null;
  return {
    onLobby(cb: LobbyCallback) { lobbyCb = cb; },
    onMatchStarting(cb: StartingCallback) { startingCb = cb; },
    emitLobby(s: LobbySnapshot) { lobbyCb?.(s); },
    emitMatchStarting(startAt: number) { startingCb?.(startAt); },
  };
}

// ── Shared fixtures ───────────────────────────────────────────────────────────
const BASE_PLAYERS = [
  { id: "p1", name: "Alice", team: "red" as const },
  { id: "p2", name: "Bob",   team: "blue" as const },
];
const BASE_CONFIG = {
  mode: "classic" as const,
  rounds: 3 as const,
  noTurn: false,
  turnSeconds: 60,
};
const BASE_SNAPSHOT: LobbySnapshot = {
  players: BASE_PLAYERS,
  spectators: [],
  hostId: "p1",
  myId: "p2",
  config: BASE_CONFIG,
  round1Seed: 42,
};

// ── Test suite ────────────────────────────────────────────────────────────────
describe("bindNetworkGame — LobbySnapshot", () => {
  beforeEach(() => {
    // Reset store to a clean state for each test
    netLobbyStore.set(initialNetLobbyState("TEST"));
  });

  it("on first LobbySnapshot: sets phase=lobby, players, hostId, round1Seed", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "p2");

    net.emitLobby(BASE_SNAPSHOT);

    const s = netLobbyStore.get();
    expect(s.phase).toBe("lobby");
    expect(s.players).toEqual(BASE_PLAYERS);
    expect(s.hostId).toBe("p1");
    expect(s.round1Seed).toBe(42);

    unsub();
  });

  it("amHost is true when myId===hostId", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "p1"); // p1 is host

    net.emitLobby({ ...BASE_SNAPSHOT, myId: "p1" });

    expect(netLobbyStore.get().amHost).toBe(true);
    unsub();
  });

  it("amHost is false when myId!==hostId", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "p2"); // p2 is not host

    net.emitLobby(BASE_SNAPSHOT);

    expect(netLobbyStore.get().amHost).toBe(false);
    unsub();
  });

  it("amSpectator is true when myId appears in spectators", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "spec1");

    net.emitLobby({
      ...BASE_SNAPSHOT,
      myId: "spec1",
      spectators: [{ id: "spec1", name: "Watcher" }],
    });

    expect(netLobbyStore.get().amSpectator).toBe(true);
    unsub();
  });

  it("amSpectator is false when myId is not in spectators", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "p2");

    net.emitLobby(BASE_SNAPSHOT);

    expect(netLobbyStore.get().amSpectator).toBe(false);
    unsub();
  });

  it("configFlash does NOT increment on first snapshot", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "p2");

    net.emitLobby(BASE_SNAPSHOT);

    expect(netLobbyStore.get().configFlash).toBe(0);
    unsub();
  });

  it("configFlash increments when config changes on subsequent snapshot", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "p2");

    net.emitLobby(BASE_SNAPSHOT);
    const flashBefore = netLobbyStore.get().configFlash;

    // Emit again with a different mode
    net.emitLobby({ ...BASE_SNAPSHOT, config: { ...BASE_CONFIG, mode: "hp" } });

    expect(netLobbyStore.get().configFlash).toBe(flashBefore + 1);
    unsub();
  });

  it("configFlash does NOT increment when config is unchanged", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "p2");

    net.emitLobby(BASE_SNAPSHOT);
    const flashBefore = netLobbyStore.get().configFlash;

    // Emit same config again
    net.emitLobby({ ...BASE_SNAPSHOT });

    expect(netLobbyStore.get().configFlash).toBe(flashBefore);
    unsub();
  });

  it("unwire fn stops further store updates", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "p2");

    net.emitLobby(BASE_SNAPSHOT);
    unsub();

    // Emit after unwire — store should not change
    net.emitLobby({ ...BASE_SNAPSHOT, players: [] });

    expect(netLobbyStore.get().players).toEqual(BASE_PLAYERS);
  });
});

describe("bindNetworkGame — matchStarting", () => {
  beforeEach(() => {
    netLobbyStore.set(initialNetLobbyState("TEST"));
  });

  it("on matchStarting: sets phase=countdown and startAt", () => {
    const net = makeStubNet();
    const unsub = bindNetworkGame(net as never, () => "p2");

    const startAt = Date.now() + 3000;
    net.emitMatchStarting(startAt);

    const s = netLobbyStore.get();
    expect(s.phase).toBe("countdown");
    expect(s.startAt).toBe(startAt);
    unsub();
  });
});
