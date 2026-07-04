// src/app/screens/OnlineFlow.tsx
//
// ADR-0003: OnlineFlow — arena-as-waiting-room.
// Replaces OnlineParity. Coordinates lobby → countdown → play for online matches.

import { useEffect, useRef, useState, useCallback } from "react";
import { ArenaStage } from "../arena/ArenaStage";
import { Footer } from "../hud/Footer";
import { HudOverlays } from "../hud/Overlays";
import { TeamStrip } from "../hud/TeamStrip";
import { hudController } from "../hud/hudStore";
import { NetworkGame } from "../../net/NetworkGame";
import { ServerClient } from "../../net/ServerClient";
import { netLobbyStore, initialNetLobbyState, bindNetworkGame } from "../net/netLobbyStore";
import { ReconnectOverlays } from "../net/ReconnectOverlays";
import { buildArenaPreview } from "../net/arenaPreview";
import { getNickname } from "../net/nickname";
import { useStore } from "../store";
import { ConfigPanel } from "./ConfigPanel";
import { NetCountdown } from "./NetCountdown";
import type { GameRenderer } from "../../game/GameRenderer";
import type { PanelConfig } from "./ConfigPanel";

const WS_URL: string = (import.meta.env["VITE_WS_URL"] as string | undefined) ?? "ws://localhost:3001";

interface Props {
  code: string;
}

