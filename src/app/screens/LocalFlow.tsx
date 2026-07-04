import { useRef, useState } from "react";
import type { MatchConfig } from "../../game/matchLogic";
import { LocalGame } from "../../game/LocalGame";
import type { GameRenderer } from "../../game/GameRenderer";
import { configToHash } from "../../game/configRouter";
import { hudController } from "../hud/hudStore";
import { ArenaStage } from "../arena/ArenaStage";
import { HudBar } from "../hud/HudBar";
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

  return (
    <div className="local-flow gw-layer">
      <ArenaStage scale={phase === "play" ? 1 : 0.87} onReady={onReady} />
      {phase === "config" && (
        <>
          {/* proto-HUD seats: same edges the player panels will occupy */}
          <div className="seat seat-red gw-card">P1 · <b style={{ color: "var(--gw-red)" }}>RED</b></div>
          <div className="seat seat-blue gw-card">P2 · <b style={{ color: "var(--gw-blue)" }}>BLUE</b></div>
          <aside className="config-drawer">
            <ConfigPanel value={config} onChange={onChange} seed={seed} onReroll={onReroll} />
            <button className="gw-btn gw-btn--primary cfg-start" onClick={onStart}>▶ Start Match</button>
          </aside>
        </>
      )}
      {phase === "countdown" && <CountdownOverlay seconds={3} onDone={onCountdownDone} />}
      {phase === "play" && (<><HudBar /><HudOverlays /></>)}
    </div>
  );
}
