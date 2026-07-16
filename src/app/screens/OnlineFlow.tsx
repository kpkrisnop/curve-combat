// src/app/screens/OnlineFlow.tsx
//
// ADR-0003: OnlineFlow — arena-as-waiting-room.
// Replaces OnlineParity. Coordinates lobby → countdown → play for online matches.

import { useEffect, useRef, useCallback } from "react";
import { Icon } from "../mdiIcon";
import { mdiRefresh } from "@mdi/js";
import { ArenaStage } from "../arena/ArenaStage";
import { Footer } from "../hud/Footer";
import { IngameQuit } from "../hud/IngameQuit";
import { HudOverlays } from "../hud/Overlays";
import { hudController } from "../hud/hudStore";
import { NetworkGame } from "../../net/NetworkGame";
import { ServerClient } from "../../net/ServerClient";
import { netLobbyStore, initialNetLobbyState, bindNetworkGame } from "../net/netLobbyStore";
import { ReconnectOverlays } from "../net/ReconnectOverlays";
import { buildArenaPreview } from "../net/arenaPreview";
import { mirroredForTeam } from "../../game/viewMirror";
import { getNickname, setNickname } from "../net/nickname";
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
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

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

  // ── Config flash ref (for toggling CSS class) ─────────────────────────────
  // Attached to the lobby side panel: a guest sees its border pulse when the
  // host changes a setting. The panel is always present in the lobby (ADR-0007,
  // no gear toggle), so this is a stable target for the cue.
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
    hudController.reset();
    netLobbyStore.set(initialNetLobbyState(code));
    hudController.onReset(() => { location.hash = ""; });
    return () => {
      unwireRef.current?.();
      unwireRef.current = null;
      netRef.current?.close();
      netRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Config flash animation ────────────────────────────────────────────────
  useEffect(() => {
    if (configFlash <= prevFlashRef.current) return;
    prevFlashRef.current = configFlash;
    const el = configFlashRef.current;
    if (!el) return;
    el.classList.remove("cc-config-flash");
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add("cc-config-flash");
    const tid = setTimeout(() => el.classList.remove("cc-config-flash"), 700);
    return () => clearTimeout(tid);
  }, [configFlash]);

  // ── Preview terrain whenever config/seed changes in lobby phase ────────────
  const applyPreview = useCallback((
    cfg: PanelConfig,
    seed: number | null,
    renderer: GameRenderer,
    pls: typeof players,
    mirrored: boolean,
  ) => {
    if (seed === null) return;
    // H3 fix: pregame preview needs the same no-turn flag the live match uses
    // so isPlayerActive() (src/game/badge.ts) glows the right dot(s) before
    // any real turn has been assigned.
    renderer.setNoTurnMode(cfg.noTurn);
    // WYSIWYG lobby: a world-right (BLUE) viewer previews the arena in the exact
    // mirrored frame they will play (ADR 0008). Pressing "Switch side" changes
    // myLobbyTeam → this effect re-runs → the preview flips. Spectators (null)
    // stay canonical RED-left.
    renderer.setMirror(mirrored);
    renderer.setMap(cfg.map);
    const bounds = renderer.getEffectiveBounds();
    const counts = {
      red: Math.max(pls.filter((p) => p.team === "red").length, 1),
      blue: Math.max(pls.filter((p) => p.team === "blue").length, 1),
    };
    const layout = buildArenaPreview(cfg, seed, counts);
    const redPlayer = layout.players.find((p) => p.team === "red")!;
    const bluePlayer = layout.players.find((p) => p.team === "blue")!;

    // buildArenaPreview deals synthetic placeholder names/ids ("RED"/"r1"…) onto
    // spawn slots in team order (mirrors the server's left/right dealing) — swap
    // in the real roster names so pregame badges show actual player names.
    //
    // L1 fix: `counts` above is max(actual, 1) so spawn POSITIONS exist for a
    // future joiner even when a side is empty — but a spawn slot with no real
    // roster player must not render a dot/badge (per spec §7, only an actual
    // joined player gets a soldier dot). Drop any layout player that has no
    // matching roster entry instead of falling back to the placeholder.
    const redRoster = pls.filter((p) => p.team === "red");
    const blueRoster = pls.filter((p) => p.team === "blue");
    let ri = 0;
    let bi = 0;
    const namedPlayers = layout.players.flatMap((p) => {
      const real = p.team === "red" ? redRoster[ri++] : blueRoster[bi++];
      return real ? [{ ...p, id: real.id, name: real.name }] : [];
    });

    // Pregame preview has no real turn yet — highlight only the first red
    // player (mirrors round 1 always firing red-first) rather than the whole
    // red team (see H3 fix in src/game/badge.ts:isPlayerActive).
    const previewActivePlayerId = namedPlayers.find((p) => p.team === "red")?.id ?? null;

    renderer.setWorld(
      {
        soldier: { pos: redPlayer.pos, dir: 1 },
        bounds,
        targets: [{ id: bluePlayer.id, pos: bluePlayer.pos, radius: 0.1 }],
        planets: layout.planets,
      },
      "red",
      namedPlayers,
      { phase: "pregame", mode: cfg.mode, activePlayerId: previewActivePlayerId, scatter: cfg.scatter },
    );
  }, []);

  useEffect(() => {
    if (phase !== "lobby") return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    applyPreview(config, round1Seed, renderer, players, mirroredForTeam(myLobbyTeam));
  }, [phase, config, round1Seed, players, myLobbyTeam, applyPreview]);

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
    const { config: cfg, round1Seed: seed, players: pls, phase: ph, myId: mid } = netLobbyStore.get();
    if (ph === "lobby") {
      const myTeamNow = pls.find((p) => p.id === mid)?.team ?? null;
      applyPreview(cfg, seed, renderer, pls, mirroredForTeam(myTeamNow));
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

  // Footer's Name input fires on every keystroke — debounce the setName
  // dispatch so we don't flood the server with a message per character.
  //
  // H1 fix (layer 2): the Name input only renders during the lobby phase, but
  // a keystroke right before the host presses Start can leave this debounce
  // pending when the phase flips to 'countdown'/'play'. Guard the fire so a
  // stale send can't reach the server mid-match (belt-and-suspenders on top
  // of netLobbyStore's phase-regression guard and roomManager's locked guard).
  const onFooterNameChange = useCallback((name: string) => {
    setNickname(name); // persist locally right away; server send stays debounced
    const net = netRef.current;
    if (!net) return;
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => {
      nameDebounceRef.current = null;
      if (netLobbyStore.get().phase !== "lobby") return;
      net.sendSetName(name);
    }, 300);
  }, []);

  // Cancel any pending debounced name send the moment we leave the lobby
  // phase (host pressed Start) — don't wait for unmount, which happens much
  // later (or never, if the component stays mounted through countdown/play).
  useEffect(() => {
    if (phase === "lobby") return;
    if (nameDebounceRef.current) {
      clearTimeout(nameDebounceRef.current);
      nameDebounceRef.current = null;
    }
  }, [phase]);

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

  // The config panel is always open in the lobby and never present in-game —
  // its presence alone distinguishes the two states (ADR-0007).
  const shellClass = [
    "online-flow", "cc-layer", "arena-shell",
    isLobby ? "arena-shell--open" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClass}>
      <div className="comp map-card">
        <ArenaStage scale={scale} onReady={onReady} />
        {isPlay && !amSpectator && (
          <IngameQuit onLeave={() => { netRef.current?.sendForfeit(); hudController.requestReset(); }} />
        )}
      </div>

      {/* ── Lobby chrome ──────────────────────────────────────────────── */}
      {isLobby && (
        <>
          {/* Room code badge — out-of-flow, doesn't become a grid item */}
          <div className="net-room-code cc-card">
            <span className="net-room-code__label">Room</span>
            <span className="net-room-code__code">{roomCode}</span>
          </div>

          {/* SIDE PANEL — arena settings, always the lobby's second grid column.
              configFlashRef lives on the panel border: a guest sees it pulse
              when the host changes a setting (ADR-0007). */}
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
                <button className="cc-btn" onClick={onReroll}>
                  <Icon path={mdiRefresh} size="14px" color="currentColor" />
                  Reroll terrain
                </button>
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

          {/* FOOTER — Start (host) / Waiting… (guest), name, switch, copy */}
          <Footer
            mode="pregame-online"
            isHost={amHost}
            onStart={onStart}
            startDisabled={!bothTeamsFilled}
            name={myName}
            onNameChange={onFooterNameChange}
            onSwitchSide={onFooterSwitchSide}
            roomCode={roomCode}
            onLeave={() => hudController.requestReset()}
          />
        </>
      )}

      {/* ── Countdown chrome ──────────────────────────────────────────── */}
      {isCountdown && startAt !== null && (
        <NetCountdown startAt={startAt} />
      )}

      {/* ── Play chrome ──────────────────────────────────────────────── */}
      {/* Names + HP now live in the on-map name badges (GameRenderer), anchored
          to each soldier dot — see src/game/badge.ts. TeamStrip is retired from
          the arena; matchPlayers/matchActivePlayerId already reach the renderer
          via NetworkGame.render(), which is where those badges are drawn. */}
      {isPlay && amSpectator && (
        <>
          <div className="spectator-badge">
            Spectating · {roomCode}
          </div>
          <button
            className="cc-btn spectator-leave"
            onClick={() => { location.hash = ""; }}
          >
            Leave
          </button>
        </>
      )}

      {isPlay && !amSpectator && (
        <>
          <Footer mode="ingame" singleTeam={myTeam ?? undefined} />
          <HudOverlays />
          <ReconnectOverlays />
        </>
      )}
    </div>
  );
}