export function OnlineFlow({ code }: Props) {
  // ── Refs ───────────────────────────────────────────────────────────────────
  const netRef = useRef<NetworkGame | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const unwireRef = useRef<(() => void) | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  // ── Settings panel open/close state (fixed gear toggles this) ─────────────
  const [settingsOpen, setSettingsOpen] = useState(true);

  // ── Store subscriptions ────────────────────────────────────────────────────
  const phase = useStore(netLobbyStore, (s) => s.phase);
  const players = useStore(netLobbyStore, (s) => s.players);
  const myId = useStore(netLobbyStore, (s) => s.myId);
  const amHost = useStore(netLobbyStore, (s) => s.amHost);
  const amSpectator = useStore(netLobbyStore, (s) => s.amSpectator);
  const config = useStore(netLobbyStore, (s) => s.config);
  const round1Seed = useStore(netLobbyStore, (s) => s.round1Seed);
  const startAt = useStore(netLobbyStore, (s) => s.startAt);
  const configFlash = useStore(netLobbyStore, (s) => s.configFlash);
  const roomCode = useStore(netLobbyStore, (s) => s.roomCode);
  const matchPlayers = useStore(netLobbyStore, (s) => s.matchPlayers);
  const matchActivePlayerId = useStore(netLobbyStore, (s) => s.matchActivePlayerId);

  // ── Config flash ref (for toggling CSS class) ─────────────────────────────
  const configFlashRef = useRef<HTMLDivElement | null>(null);
  const prevFlashRef = useRef(0);

  // ── Team counts ────────────────────────────────────────────────────────────
  const redCount = players.filter((p) => p.team === "red").length;
  const blueCount = players.filter((p) => p.team === "blue").length;
  const bothTeamsFilled = redCount >= 1 && blueCount >= 1;

  // My roster entry in the LOBBY (distinct from `matchPlayers`-derived team below,
  // which only exists once play starts).
  const myLobbyTeam = players.find((p) => p.id === myId)?.team ?? null;
  const myName = players.find((p) => p.id === myId)?.name ?? "";

  // ── Initialize store on mount ─────────────────────────────────────────────
  useEffect(() => {
    netLobbyStore.set(initialNetLobbyState(code));
    hudController.onReset(() => { location.hash = ""; });
    return () => {
      unwireRef.current?.();
      unwireRef.current = null;
      netRef.current?.close();
      netRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Config flash animation ────────────────────────────────────────────────
  useEffect(() => {
    if (configFlash <= prevFlashRef.current) return;
    prevFlashRef.current = configFlash;
    const el = configFlashRef.current;
    if (!el) return;
    el.classList.remove("gw-config-flash");
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add("gw-config-flash");
    const tid = setTimeout(() => el.classList.remove("gw-config-flash"), 700);
    return () => clearTimeout(tid);
  }, [configFlash]);

  // ── Preview terrain whenever config/seed changes in lobby phase ────────────
  const applyPreview = useCallback((
    cfg: PanelConfig,
    seed: number | null,
    renderer: GameRenderer,
    pls: typeof players,
  ) => {
    if (seed === null) return;
    renderer.setMap(cfg.map);
    const bounds = renderer.getEffectiveBounds();
    const counts = {
      red: Math.max(pls.filter((p) => p.team === "red").length, 1),
      blue: Math.max(pls.filter((p) => p.team === "blue").length, 1),
    };
    const layout = buildArenaPreview(cfg, seed, counts);
    const redPlayer = layout.players.find((p) => p.team === "red")!;
    const bluePlayer = layout.players.find((p) => p.team === "blue")!;
    renderer.setWorld(
      {
        soldier: { pos: redPlayer.pos, dir: 1 },
        bounds,
        targets: [{ id: bluePlayer.id, pos: bluePlayer.pos, radius: 0.1 }],
        planets: layout.planets,
      },
      "red",
      redPlayer.pos,
      bluePlayer.pos,
    );
  }, []);

  useEffect(() => {
    if (phase !== "lobby") return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    applyPreview(config, round1Seed, renderer, players);
  }, [phase, config, round1Seed, players, applyPreview]);

  // ── ArenaStage onReady — called once renderer is mounted ──────────────────
  const onReady = useCallback((renderer: GameRenderer) => {
    if (startedRef.current) return;
    startedRef.current = true;
    rendererRef.current = renderer;

    const net = new NetworkGame(new ServerClient(WS_URL), renderer, hudController);
    netRef.current = net;

    const unwire = bindNetworkGame(net, () => netLobbyStore.get().myId);
    unwireRef.current = unwire;

    // The store phase flips to "play" on the first matchState — that flip lives in
    // NetworkGame's matchState handler (netLobbyStore.set({ phase: "play" })), so it's
    // server-authoritative and needs nothing wired here.
    void net.start(code, getNickname());

    // Initial preview with current store state
    const { config: cfg, round1Seed: seed, players: pls, phase: ph } = netLobbyStore.get();
    if (ph === "lobby") {
      applyPreview(cfg, seed, renderer, pls);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, applyPreview]);

  // ── Host config changes → debounced sendConfigure ─────────────────────────
  const onConfigChange = useCallback((patch: Partial<PanelConfig>) => {
    if (!amHost || !netRef.current) return;
    // Update store locally so ConfigPanel re-renders immediately
    netLobbyStore.set((s) => ({ config: { ...s.config, ...patch } }));
    const net = netRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const cfg = netLobbyStore.get().config;
      net.sendConfigure({
        mode: cfg.mode,
        rounds: cfg.rounds,
        noTurn: cfg.noTurn,
        turnSeconds: cfg.turnSeconds,
        map: cfg.map,
        scatter: cfg.scatter,
      });
    }, 250);
  }, [amHost]);

  const onReroll = useCallback(() => {
    netRef.current?.sendReroll();
  }, []);

  const onSwitchTeam = useCallback((team: "red" | "blue") => {
    netRef.current?.sendSwitchTeam(team);
  }, []);

  const onStart = useCallback(() => {
    netRef.current?.requestStart();
  }, []);

  // Footer's "⇄ Switch side" toggles to whichever team I'm not currently on.
  // Reuses the existing sendSwitchTeam dispatch (already wired) — the actual
  // setName/switchTeam re-preview coupling to A2's relayout is E2/E3's job;
  // this is just the existing switch behavior relocated into the footer.
  const onFooterSwitchSide = useCallback(() => {
    if (!myLobbyTeam) return;
    onSwitchTeam(myLobbyTeam === "red" ? "blue" : "red");
  }, [myLobbyTeam, onSwitchTeam]);

  // ── Derive my team from matchPlayers (available in play phase) ───────────
  const myTeam = matchPlayers.find((p) => p.id === myId)?.team ?? null;

  // ── Scale: 0.87 until play, 1 in play ────────────────────────────────────
  const scale = phase === "play" ? 1 : 0.87;

  const isLobby = phase === "lobby" || phase === "connecting";
  const isCountdown = phase === "countdown";
  const isPlay = phase === "play";

  const shellClass = [
    "online-flow", "gw-layer", "arena-shell",
    isLobby && settingsOpen ? "arena-shell--open" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClass}>
      <div className="comp map-card">
        <ArenaStage scale={scale} onReady={onReady} />
      </div>

      {/* ── Lobby chrome ──────────────────────────────────────────────── */}
      {isLobby && (
        <>
          {/* Room code badge — out-of-flow, doesn't become a grid item */}
          <div className="net-room-code gw-card">
            <span className="net-room-code__label">Room</span>
            <span className="net-room-code__code">{roomCode}</span>
          </div>

          {/* SIDE PANEL — arena settings, second grid column when open */}
          {settingsOpen && (
            <div className="comp side-panel" ref={configFlashRef}>
              {amHost ? (
                <>
                  <ConfigPanel
                    value={config}
                    onChange={onConfigChange}
                    seed={round1Seed ?? 0}
                    onReroll={onReroll}
                    hideSeedRow
                  />
                  <button className="gw-btn" onClick={onReroll}>Reroll terrain</button>
                </>
              ) : (
                <ConfigPanel
                  value={config}
                  onChange={() => { /* guest: no-op */ }}
                  seed={round1Seed ?? 0}
                  onReroll={() => { /* guest: no-op */ }}
                  readOnly
                  hideSeedRow
                />
              )}
            </div>
          )}

          {/* Fixed config gear — constant top-right position, pre-game only */}
          <button
            type="button"
            className="gear"
            aria-label={settingsOpen ? "Close settings" : "Open settings"}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            ⚙
          </button>

          {/* FOOTER — Start (host) / Waiting… (guest), name, switch, copy */}
          <Footer
            mode="pregame-online"
            isHost={amHost}
            onStart={onStart}
            startDisabled={!bothTeamsFilled}
            name={myName}
            onNameChange={() => { /* seam: setName dispatch lands here (E2) */ }}
            onSwitchSide={onFooterSwitchSide}
            roomCode={roomCode}
          />
        </>
      )}

      {/* ── Countdown chrome ──────────────────────────────────────────── */}
      {isCountdown && startAt !== null && (
        <NetCountdown startAt={startAt} />
      )}

      {/* ── Play chrome ──────────────────────────────────────────────── */}
      {isPlay && amSpectator && (
        <>
          <TeamStrip
            players={matchPlayers}
            myId={myId}
            activePlayerId={matchActivePlayerId}
          />
          <div className="spectator-badge">
            Spectating · {roomCode}
          </div>
          <button
            className="gw-btn spectator-leave"
            onClick={() => { location.hash = ""; }}
          >
            Leave
          </button>
        </>
      )}

      {isPlay && !amSpectator && (
        <>
          <TeamStrip
            players={matchPlayers}
            myId={myId}
            activePlayerId={matchActivePlayerId}
          />
          <Footer mode="ingame" singleTeam={myTeam ?? undefined} />
          <HudOverlays />
          <ReconnectOverlays />
        </>
      )}
    </div>
  );
}
