// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { netLobbyStore, initialNetLobbyState } from "../net/netLobbyStore";
import type { NetLobbyState } from "../net/netLobbyStore";
import { OnlineFlow } from "./OnlineFlow";

// ── Mock ArenaStage: immediately calls onReady with a fake renderer ────────
const fakeRenderer = {
  setMap: vi.fn(),
  getEffectiveBounds: vi.fn(() => ({ xMin: -10, xMax: 10, yMin: -8, yMax: 8 })),
  setWorld: vi.fn(),
  setNoTurnMode: vi.fn(),
  playShot: vi.fn(),
  showFloatingDamage: vi.fn(),
};

vi.mock("../arena/ArenaStage", () => ({
  ArenaStage: ({ onReady }: { onReady: (r: typeof fakeRenderer) => void }) => {
    // Call onReady synchronously so tests can inspect state immediately
    onReady(fakeRenderer);
    return <div data-testid="arena-stage" />;
  },
}));

// ── Mock NetworkGame ──────────────────────────────────────────────────────
const mockNet = {
  start: vi.fn(() => Promise.resolve()),
  close: vi.fn(),
  sendConfigure: vi.fn(),
  sendSwitchTeam: vi.fn(),
  sendReroll: vi.fn(),
  requestStart: vi.fn(),
  onLobby: vi.fn(),
  onMatchStarting: vi.fn(),
  onState: vi.fn(),
};

vi.mock("../../net/NetworkGame", () => ({
  NetworkGame: vi.fn(() => mockNet),
}));

vi.mock("../../net/ServerClient", () => ({
  ServerClient: vi.fn(() => ({})),
}));

vi.mock("../net/nickname", () => ({
  getNickname: vi.fn(() => "TestPlayer"),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function setLobbyState(patch: Partial<NetLobbyState>) {
  netLobbyStore.set({ ...initialNetLobbyState("ROOM1"), ...patch });
}

const BASE_PLAYERS = [
  { id: "r1", name: "Alice", team: "red" as const },
  { id: "b1", name: "Bob", team: "blue" as const },
];

// ── Tests ─────────────────────────────────────────────────────────────────

describe("OnlineFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    netLobbyStore.set(initialNetLobbyState("ROOM1"));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows room code in lobby phase", async () => {
    await act(async () => {
      render(<OnlineFlow code="ROOM1" />);
    });
    // Set lobby state with room code
    act(() => {
      setLobbyState({
        phase: "lobby",
        roomCode: "ROOM1",
        players: BASE_PLAYERS,
        myId: "b1",
        hostId: "r1",
        amHost: false,
        amSpectator: false,
      });
    });
    expect(screen.getByText("ROOM1")).toBeTruthy();
  });

  it("guest sees disabled fieldset (readOnly ConfigPanel)", async () => {
    await act(async () => {
      render(<OnlineFlow code="ROOM1" />);
    });
    act(() => {
      setLobbyState({
        phase: "lobby",
        roomCode: "ROOM1",
        players: BASE_PLAYERS,
        myId: "b1",
        hostId: "r1",
        amHost: false,
        amSpectator: false,
      });
    });
    // Guest ConfigPanel has readOnly → fieldset disabled
    const fieldset = document.querySelector("fieldset[disabled]");
    expect(fieldset).toBeTruthy();
    // Guest sees waiting text
    expect(screen.getByText(/Waiting for host to start/i)).toBeTruthy();
    // Guest does NOT see Start button
    expect(screen.queryByRole("button", { name: /Start Match/i })).toBeNull();
  });

  it("host sees editable drawer and Start button enabled when both teams have players", async () => {
    await act(async () => {
      render(<OnlineFlow code="ROOM1" />);
    });
    act(() => {
      setLobbyState({
        phase: "lobby",
        roomCode: "ROOM1",
        players: BASE_PLAYERS,
        myId: "r1",
        hostId: "r1",
        amHost: true,
        amSpectator: false,
      });
    });
    // Host ConfigPanel: fieldset NOT disabled
    const fieldset = document.querySelector("fieldset[disabled]");
    expect(fieldset).toBeNull();
    // Start button visible and enabled
    const startBtn = screen.getByRole("button", { name: /Start Match/i });
    expect(startBtn).toBeTruthy();
    expect((startBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("host Start button disabled when only one team has players", async () => {
    await act(async () => {
      render(<OnlineFlow code="ROOM1" />);
    });
    act(() => {
      setLobbyState({
        phase: "lobby",
        roomCode: "ROOM1",
        players: [{ id: "r1", name: "Alice", team: "red" }],
        myId: "r1",
        hostId: "r1",
        amHost: true,
        amSpectator: false,
      });
    });
    const startBtn = screen.getByRole("button", { name: /Start Match/i });
    expect((startBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("store → countdown hides Start button and shows NetCountdown", async () => {
    await act(async () => {
      render(<OnlineFlow code="ROOM1" />);
    });
    // First set lobby so Start button appears
    act(() => {
      setLobbyState({
        phase: "lobby",
        roomCode: "ROOM1",
        players: BASE_PLAYERS,
        myId: "r1",
        hostId: "r1",
        amHost: true,
        amSpectator: false,
      });
    });
    expect(screen.getByRole("button", { name: /Start Match/i })).toBeTruthy();

    // Transition to countdown
    act(() => {
      netLobbyStore.set({ phase: "countdown", startAt: Date.now() + 5000 });
    });

    // Start button gone
    expect(screen.queryByRole("button", { name: /Start Match/i })).toBeNull();
    // Countdown visible (NetCountdown renders "5" or similar)
    // The countdown num should be visible since startAt is in the future
    const countdownEl = document.querySelector(".gw-countdown-num");
    expect(countdownEl).toBeTruthy();
  });
});
