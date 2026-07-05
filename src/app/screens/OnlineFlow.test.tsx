// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
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
  sendSetName: vi.fn(),
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
    // Guest sees waiting text in the footer
    expect(screen.getByText(/Waiting for host/i)).toBeTruthy();
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

  it("host sees the switch-side and copy controls in the full-width footer", async () => {
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
    expect(document.querySelector(".comp.footer")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Switch side/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy code/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy link/i })).toBeTruthy();
  });

  it("gear toggles the settings panel as a second grid column, without moving the gear", async () => {
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

    const shell = document.querySelector(".online-flow") as HTMLElement;
    const gear = screen.getByRole("button", { name: /settings/i });
    const gearClassBefore = gear.className;

    expect(document.querySelector(".comp.side-panel")).toBeTruthy();
    expect(shell.className).toContain("arena-shell--open");

    fireEvent.click(gear);
    expect(document.querySelector(".comp.side-panel")).toBeNull();
    expect(shell.className).not.toContain("arena-shell--open");
    expect(gear.className).toBe(gearClassBefore);
  });

  it("joins with the default nickname from getNickname()", async () => {
    await act(async () => {
      render(<OnlineFlow code="ROOM1" />);
    });
    expect(mockNet.start).toHaveBeenCalledWith("ROOM1", "TestPlayer");
  });

  it("debounces footer name changes before calling sendSetName", async () => {
    vi.useFakeTimers();
    render(<OnlineFlow code="ROOM1" />);
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

    const nameInput = document.querySelector(".footer-name-input") as HTMLInputElement;
    expect(nameInput).toBeTruthy();

    fireEvent.change(nameInput, { target: { value: "Alicia" } });
    expect(mockNet.sendSetName).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(mockNet.sendSetName).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mockNet.sendSetName).toHaveBeenCalledWith("Alicia");

    vi.useRealTimers();
  });

  // ── E3 regression: footer Switch side dispatch ────────────────────────────

  it("footer Switch side dispatches sendSwitchTeam for the opposite team", async () => {
    await act(async () => {
      render(<OnlineFlow code="ROOM1" />);
    });
    act(() => {
      setLobbyState({
        phase: "lobby",
        roomCode: "ROOM1",
        players: BASE_PLAYERS,
        myId: "r1", // r1 is on "red"
        hostId: "r1",
        amHost: true,
        amSpectator: false,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /Switch side/i }));
    expect(mockNet.sendSwitchTeam).toHaveBeenCalledWith("blue");
  });

  it("switching is allowed even when it would empty the source side (no min-side guard)", async () => {
    await act(async () => {
      render(<OnlineFlow code="ROOM1" />);
    });
    act(() => {
      // Sole red player — switching would leave "red" empty. Per §8 this must
      // still be allowed client-side.
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

    const switchBtn = screen.getByRole("button", { name: /Switch side/i });
    expect((switchBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(switchBtn);
    expect(mockNet.sendSwitchTeam).toHaveBeenCalledWith("blue");
  });

  // ── E3 regression: re-preview on reroll seed change ───────────────────────

  it("a lobbyState with a changed round1Seed (same players) rebuilds the arena preview", async () => {
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
        round1Seed: 111,
      });
    });

    const callsBefore = fakeRenderer.setWorld.mock.calls.length;
    expect(callsBefore).toBeGreaterThan(0);
    const firstWorld = fakeRenderer.setWorld.mock.calls[callsBefore - 1][0];

    // Simulate the server broadcasting a relayout'd lobbyState after ANY
    // roster change (join/leave/switchTeam) — same roster, new seed only.
    act(() => {
      netLobbyStore.set({ round1Seed: 222 });
    });

    expect(fakeRenderer.setWorld.mock.calls.length).toBe(callsBefore + 1);
    const secondWorld = fakeRenderer.setWorld.mock.calls[callsBefore][0];
    // Terrain (planets) is reseeded — the new preview must not be a stale copy.
    expect(secondWorld.planets).not.toEqual(firstWorld.planets);
  });

  // ── L1 regression: no ghost dot/badge for an unoccupied spawn slot ────────

  it("1 red + 0 blue preview yields exactly one soldier (no ghost badge for the empty side)", async () => {
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
        round1Seed: 111,
      });
    });

    const lastCall = fakeRenderer.setWorld.mock.calls.at(-1)!;
    const namedPlayers = lastCall[2] as Array<{ id: string; team: string }>;
    expect(namedPlayers).toHaveLength(1);
    expect(namedPlayers[0]?.team).toBe("red");
    expect(namedPlayers[0]?.id).toBe("r1");
  });

  it("1v1 preview yields exactly two soldiers, one per real roster player", async () => {
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
        round1Seed: 111,
      });
    });

    const lastCall = fakeRenderer.setWorld.mock.calls.at(-1)!;
    const namedPlayers = lastCall[2] as Array<{ id: string; team: string }>;
    expect(namedPlayers).toHaveLength(2);
    expect(namedPlayers.map((p) => p.id).sort()).toEqual(["b1", "r1"]);
  });

  // ── L2 regression: config-flash target survives settings panel collapse ──

  it("the config-flash target element (gear button) is rendered whether or not the settings panel is open", async () => {
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

    const gear = screen.getByRole("button", { name: /settings/i });
    expect(document.querySelector(".comp.side-panel")).toBeTruthy();
    expect(gear).toBeTruthy();

    fireEvent.click(gear);
    expect(document.querySelector(".comp.side-panel")).toBeNull();
    // Gear (and thus the config-flash ref target) must still be present.
    expect(screen.getByRole("button", { name: /settings/i })).toBeTruthy();
  });

  it("a config-flash increment adds the flash class to the gear button even with the panel collapsed", async () => {
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
        configFlash: 0,
      });
    });

    // Collapse the settings panel (guest closes the gear).
    const gear = screen.getByRole("button", { name: /settings/i });
    fireEvent.click(gear);
    expect(document.querySelector(".comp.side-panel")).toBeNull();

    // Host changes config → server broadcasts a bumped configFlash counter.
    act(() => {
      netLobbyStore.set({ configFlash: 1 });
    });

    const gearAfter = screen.getByRole("button", { name: /settings/i });
    expect(gearAfter.className).toContain("gw-config-flash");
  });
});
