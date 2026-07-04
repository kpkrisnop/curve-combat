import { useRef, useState } from "react";
import type { MatchConfig } from "../../game/matchLogic";
import { LocalGame } from "../../game/LocalGame";
import type { GameRenderer } from "../../game/GameRenderer";
import { configToHash } from "../../game/configRouter";
import { hudController } from "../hud/hudStore";
import { ArenaStage } from "../arena/ArenaStage";
import { Footer } from "../hud/Footer";
import { HudOverlays } from "../hud/Overlays";
import { ConfigPanel, type PanelConfig } from "./ConfigPanel";
import { CountdownOverlay } from "./CountdownOverlay";

type Phase = "config" | "countdown" | "play";
const newSeed = () => (Math.random() * 0xffffffff) >>> 0;

interface Props {
  initial: MatchConfig;
  autostart?: boolean;      // direct #game?… URL: skip config, straight to countdown
}

export function LocalFlow({ initial, autostart = false }: Props) {
  const [phase, setPhase] = useState<Phase>(autostart ? "countdown" : "config");
  const [config, setConfig] = useState<PanelConfig>({
    mode: initial.mode, rounds: initial.rounds, noTurn: initial.noTurn,
    turnSeconds: initial.turnSeconds ?? 60, map: initial.map, scatter: initial.scatter,
  });
  const [seed, setSeed] = useState(newSeed);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const gameRef = useRef<LocalGame | null>(null);

  const toMatchConfig = (c: PanelConfig): MatchConfig =>
    ({ ...c, role: "local", teamSize: 1 });

  const applyPreview = (c: PanelConfig, s: number) => {
    gameRef.current?.preview(toMatchConfig(c), s);
  };

  const onReady = (renderer: GameRenderer) => {
    if (!gameRef.current) {
      const g = new LocalGame(renderer, hudController);
      hudController.onReset(() => { g.dispose(); gameRef.current = null; location.hash = ""; });
      gameRef.current = g;
    }
    applyPreview(config, seed);
  };

  const onChange = (patch: Partial<PanelConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    applyPreview(next, seed);
  };

  const onReroll = () => {
    const s = newSeed();
    setSeed(s);
    applyPreview(config, s);
  };

  const onStart = () => {
    history.pushState(null, "", configToHash(toMatchConfig(config)));
    setPhase("countdown");
  };

  const onCountdownDone = () => {
    setPhase("play");
    gameRef.current?.begin();
  };

  const shellClass = [
    "local-flow", "gw-layer", "arena-shell",
    phase === "config" && settingsOpen ? "arena-shell--open" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClass}>
      <div className="comp map-card">
        <ArenaStage scale={phase === "play" ? 1 : 0.87} onReady={onReady} />
        {phase === "config" && (
          <>
            {/* proto-HUD seats: same edges the player panels will occupy */}
            <div className="seat seat-red gw-card">P1 · <b style={{ color: "var(--gw-red)" }}>RED</b></div>
            <div className="seat seat-blue gw-card">P2 · <b style={{ color: "var(--gw-blue)" }}>BLUE</b></div>
          </>
        )}
      </div>

      {phase === "config" && settingsOpen && (
        <div className="comp side-panel">
          <ConfigPanel value={config} onChange={onChange} seed={seed} onReroll={onReroll} />
        </div>
      )}

      {phase === "config" && (
        <button
          type="button"
          className="gear"
          aria-label={settingsOpen ? "Close settings" : "Open settings"}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          ⚙
        </button>
      )}

      {phase === "config" && <Footer mode="pregame-local" onStart={onStart} />}
      {phase === "countdown" && <CountdownOverlay seconds={3} onDone={onCountdownDone} />}
      {phase === "play" && (<><Footer mode="ingame" /><HudOverlays /></>)}
    </div>
  );
}
