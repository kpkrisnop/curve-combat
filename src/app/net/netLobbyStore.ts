// src/app/net/netLobbyStore.ts
//
// Pure-logic bridge between NetworkGame's Phase-3 event surface and the React
// lobby UI. No React; no DOM; no side-effects beyond store writes.

import { createStore, type Store } from "../store";
import type { NetworkGame, LobbySnapshot } from "../../net/NetworkGame";
import type { PanelConfig } from "../screens/ConfigPanel";
import type { PlayerState } from "../../game/matchState";
import { DEFAULT_MAP, DEFAULT_SCATTER } from "../../game/arenaDefaults";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NetPhase = "connecting" | "lobby" | "countdown" | "play" | "spectating";

export interface NetLobbyState {
  phase: NetPhase;
  roomCode: string;
  myId: string | null;
  hostId: string | null;
  amHost: boolean;        // derived: myId === hostId
  amSpectator: boolean;
  players: { id: string; name: string; team: "red" | "blue" }[];
  spectators: { id: string; name: string }[];
  /** Live player states from MatchState, updated on every server matchState event. */
  matchPlayers: PlayerState[];
  /** Active player id (from MatchState.activePlayerId), for the on-map active badge. */
  matchActivePlayerId: string | null;
  config: PanelConfig;   // Phase 1's PanelConfig (mode/rounds/noTurn/turnSeconds/map/scatter)
  round1Seed: number | null;
  startAt: number | null;
  configFlash: number;   // increments on every guest-visible config change (drives the flash)
  // Peer-disconnect and forfeit notices are NOT stored here — they go straight
  // to the HUD status line (hudStore, via GameUiPort.setStatus) so there is one
  // message channel instead of a competing badge. Only `selfReconnecting` still
  // warrants an overlay, because it must BLOCK: you cannot play while you're the
  // one who is disconnected.
  selfReconnecting: boolean;
  error: string | null;
}

// ── Default initial state ─────────────────────────────────────────────────────

const DEFAULT_PANEL_CONFIG: PanelConfig = {
  mode: "classic",
  rounds: 3,
  noTurn: false,
  turnSeconds: 60,
  gridMode: "full",
  showFiredEquation: true,
  map: { ...DEFAULT_MAP },
  scatter: { ...DEFAULT_SCATTER },
};

export function initialNetLobbyState(roomCode: string): NetLobbyState {
  return {
    phase: "connecting",
    roomCode,
    myId: null,
    hostId: null,
    amHost: false,
    amSpectator: false,
    players: [],
    spectators: [],
    matchPlayers: [],
    matchActivePlayerId: null,
    config: { ...DEFAULT_PANEL_CONFIG, map: { ...DEFAULT_MAP }, scatter: { ...DEFAULT_SCATTER } },
    round1Seed: null,
    startAt: null,
    configFlash: 0,
    selfReconnecting: false,
    error: null,
  };
}

// ── Singleton store ───────────────────────────────────────────────────────────
// Initialised with an empty roomCode; caller should reset via store.set(initialNetLobbyState(code)).

export const netLobbyStore: Store<NetLobbyState> = createStore(initialNetLobbyState(""));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Coerce a LobbySnapshot's optional config into a full PanelConfig,
 * falling back to the store's current config for any missing fields.
 */
function snapshotToPanel(
  incoming: LobbySnapshot["config"],
  current: PanelConfig,
): PanelConfig {
  if (!incoming) return current;
  return {
    mode: incoming.mode,
    rounds: incoming.rounds,
    noTurn: incoming.noTurn,
    turnSeconds: incoming.turnSeconds,
    gridMode: incoming.gridMode ?? current.gridMode,
    showFiredEquation: incoming.showFiredEquation ?? current.showFiredEquation,
    map: incoming.map ?? current.map,
    scatter: incoming.scatter ?? current.scatter,
  };
}

// ── bindNetworkGame ───────────────────────────────────────────────────────────

/**
 * Wire a NetworkGame's Phase-3 event surface into the store.
 * Returns an unwire function — call it to stop updates (e.g. on unmount).
 *
 * Registers onLobby and onMatchStarting listeners.
 * NetworkGame only supports one listener per event, so the caller is
 * responsible for not binding twice on the same instance.
 */
export function bindNetworkGame(
  net: Pick<NetworkGame, "onLobby" | "onMatchStarting" | "onState">,
  _myIdProvider: () => string | null,
): () => void {
  let active = true;

  net.onState((state) => {
    if (!active) return;
    netLobbyStore.set({
      matchPlayers: state.players,
      matchActivePlayerId: state.activePlayerId,
    });
  });

  net.onLobby((snap: LobbySnapshot) => {
    if (!active) return;
    netLobbyStore.set((s) => {
      const newConfig = snapshotToPanel(snap.config, s.config);
      const configChanged =
        snap.config !== undefined &&
        JSON.stringify(newConfig) !== JSON.stringify(s.config);
      // configFlash increments only on the SECOND and subsequent snapshots when
      // config actually differs from what the store currently holds.
      const configFlash = configChanged ? s.configFlash + 1 : s.configFlash;

      const myId = snap.myId;
      const hostId = snap.hostId;
      const amHost = myId !== null && myId === hostId;
      const amSpectator = myId !== null && snap.spectators.some((sp) => sp.id === myId);

      // INVARIANT: a lobbyState must never move a client OUT of an in-progress
      // match. Phase is server-authoritative via matchStarting ('countdown')
      // and the first matchState ('play') — a late lobbyState (e.g. triggered
      // by a debounced setName that fires after the host already started the
      // match) must not regress phase back to 'lobby'. Roster/config/seed
      // still update normally regardless of phase.
      const phase = s.phase === "countdown" || s.phase === "play" ? s.phase : "lobby";

      return {
        phase,
        players: snap.players,
        spectators: snap.spectators,
        hostId,
        myId,
        amHost,
        amSpectator,
        config: newConfig,
        round1Seed: snap.round1Seed ?? null,
        configFlash,
      };
    });
  });

  net.onMatchStarting((startAt: number) => {
    if (!active) return;
    netLobbyStore.set({ phase: "countdown", startAt });
  });

  return () => { active = false; };
}
